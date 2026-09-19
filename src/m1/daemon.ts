import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

const token = process.env['LOCAL_AGENT_IPC_TOKEN'];
if (!token || token.length < 32) throw new Error('LOCAL_AGENT_IPC_TOKEN must contain at least 32 characters');
const expectedAuth = Buffer.from(`Bearer ${token}`);
const dbPath = resolve(process.env['LOCAL_AGENT_DB_PATH'] ?? '.state/tasks.db');
await mkdir(dirname(dbPath), { recursive: true });
const store = new TaskStore(dbPath);
const capabilities = new CapabilityService(dbPath);
store.recoverInterrupted();
const service = new FakeTaskService(store);
const fakeDelayMs = Math.min(5_000, Math.max(0, Number(process.env['LOCAL_AGENT_FAKE_DELAY_MS'] ?? 100)));
const providerName = process.env['LOCAL_AGENT_PROVIDER'] ?? 'fake';
if (!['fake', 'ollama', 'explorer'].includes(providerName)) throw new Error('INVALID_PROVIDER');
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
  if (!configPath) throw new Error('REPO_CONFIG_REQUIRED');
  const text = await readFile(configPath, 'utf8');
  if (Buffer.byteLength(text) > 65_536) throw new Error('REPO_CONFIG_LIMIT');
  const config = z.record(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), z.string().refine(isAbsolute)).parse(JSON.parse(text));
  if (Object.keys(config).length > 100) throw new Error('REPO_CONFIG_LIMIT');
  const repos = new RepoRegistry();
  for (const [id, root] of Object.entries(config)) await repos.register(id, root);
  snapshots = new SnapshotTaskService(store, repos, secrets);
  const modelOptions = {
    model: process.env['LOCAL_AGENT_MODEL'] ?? 'qwen3:8b',
    num_ctx: Number(process.env['LOCAL_AGENT_NUM_CTX'] ?? 8192),
    num_predict: Number(process.env['LOCAL_AGENT_NUM_PREDICT'] ?? 512),
  };
  explorer = new ExplorerRunner(snapshots, capabilities, new OllamaExplorerProvider(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11435', ollamaToken, modelOptions,
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
      if (generation !== undefined && store.get(taskId).status === 'running') store.failLeased(taskId, owner, generation, error instanceof Error && /^OLLAMA_HTTP_\d+$/.test(error.message) ? error.message : 'PROVIDER_FAILED');
    } catch { /* A concurrent cancellation or terminal publication wins. */ }
  }
}

function send(response: ServerResponse, status: number, body: unknown) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded), 'Cache-Control': 'no-store' });
  response.end(encoded);
}
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 65_536) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

const server = createServer(async (request, response) => {
  if (request.headers.origin || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')) return send(response, 403, { ok: false, error: 'INVALID_ORIGIN' });
  const supplied = Buffer.from(request.headers.authorization ?? '');
  if (supplied.length !== expectedAuth.length || !timingSafeEqual(supplied, expectedAuth)) return send(response, 401, { ok: false, error: 'UNAUTHORIZED' });
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  try {
    const body = await readJson(request);
    if (snapshots) secrets.assertSafeInput(body);
    if (request.url === '/v1/check-capability') return send(response, 200, { ok: true, value: await capabilities.check(body) });
    if (request.url === '/v1/resolve-capability') {
      const value = await capabilities.resolve(body);
      if (value.status === 'available' && explorer) store.resumeCapabilityTasks();
      return send(response, 200, { ok: true, value });
    }
    if (request.url === '/v1/submit') {
      const admitted = snapshots ? await snapshots.submit(body) : service.submit(AnalyzeRepoInput.parse(body));
      if (admitted.created && !explorer) setTimeout(() => { void execute(admitted.task.id); }, fakeDelayMs);
      return send(response, 200, { ok: true, value: { schemaVersion: 1, taskId: admitted.task.id, status: admitted.task.status, duplicate: !admitted.created, pollAfterMs: 250, ...(snapshots ? { snapshot: store.snapshot(admitted.task.id) } : {}) } });
    }
    if (request.url === '/v1/get') {
      const input = GetTaskInput.parse(body);
      let view = service.get(input.taskId, input.afterEventSeq, input.maxEvents);
      const waitUntil = Date.now() + input.waitMs;
      while (view.events.length === 0 && !['blocked', 'cancelled', 'completed', 'failed', 'budget_exceeded'].includes(view.task.status) && Date.now() < waitUntil) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(50, waitUntil - Date.now())));
        view = service.get(input.taskId, input.afterEventSeq, input.maxEvents);
      }
      return send(response, 200, { ok: true, value: { schemaVersion: 1, ...view } });
    }
    if (request.url === '/v1/cancel') {
      const input = CancelTaskInput.parse(body);
      const task = service.cancel(input.taskId, input.reason);
      explorer?.cancel(input.taskId);
      return send(response, 200, { ok: true, value: { schemaVersion: 1, task } });
    }
    return send(response, 404, { ok: false, error: 'NOT_FOUND' });
  } catch (error) {
    const message = error instanceof Error && ['IDEMPOTENCY_CONFLICT', 'TASK_NOT_FOUND', 'UNKNOWN_REPO', 'SENSITIVE_INPUT', 'SNAPSHOT_MODE_CONFLICT', 'GIT_OBJECT_UNAVAILABLE', 'QUEUE_FULL'].includes(error.message) ? error.message : 'INVALID_INPUT';
    return send(response, message === 'TASK_NOT_FOUND' ? 404 : 400, { ok: false, error: message });
  }
});

await new Promise<void>((resolvePromise, reject) => { server.once('error', reject); server.listen(Number(process.env['LOCAL_AGENT_DAEMON_PORT'] ?? 0), '127.0.0.1', resolvePromise); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('DAEMON_LISTEN_FAILED');
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
  server.close(() => { void activeTick.finally(() => { capabilities.close(); store.close(); process.exit(0); }); });
});
