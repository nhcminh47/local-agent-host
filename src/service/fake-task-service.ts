import type { AnalyzeRepoRequest, TaskRecord } from '../domain/task-contracts.js';
import { TaskStore } from '../store/task-store.js';

export class FakeTaskService {
  constructor(readonly store: TaskStore) {}

  submit(request: AnalyzeRepoRequest) { return this.store.submit(request); }
  get(taskId: string, afterEventSeq = 0, maxEvents = 50) {
    const page = this.store.events(taskId, afterEventSeq, maxEvents + 1);
    const events = page.slice(0, maxEvents);
    return { task: this.store.get(taskId), events, eventPage: { afterEventSeq, nextEventSeq: events.at(-1)?.seq ?? afterEventSeq, hasMore: page.length > maxEvents } };
  }
  cancel(taskId: string, reason: string) { return this.store.cancel(taskId, reason); }

  runOne(taskId: string): TaskRecord {
    const owner = 'fake-provider';
    const claimed = this.store.claim(taskId, owner, 30_000);
    const running = claimed.task;
    const request = JSON.parse(running.payloadJson) as AnalyzeRepoRequest;
    return this.store.completeLeased(taskId, owner, claimed.generation, {
      schemaVersion: 1,
      outcome: 'completed',
      verification: 'not_run',
      summary: `Fake analysis accepted for ${request.repoId}`,
      findings: [],
      provider: 'fake',
    });
  }
}
