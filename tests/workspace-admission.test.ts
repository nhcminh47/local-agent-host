import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DaemonClient, DaemonRequestError } from '../src/runtime/ipc-client.js';
import { atomicPrivateWrite } from '../src/bootstrap/user-state.js';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return address.port;
}

test('daemon separates management authority and blocks v2 admission before trust', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-admission-'));
  const repository = join(root, 'repo');
  const git = await resolveExecutable('git');
  assert(git);
  const childEnv = { ...process.env };
  for (const key of ['LOCAL_AGENT_IPC_TOKEN', 'LOCAL_AGENT_PROVIDER', 'LOCAL_AGENT_DB_PATH', 'LOCAL_AGENT_REPOS_FILE', 'LOCAL_AGENT_DAEMON_PORT']) delete childEnv[key];
  childEnv['LOCAL_AGENT_STATE_DIR'] = join(root, 'state');
  const bridgeToken = randomBytes(32).toString('hex');
  const managementToken = randomBytes(32).toString('hex');
  let child: ReturnType<typeof spawn> | undefined;
  let bridgeClient: Client | undefined;
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(repository);
    const runGit = (...args: string[]) => promisify(execFile)(git, ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
    await runGit('init');
    await writeFile(join(repository, 'fact.txt'), 'VALUE=9\n');
    await runGit('add', 'fact.txt');
    await runGit('commit', '-m', 'fixture');
    const port = await freePort();
    await atomicPrivateWrite(join(childEnv['LOCAL_AGENT_STATE_DIR'], 'config.json'), JSON.stringify({ schemaVersion: 1, daemonPort: port, databasePath: join(root, 'tasks.db'), provider: 'explorer', ollamaUrl: 'http://127.0.0.1:9', model: 'qwen3:8b', clientAdapter: 'manual' }));
    await atomicPrivateWrite(join(childEnv['LOCAL_AGENT_STATE_DIR'], 'ipc-token'), `${bridgeToken}\n`);
    await atomicPrivateWrite(join(childEnv['LOCAL_AGENT_STATE_DIR'], 'management-token'), `${managementToken}\n`);
    child = spawn(process.execPath, [fileURLToPath(new URL('../src/runtime/daemon.js', import.meta.url))], { env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DAEMON_START_TIMEOUT')), 7_000);
      let output = '';
      let errors = '';
      child!.stderr!.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(0, 2000); });
      child!.once('exit', () => { clearTimeout(timeout); reject(new Error(`DAEMON_EXITED ${errors}`)); });
      child!.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.includes('"status":"ready"')) { clearTimeout(timeout); resolve(); } });
    });
    const origin = `http://127.0.0.1:${port}`;
    const bridge = new DaemonClient(origin, bridgeToken);
    const management = new DaemonClient(origin, managementToken);
    await assert.rejects(bridge.call('workspace-select', { path: repository }), /UNAUTHORIZED/);
    const selected = await management.call('workspace-select', { path: repository }) as { workspaceRef: string };
    const request = { schemaVersion: 2, workspaceRef: selected.workspaceRef, requestKey: 'fixture', baseRef: 'HEAD', objective: 'Read the fixture', question: 'What is its value?' };
    await assert.rejects(bridge.call('submit', { ...request, workspaceRef: undefined }), /WORKSPACE_SELECTION_REQUIRED/);
    await assert.rejects(bridge.call('submit', request), error => error instanceof DaemonRequestError && error.message === 'WORKSPACE_TRUST_REQUIRED' && typeof error.requiredAction === 'object');
    const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/runtime/mcp-server.js', import.meta.url))], env: { ...childEnv, LOCAL_AGENT_DAEMON_URL: origin }, stderr: 'pipe' });
    bridgeClient = new Client({ name: 'workspace-fixture', version: '0.1.0' });
    await bridgeClient.connect(transport);
    const blocked = await bridgeClient.callTool({ name: 'analyze_repo', arguments: request });
    assert.equal(blocked.isError, true);
    assert.equal((blocked.structuredContent as { code: string }).code, 'WORKSPACE_TRUST_REQUIRED');
    await management.call('workspace-grant', { workspaceRef: selected.workspaceRef, mode: 'once' });
    const viaMcp = await bridgeClient.callTool({ name: 'analyze_repo', arguments: request });
    assert.notEqual(viaMcp.isError, true);
    const admitted = viaMcp.structuredContent as { taskId: string };
    assert.match(admitted.taskId, /^[a-f0-9-]{36}$/);
    await management.call('workspace-revoke', { workspaceRef: selected.workspaceRef });
    await assert.rejects(bridge.call('submit', { ...request, requestKey: 'second' }), /WORKSPACE_TRUST_REQUIRED/);
  } finally {
    await bridgeClient?.close();
    if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});
