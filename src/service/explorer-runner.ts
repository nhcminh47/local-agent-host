import { AnalyzeRepoInput } from '../domain/task-contracts.js';
import type { CapabilityService } from '../exploration/capability-service.js';
import type { ExplorerProvider } from '../provider/explorer-provider.js';
import { SnapshotTaskService } from './snapshot-task-service.js';
import { ExplorerBlocked, runExplorer } from './explorer-loop.js';

export class ExplorerRunner {
  #busy = false;
  #active: { id: string; abort: AbortController } | null = null;
  constructor(readonly admission: SnapshotTaskService, readonly capabilities: CapabilityService, readonly provider: ExplorerProvider) {}
  cancel(id: string) { if (this.#active?.id === id) this.#active.abort.abort(); }
  abort() { this.#active?.abort.abort(); }
  async tick() {
    if (this.#busy) return;
    this.#busy = true;
    const store = this.admission.store;
    let monitor: ReturnType<typeof setInterval> | undefined;
    try {
      store.expireDue();
      const next = store.nextQueued();
      if (!next) return;
      const owner = `explorer-${process.pid}`;
      const claimed = store.claim(next.id, owner, 15 * 60_000);
      const abort = new AbortController();
      this.#active = { id: next.id, abort };
      const remaining = Math.max(1, Date.parse(claimed.task.deadlineAt) - Date.now());
      const deadline = AbortSignal.timeout(remaining);
      const signal = AbortSignal.any([abort.signal, deadline]);
      monitor = setInterval(() => {
        store.expireDue();
        if (store.get(next.id).status !== 'running') abort.abort();
      }, 100);
      try {
        const request = AnalyzeRepoInput.parse(JSON.parse(claimed.task.payloadJson));
        const snapshot = await this.admission.restore(next.id);
        signal.throwIfAborted();
        const result = await runExplorer(request, snapshot, this.capabilities, this.provider, signal, kind => store.reserveExplorerBudget(next.id, owner, claimed.generation, kind, kind === 'turn' ? request.budget.maxModelTurns : request.budget.maxToolCalls));
        signal.throwIfAborted();
        store.completeLeased(next.id, owner, claimed.generation, result);
      } catch (error) {
        const status = store.get(next.id).status;
        if (status === 'cancelling') store.transition(next.id, ['cancelling'], 'cancelled', 'task.cancelled');
        else if (status === 'running') {
          if (deadline.aborted) store.expireDue();
          else if (error instanceof ExplorerBlocked) store.blockLeased(next.id, owner, claimed.generation, error.requiredAction);
          else if (error instanceof Error && ['EXPLORER_CONTEXT_LIMIT', 'EXPLORER_TOOL_LIMIT', 'EXPLORER_TURN_LIMIT'].includes(error.message)) store.budgetExceededLeased(next.id, owner, claimed.generation, error.message);
          else store.failLeased(next.id, owner, claimed.generation, error instanceof Error && /^(EXPLORER_[A-Z_]+|SNAPSHOT_[A-Z_]+|GIT_OBJECT_UNAVAILABLE)$/.test(error.message) ? error.message : 'EXPLORER_FAILED');
        }
      }
    } finally { if (monitor) clearInterval(monitor); this.#active = null; this.#busy = false; }
  }
}
