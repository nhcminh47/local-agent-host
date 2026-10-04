import { hasErrorCode } from "../shared/errors.js";
import { ERROR_CODES } from '../constants/error-codes.js';
import { sendJson, readJson } from '../shared/http-json.js';
import { HTTP_STATUS } from '../constants/http-status.js';
import { MESSAGES } from '../constants/messages.js';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { AnalyzeRepoInput, CancelTaskInput, GetTaskInput } from '../domain/task-contracts.js';
import { FakeTaskService } from '../service/fake-task-service.js';
import { TaskStore } from '../store/task-store.js';
import { OllamaAnalysisProvider } from '../provider/ollama-analysis-provider.js';
import { CapabilityService } from '../exploration/capability-service.js';
import { RepoRegistry } from '../exploration/repo-registry.js';
import { SecretFilter } from '../exploration/secret-filter.js';
import { SnapshotTaskService } from '../service/snapshot-task-service.js';
import { ExplorerRunner } from '../service/explorer-runner.js';
import { OllamaExplorerProvider } from '../provider/explorer-provider.js';
import { readHostConfig, readHostToken, readManagementToken } from '../bootstrap/host-config.js';
import { WorkspaceGrantStore } from '../store/workspace-grant-store.js';
import { WorkspaceTrustService } from '../service/workspace-trust-service.js';

const hostConfig = process.env['LOCAL_AGENT_IPC_TOKEN'] && process.env['LOCAL_AGENT_PROVIDER'] ? null : await readHostConfig();
const token = process.env['LOCAL_AGENT_IPC_TOKEN'] ?? await readHostToken();
if (!token || token.length < 32) throw new Error(MESSAGES.IPC_TOKEN_TOO_SHORT);
const expectedAuth = Buffer.from(`Bearer ${token}`);
const managementToken = await readManagementToken();
const expectedManagementAuth = managementToken ? Buffer.from(`Bearer ${managementToken}`) : null;
const dbPath = resolve(process.env['LOCAL_AGENT_DB_PATH'] ?? hostConfig?.databasePath ?? '.state/tasks.db');
await mkdir(dirname(dbPath), { recursive: true });
const store = new TaskStore(dbPath);
const grantStore = hostConfig ? new WorkspaceGrantStore(dbPath) : undefined;
const trust = grantStore ? new WorkspaceTrustService(grantStore) : undefined;
const capabilities = new CapabilityService(dbPath);
store.recoverInterrupted();
const service = new FakeTaskService(store);
const fakeDelayMs = Math.min(5_000, Math.max(0, Number(process.env['LOCAL_AGENT_FAKE_DELAY_MS'] ?? 100)));
const providerName = process.env['LOCAL_AGENT_PROVIDER'] ?? hostConfig?.provider ?? 'fake';
if (!['fake', 'ollama', 'explorer'].includes(providerName)) throw new Error(ERROR_CODES.INVALID_PROVIDER);
let ollamaToken = process.env['OLLAMA_API_KEY'] ?? '';
if (providerName === 'explorer' && !ollamaToken && process.env['OLLAMA_ENV_FILE']) {
  const contents = await readFile(process.env['OLLAMA_ENV_FILE'], 'utf8');
  ollamaToken = /^\s*OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m.exec(contents)?.[1]?.replace(/^(['"])(.*)\1$/, '$2') ?? '';
}
const secrets = new SecretFilter([token, ...(ollamaToken ? [ollamaToken] : [])]);
let snapshots: SnapshotTaskService | undefined;
let explorer: ExplorerRunner | undefined;
if (providerName === 'explorer') {
  const configPath = process.env['LOCAL_AGENT_REPOS_FILE'];
  const repos = new RepoRegistry();
  if (configPath) {
    const text = await readFile(configPath, 'utf8');
    if (Buffer.byteLength(text) > 65_536) throw new Error(ERROR_CODES.REPO_CONFIG_LIMIT);
    const config = z.record(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), z.string().refine(isAbsolute)).parse(JSON.parse(text));
    if (Object.keys(config).length > 100) throw new Error(ERROR_CODES.REPO_CONFIG_LIMIT);
    for (const [id, root] of Object.entries(config)) await repos.register(id, root);
  } else if (!trust) throw new Error(ERROR_CODES.REPO_CONFIG_REQUIRED);
  snapshots = new SnapshotTaskService(store, repos, secrets, trust);
  const modelOptions = {
    model: process.env['LOCAL_AGENT_MODEL'] ?? hostConfig?.model ?? 'qwen3:8b',
    num_ctx: Number(process.env['LOCAL_AGENT_NUM_CTX'] ?? 8192),
    num_predict: Number(process.env['LOCAL_AGENT_NUM_PREDICT'] ?? 512),
  };
  explorer = new ExplorerRunner(snapshots, capabilities, new OllamaExplorerProvider(process.env['OLLAMA_BASE_URL'] ?? hostConfig?.ollamaUrl ?? 'http://127.0.0.1:11435', ollamaToken, modelOptions,
    process.env['LOCAL_AGENT_INFERENCE_METRICS'] === '1' ? metric => { process.stderr.write(JSON.stringify({ event: 'inference.metrics', ...metric }) + '\n'); } : undefined));
  // A crash between persisting a capability decision and requeueing tasks is safe.
  if ((await capabilities.check({ schemaVersion: 1, capability: 'ripgrep' })).status === 'available') store.resumeCapabilityTasks();
}
const ollama = providerName === 'ollama' ? new OllamaAnalysisProvider(
  process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11435',
  process.env['OLLAMA_API_KEY'] ?? '',
  process.env['OLLAMA_MODEL'] ?? 'qwen3.5:latest',
) : undefined;

async function execute(taskId: string) {
  const owner = `daemon-${process.pid}`;
  let generation: number | undefined;
  try {
    if (store.get(taskId).status !== 'queued') return;
    if (!ollama) return service.runOne(taskId);
    const claimed = store.claim(taskId, owner, 15 * 60_000);
    generation = claimed.generation;
    const running = claimed.task;
    const request = AnalyzeRepoInput.parse(JSON.parse(running.payloadJson));
    const timeout = AbortSignal.timeout(request.budget.maxWallSeconds * 1_000);
    store.completeLeased(taskId, owner, generation, await ollama.analyze(request, timeout));
  } catch (error) {
    try {
      if (generation !== undefined && store.get(taskId).status === 'running') store.failLeased(taskId, owner, generation, error instanceof Error && /^OLLAMA_HTTP_\d+$/.test(error.message) ? error.message : ERROR_CODES.PROVIDER_FAILED);
    } catch { /* A concurrent cancellation or terminal publication wins. */ }
  }
}

const server = createServer(async (request, response) => {
  if (request.headers.origin || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) return sendJson(response, HTTP_STATUS.FORBIDDEN, { ok: false, error: ERROR_CODES.INVALID_ORIGIN });
  const supplied = Buffer.from(request.headers.authorization ?? '');
  const expected = request.url?.startsWith('/v1/workspace-') ? expectedManagementAuth : expectedAuth;
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return sendJson(response, HTTP_STATUS.UNAUTHORIZED, { ok: false, error: ERROR_CODES.UNAUTHORIZED });
  if (request.method !== 'POST') return sendJson(response, HTTP_STATUS.METHOD_NOT_ALLOWED, { ok: false, error: ERROR_CODES.METHOD_NOT_ALLOWED });
  let submittedWorkspaceRef: string | undefined;
  try {
    const body = await readJson(request);
    if (request.url === '/v1/submit' && body && typeof body === 'object' && 'workspaceRef' in body && typeof body.workspaceRef === 'string' && /^ws-[a-f0-9]{32}$/.test(body.workspaceRef)) submittedWorkspaceRef = body.workspaceRef;
    if (snapshots) secrets.assertSafeInput(body);
    if (request.url === '/v1/workspace-select' && trust) {
      const input = z.object({ path: z.string().min(1).max(4096) }).strict().parse(body);
      const identity = await trust.select(input.path);
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { workspaceRef: identity.workspaceRef, root: identity.root } });
    }
    if (request.url === '/v1/workspace-grant' && trust) {
      const input = z.object({ workspaceRef: z.string(), mode: z.enum(['once', 'durable']) }).strict().parse(body);
      const value = await trust.grant(input.workspaceRef, input.mode);
      const root = (await trust.inspect(input.workspaceRef)).identity.root;
      store.resumeWorkspaceTasks(input.workspaceRef, snapshots?.repos.idsForRoot(root).filter(id => !id.startsWith('ws-')) ?? []);
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value });
    }
    if (request.url === '/v1/workspace-list' && trust) return sendJson(response, HTTP_STATUS.OK, { ok: true, value: trust.list() });
    if (request.url === '/v1/workspace-revoke' && trust) {
      const input = z.object({ workspaceRef: z.string() }).strict().parse(body);
      const selected = trust.grants.get(input.workspaceRef);
      const legacyIds = selected ? snapshots?.repos.idsForRoot(selected.identity.root).filter(id => !id.startsWith('ws-')) ?? [] : [];
      trust.revoke(input.workspaceRef);
      for (const id of [...store.tasksForWorkspace(input.workspaceRef), ...store.activeTasksForRepos(legacyIds)]) { store.cancel(id, 'WORKSPACE_TRUST_REVOKED'); explorer?.cancel(id); }
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { workspaceRef: input.workspaceRef, revoked: true } });
    }
    if (request.url === '/v1/workspace-deny' && trust) {
      const input = z.object({ workspaceRef: z.string() }).strict().parse(body);
      await trust.inspect(input.workspaceRef);
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { workspaceRef: input.workspaceRef, denied: true } });
    }
    if (request.url === '/v1/check-capability') return sendJson(response, HTTP_STATUS.OK, { ok: true, value: await capabilities.check(body) });
    if (request.url === '/v1/resolve-capability') {
      const value = await capabilities.resolve(body);
      if (value.status === 'available' && explorer) store.resumeCapabilityTasks();
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value });
    }
    if (request.url === '/v1/submit') {
      const admitted = snapshots ? await snapshots.submit(body) : service.submit(AnalyzeRepoInput.parse(body));
      if (admitted.created && !explorer) setTimeout(() => { void execute(admitted.task.id); }, fakeDelayMs);
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { schemaVersion: 1, taskId: admitted.task.id, status: admitted.task.status, duplicate: !admitted.created, pollAfterMs: 250, ...(snapshots ? { snapshot: store.snapshot(admitted.task.id) } : {}) } });
    }
    if (request.url === '/v1/get') {
      const input = GetTaskInput.parse(body);
      let view = service.get(input.taskId, input.afterEventSeq, input.maxEvents);
      const waitUntil = Date.now() + input.waitMs;
      while (view.events.length === 0 && !['blocked', 'cancelled', 'completed', 'failed', 'budget_exceeded'].includes(view.task.status) && Date.now() < waitUntil) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(50, waitUntil - Date.now())));
        view = service.get(input.taskId, input.afterEventSeq, input.maxEvents);
      }
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { schemaVersion: 1, ...view } });
    }
    if (request.url === '/v1/cancel') {
      const input = CancelTaskInput.parse(body);
      const task = service.cancel(input.taskId, input.reason);
      explorer?.cancel(input.taskId);
      return sendJson(response, HTTP_STATUS.OK, { ok: true, value: { schemaVersion: 1, task } });
    }
    return sendJson(response, HTTP_STATUS.NOT_FOUND, { ok: false, error: ERROR_CODES.NOT_FOUND });
  } catch (error) {
    if (hasErrorCode(error, [ERROR_CODES.REQUEST_TOO_LARGE])) {
      // Do not drain an unbounded sender or reuse a connection with unread data.
      response.setHeader('Connection', 'close');
      return sendJson(response, HTTP_STATUS.PAYLOAD_TOO_LARGE, { ok: false, error: ERROR_CODES.REQUEST_TOO_LARGE });
    }
    const message = hasErrorCode(error, [ERROR_CODES.IDEMPOTENCY_CONFLICT, ERROR_CODES.TASK_NOT_FOUND, ERROR_CODES.UNKNOWN_REPO, ERROR_CODES.SENSITIVE_INPUT, ERROR_CODES.SNAPSHOT_MODE_CONFLICT, 'GIT_OBJECT_UNAVAILABLE', ERROR_CODES.QUEUE_FULL, 'WORKSPACE_SELECTION_REQUIRED', 'WORKSPACE_TRUST_REQUIRED', 'WORKSPACE_IDENTITY_CHANGED']) ? error.message : ERROR_CODES.INVALID_INPUT;
    const requiredAction = ['WORKSPACE_SELECTION_REQUIRED', 'WORKSPACE_TRUST_REQUIRED', 'WORKSPACE_IDENTITY_CHANGED'].includes(message) ? {
      schemaVersion: 2, code: message, capability: 'read', ...(submittedWorkspaceRef ? { workspaceRef: submittedWorkspaceRef } : {}),
      action: message === 'WORKSPACE_SELECTION_REQUIRED' ? 'Select a workspace with the host CLI and retry using its workspaceRef.' : 'Review workspace trust with the host CLI, then retry the request.',
    } : undefined;
    return sendJson(response, message === ERROR_CODES.TASK_NOT_FOUND ? HTTP_STATUS.NOT_FOUND : HTTP_STATUS.BAD_REQUEST, { ok: false, error: message, ...(requiredAction ? { value: requiredAction } : {}) });
  }
});

await new Promise<void>((resolvePromise, reject) => { server.once('error', reject); server.listen(Number(process.env['LOCAL_AGENT_DAEMON_PORT'] ?? hostConfig?.daemonPort ?? 0), '127.0.0.1', resolvePromise); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error(ERROR_CODES.DAEMON_LISTEN_FAILED);
console.log(JSON.stringify({ status: 'ready', host: '127.0.0.1', port: address.port }));
let activeTick: Promise<void> = Promise.resolve();
let ticking = false;
const schedule = explorer ? setInterval(() => {
  if (ticking) return;
  ticking = true;
  activeTick = explorer!.tick().catch(() => { console.error('EXPLORER_SCHEDULER_FAILED'); }).finally(() => { ticking = false; });
}, 100) : undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  if (schedule) clearInterval(schedule);
  explorer?.abort();
  server.close(() => { void activeTick.finally(() => { capabilities.close(); grantStore?.close(); store.close(); process.exit(0); }); });
});
