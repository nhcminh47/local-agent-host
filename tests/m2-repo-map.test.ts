import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { GitSnapshotTools } from '../src/exploration/git-snapshot.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { SecretFilter } from '../src/exploration/secret-filter.js';
import { buildRepoMap } from '../src/exploration/repo-map.js';

test('RepoMap is deterministic, scoped, filtered, committed and bounded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repo-map-'));
  const executable = await resolveExecutable('git');
  assert(executable);
  const git = async (...args: string[]) => promisify(execFile)(executable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
  try {
    await git('init');
    await mkdir(join(root, 'src'));
    await mkdir(join(root, 'tests'));
    await mkdir(join(root, 'private'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'committed-name', scripts: { check: 'secret-command-canary', test: 'node --test' } }));
    await writeFile(join(root, 'src', 'main.ts'), 'export const value = 731;\n');
    await writeFile(join(root, 'tests', 'main.test.ts'), 'export {};\n');
    await writeFile(join(root, 'private', 'package.json'), JSON.stringify({ name: 'private-package', scripts: { leak: 'private-canary' } }));
    await writeFile(join(root, 'README.md'), 'public\n');
    await writeFile(join(root, 'AGENTS.md'), 'password = secret-canary\n');
    await git('add', '.');
    await git('commit', '-m', 'fixture');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'dirty-name', scripts: { dirty: 'dirty-canary' } }));
    const repos = new RepoRegistry();
    await repos.register('fixture', root);
    const scope = { allow: ['package.json', 'src/**', 'tests/**', 'README.md', 'AGENTS.md'], deny: [] };
    const snapshot = await GitSnapshotTools.capture(repos, 'fixture', 'HEAD', new SecretFilter(['secret-canary']), scope);
    const map = await buildRepoMap(snapshot, 'fixture', new AbortController().signal);
    assert.equal(map.snapshotId, snapshot.metadata.snapshotId);
    assert.equal(map.scopeHash, snapshot.metadata.scopeHash);
    assert.deepEqual(map.packages, [{ path: '.', name: 'committed-name', scripts: ['check', 'test'] }]);
    assert(map.entryPoints.includes('src/main.ts'));
    assert(!JSON.stringify(map).includes('private'));
    assert(!JSON.stringify(map).includes('dirty'));
    assert(!JSON.stringify(map).includes('secret-command-canary'));
    assert(!JSON.stringify(map).includes('secret-canary'));
    assert.deepEqual(await buildRepoMap(snapshot, 'fixture', new AbortController().signal), map);
    assert(Buffer.byteLength(JSON.stringify(map)) <= 4096);
    const manifestOid = (await git('rev-parse', 'HEAD:package.json')).stdout.trim();
    await rm(join(root, '.git', 'objects', manifestOid.slice(0, 2), manifestOid.slice(2)));
    await assert.rejects(() => buildRepoMap(snapshot, 'fixture', new AbortController().signal), /GIT_OBJECT_UNAVAILABLE/);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});

test('RepoMap truncates large eligible path sets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repo-map-limit-'));
  const executable = await resolveExecutable('git');
  assert(executable);
  const git = async (...args: string[]) => promisify(execFile)(executable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
  try {
    await git('init');
    await mkdir(join(root, 'src'));
    for (let index = 0; index < 80; index++) await writeFile(join(root, 'src', `entry-${String(index).padStart(3, '0')}.ts`), 'export {};\n');
    await mkdir(join(root, 'tests'));
    for (let index = 0; index < 80; index++) {
      const directory = join(root, 'tests', `group-${String(index).padStart(3, '0')}`);
      await mkdir(directory);
      await writeFile(join(directory, 'case.ts'), 'export {};\n');
    }
    await git('add', '.'); await git('commit', '-m', 'fixture');
    const repos = new RepoRegistry(); await repos.register('fixture', root);
    const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
    const map = await buildRepoMap(snapshot, 'fixture', new AbortController().signal);
    assert(map.truncated);
    assert(Buffer.byteLength(JSON.stringify(map)) <= 4096);
    assert(map.testRoots.length <= 24);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});
