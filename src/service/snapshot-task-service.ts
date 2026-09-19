import { AnalyzeRepoInput } from '../domain/task-contracts.js';
import { repoRootHash } from '../domain/snapshot-contracts.js';
import { GitSnapshotTools } from '../exploration/git-snapshot.js';
import { RepoRegistry } from '../exploration/repo-registry.js';
import { SecretFilter } from '../exploration/secret-filter.js';
import { TaskStore } from '../store/task-store.js';
import { scopeHash } from '../domain/path-scope.js';

// Host-only admission/restore, ready for the explorer scheduler. The task, identity
// and events are committed together; retries never resolve the submitted ref again.
export class SnapshotTaskService {
  constructor(readonly store: TaskStore, readonly repos: RepoRegistry, readonly secrets = new SecretFilter()) {}

  async submit(raw: unknown) {
    const request = AnalyzeRepoInput.parse(raw);
    this.secrets.assertSafeInput(request);
    const existing = this.store.findSubmission(request);
    if (existing) {
      const identity = this.store.snapshot(existing.id);
      if (!identity) throw new Error('SNAPSHOT_MODE_CONFLICT');
      return { task: existing, created: false, snapshot: identity };
    }
    const rootHash = repoRootHash(this.repos.root(request.repoId));
    const tools = await GitSnapshotTools.capture(this.repos, request.repoId, request.baseRef, this.secrets, request.scope);
    if (repoRootHash(this.repos.root(request.repoId)) !== rootHash) throw new Error('SNAPSHOT_REPO_CHANGED');
    const admitted = this.store.submit(request, { schemaVersion: 1, baseCommit: tools.metadata.baseCommit, snapshotId: tools.metadata.snapshotId, repoRootHash: rootHash, ...(tools.metadata.scopeHash ? { scopeHash: tools.metadata.scopeHash } : {}) });
    // Another submission may have won while Git capture awaited. Return its identity.
    return { ...admitted, snapshot: this.store.snapshot(admitted.task.id)! };
  }

  async restore(taskId: string) {
    const task = this.store.get(taskId);
    const identity = this.store.snapshot(taskId);
    if (!identity) throw new Error('SNAPSHOT_NOT_ADMITTED');
    if (repoRootHash(this.repos.root(task.repoId)) !== identity.repoRootHash) throw new Error('SNAPSHOT_REPO_CHANGED');
    const request = AnalyzeRepoInput.parse(JSON.parse(task.payloadJson));
    if ((request.scope ? scopeHash(request.scope) : undefined) !== identity.scopeHash) throw new Error('SNAPSHOT_SCOPE_MISMATCH');
    const tools = await GitSnapshotTools.capture(this.repos, task.repoId, identity.baseCommit, this.secrets, request.scope);
    if (tools.metadata.baseCommit !== identity.baseCommit || tools.metadata.snapshotId !== identity.snapshotId || repoRootHash(this.repos.root(task.repoId)) !== identity.repoRootHash) throw new Error('SNAPSHOT_IDENTITY_MISMATCH');
    return tools;
  }
}
