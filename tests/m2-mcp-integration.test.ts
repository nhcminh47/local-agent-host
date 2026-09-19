import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('MCP explorer preserves snapshots and contains failure canaries across persistence and restart', { timeout: 40_000 }, async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../src/m2/explorer-mcp-smoke.js', import.meta.url))], { env: { ...process.env, M2_LIVE_OLLAMA: '0' }, windowsHide: true, timeout: 35_000, maxBuffer: 65_536 });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.status, 'passed');
  assert.equal(result.failureCases, 7);
  assert(result.checks.includes('failure/output canaries absent from SQLite rows and DB/WAL bytes'));
  assert(result.checks.includes('terminal failures survive restart without inference replay'));
});
