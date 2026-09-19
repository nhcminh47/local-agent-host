import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const dir = await mkdtemp(join(tmpdir(), 'agent-m1-ipc-'));
const token = randomBytes(32).toString('hex');
const daemonPath = fileURLToPath(new URL('./daemon.js', import.meta.url));
const bridgePath = fileURLToPath(new URL('./mcp-server.js', import.meta.url));
const liveOllama = process.env['M1_LIVE_OLLAMA'] === '1';
let daemon: ChildProcess | undefined;
const deadline = setTimeout(() => { console.error('M1 IPC smoke deadline exceeded'); process.exit(1); }, liveOllama ? 190_000 : 20_000);

function waitForReady(child: ChildProcess): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    let text = '';
    child.stdout?.on('data', chunk => {
      text += String(chunk);
      const line = text.split(/\r?\n/).find(value => value.startsWith('{'));
      if (line) {
        try { resolvePromise(Number((JSON.parse(line) as { port: number }).port)); }
        catch (error) { reject(error); }
      }
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`daemon exited before ready: ${code}`)));
  });
}

async function connectBridge(origin: string) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [bridgePath], env: { ...process.env, LOCAL_AGENT_DAEMON_URL: origin, LOCAL_AGENT_IPC_TOKEN: token }, stderr: 'pipe' });
  const client = new Client({ name: 'm1-smoke', version: '0.1.0' });
  await client.connect(transport);
  return client;
}

try {
  daemon = spawn(process.execPath, [daemonPath], { env: { ...process.env, LOCAL_AGENT_DB_PATH: join(dir, 'tasks.db'), LOCAL_AGENT_IPC_TOKEN: token, LOCAL_AGENT_DAEMON_PORT: '0', LOCAL_AGENT_FAKE_DELAY_MS: '300', LOCAL_AGENT_PROVIDER: liveOllama ? 'ollama' : 'fake' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const port = await waitForReady(daemon);
  const origin = `http://127.0.0.1:${port}`;
  const unauthorized = await fetch(`${origin}/v1/get`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauthorized.status, 401);

  const firstBridge = await connectBridge(origin);
  const { tools } = await firstBridge.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['analyze_repo', 'cancel_task', 'check_capability', 'get_task', 'resolve_capability']);
  const capabilityDecision = await firstBridge.callTool({ name: 'resolve_capability', arguments: { schemaVersion: 1, capability: 'ripgrep', decision: 'use_builtin_fallback' } });
  assert.equal((capabilityDecision.structuredContent as { backend: string }).backend, 'node');
  const rejected = await firstBridge.callTool({ name: 'resolve_capability', arguments: { schemaVersion: 1, capability: 'ripgrep', decision: 'install', command: 'forbidden' } });
  assert.equal(rejected.isError, true);
  const submission = await firstBridge.callTool({ name: 'analyze_repo', arguments: { schemaVersion: 1, repoId: 'fixture', requestKey: 'disconnect-1', baseRef: 'main', objective: 'Map fixture', question: 'Where is pagination?', depth: 'quick' } });
  const taskId = (submission.structuredContent as { taskId: string }).taskId;
  await firstBridge.close();

  assert.equal(daemon.exitCode, null);
  const secondBridge = await connectBridge(origin);
  const savedCapability = await secondBridge.callTool({ name: 'check_capability', arguments: { schemaVersion: 1, capability: 'ripgrep' } });
  assert.equal((savedCapability.structuredContent as { backend: string }).backend, 'node');
  // Submit after reconnect so bridge startup time cannot consume the fake delay.
  const pollSubmission = await secondBridge.callTool({ name: 'analyze_repo', arguments: { schemaVersion: 1, repoId: 'fixture', requestKey: 'long-poll-1', baseRef: 'main', objective: 'Map fixture', question: 'Where is pagination?', depth: 'quick' } });
  const pollTaskId = (pollSubmission.structuredContent as { taskId: string }).taskId;
  const pollInitial = await secondBridge.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId: pollTaskId } });
  const pollCursor = (pollInitial.structuredContent as { eventPage: { nextEventSeq: number } }).eventPage.nextEventSeq;
  const longPollStarted = performance.now();
  const awakened = await secondBridge.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId: pollTaskId, afterEventSeq: pollCursor, waitMs: 3_000, maxEvents: 1 } });
  const awakenedView = awakened.structuredContent as { events: unknown[]; eventPage: { nextEventSeq: number; hasMore: boolean } };
  assert.equal(awakenedView.events.length, 1);
  assert(awakenedView.eventPage.nextEventSeq > pollCursor);
  assert(performance.now() - longPollStarted >= 150);
  let task: { status: string; resultJson: string | null } | undefined;
  const pollDeadline = Date.now() + (liveOllama ? 180_000 : 5_000);
  while (Date.now() < pollDeadline) {
    const status = await secondBridge.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId } });
    task = (status.structuredContent as { task: { status: string; resultJson: string | null } }).task;
    if (['completed', 'failed', 'cancelled'].includes(task.status)) break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  assert.equal(task?.status, 'completed');
  const result = JSON.parse(task?.resultJson ?? '{}') as { provider?: string; metrics?: unknown };
  assert.equal(result.provider, liveOllama ? 'ollama' : 'fake');
  const duplicate = await secondBridge.callTool({ name: 'analyze_repo', arguments: { schemaVersion: 1, repoId: 'fixture', requestKey: 'disconnect-1', baseRef: 'main', objective: 'Map fixture', question: 'Where is pagination?', depth: 'quick' } });
  assert.equal((duplicate.structuredContent as { duplicate: boolean }).duplicate, true);
  await secondBridge.close();
  console.log(JSON.stringify({ status: 'passed', provider: result.provider, metrics: result.metrics ?? null, checks: ['authenticated loopback IPC', 'tool discovery', 'bridge disconnect', 'daemon survival', 'long-poll wakeup', 'event cursor', 'reconnect status', 'idempotent duplicate'] }));
} finally {
  if (daemon && daemon.exitCode === null) {
    daemon.kill('SIGTERM');
    await once(daemon, 'exit');
  }
  clearTimeout(deadline);
  await rm(dir, { recursive: true, force: true });
}
