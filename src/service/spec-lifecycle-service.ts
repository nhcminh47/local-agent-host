import { createHash, randomUUID } from 'node:crypto';
import { SpecRegisterInput, SpecSummary, SpecTransitionInput, type SpecLifecycleRecordValue } from '../domain/spec-lifecycle-contracts.js';
import { repoRootHash } from '../domain/snapshot-contracts.js';
import { LearningStore } from '../store/learning-store.js';
import { SpecLifecycleStore } from '../store/spec-lifecycle-store.js';
import { SnapshotTaskService } from './snapshot-task-service.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class SpecLifecycleService {
  constructor(readonly store: SpecLifecycleStore, readonly admission: SnapshotTaskService, readonly learning: LearningStore) {}

  async register(raw: unknown): Promise<SpecLifecycleRecordValue> {
    const input = SpecRegisterInput.parse(raw);
    const snapshot = await this.admission.restore(input.taskId);
    const task = this.admission.store.get(input.taskId);
    const identity = this.admission.store.snapshot(input.taskId);
    if (!identity) throw new Error('SPEC_LIFECYCLE_BAD_PROVENANCE');
    const folder = `specs/${input.specId}`;
    const support: SpecLifecycleRecordValue['support'] = [];
    for (const name of ['spec.md', 'plan.md', 'tasks.md', 'research.md', 'data-model.md']) {
      const path = `${folder}/${name}`;
      try {
        const file = await snapshot.readSearchText(task.repoId, path);
        if (file.redacted) throw new Error('SPEC_LIFECYCLE_REDACTED');
        support.push({ path, sha256: file.sha256 });
      } catch (error) {
        if (name === 'spec.md' || error instanceof Error && error.message === 'SPEC_LIFECYCLE_REDACTED') throw error;
        if (!(error instanceof Error && (error.message === 'PATH_DENIED' || error.message === 'SCOPE_PATH_DENIED'))) throw error;
      }
    }
    if (!support.length || support[0]?.path !== `${folder}/spec.md`) throw new Error('SPEC_LIFECYCLE_BAD_PROVENANCE');
    const timestamp = new Date().toISOString();
    return this.store.register({
      schemaVersion: 1, id: randomUUID(), specId: input.specId, specPath: `${folder}/spec.md`, repoId: task.repoId,
      sourceTaskId: task.id, repoRootHash: identity.repoRootHash, baseCommit: identity.baseCommit,
      snapshotId: identity.snapshotId, ...(identity.scopeHash ? { scopeHash: identity.scopeHash } : {}),
      bundleHash: digest(JSON.stringify(support)), support, status: 'draft', createdAt: timestamp, updatedAt: timestamp,
    });
  }

  async finalize(recordId: string, rawSummary: unknown): Promise<SpecLifecycleRecordValue> {
    const item = this.store.get(recordId);
    await this.admission.restore(item.sourceTaskId);
    const summary = SpecSummary.parse(rawSummary);
    if (this.admission.secrets.filter(JSON.stringify(summary)).redacted) throw new Error('SPEC_LIFECYCLE_REDACTED');
    for (const id of summary.knowledgeIds) {
      const knowledge = this.learning.get(id);
      if (knowledge.repoRootHash !== item.repoRootHash || knowledge.repoId !== item.repoId) throw new Error('SPEC_LIFECYCLE_KNOWLEDGE_MISMATCH');
    }
    return this.store.finalize(recordId, summary);
  }

  async transition(raw: unknown): Promise<SpecLifecycleRecordValue> {
    const input = SpecTransitionInput.parse(raw);
    const item = this.store.get(input.recordId);
    await this.admission.restore(item.sourceTaskId);
    if (this.admission.secrets.filter(input.reason).redacted) throw new Error('SPEC_LIFECYCLE_REDACTED');
    if (input.supersededBy) {
      const replacement = this.store.get(input.supersededBy);
      if (replacement.repoRootHash !== item.repoRootHash || replacement.repoId !== item.repoId) throw new Error('SPEC_LIFECYCLE_REPLACEMENT_MISMATCH');
    }
    return this.store.transition(item.id, input.action, input.reason, input.supersededBy);
  }

  async list(taskId: string): Promise<SpecLifecycleRecordValue[]> {
    await this.admission.restore(taskId);
    const task = this.admission.store.get(taskId);
    return this.store.list(repoRootHash(this.admission.repos.root(task.repoId)), task.repoId);
  }

  async inspect(recordId: string) {
    const item = this.store.get(recordId);
    await this.admission.restore(item.sourceTaskId);
    return { item, events: this.store.events(recordId) };
  }

  async hygiene(taskId: string) {
    await this.admission.restore(taskId);
    const task = this.admission.store.get(taskId);
    return this.store.report(repoRootHash(this.admission.repos.root(task.repoId)), task.repoId);
  }
}
