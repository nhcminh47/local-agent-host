import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '../src/exploration/capabilities.js';
import { ReadTools } from '../src/exploration/read-tools.js';
import { PathDenied, RepoRegistry } from '../src/exploration/repo-registry.js';

async function repoFixture(run: (root: string, tools: ReadTools) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-m2-repo-'));
  try {
    await mkdir(join(root, 'src'));
    await mkdir(join(root, '.git'));
    await writeFile(join(root, 'src', 'app.ts'), 'export function paginate() {\n  return "pagination";\n}\n', 'utf8');
    await writeFile(join(root, 'README.md'), 'fixture repository\n', 'utf8');
    await writeFile(join(root, '.env'), 'SECRET_CANARY=never-return\n', 'utf8');
    await writeFile(join(root, '.git', 'config'), 'never-return\n', 'utf8');
    const registry = new RepoRegistry();
    await registry.register('fixture', root);
    await run(root, new ReadTools(registry));
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}

test('read_file is bounded, line-numbered and denies traversal and secrets', async () => repoFixture(async (_root, tools) => {
  const result = await tools.readFile('fixture', 'src/app.ts', 2, 2);
  assert.equal(result.content, '2:   return "pagination";');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(() => tools.readFile('fixture', '../outside'), PathDenied);
  await assert.rejects(() => tools.readFile('fixture', '.env'), /PATH_DENIED/);
}));

test('list_files excludes denied trees and paginates with stable cursor', async () => repoFixture(async (_root, tools) => {
  const first = await tools.listFiles('fixture', '', 1);
  assert.deepEqual(first.files, ['README.md']);
  assert.equal(first.truncated, true);
  const second = await tools.listFiles('fixture', first.nextCursor ?? '', 10);
  assert.deepEqual(second.files, ['src/app.ts']);
  assert.equal(second.truncated, false);
}));

test('Node search fallback returns bounded evidence without secret files', async () => repoFixture(async (_root, tools) => {
  const result = await tools.searchBuiltin('fixture', 'paginate', 10);
  assert.equal(result.backend, 'node');
  assert.deepEqual(result.matches, [{ path: 'src/app.ts', line: 1, preview: 'export function paginate() {' }]);
  assert.equal(JSON.stringify(result).includes('never-return'), false);
}));

test('capability preflight returns install/fallback/cancel when rg is absent', async () => {
  const registry = new CapabilityRegistry();
  const capability = await registry.ripgrep('definitely-missing-rg-executable');
  assert.deepEqual(capability, { status: 'missing', choices: ['install', 'use_builtin_fallback', 'cancel'] });
});
