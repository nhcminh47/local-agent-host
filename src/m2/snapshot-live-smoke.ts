import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SnapshotTaskService } from '../service/snapshot-task-service.js';
import { TaskStore } from '../store/task-store.js';
import { AnalyzeRepoInput } from '../domain/task-contracts.js';
import { RepoRegistry } from '../exploration/repo-registry.js';
import { SecretFilter } from '../exploration/secret-filter.js';
import { resolveExecutable } from '../exploration/capabilities.js';

// Opt-in development smoke only. Never executes model-supplied commands or writes.
const model = 'qwen3:8b';
const origin = new URL(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11435');
if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('INVALID_LIVE_ORIGIN');
let token = process.env['OLLAMA_API_KEY'];
if (!token && process.env['OLLAMA_ENV_FILE']) {
  const env = await readFile(process.env['OLLAMA_ENV_FILE'], 'utf8');
  token = /^\s*OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m.exec(env)?.[1]?.replace(/^(['"])(.*)\1$/, '$2');
}
if (!token) throw new Error('OLLAMA_CREDENTIAL_UNAVAILABLE');
const canary = 'snapshot-fixture-only-canary-198734';
const filter = new SecretFilter([canary, token]);
const root = await mkdtemp(join(tmpdir(), 'agent-live-snapshot-'));
const executable = await resolveExecutable('git');
if (!executable) throw new Error('GIT_UNAVAILABLE');
const exec = promisify(execFile);
const git = async (...args: string[]) => (await exec(executable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true })).stdout.trim();
type Message = { role: string; content: string; tool_calls?: unknown[] | undefined; tool_name?: string };
const metrics: Array<{ wallMs: number; promptTokens: number | null; generatedTokens: number | null }> = [];
let store: TaskStore | undefined;
const Call = z.object({ function: z.object({ name: z.literal('read_file'), arguments: z.object({ path: z.literal('facts.txt') }).strict() }) });
const Reply = z.object({ message: z.object({ role: z.literal('assistant'), content: z.string(), tool_calls: z.array(Call).optional() }), prompt_eval_count: z.number().optional(), eval_count: z.number().optional() });

async function readJson(response: Response) {
  if (!response.ok || !response.body) throw new Error('LIVE_HTTP_FAILED');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 128 * 1024) throw new Error('LIVE_RESPONSE_LIMIT');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function chat(messages: Message[], withTools: boolean) {
  const body = JSON.stringify({ model, messages, stream: false, think: false, keep_alive: '5m', options: { num_ctx: 8192, num_predict: 256, temperature: 0 },
    ...(withTools ? { tools: [{ type: 'function', function: { name: 'read_file', description: 'Read the filtered immutable snapshot fixture.', parameters: { type: 'object', properties: { path: { type: 'string', enum: ['facts.txt'] } }, required: ['path'], additionalProperties: false } } }] } : {}),
  });
  assert(!body.includes(canary) && !body.includes(token!), 'Unsafe model request');
  const started = performance.now();
  const response = await fetch(new URL('/api/chat', origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body });
  const reply = Reply.parse(await readJson(response));
  if (filter.filter(reply.message.content).redacted) throw new Error('SENSITIVE_MODEL_OUTPUT');
  metrics.push({ wallMs: Math.round(performance.now() - started), promptTokens: reply.prompt_eval_count ?? null, generatedTokens: reply.eval_count ?? null });
  return reply.message;
}

try {
  const tags = await readJson(await fetch(new URL('/api/tags', origin), { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token}` } }));
  const installed = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) }).parse(tags).models.find(item => item.name === model);
  if (!installed) throw new Error('LIVE_MODEL_NOT_INSTALLED');
  await git('init');
  await writeFile(join(root, 'facts.txt'), `SNAPSHOT_VALUE = 731\npassword = ${canary}\n`);
  await git('add', 'facts.txt');
  await git('commit', '-m', 'snapshot live fixture');
  const repos = new RepoRegistry();
  await repos.register('fixture', root);
  const dbPath = join(root, 'tasks.db');
  store = new TaskStore(dbPath);
  const request = AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey: 'live-recovery', baseRef: 'HEAD', objective: 'Read snapshot fixture', question: 'What is SNAPSHOT_VALUE?' });
  const admission = await new SnapshotTaskService(store, repos, filter).submit(request);
  store.claim(admission.task.id, 'before-restart', 30_000);
  await writeFile(join(root, 'facts.txt'), 'SNAPSHOT_VALUE = 999\n');
  store.close();
  store = new TaskStore(dbPath);
  assert.equal(store.recoverInterrupted(), 1);
  const recoveredService = new SnapshotTaskService(store, repos, filter);
  const duplicate = await recoveredService.submit(request);
  assert.equal(duplicate.created, false);
  assert.deepEqual(duplicate.snapshot, admission.snapshot);
  const snapshot = await recoveredService.restore(admission.task.id);
  const beforeStatus = await git('status', '--porcelain=v1');
  const beforeIndex = await readFile(join(root, '.git', 'index'));
  const messages: Message[] = [
    { role: 'system', content: 'Use read_file to obtain evidence. Only the immutable snapshot is authoritative. After the tool result, return only the integer assigned to SNAPSHOT_VALUE, with no explanation.' },
    { role: 'user', content: 'Read facts.txt and report SNAPSHOT_VALUE.' },
  ];
  const first = await chat(messages, true);
  if (first.tool_calls?.length !== 1) throw new Error('LIVE_EXPECTED_ONE_TOOL_CALL');
  const call = Call.parse(first.tool_calls[0]);
  const result = await snapshot.readFile('fixture', call.function.arguments.path);
  assert(result.redacted && !JSON.stringify(result).includes(canary));
  messages.push(first, { role: 'tool', tool_name: 'read_file', content: JSON.stringify(result) });
  const second = await chat(messages, false);
  if (second.tool_calls?.length || second.content.trim() !== '731') throw new Error('LIVE_SNAPSHOT_ANSWER_FAILED');
  assert.equal(await git('status', '--porcelain=v1'), beforeStatus);
  assert.deepEqual(await readFile(join(root, '.git', 'index')), beforeIndex);
  assert.equal(await readFile(join(root, 'facts.txt'), 'utf8'), 'SNAPSHOT_VALUE = 999\n');
  console.log(JSON.stringify({ schemaVersion: 1, status: 'passed', model, modelDigest: installed.digest, snapshot: snapshot.metadata, metrics,
    checks: ['durable admission and store restart recovery', 'duplicate kept admitted snapshot', 'live model tool call validated', 'committed snapshot value followed', 'dirty checkout excluded and unchanged', 'canary absent from model payload and result', 'index unchanged'],
    scope: 'Two-turn read-only fixture smoke after store restart; not production explorer loop or MCP end-to-end' }));
} catch (error) {
  const code = error instanceof Error && /^LIVE_[A-Z_]+$/.test(error.message) ? error.message : 'LIVE_TEST_FAILED';
  console.log(JSON.stringify({ schemaVersion: 1, status: 'failed', model, error: code, metrics }));
  process.exitCode = 1;
} finally { store?.close(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
