import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { resolveWorkspace } from '../src/exploration/workspace-identity.js';
import { WorkspaceGrantStore } from '../src/store/workspace-grant-store.js';
import { WorkspaceTrustService } from '../src/service/workspace-trust-service.js';
import { TaskStore } from '../src/store/task-store.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { SnapshotTaskService } from '../src/service/snapshot-task-service.js';
import Database from 'better-sqlite3';

test('workspace selection is separate from read trust, and durable grant survives restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-trust-'));
  const gitExecutable = await resolveExecutable('git');
  assert(gitExecutable);
  const git = async (...args: string[]) => (await promisify(execFile)(gitExecutable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true })).stdout.trim();
  const db = join(root, 'tasks.db');
  let grants: WorkspaceGrantStore | undefined;
  let tasks: TaskStore | undefined;
  try {
    await git('init');
    await writeFile(join(root, 'facts.txt'), 'TRUSTED_VALUE=17\n');
    await writeFile(join(root, '.env'), 'SECRET_CANARY=hidden\n');
    await git('add', 'facts.txt');
    await git('commit', '-m', 'fixture');
    await mkdir(join(root, 'nested'));
    const identity = await resolveWorkspace(join(root, 'nested'));
    assert.equal(identity.root, (await resolveWorkspace(root)).root);
    grants = new WorkspaceGrantStore(db);
    tasks = new TaskStore(db);
    let trust = new WorkspaceTrustService(grants);
    const selected = await trust.select(root);
    assert.equal(selected.workspaceRef, identity.workspaceRef);
    await assert.rejects(() => trust.requireRead(identity.workspaceRef), /WORKSPACE_TRUST_REQUIRED/);
    const repos = new RepoRegistry();
    await repos.register('legacy', root);
    const legacy = await new SnapshotTaskService(tasks, repos).submit({ schemaVersion: 1, repoId: 'legacy', requestKey: 'legacy', baseRef: 'HEAD', objective: 'Read facts', question: 'What value?' });
    await assert.rejects(() => new SnapshotTaskService(tasks!, repos, undefined, trust).restore(legacy.task.id), /WORKSPACE_TRUST_REQUIRED/);
    const service = new SnapshotTaskService(tasks, repos, undefined, trust);
    const request = { schemaVersion: 2, workspaceRef: identity.workspaceRef, requestKey: 'trust-1', baseRef: 'HEAD', objective: 'Read facts', question: 'What value?', scope: { allow: ['facts.txt'] } };
    await assert.rejects(() => service.submit(request), /WORKSPACE_TRUST_REQUIRED/);
    assert.equal(tasks.nextQueued()?.id, legacy.task.id);
    await trust.grant(identity.workspaceRef, 'once');
    const admitted = await service.submit(request);
    assert.equal(tasks.workspaceBinding(admitted.task.id)?.capability, 'read');
    const snapshot = await service.restore(admitted.task.id);
    assert.match((await snapshot.readFile(identity.workspaceRef, 'facts.txt')).content, /17/);
    assert.deepEqual((await snapshot.listFiles(identity.workspaceRef)).files, ['facts.txt']);
    await assert.rejects(() => snapshot.readFile(identity.workspaceRef, '.env'), /SCOPE_PATH_DENIED/);
    trust = new WorkspaceTrustService(grants);
    await assert.rejects(() => trust.requireRead(identity.workspaceRef), /WORKSPACE_TRUST_REQUIRED/);
    await assert.rejects(() => new SnapshotTaskService(tasks!, repos, undefined, trust).restore(admitted.task.id), /WORKSPACE_TRUST_REQUIRED/);
    await trust.grant(identity.workspaceRef, 'durable');
    await trust.assertBinding(tasks.workspaceBinding(admitted.task.id)!);
    assert(await new SnapshotTaskService(tasks, repos, undefined, trust).restore(legacy.task.id));
    grants.close(); grants = new WorkspaceGrantStore(db);
    trust = new WorkspaceTrustService(grants);
    assert.equal((await trust.requireRead(identity.workspaceRef)).root, identity.root);
    trust.revoke(identity.workspaceRef);
    await assert.rejects(() => trust.requireRead(identity.workspaceRef), /WORKSPACE_TRUST_REQUIRED/);
    const cancelled = tasks.cancel(admitted.task.id, 'WORKSPACE_TRUST_REVOKED');
    assert.equal(cancelled.status, 'cancelled');
    await assert.rejects(() => new SnapshotTaskService(tasks!, repos, undefined, trust).restore(admitted.task.id), /WORKSPACE_TRUST_REQUIRED/);
  } finally {
    tasks?.close(); grants?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});

test('symlinked selection resolves to one root and linked worktrees have separate identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-trust-links-'));
  const repo = join(root, 'repo');
  const link = join(root, 'link');
  const worktree = join(root, 'worktree');
  const gitExecutable = await resolveExecutable('git');
  assert(gitExecutable);
  try {
    await mkdir(repo);
    const git = (...args: string[]) => promisify(execFile)(gitExecutable, ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
    await git('init');
    await writeFile(join(repo, 'fact.txt'), 'hello');
    await git('add', 'fact.txt');
    await git('commit', '-m', 'fixture');
    await symlink(repo, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(await resolveWorkspace(link), await resolveWorkspace(repo));
    await git('worktree', 'add', '--detach', worktree);
    const other = await resolveWorkspace(worktree);
    assert.notEqual(other.workspaceRef, (await resolveWorkspace(repo)).workspaceRef);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
});

test('malformed durable grant data fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-trust-corrupt-'));
  const path = join(root, 'grants.db');
  const grants = new WorkspaceGrantStore(path);
  try {
    const db = new Database(path);
    try { db.prepare('INSERT INTO workspace_selections(ref,identity_json,generation,durable) VALUES(?,?,?,?)').run(`ws-${'a'.repeat(32)}`, '{}', 1, 1); }
    finally { db.close(); }
    assert.throws(() => grants.list());
  } finally { grants.close(); await rm(root, { recursive: true, force: true }); }
});

test('replacing the Git marker invalidates an existing grant', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-trust-replace-'));
  const gitExecutable = await resolveExecutable('git');
  assert(gitExecutable);
  const git = async (...args: string[]) => promisify(execFile)(gitExecutable, ['-C', root, ...args], { windowsHide: true });
  const grants = new WorkspaceGrantStore(join(root, 'grants.db'));
  try {
    await git('init');
    const trust = new WorkspaceTrustService(grants);
    const identity = await trust.select(root);
    await trust.grant(identity.workspaceRef, 'durable');
    await rm(join(root, '.git'), { recursive: true, force: true });
    await git('init');
    await assert.rejects(() => trust.requireRead(identity.workspaceRef), /WORKSPACE_IDENTITY_CHANGED/);
    const replacement = await trust.select(root);
    assert.equal(replacement.workspaceRef, identity.workspaceRef);
    await assert.rejects(() => trust.requireRead(identity.workspaceRef), /WORKSPACE_TRUST_REQUIRED/);
  } finally { grants.close(); await rm(root, { recursive: true, force: true }); }
});
