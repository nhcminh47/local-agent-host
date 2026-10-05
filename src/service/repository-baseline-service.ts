import type { RepositoryBaselineValue } from '../domain/repository-baseline-contracts.js';
import type { GitSnapshotTools } from '../exploration/git-snapshot.js';
import { buildRepositoryBaseline } from '../exploration/repository-baseline.js';
import { RepositoryBaselineStore } from '../store/repository-baseline-store.js';
import { SnapshotTaskService } from './snapshot-task-service.js';

export type BaselineContext = {
  schemaVersion: 1;
  currentSnapshotId: string;
  baselineSourceSnapshotId: string;
  claims: RepositoryBaselineValue['claims'];
  unknowns: string[];
};

export class RepositoryBaselineService {
  constructor(readonly store: RepositoryBaselineStore, readonly admission: SnapshotTaskService) {}

  async current(snapshot: GitSnapshotTools, repoId: string, signal: AbortSignal): Promise<RepositoryBaselineValue> {
    const built = await buildRepositoryBaseline(snapshot, repoId, this.admission.repos.root(repoId), signal);
    return this.store.saveOrReuse(built);
  }

  async inspect(taskId: string): Promise<{ baseline: RepositoryBaselineValue; versions: RepositoryBaselineValue[] }> {
    const snapshot = await this.admission.restore(taskId);
    const task = this.admission.store.get(taskId);
    const baseline = await this.current(snapshot, task.repoId, new AbortController().signal);
    return { baseline, versions: this.store.versions(baseline.repoRootHash, task.repoId, snapshot.metadata.scopeHash) };
  }

  context(baseline: RepositoryBaselineValue, currentSnapshotId: string): BaselineContext {
    let projection: BaselineContext = {
      schemaVersion: 1, currentSnapshotId, baselineSourceSnapshotId: baseline.snapshotId,
      claims: baseline.claims.slice(0, 20), unknowns: baseline.unknowns,
    };
    while (Buffer.byteLength(JSON.stringify(projection)) > 2_048 && projection.claims.length) projection = { ...projection, claims: projection.claims.slice(0, -1) };
    while (Buffer.byteLength(JSON.stringify(projection)) > 2_048 && projection.unknowns.length) projection = { ...projection, unknowns: projection.unknowns.slice(0, -1) };
    if (Buffer.byteLength(JSON.stringify(projection)) > 2_048) throw new Error('BASELINE_CONTEXT_LIMIT');
    return projection;
  }
}
