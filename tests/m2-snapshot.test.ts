import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { GitSnapshotTools } from '../src/exploration/git-snapshot.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { SnapshotTaskService } from '../src/service/snapshot-task-service.js';
import { TaskStore } from '../src/store/task-store.js';
import { AnalyzeRepoInput } from '../src/domain/task-contracts.js';
import Database from 'better-sqlite3';

const exec = promisify(execFile);
const request = () => AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey: 'snapshot-1', baseRef: 'HEAD', objective: 'Read fixture', question: 'What is the committed value?' });
async function fixture(run: (root: string, repos: RepoRegistry, git: (...args: string[]) => Promise<string>) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-snapshot-'));
  const executable = await resolveExecutable('git');
  assert(executable, 'Git is required for snapshot tests');
  const git = async (...args: string[]) => (await exec(executable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true })).stdout.trim();
  try {
    await git('init');
    await writeFile(join(root, 'facts.txt'), 'SNAPSHOT_VALUE = 731\npassword = fixture-canary\n');
    await writeFile(join(root, '.env'), 'DENIED_CANARY');
    await git('add', '.');
    await git('commit', '-m', 'fixture baseline');
    const repos = new RepoRegistry();
    await repos.register('fixture', root);
    await run(root, repos, git);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}

test('snapshot stays at admitted commit across dirty checkout and later commits', async () => fixture(async (root, repos, git) => {
  const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
  const commit = await git('rev-parse', 'HEAD');
  assert.equal(snapshot.metadata.baseCommit, commit);
  assert(Object.isFrozen(snapshot.metadata));
  await writeFile(join(root, 'facts.txt'), 'SNAPSHOT_VALUE = 999\n');
  await writeFile(join(root, 'untracked.txt'), 'untracked');
  const status = await git('status', '--porcelain=v1');
  const index = await readFile(join(root, '.git', 'index'));
  const read = await snapshot.readFile('fixture', 'facts.txt');
  assert.match(read.content, /731/);
  assert.doesNotMatch(read.content, /fixture-canary/);
  assert.equal(read.snapshot?.baseCommit, commit);
  assert.equal(await git('status', '--porcelain=v1'), status);
  assert.deepEqual(await readFile(join(root, '.git', 'index')), index);
  assert.equal(await readFile(join(root, 'facts.txt'), 'utf8'), 'SNAPSHOT_VALUE = 999\n');
  await git('add', 'facts.txt');
  await git('commit', '-m', 'fixture advance');
  assert.match((await snapshot.readFile('fixture', 'facts.txt')).content, /731/);
  assert.equal((await snapshot.searchBuiltin('fixture', '999')).matches.length, 0);
  const search = await snapshot.searchBuiltin('fixture', '731');
  assert.equal(search.matches.length, 1);
  assert.equal(search.snapshot?.baseCommit, commit);
  const newer = await GitSnapshotTools.capture(repos, 'fixture');
  assert.notEqual(newer.metadata.snapshotId, snapshot.metadata.snapshotId);
  assert.match((await newer.readFile('fixture', 'facts.txt')).content, /999/);
  await assert.rejects(() => snapshot.readFile('fixture', 'untracked.txt'), /PATH_DENIED/);
}));

test('snapshot rejects refs, traversal, denied files and registrations below Git root', async () => fixture(async (root, repos) => {
  for (const ref of ['--help', 'HEAD:path', '../HEAD', 'HEAD~1', 'missing-reference']) await assert.rejects(() => GitSnapshotTools.capture(repos, 'fixture', ref));
  const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
  for (const path of ['.env', '../facts.txt', '/facts.txt', 'facts.txt:stream']) await assert.rejects(() => snapshot.readFile('fixture', path), /PATH_DENIED/);
  assert.deepEqual((await snapshot.listFiles('fixture')).files, ['facts.txt']);
  await assert.rejects(() => snapshot.readFile('unknown', 'facts.txt'), /UNKNOWN_REPO/);
  await mkdir(join(root, 'sub'));
  const nested = new RepoRegistry();
  await nested.register('nested', join(root, 'sub'));
  await assert.rejects(() => GitSnapshotTools.capture(nested, 'nested'), /GIT_ROOT_REQUIRED/);
}));

test('snapshot excludes symlink and gitlink tree entries without checking them out', async () => fixture(async (_root, repos, git) => {
  const blob = await git('rev-parse', 'HEAD:facts.txt');
  const commit = await git('rev-parse', 'HEAD');
  await git('update-index', '--add', '--cacheinfo', `120000,${blob},link`);
  await git('update-index', '--add', '--cacheinfo', `160000,${commit},submodule`);
  await git('commit', '-m', 'fixture special entries');
  const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
  assert.deepEqual((await snapshot.listFiles('fixture')).files, ['facts.txt']);
  assert.equal(snapshot.metadata.excludedEntries, 3);
}));

test('snapshot ignores replacement refs and fails closed when the committed blob is missing', async () => fixture(async (root, repos, git) => {
  const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
  const original = await git('rev-parse', 'HEAD:facts.txt');
  await writeFile(join(root, 'facts.txt'), 'SNAPSHOT_VALUE = 999\n');
  await git('add', 'facts.txt');
  await git('commit', '-m', 'fixture alternative');
  const replacement = await git('rev-parse', 'HEAD:facts.txt');
  await git('replace', original, replacement);
  assert.match((await snapshot.readFile('fixture', 'facts.txt')).content, /731/);
  await rm(join(root, '.git', 'objects', original.slice(0, 2), original.slice(2)));
  await assert.rejects(() => snapshot.readFile('fixture', 'facts.txt'), /GIT_OBJECT_UNAVAILABLE/);
  assert.equal(await readFile(join(root, 'facts.txt'), 'utf8'), 'SNAPSHOT_VALUE = 999\n');
}));

test('durable snapshot survives store restart and recovery without resolving HEAD again', async () => fixture(async (root, repos, git) => {
  const db = join(root, 'tasks.db');
  let store = new TaskStore(db);
  try {
    let service = new SnapshotTaskService(store, repos);
    const admitted = await service.submit(request());
    const identity = admitted.snapshot;
    store.claim(admitted.task.id, 'old-worker', 30_000);
    await writeFile(join(root, 'facts.txt'), 'SNAPSHOT_VALUE = 999\n');
    await git('add', 'facts.txt');
    await git('commit', '-m', 'advance after admission');
    store.close();
    store = new TaskStore(db);
    const freshRepos = new RepoRegistry();
    await freshRepos.register('fixture', root);
    service = new SnapshotTaskService(store, freshRepos);
    assert.equal(store.recoverInterrupted(), 1);
    const duplicate = await service.submit(request());
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.task.id, admitted.task.id);
    assert.deepEqual(duplicate.snapshot, identity);
    const restored = await service.restore(admitted.task.id);
    assert.match((await restored.readFile('fixture', 'facts.txt')).content, /731/);
    assert.equal(store.events(admitted.task.id).filter(event => event.type === 'task.snapshot_admitted').length, 1);
    await assert.rejects(() => service.submit({ ...request(), question: 'Different request' }), /IDEMPOTENCY_CONFLICT/);
    // Losing the old commit must not prevent retrieval of an existing admission.
    await rm(join(root, '.git', 'objects', identity.baseCommit.slice(0, 2), identity.baseCommit.slice(2)));
    assert.equal((await service.submit(request())).task.id, admitted.task.id);
    await assert.rejects(() => service.restore(admitted.task.id), /GIT_OBJECT_UNAVAILABLE/);
  } finally { store.close(); }
}));

test('snapshot admission rolls back task and identity if event publication fails', async () => fixture(async (root, repos) => {
  const path = join(root, 'tasks.db');
  const store = new TaskStore(path);
  const diagnostic = new Database(path);
  try {
    diagnostic.exec("CREATE TRIGGER reject_snapshot_event BEFORE INSERT ON task_events WHEN NEW.type='task.snapshot_admitted' BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END");
    const service = new SnapshotTaskService(store, repos);
    await assert.rejects(() => service.submit(request()));
    assert.equal(store.findSubmission(request()), null);
    for (const table of ['tasks', 'task_snapshots', 'task_events']) assert.equal((diagnostic.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
    diagnostic.exec('DROP TRIGGER reject_snapshot_event');
    assert.equal((await service.submit(request())).created, true);
  } finally { diagnostic.close(); store.close(); }
}));

test('concurrent duplicate admissions share one identity and legacy tasks cannot be retrofitted', async () => fixture(async (root, repos) => {
  const store = new TaskStore(join(root, 'tasks.db'));
  try {
    const service = new SnapshotTaskService(store, repos);
    const submissions = await Promise.all([service.submit(request()), service.submit(request())]);
    assert.equal(submissions.filter(item => item.created).length, 1);
    assert.equal(submissions[0]!.task.id, submissions[1]!.task.id);
    assert.deepEqual(submissions[0]!.snapshot, submissions[1]!.snapshot);
    assert.throws(() => store.submit(request()), /SNAPSHOT_MODE_CONFLICT/);
    const legacy = { ...request(), requestKey: 'legacy' };
    const oldTask = store.submit(legacy).task;
    await assert.rejects(() => service.submit(legacy), /SNAPSHOT_MODE_CONFLICT/);
    await assert.rejects(() => service.restore(oldTask.id), /SNAPSHOT_NOT_ADMITTED/);
  } finally { store.close(); }
}));

test('restore rejects changed repo registration and corrupt persisted identity', async () => fixture(async (root, repos) => {
  const path = join(root, 'tasks.db');
  const store = new TaskStore(path);
  const diagnostic = new Database(path);
  try {
    const service = new SnapshotTaskService(store, repos);
    const admitted = await service.submit(request());
    await mkdir(join(root, 'different-root'));
    const changed = new RepoRegistry();
    await changed.register('fixture', join(root, 'different-root'));
    await assert.rejects(() => new SnapshotTaskService(store, changed).restore(admitted.task.id), /SNAPSHOT_REPO_CHANGED/);
    diagnostic.prepare('UPDATE task_snapshots SET identity_json=? WHERE task_id=?').run('{}', admitted.task.id);
    await assert.rejects(() => service.restore(admitted.task.id), /INVALID_PERSISTED_SNAPSHOT/);
  } finally { diagnostic.close(); store.close(); }
}));
