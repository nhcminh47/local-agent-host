import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DaemonClient } from '../src/runtime/ipc-client.js';

test('daemon distinguishes oversized bodies from invalid input and remains usable', { timeout: 25_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-http-'));
  const token = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/runtime/daemon.js', import.meta.url))], {
    env: { ...process.env, LOCAL_AGENT_DB_PATH: join(dir, 'tasks.db'), LOCAL_AGENT_IPC_TOKEN: token, LOCAL_AGENT_DAEMON_PORT: '0', LOCAL_AGENT_PROVIDER: 'fake' },
    stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('daemon readiness timeout')), 8_000);
      let output = '';
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('daemon exited before readiness')); });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.length > 8192) { clearTimeout(timeout); reject(new Error('daemon readiness limit')); return; }
        const line = output.split(/\r?\n/).find(value => value.startsWith('{'));
        if (!line) return;
        try { const ready = JSON.parse(line) as { port: number }; clearTimeout(timeout); resolve(ready.port); }
        catch { /* Wait for the complete readiness line. */ }
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const send = (body: string, chunked = false, authenticated = true) => new Promise<{ status: number; body: unknown; connection: string | undefined }>((resolve, reject) => {
      const bytes = Buffer.from(body);
      const request = httpRequest(`${origin}/v1/submit`, { method: 'POST', headers: {
        'Content-Type': 'application/json',
        ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        ...(chunked ? {} : { 'Content-Length': bytes.length }),
      } });
      const timeout = setTimeout(() => request.destroy(new Error('HTTP response timeout')), 4_000);
      request.on('error', error => { clearTimeout(timeout); reject(error); });
      request.on('response', response => {
        let text = '';
        response.on('data', (chunk: Buffer) => {
          text += chunk.toString();
          if (text.length > 8192) request.destroy(new Error('HTTP response limit'));
        });
        response.on('error', reject);
        response.on('end', () => {
          clearTimeout(timeout);
          try { resolve({ status: response.statusCode!, body: JSON.parse(text) as unknown, connection: response.headers.connection }); }
          catch (error) { reject(error); }
          request.destroy();
        });
      });
      if (chunked) {
        // Deliberately never end: overflow must respond without waiting for EOF.
        request.write(bytes.subarray(0, 32_768));
        setImmediate(() => request.write(bytes.subarray(32_768)));
      } else request.end(bytes);
    });
    const valid = JSON.stringify({ schemaVersion: 1, repoId: 'fixture', requestKey: 'http-boundary', baseRef: 'main', objective: 'Read fixture', question: 'What is café?', depth: 'quick' });
    const padded = (size: number) => valid + ' '.repeat(size - Buffer.byteLength(valid));
    await t.test('at and below the byte cap are admitted', async () => {
      for (const size of [65_535, 65_536]) assert.equal((await send(padded(size))).status, 200);
    });
    await t.test('declared-length and unfinished chunked overflow return JSON 413', async () => {
      for (const chunked of [false, true]) {
        const result = await send(padded(65_537), chunked);
        assert.equal(result.status, 413);
        assert.deepEqual(result.body, { ok: false, error: 'REQUEST_TOO_LARGE' });
        assert.equal(result.connection, 'close');
      }
    });
    await t.test('UTF-8 overflow counts bytes rather than characters', async () => {
      const body = JSON.stringify({ text: 'é'.repeat(32_768) });
      assert(body.length < 65_536);
      assert.equal((await send(body)).status, 413);
    });
    await t.test('malformed and schema-invalid input remain sanitized 400', async () => {
      for (const body of ['{', '{}', 'null']) {
        const result = await send(body);
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { ok: false, error: 'INVALID_INPUT' });
      }
    });
    await t.test('authentication still precedes body-size rejection', async () => {
      assert.equal((await send(padded(65_537), false, false)).status, 401);
    });
    await t.test('IPC client receives stable overflow code and subsequent requests succeed', async () => {
      const client = new DaemonClient(origin, token);
      await assert.rejects(client.call('submit', { text: 'x'.repeat(65_536) }), { message: 'REQUEST_TOO_LARGE' });
      assert.equal((await send(valid)).status, 200);
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});
