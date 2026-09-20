# M1 — Task backbone status

Started 18 September 2026. The initial M1 slice used a fake provider; the later opt-in Ollama connectivity provider is described below. Neither M1 provider reads or modifies repository content. M2 subsequently extends the shared daemon with snapshot exploration.

## Source refactor validation — 20 September 2026

Production entry points now live in `src/runtime/`; the reconnect probe is in `src/diagnostics/task/`. Legacy daemon and MCP forwarding entries have been removed; launch configurations use the runtime paths. Shared HTTP/MCP helpers, error codes, HTTP statuses and prompts have dedicated modules. See [source structure](source-structure.md) and the [M1 Spec Kit package](../specs/003-m1-task-backbone/spec.md).

Observed on Windows with Node 22.23.2 and pnpm 11.7.0: strict check and all 90 deterministic tests passed. The M1 fake-provider smoke passed authentication, disconnect/reconnect, durable completion, long polling and duplicate admission. Live Ollama, Cursor UI and native macOS checks were not rerun; historical evidence and remaining operational gates below retain their original scope.

## Implemented

- Strict Zod contracts for `analyze_repo`, `get_task`, and `cancel_task`, including bounded strings, budgets, strict unknown-field rejection, and repo-relative focus paths.
- SQLite WAL store with schema metadata, durable tasks, an append-only event journal, and a uniqueness constraint for `(repoId, requestKey)`.
- Atomic admission: an identical canonical payload returns the existing task; a changed payload with the same key returns `IDEMPOTENCY_CONFLICT`.
- Explicit task transitions for queued, running, cancelling, cancelled, completed, and failed states.
- Idempotent queued cancellation and restart recovery: interrupted running tasks return to queued; interrupted cancellation becomes cancelled.
- Fake provider that exercises queued → running → completed and writes a structured terminal result.
- MCP stdio vertical slice exposing `analyze_repo`, `get_task`, and `cancel_task`.
- Separate long-lived daemon and stdio MCP bridge. The daemon owns SQLite and fake task execution; the bridge owns no task state.
- Authenticated loopback HTTP IPC. The client rejects non-loopback origins, credentials in URLs, HTTPS ambiguity, URL paths, and short tokens; the daemon uses constant-time bearer comparison and a 64KB request cap.
- Selectable Ollama analysis provider with a fixed model allowlist, bounded prompt/output, request budget timeout, sanitized terminal failures, and persisted inference metrics. This M1 provider sends only the submitted objective/question; it does not claim repository access.
- Queue capacity enforced transactionally after idempotency lookup, so exact duplicates do not consume an additional slot and new work receives `QUEUE_FULL` when capacity is reached.
- Worker leases with monotonically increasing fencing generations. Terminal publication requires the current owner and generation; a recovered stale worker receives `STALE_LEASE`.
- Lease renewal preserves generation; takeover is allowed only after observed expiry and increments generation before any new publication.
- Per-task wall deadline persisted at admission. Due queued/running tasks become terminal `budget_exceeded`, release queue capacity, clear lease ownership, and emit an event.
- `get_task` supports bounded event pages with `nextEventSeq`/`hasMore` and long-poll wakeup up to 20 seconds.

## Evidence

- TypeScript strict check and build pass on Windows with Node 22.23.2.
- Thirteen deterministic tests pass: existing M0 checks plus schema/path rejection, IPC endpoint policy, durable idempotency, fake lifecycle, cancellation, restart recovery, queue capacity, stale-worker fencing, lease renewal/takeover, deadline expiry, and event pagination.
- MCP SDK smoke passes tool discovery, durable admission, fake completion, status/event retrieval, and duplicate submission.
- Bridge-disconnect smoke passes: submit through bridge A, close it before fake work completes, keep daemon alive, connect bridge B, and retrieve the completed durable task. An unauthenticated IPC call receives HTTP 401.
- Live Ollama smoke passes through the same disconnect/reconnect topology with `qwen3.5:latest`. Cold observation: 8.465s wall / 7.969s load; warm observation after lease changes: 0.885s wall / 0.326s load, 62 prompt tokens and 16 generated tokens. No repository content was sent.
- Long-poll smoke passes with both fake and live Ollama providers: bridge B waits after event sequence 1, wakes on a new daemon event, follows the cursor, and retrieves the terminal task. A later live observation after schema v3 measured 7.381s wall / 6.951s load.

## Open M1 gates

- Add failure injection around transaction boundaries and daemon restart.
- Add daemon installation/supervision and local token provisioning without placing the token in a committed Cursor config.
- Run the same tests on macOS. M0 Mac connectivity gates also remain open.

The Windows M1 core gate is complete. Remaining operational/platform gates are supervision, token provisioning, failure injection, and macOS execution. The next implementation slice is M2 repository registration and bounded read/search on an immutable snapshot.

## HTTP 413 correction — 20 September 2026

The daemon now returns HTTP 413 / REQUEST_TOO_LARGE above the unchanged 65,536-byte body cap. It sends the JSON rejection before closing the connection, including for a chunked sender that never ends its request. Within-cap JSON/schema failures remain HTTP 400 / INVALID_INPUT. Authentication, origin and method checks retain their precedence.

Windows Node 22.23.2 / pnpm 11.7.0: strict check and 102/102 tests passed (96 top-level tests plus six HTTP subtests), including exact byte boundaries, UTF-8 overflow, declared-length and unfinished chunked requests, sanitized invalid input, client error propagation and successful requests after rejection. Fake-provider M1 disconnect/reconnect smoke passed. These observations do not close the operational/macOS gates above.
