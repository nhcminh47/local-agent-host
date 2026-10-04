import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHostConfig, readHostToken, ensureHostToken, writeHostConfig } from '../src/bootstrap/host-config.js';
import { installCursorEntry } from '../src/bootstrap/client-adapters/cursor.js';
import { bootstrap } from '../src/bootstrap/bootstrap.js';

test('user-local config and credentials are idempotent and Cursor entry preserves peers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-bootstrap-'));
  const before = process.env['LOCAL_AGENT_STATE_DIR'];
  process.env['LOCAL_AGENT_STATE_DIR'] = root;
  try {
    const config = { schemaVersion: 1 as const, daemonPort: 43127, databasePath: join(root, 'tasks.db'), provider: 'explorer' as const, ollamaUrl: 'http://127.0.0.1:11434', model: 'qwen3:8b' as const, clientAdapter: 'cursor' as const };
    await writeHostConfig(config);
    assert.deepEqual(await readHostConfig(), config);
    await writeHostConfig(config);
    assert.deepEqual(await readHostConfig(), config);
    const token = await ensureHostToken();
    assert.equal(await ensureHostToken(), token);
    assert.equal(await readHostToken(), token);
    assert.doesNotMatch(await readFile(join(root, 'config.json'), 'utf8'), new RegExp(token));
    const configBytes = await readFile(join(root, 'config.json'));
    const tokenBytes = await readFile(join(root, 'ipc-token'));
    const priorLog = console.log;
    const lines: string[] = [];
    console.log = (...values: unknown[]) => { lines.push(values.map(String).join(' ')); };
    try { await bootstrap(['--check']); }
    finally { console.log = priorLog; }
    assert.deepEqual(await readFile(join(root, 'config.json')), configBytes);
    assert.deepEqual(await readFile(join(root, 'ipc-token')), tokenBytes);
    assert.doesNotMatch(lines.join('\n'), new RegExp(token));
    const cursor = join(root, 'mcp.json');
    await writeFile(cursor, JSON.stringify({ mcpServers: { peer: { command: 'peer' } }, custom: 7 }));
    await installCursorEntry(root, cursor);
    const installed = JSON.parse(await readFile(cursor, 'utf8'));
    assert.equal(installed.custom, 7);
    assert.equal(installed.mcpServers.peer.command, 'peer');
    assert.equal(installed.mcpServers['local-agent-host'].command, process.execPath);
    assert.doesNotMatch(JSON.stringify(installed), new RegExp(token));
    assert.match(await readFile(`${cursor}.bak`, 'utf8'), /peer/);
    await writeFile(cursor, '{invalid');
    await assert.rejects(() => installCursorEntry(root, cursor));
    assert.equal(await readFile(cursor, 'utf8'), '{invalid');
  } finally {
    if (before === undefined) delete process.env['LOCAL_AGENT_STATE_DIR']; else process.env['LOCAL_AGENT_STATE_DIR'] = before;
    await rm(root, { recursive: true, force: true });
  }
});
