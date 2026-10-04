import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { WorkspaceGrantStore } from '../src/store/workspace-grant-store.js';
import { WorkspaceTrustService } from '../src/service/workspace-trust-service.js';
import { TaskStore } from '../src/store/task-store.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { SnapshotTaskService } from '../src/service/snapshot-task-service.js';
import { ExplorerRunner } from '../src/service/explorer-runner.js';
import { CapabilityService } from '../src/exploration/capability-service.js';
import type { ExplorerProvider } from '../src/provider/explorer-provider.js';

test('revocation aborts active inference and fences completion', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-revoke-'));
  const git = await resolveExecutable('git');
  assert(git);
  const runGit = (...args: string[]) => promisify(execFile)(git, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
  let store: TaskStore | undefined;
  let grants: WorkspaceGrantStore | undefined;
  let capabilities: CapabilityService | undefined;
  try {
    await runGit('init');
    await writeFile(join(root, 'fact.txt'), 'VALUE=9\n');
    await runGit('add', 'fact.txt');
    await runGit('commit', '-m', 'fixture');
    const db = join(root, 'tasks.db');
    store = new TaskStore(db);
    grants = new WorkspaceGrantStore(db);
    capabilities = new CapabilityService(db);
    const trust = new WorkspaceTrustService(grants);
    const selected = await trust.select(root);
    await trust.grant(selected.workspaceRef, 'durable');
    const service = new SnapshotTaskService(store, new RepoRegistry(), undefined, trust);
    const task = await service.submit({ schemaVersion: 2, workspaceRef: selected.workspaceRef, requestKey: 'revocation', baseRef: 'HEAD', objective: 'Read fixture', question: 'What value?' });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    const provider: ExplorerProvider = { async chat(_messages, _tools, signal) {
      calls++;
      entered();
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) { reject(new Error('ABORTED')); return; }
        signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true });
      });
      return { role: 'assistant', content: '' };
    } };
    const runner = new ExplorerRunner(service, capabilities, provider);
    const running = runner.tick();
    await started;
    trust.revoke(selected.workspaceRef);
    store.cancel(task.task.id, 'WORKSPACE_TRUST_REVOKED');
    runner.cancel(task.task.id);
    await running;
    assert.equal(store.get(task.task.id).status, 'cancelled');
    assert.equal(calls, 1);
  } finally {
    capabilities?.close(); store?.close(); grants?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});
