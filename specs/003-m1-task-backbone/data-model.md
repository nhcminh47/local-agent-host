# Data Model: M1 Durable Task Backbone

Tasks are stored by `src/store/task-store.ts` in SQLite WAL. Uniqueness on repository id and request key supports idempotency; canonical payload hashes distinguish conflicts. Task/event admission is transactional.

The current `TaskRecord` includes id, repoId, requestKey, payloadHash/payloadJson, status, cancellation/result fields, creation/update timestamps, lease owner/generation/expiry, deadline, and explorer usage counters. Events have sequence, taskId, type, data and createdAt. Snapshot identity and explorer usage are M2 extensions of this shared store.

Normal lifecycle: queued → running → completed/failed. Cancellation becomes cancelled; deadline expiry becomes budget_exceeded. Restart recovery requeues interrupted running work and completes interrupted cancellation. A blocked task is an M2 capability state. Lease takeover increments generation, and terminal publication checks ownership/generation. Consult store methods and deterministic tests for the complete guarded transition behavior.
