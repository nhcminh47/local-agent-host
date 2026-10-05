import { createHash, randomUUID } from 'node:crypto';
import { GroundedFinding } from '../domain/exploration-result.js';
import { LearningProposeInput, type LearningItemValue } from '../domain/learning-contracts.js';
import { repoRootHash } from '../domain/snapshot-contracts.js';
import type { GitSnapshotTools } from '../exploration/git-snapshot.js';
import { LearningStore } from '../store/learning-store.js';
import { SnapshotTaskService } from './snapshot-task-service.js';

type Support = LearningItemValue['support'][number];
export type RetrievedLearning = Pick<LearningItemValue, 'id' | 'kind' | 'statement' | 'baseCommit' | 'support'>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class LearningService {
  constructor(readonly store: LearningStore, readonly admission: SnapshotTaskService) {}

  async propose(raw: unknown): Promise<LearningItemValue> {
    const input = LearningProposeInput.parse(raw);
    const task = this.admission.store.get(input.taskId);
    if (task.status !== 'completed' || !task.resultJson) throw new Error('LEARNING_SOURCE_NOT_COMPLETED');
    const result: unknown = JSON.parse(task.resultJson);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('LEARNING_SOURCE_INVALID');
    const record = result as Record<string, unknown>;
    if (record['schemaVersion'] !== 2 || record['outcome'] !== 'completed' ||
      (record['validation'] as Record<string, unknown> | undefined)?.['status'] !== 'grounded' || !Array.isArray(record['findings'])) throw new Error('LEARNING_SOURCE_INVALID');
    const finding = GroundedFinding.parse(record['findings'].find((item: unknown) => item && typeof item === 'object' && (item as Record<string, unknown>)['id'] === input.findingId));
    const identity = this.admission.store.snapshot(task.id);
    if (!identity) throw new Error('LEARNING_SOURCE_INVALID');
    const snapshot = await this.admission.restore(task.id);
    if (snapshot.metadata.snapshotId !== identity.snapshotId || snapshot.metadata.baseCommit !== identity.baseCommit) throw new Error('LEARNING_SOURCE_INVALID');
    if (this.admission.secrets.filter(finding.statement).redacted) throw new Error('LEARNING_REDACTED');
    const support = await this.support(snapshot, task.repoId, finding.citations, finding.excerpt);
    const timestamp = new Date().toISOString();
    return this.store.add({
      schemaVersion: 1, id: randomUUID(), kind: input.kind, status: 'candidate', statement: finding.statement,
      repoRootHash: identity.repoRootHash, repoId: task.repoId, baseCommit: identity.baseCommit,
      snapshotId: identity.snapshotId, ...(identity.scopeHash ? { scopeHash: identity.scopeHash } : {}),
      sourceTaskId: task.id, sourceFindingId: finding.id, support, createdAt: timestamp, updatedAt: timestamp,
    });
  }

  async decide(id: string, action: 'promote' | 'reject' | 'retire', reason: string): Promise<LearningItemValue> {
    if (this.admission.secrets.filter(reason).redacted) throw new Error('LEARNING_REDACTED');
    if (action === 'promote') {
      const item = this.store.get(id);
      const snapshot = await this.admission.restore(item.sourceTaskId);
      const current = await this.support(snapshot, item.repoId, item.support);
      if (current.some((source, index) => source.sha256 !== item.support[index]?.sha256)) throw new Error('LEARNING_BAD_PROVENANCE');
    }
    return this.store.decide(id, action, 'user', reason);
  }

  async listForTask(taskId: string): Promise<LearningItemValue[]> {
    await this.admission.restore(taskId);
    const identity = this.admission.store.snapshot(taskId);
    if (!identity) throw new Error('LEARNING_SOURCE_INVALID');
    return this.store.list(identity.repoRootHash);
  }

  async inspect(id: string): Promise<{ item: LearningItemValue; decisions: ReturnType<LearningStore['decisions']> }> {
    const item = this.store.get(id);
    await this.admission.restore(item.sourceTaskId);
    return { item, decisions: this.store.decisions(id) };
  }

  async retrieve(snapshot: GitSnapshotTools, repoId: string): Promise<RetrievedLearning[]> {
    const rootHash = repoRootHash(this.admission.repos.root(repoId));
    const result: RetrievedLearning[] = [];
    let bytes = 0;
    for (const item of this.store.active(rootHash)) {
      if (result.length >= 4) break;
      if (item.repoId !== repoId) continue;
      let current: Support[];
      try { current = await this.support(snapshot, repoId, item.support); }
      catch (error) {
        // A narrower task scope must not retire otherwise valid repository knowledge.
        if (error instanceof Error && error.message === 'SCOPE_PATH_DENIED') continue;
        this.store.decide(item.id, 'mark_stale', 'host', 'Supporting evidence unavailable or redacted in the current snapshot.');
        continue;
      }
      if (current.some((source, index) => source.sha256 !== item.support[index]?.sha256)) {
        this.store.decide(item.id, 'mark_stale', 'host', 'Supporting evidence changed in the current snapshot.');
        continue;
      }
      const entry: RetrievedLearning = { id: item.id, kind: item.kind, statement: item.statement, baseCommit: item.baseCommit, support: item.support };
      const size = Buffer.byteLength(JSON.stringify(entry));
      if (bytes + size > 2_048) continue;
      bytes += size;
      result.push(entry);
    }
    return result;
  }

  private async support(snapshot: GitSnapshotTools, repoId: string, citations: readonly { path: string; startLine: number; endLine: number }[], expectedExcerpt?: string): Promise<Support[]> {
    if (citations.length < 1 || citations.length > 8) throw new Error('LEARNING_BAD_PROVENANCE');
    const support: Support[] = [];
    const excerpts: string[] = [];
    for (const citation of citations) {
      if (citation.endLine < citation.startLine || citation.endLine - citation.startLine >= 100) throw new Error('LEARNING_BAD_PROVENANCE');
      const file = await snapshot.readSearchText(repoId, citation.path);
      const lines = file.text.split('\n').slice(citation.startLine - 1, citation.endLine);
      if (lines.length !== citation.endLine - citation.startLine + 1) throw new Error('LEARNING_BAD_PROVENANCE');
      if (lines.some(line => line.includes('[REDACTED]'))) throw new Error('LEARNING_REDACTED');
      const excerpt = lines.join('\n');
      excerpts.push(excerpt);
      support.push({ path: citation.path, startLine: citation.startLine, endLine: citation.endLine, sha256: digest(excerpt) });
    }
    if (expectedExcerpt !== undefined && excerpts.join('\n') !== expectedExcerpt) throw new Error('LEARNING_BAD_PROVENANCE');
    return support;
  }
}
