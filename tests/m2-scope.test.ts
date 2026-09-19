import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { PathScope, inScope } from '../src/domain/path-scope.js';
import { AnalyzeRepoInput } from '../src/domain/task-contracts.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { GitSnapshotTools } from '../src/exploration/git-snapshot.js';
import { SecretFilter } from '../src/exploration/secret-filter.js';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { CapabilityService } from '../src/exploration/capability-service.js';
import { SearchService } from '../src/exploration/search-service.js';
import { TaskStore } from '../src/store/task-store.js';
import { SnapshotTaskService } from '../src/service/snapshot-task-service.js';
import { runExplorer } from '../src/service/explorer-loop.js';
import type { ExplorerMessage } from '../src/provider/explorer-provider.js';

test('scope grammar is bounded, canonical and uses case-sensitive segment boundaries', () => {
  const scope = PathScope.parse({ allow: ['src/**', 'README.md', 'src/**'], deny: ['src/private/**'] });
  assert.deepEqual(scope.allow, ['README.md', 'src/**']);
  for (const path of ['src/a.ts', 'src/đọc mã.ts', 'README.md']) assert(inScope(path, scope));
  for (const path of ['src2/a.ts', 'SRC/a.ts', 'src/private/a.ts', 'README.md/child', 'src']) assert(!inScope(path, scope));
  for (const pattern of ['/src/**', '../src', 'src/../a', 'C:/src', 'src\\a', './src', 'src//a', 'src/', 'src/*.ts', 'src/**/a', 'src/\0a']) {
    assert.equal(PathScope.safeParse({ allow: [pattern] }).success, false, pattern);
  }
  assert.equal(PathScope.safeParse({ allow: [] }).success, false);
  assert.equal(PathScope.safeParse({ allow: ['**'], unknown: true }).success, false);
  assert.equal(PathScope.safeParse({ allow: Array(33).fill('src') }).success, false);
});

async function fixture(run: (dir: string, repo: string, repos: RepoRegistry, git: (...args: string[]) => Promise<string>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-scope-'));
  const repo = join(dir, 'repo'); await mkdir(repo);
  const executable = await resolveExecutable('git'); assert(executable);
  const exec = promisify(execFile);
  const git = async (...args: string[]) => (await exec(executable, ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true })).stdout.trim();
  try {
    await mkdir(join(repo, 'src/private'), { recursive: true }); await mkdir(join(repo, 'src2'));
    for (const [path, text] of Object.entries({ 'src/a.ts': 'MATCH old', 'src/b.ts': 'MATCH two', 'src/private/key.ts': 'MATCH outside-canary', 'src2/a.ts': 'MATCH outside-canary', '.env': 'password=fixture', 'README.md': 'MATCH readme' })) await writeFile(join(repo, path), text);
    await git('init'); await git('add', '.'); await git('commit', '-m', 'fixture');
    const repos = new RepoRegistry(); await repos.register('fixture', repo);
    await run(dir, repo, repos, git);
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}
const scope = PathScope.parse({ allow: ['src/**'], deny: ['src/private/**'] });

test('snapshot scope filters list before pagination and protects read plus both search backends', async () => fixture(async (dir, repo, repos) => {
  const tools = await GitSnapshotTools.capture(repos, 'fixture', 'HEAD', new SecretFilter(), scope);
  const index = await readFile(join(repo, '.git/index'));
  assert.deepEqual((await tools.listFiles('fixture', '', 1)).files, ['src/a.ts']);
  assert.deepEqual((await tools.listFiles('fixture', 'src/a.ts', 1)).files, ['src/b.ts']);
  for (const path of ['src/private/key.ts', 'src2/a.ts', '.env', '../src/a.ts']) await assert.rejects(() => tools.readFile('fixture', path), /PATH_DENIED/);
  assert.match((await tools.readFile('fixture', 'src/a.ts')).content, /MATCH old/);
  const built = await tools.searchBuiltin('fixture', 'MATCH');
  assert.deepEqual(built.matches.map(item => item.path), ['src/a.ts', 'src/b.ts']);
  const capabilities = new CapabilityService(join(dir, 'capabilities.db'));
  try {
    const check = await capabilities.check({ schemaVersion: 1, capability: 'ripgrep' });
    if (check.status === 'available') {
      const searched = await new SearchService(tools, capabilities).search({ schemaVersion: 1, repoId: 'fixture', pattern: 'MATCH' });
      assert('matches' in searched); assert.deepEqual(searched.matches, built.matches);
    }
  } finally { capabilities.close(); }
  const all = await GitSnapshotTools.capture(repos, 'fixture', 'HEAD', new SecretFilter(), PathScope.parse({ allow: ['**'] }));
  await assert.rejects(() => all.readFile('fixture', '.env'), /PATH_DENIED/);
  assert.deepEqual(await readFile(join(repo, '.git/index')), index);
}));

test('scope persists across store restart and HEAD changes; idempotency cannot broaden it', async () => fixture(async (dir, repo, repos, git) => {
  const dbPath = join(dir, 'tasks.db'); let store = new TaskStore(dbPath);
  const request = AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey: 'scope', baseRef: 'HEAD', objective: 'Read', question: 'Find MATCH', scope, focusPaths: ['src2/a.ts'] });
  try {
    let service = new SnapshotTaskService(store, repos);
    const admitted = await service.submit(request);
    assert(admitted.snapshot.scopeHash);
    store.claim(admitted.task.id, 'fixture', 1000);
    await writeFile(join(repo, 'src/a.ts'), 'MATCH new'); await git('add', '.'); await git('commit', '-m', 'advance');
    store.close(); store = new TaskStore(dbPath); store.recoverInterrupted(); service = new SnapshotTaskService(store, repos);
    const duplicate = await service.submit({ ...request, scope: { allow: ['src/**', 'src/**'], deny: ['src/private/**'] } });
    assert.equal(duplicate.created, false); assert.deepEqual(duplicate.snapshot, admitted.snapshot);
    await assert.rejects(() => service.submit({ ...request, scope: { allow: ['**'], deny: [] } }), /IDEMPOTENCY_CONFLICT/);
    const restored = await service.restore(admitted.task.id);
    assert.match((await restored.readFile('fixture', 'src/a.ts')).content, /MATCH old/);
    await assert.rejects(() => restored.readFile('fixture', 'src2/a.ts'), /PATH_DENIED/);
    assert.equal(restored.metadata.scopeHash, admitted.snapshot.scopeHash);
    const broad = await service.submit({ ...request, requestKey: 'broad', baseRef: admitted.snapshot.baseCommit, scope: { allow: ['**'], deny: [] } });
    assert.notEqual(broad.snapshot.snapshotId, admitted.snapshot.snapshotId);
    // A corrupted scope in persisted payload must fail closed against identity.
    const db = new Database(dbPath);
    try { db.prepare('UPDATE tasks SET payload_json=? WHERE id=?').run(JSON.stringify({ ...request, scope: { allow: ['**'], deny: [] } }), admitted.task.id); }
    finally { db.close(); }
    await assert.rejects(() => service.restore(admitted.task.id), /SNAPSHOT_SCOPE_MISMATCH/);
  } finally { store.close(); }
}));

test('model cannot use focus paths or tool calls to escape enforced scope', async () => fixture(async (dir, _repo, repos) => {
  const tools = await GitSnapshotTools.capture(repos, 'fixture', 'HEAD', new SecretFilter(), scope);
  const capabilities = new CapabilityService(join(dir, 'loop-capabilities.db'), 'missing-rg-fixture');
  const request = AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey: 'loop', baseRef: 'HEAD', objective: 'Read', question: 'Find MATCH', scope, focusPaths: ['src2/a.ts'] });
  const call = (name: string, args: unknown): ExplorerMessage => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
  const replies = [call('read_file', { path: 'src2/a.ts' }), call('list_files', {}), call('search_code', { pattern: 'MATCH' }), call('finish_analysis', {
    findings: [{ id: 'matches', statement: 'Eligible source lines contain the requested literal.', basis: 'inference', citations: [{ path: 'src/a.ts', startLine: 1, endLine: 1 }, { path: 'src/b.ts', startLine: 1, endLine: 1 }] }],
    limitations: [{ kind: 'outside_scope', description: 'The requested focus path could not be inspected under the enforced scope.', path: 'src2/a.ts', citations: [] }],
  })];
  let turns = 0;
  try {
    await capabilities.resolve({ schemaVersion: 1, capability: 'ripgrep', decision: 'use_builtin_fallback' });
    const result = await runExplorer(request, tools, capabilities, { async chat(messages) {
      assert(!JSON.stringify(messages).includes('outside-canary'));
      if (turns === 1) assert.equal(JSON.parse(messages.at(-1)!.content).reason, 'SCOPE_PATH_UNAVAILABLE');
      if (turns === 2) assert.deepEqual(JSON.parse(messages.at(-1)!.content).files, ['src/a.ts', 'src/b.ts']);
      turns++; return replies.shift()!;
    } }, new AbortController().signal);
    assert.deepEqual(result.evidence.map(item => item.path), ['src/a.ts', 'src/b.ts']);
    assert.equal(result.limitations[0]?.kind, 'outside_scope');
    assert.equal(result.snapshot.scopeHash, tools.metadata.scopeHash);
  } finally { capabilities.close(); }
}));
