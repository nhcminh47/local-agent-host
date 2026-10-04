import { ERROR_CODES } from '../constants/error-codes.js';
import { AnalyzeRepoInput, AnalyzeRepoWireInput } from '../domain/task-contracts.js';
import { repoRootHash } from '../domain/snapshot-contracts.js';
import { GitSnapshotTools } from '../exploration/git-snapshot.js';
import { RepoRegistry } from '../exploration/repo-registry.js';
import { SecretFilter } from '../exploration/secret-filter.js';
import { TaskStore } from '../store/task-store.js';
import { scopeHash } from '../domain/path-scope.js';
import type { WorkspaceTrustService } from './workspace-trust-service.js';
import type { WorkspaceBindingValue } from '../domain/workspace-trust-contracts.js';

// Host-only admission/restore, ready for the explorer scheduler. The task, identity
// and events are committed together; retries never resolve the submitted ref again.
export class SnapshotTaskService {
  constructor(readonly store: TaskStore, readonly repos: RepoRegistry, readonly secrets = new SecretFilter(), readonly trust?: WorkspaceTrustService) {}

  async submit(raw: unknown) {
    const wire = AnalyzeRepoWireInput.parse(raw);
    let binding: WorkspaceBindingValue | undefined;
    let request;
    if (wire.schemaVersion === 2) {
      if (!this.trust || !wire.workspaceRef) throw new Error('WORKSPACE_SELECTION_REQUIRED');
      const authorized = await this.trust.requireRead(wire.workspaceRef);
      await this.repos.register(wire.workspaceRef, authorized.root);
      binding = authorized.binding;
      const { workspaceRef, ...fields } = wire;
      request = AnalyzeRepoInput.parse({ ...fields, schemaVersion: 1, repoId: workspaceRef });
    } else {
      request = wire;
      if (this.trust) {
        const selected = await this.trust.select(this.repos.root(request.repoId));
        binding = (await this.trust.requireRead(selected.workspaceRef)).binding;
      }
    }
    this.secrets.assertSafeInput(request);
    const existing = this.store.findSubmission(request);
    if (existing) {
      if (binding && (!this.store.workspaceBinding(existing.id) || this.store.workspaceBinding(existing.id)?.grantGeneration !== binding.grantGeneration)) throw new Error('WORKSPACE_TRUST_REQUIRED');
      const identity = this.store.snapshot(existing.id);
      if (!identity) throw new Error(ERROR_CODES.SNAPSHOT_MODE_CONFLICT);
      return { task: existing, created: false, snapshot: identity };
    }
    const rootHash = repoRootHash(this.repos.root(request.repoId));
    const tools = await GitSnapshotTools.capture(this.repos, request.repoId, request.baseRef, this.secrets, request.scope);
    if (repoRootHash(this.repos.root(request.repoId)) !== rootHash) throw new Error(ERROR_CODES.SNAPSHOT_REPO_CHANGED);
    if (binding) await this.trust!.assertBinding(binding);
    const admitted = this.store.submit(request, { schemaVersion: 1, baseCommit: tools.metadata.baseCommit, snapshotId: tools.metadata.snapshotId, repoRootHash: rootHash, ...(tools.metadata.scopeHash ? { scopeHash: tools.metadata.scopeHash } : {}) }, binding);
    // Another submission may have won while Git capture awaited. Return its identity.
    return { ...admitted, snapshot: this.store.snapshot(admitted.task.id)! };
  }

  async restore(taskId: string) {
    const task = this.store.get(taskId);
    const binding = this.store.workspaceBinding(taskId);
    if (binding) await this.trust?.assertBinding(binding);
    else if (this.trust) await this.trust.requireRead((await this.trust.select(this.repos.root(task.repoId))).workspaceRef);
    const identity = this.store.snapshot(taskId);
    if (!identity) throw new Error(ERROR_CODES.SNAPSHOT_NOT_ADMITTED);
    if (repoRootHash(this.repos.root(task.repoId)) !== identity.repoRootHash) throw new Error(ERROR_CODES.SNAPSHOT_REPO_CHANGED);
    const request = AnalyzeRepoInput.parse(JSON.parse(task.payloadJson));
    if ((request.scope ? scopeHash(request.scope) : undefined) !== identity.scopeHash) throw new Error(ERROR_CODES.SNAPSHOT_SCOPE_MISMATCH);
    const tools = await GitSnapshotTools.capture(this.repos, task.repoId, identity.baseCommit, this.secrets, request.scope);
    if (tools.metadata.baseCommit !== identity.baseCommit || tools.metadata.snapshotId !== identity.snapshotId || repoRootHash(this.repos.root(task.repoId)) !== identity.repoRootHash) throw new Error(ERROR_CODES.SNAPSHOT_IDENTITY_MISMATCH);
    return tools;
  }

  async bindingForTask(taskId: string): Promise<WorkspaceBindingValue | null> {
    const binding = this.store.workspaceBinding(taskId);
    if (binding) return binding;
    if (!this.trust) return null;
    const identity = await this.trust.select(this.repos.root(this.store.get(taskId).repoId));
    return (await this.trust.requireRead(identity.workspaceRef)).binding;
  }
}
