import assert from 'node:assert/strict';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolveExecutable } from '../exploration/capabilities.js';
import Database from 'better-sqlite3';

const live = process.env['M2_LIVE_OLLAMA'] === '1';
const dir = await mkdtemp(join(tmpdir(), 'agent-explorer-mcp-'));
const repo = join(dir, 'repo');
const token = randomBytes(32).toString('hex');
let modelToken = randomBytes(32).toString('hex');
const canary = 'synthetic-explorer-canary-234981';
let mock: Server | undefined;
let daemon: ChildProcess | undefined;
let bridge: Client | undefined;
let inferenceRequests = 0;
let unsafePayload = false;
let unsafeLogs = false;
let failureMode = '';
let failureRequests = 0;
let failureCases = 0;
// All scanned values are synthetic fixture credentials, never host credentials.
const privateValues = () => [canary, token, modelToken];
const assertClean = (value: unknown) => {
  const text = JSON.stringify(value);
  assert(!privateValues().some(secret => text.includes(secret)), 'SYNTHETIC_CANARY_LEAK');
};
function logScanner() {
  let tail = '';
  return (chunk: Buffer) => {
    const text = tail + chunk.toString('utf8');
    unsafeLogs ||= privateValues().some(secret => text.includes(secret));
    tail = text.slice(-256);
  };
}
let origin = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11435';
const daemonPath = fileURLToPath(new URL('../m1/daemon.js', import.meta.url));
const bridgePath = fileURLToPath(new URL('../m1/mcp-server.js', import.meta.url));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hardDeadline = setTimeout(() => { daemon?.kill(); process.exit(2); }, live ? 210_000 : 30_000);
const completedMessage = (statement = 'The observed value is 731.') => ({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'finish_analysis', arguments: {
  findings: [{ id: 'value', statement, basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] }],
  limitations: [{ kind: 'redacted', description: 'The filtered credential line is unknown.', citations: [{ path: 'facts.txt', startLine: 2, endLine: 2 }] }],
} } }] });

async function startDaemon() {
  daemon = spawn(process.execPath, [daemonPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LOCAL_AGENT_TOOL_METRICS: live ? '0' : '1', LOCAL_AGENT_PROVIDER: 'explorer', LOCAL_AGENT_DB_PATH: join(dir, 'tasks.db'), LOCAL_AGENT_IPC_TOKEN: token, LOCAL_AGENT_DAEMON_PORT: '0', LOCAL_AGENT_REPOS_FILE: join(dir, 'repos.json'), OLLAMA_API_KEY: modelToken, OLLAMA_BASE_URL: origin } });
  if (!live) { daemon.stdout!.on('data', logScanner()); daemon.stderr!.on('data', logScanner()); }
  const port = await new Promise<number>((resolve, reject) => {
    let text = '';
    const timeout = setTimeout(() => reject(new Error('DAEMON_START_TIMEOUT')), 10_000);
    daemon!.once('error', () => { clearTimeout(timeout); reject(new Error('DAEMON_START_FAILED')); });
    daemon!.once('exit', () => { clearTimeout(timeout); reject(new Error('DAEMON_EXITED')); });
    daemon!.stdout!.on('data', chunk => {
      text += String(chunk);
      if (text.length > 16_000) { clearTimeout(timeout); reject(new Error('DAEMON_OUTPUT_LIMIT')); return; }
      const line = text.split(/\r?\n/).find(value => value.startsWith('{'));
      if (line) { clearTimeout(timeout); resolve(Number(JSON.parse(line).port)); }
    });
    daemon!.stderr!.on('data', () => { /* Do not publish environment/errors from child startup. */ });
  });
  const daemonOrigin = `http://127.0.0.1:${port}`;
  const transport = new StdioClientTransport({ command: process.execPath, args: [bridgePath], env: { ...process.env, LOCAL_AGENT_DAEMON_URL: daemonOrigin, LOCAL_AGENT_IPC_TOKEN: token }, stderr: 'pipe' });
  if (!live) transport.stderr?.on('data', logScanner());
  bridge = new Client({ name: 'm2-explorer-smoke', version: '1.0.0' });
  await bridge.connect(transport);
  return daemonOrigin;
}

async function stopDaemon() {
  if (bridge) { await bridge.close(); bridge = undefined; }
  if (daemon && daemon.exitCode === null) { const exiting = once(daemon, 'exit'); daemon.kill(); await exiting; }
}

try {
  if (live) {
    const envPath = process.env['OLLAMA_ENV_FILE'];
    modelToken = process.env['OLLAMA_API_KEY'] ?? '';
    if (!modelToken && envPath) modelToken = /^\s*OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m.exec(await readFile(envPath, 'utf8'))?.[1]?.replace(/^(['"])(.*)\1$/, '$2') ?? '';
    if (!modelToken) throw new Error('LIVE_CREDENTIAL_UNAVAILABLE');
  } else {
    mock = createServer(async (request, response) => {
      if (request.headers.authorization !== `Bearer ${modelToken}`) { response.writeHead(401).end(); return; }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString('utf8');
      unsafePayload ||= raw.includes(canary) || raw.includes(token) || raw.includes(modelToken);
      const body = JSON.parse(raw);
      inferenceRequests++;
      if (failureMode) {
        failureRequests++;
        const privateText = privateValues().join(' ');
        if (failureMode === 'http') { response.writeHead(500).end(privateText); return; }
        if (failureMode === 'json') { response.end(`malformed ${privateText}`); return; }
        if (failureMode === 'schema') { response.end(JSON.stringify({ message: { role: 'assistant', content: privateText, tool_calls: 'invalid' } })); return; }
        if (failureMode === 'oversized') { response.end(privateText.repeat(2000)); return; }
        if (failureMode === 'disconnect') {
          response.writeHead(200, { 'Content-Length': '100000' });
          response.write(`{"message":{"content":"${privateText}`);
          setImmediate(() => response.destroy()); return;
        }
        if (failureMode === 'tool-input') {
          response.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: `password=${canary}` } } }] } })); return;
        }
        if (failureMode === 'output' && body.messages.some((message: { role: string }) => message.role === 'tool')) {
          response.end(JSON.stringify({ message: completedMessage(`password = ${privateText}`) })); return;
        }
      }
      // Keep first inference pending until the first daemon is killed.
      if (inferenceRequests === 1) return;
      const hasEvidence = body.messages.some((message: { role: string }) => message.role === 'tool');
      const message = hasEvidence ? completedMessage() : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'facts.txt', startLine: 1, endLine: 2 } } }] };
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message }));
    });
    await new Promise<void>(resolve => mock!.listen(0, '127.0.0.1', resolve));
    const address = mock.address(); assert(address && typeof address !== 'string');
    origin = `http://127.0.0.1:${address.port}`;
  }
  await mkdir(repo);
  const executable = await resolveExecutable('git'); assert(executable);
  const exec = promisify(execFile);
  const git = async (...args: string[]) => (await exec(executable, ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true })).stdout.trim();
  await git('init');
  await writeFile(join(repo, 'facts.txt'), `VALUE = 731\npassword = ${canary}\n`);
  await writeFile(join(repo, 'outside.txt'), 'Outside task scope');
  await git('add', 'facts.txt', 'outside.txt'); await git('commit', '-m', 'fixture baseline');
  await writeFile(join(dir, 'repos.json'), JSON.stringify({ fixture: repo }));
  const daemonOrigin = await startDaemon();
  const forbidden = await fetch(`${daemonOrigin}/v1/get`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://example.invalid' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const request = { schemaVersion: 1, repoId: 'fixture', requestKey: 'm2-smoke', baseRef: 'HEAD', scope: { allow: ['facts.txt'], deny: [] }, objective: 'Read the immutable fixture', question: 'Read facts.txt and report VALUE with its file and line. Do not report credentials.', budget: { maxWallSeconds: 180, maxModelTurns: 8, maxToolCalls: 10 } };
  const submission = await bridge!.callTool({ name: 'analyze_repo', arguments: request });
  assert(!submission.isError);
  const admitted = submission.structuredContent as { taskId: string; snapshot: { baseCommit: string } };
  await writeFile(join(repo, 'facts.txt'), 'VALUE = 999\n'); await git('add', 'facts.txt'); await git('commit', '-m', 'advance HEAD after admission');
  const index = await readFile(join(repo, '.git', 'index'));
  const status = await git('status', '--porcelain=v1');
  if (!live) {
    const until = Date.now() + 10_000;
    while (!inferenceRequests && Date.now() < until) await sleep(50);
    assert.equal(inferenceRequests, 1);
    await stopDaemon(); await startDaemon();
  }
  let task: { status: string; resultJson: string | null; explorerModelTurns: number; explorerToolCalls: number } | undefined;
  let events: Array<{ type: string }> = [];
  const until = Date.now() + (live ? 180_000 : 12_000);
  while (Date.now() < until) {
    const response = await bridge!.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId: admitted.taskId } });
    const view = response.structuredContent as { task: typeof task; events: typeof events };
    task = view.task; events = view.events;
    if (task && ['completed', 'failed', 'cancelled', 'budget_exceeded', 'blocked'].includes(task.status)) break;
    await sleep(150);
  }
  assert.equal(task?.status, 'completed');
  const result = JSON.parse(task!.resultJson!);
  assert(task!.explorerModelTurns >= result.metrics.modelTurns + (live ? 0 : 1));
  assert.equal(task!.explorerToolCalls, result.metrics.toolCalls);
  assert(result.summary.includes('731'));
  assert.equal(result.snapshot.baseCommit, admitted.snapshot.baseCommit);
  assert.equal(result.snapshot.eligibleFiles, 1);
  assert.equal(typeof result.snapshot.scopeHash, 'string');
  assert(result.evidence.some((entry: { path: string }) => entry.path === 'facts.txt'));
  assert(!JSON.stringify({ task, events }).includes(canary));
  assert(!unsafePayload);
  if (!live) assert(events.some(event => event.type === 'task.recovered'));
  if (live) { await stopDaemon(); await startDaemon(); }
  const duplicate = await bridge!.callTool({ name: 'analyze_repo', arguments: request });
  assert.equal((duplicate.structuredContent as { duplicate: boolean }).duplicate, true);
  assert.equal((duplicate.structuredContent as { taskId: string }).taskId, admitted.taskId);
  assert.equal(await git('status', '--porcelain=v1'), status);
  assert.deepEqual(await readFile(join(repo, '.git', 'index')), index);
  assert.equal(await readFile(join(repo, 'facts.txt'), 'utf8'), 'VALUE = 999\n');
  if (!live) {
    const cases = [
      ['http', 'EXPLORER_HTTP_FAILED'], ['json', 'EXPLORER_INVALID_RESPONSE'],
      ['schema', 'EXPLORER_INVALID_RESPONSE'], ['oversized', 'EXPLORER_RESPONSE_LIMIT'],
      ['disconnect', 'EXPLORER_TRANSPORT_FAILED'], ['tool-input', 'EXPLORER_FAILED'],
      ['output', 'EXPLORER_INVALID_COMPLETION'],
    ] as const;
    const results: Array<{ taskId: string; resultJson: string }> = [];
    for (const [mode, expected] of cases) {
      failureMode = mode; failureRequests = 0;
      const submitted = await bridge!.callTool({ name: 'analyze_repo', arguments: { ...request, baseRef: admitted.snapshot.baseCommit, requestKey: `canary-${mode}` } });
      assertClean(submitted); assert(!submitted.isError);
      const taskId = (submitted.structuredContent as { taskId: string }).taskId;
      let finished: { status: string; resultJson: string | null; explorerToolCalls: number } | undefined;
      const limit = Date.now() + 8000;
      do {
        const response = await bridge!.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId } });
        // Scan both MCP text content and structured output, including all events.
        assertClean(response);
        finished = (response.structuredContent as { task: typeof finished }).task;
        if (finished && ['completed', 'failed', 'budget_exceeded', 'cancelled'].includes(finished.status)) break;
        await sleep(50);
      } while (Date.now() < limit);
      assert.equal(finished?.status, expected ? 'failed' : 'completed');
      const result = JSON.parse(finished!.resultJson!);
      if (expected) {
        assert.equal(result.error, expected);
        assert.equal(finished!.explorerToolCalls, mode === 'output' ? 3 : 0);
        assert.equal(failureRequests, mode === 'output' ? 3 : 1);
      } else assert.fail('all configured failure cases must fail closed');
      results.push({ taskId, resultJson: finished!.resultJson! });
      failureCases++;
    }
    failureMode = '';
    const db = new Database(join(dir, 'tasks.db'), { readonly: true });
    try {
      for (const table of ['tasks', 'task_events', 'task_snapshots']) assertClean(db.prepare(`SELECT * FROM ${table}`).all());
    } finally { db.close(); }
    // Inspect DB and WAL while the writer remains alive, before checkpoint cleanup.
    for (const name of ['tasks.db', 'tasks.db-wal']) {
      const bytes = await readFile(join(dir, name));
      assert(!privateValues().some(secret => bytes.includes(Buffer.from(secret))), 'PERSISTED_CANARY_LEAK');
    }
    const callsBeforeRestart = inferenceRequests;
    await stopDaemon(); await startDaemon();
    for (const saved of results) {
      const response = await bridge!.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId: saved.taskId } });
      assertClean(response);
      assert.equal((response.structuredContent as { task: { resultJson: string } }).task.resultJson, saved.resultJson);
    }
    assert.equal(inferenceRequests, callsBeforeRestart);
    assert(!unsafePayload); assert(!unsafeLogs);
    assert.equal(await git('status', '--porcelain=v1'), status);
    assert.deepEqual(await readFile(join(repo, '.git', 'index')), index);
    assert.equal(await readFile(join(repo, 'facts.txt'), 'utf8'), 'VALUE = 999\n');
  }
  console.log(JSON.stringify({ schemaVersion: 1, status: 'passed', provider: live ? 'live-qwen3:8b' : 'fake-ollama', snapshot: result.snapshot, metrics: result.metrics, failureCases, checks: ['MCP admission and result', 'evidence from fixed commit after HEAD advance', live ? 'completed task survives daemon restart' : 'running task recovered after daemon process restart', 'idempotent duplicate after restart', 'checkout/index unchanged', 'canary absent from task result', ...(!live ? ['canary absent from captured model requests', 'failure/output canaries absent from SQLite rows and DB/WAL bytes', 'canaries absent from full MCP responses and captured child logs', 'terminal failures survive restart without inference replay'] : []), 'Origin rejected'], scope: 'Local MCP SDK client + daemon + snapshot explorer on a synthetic Git fixture; not Cursor UI or macOS' }));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'M2_MCP_SMOKE_FAILED'}\n`);
  console.log(JSON.stringify({ schemaVersion: 1, status: 'failed', provider: live ? 'live-qwen3:8b' : 'fake-ollama', error: 'M2_MCP_SMOKE_FAILED' }));
  process.exitCode = 1;
} finally {
  clearTimeout(hardDeadline);
  await stopDaemon();
  mock?.closeAllConnections();
  if (mock) await new Promise<void>(resolve => mock!.close(() => resolve()));
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
}
