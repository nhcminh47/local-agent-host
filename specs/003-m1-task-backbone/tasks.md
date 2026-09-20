# Tasks: M1 Durable Task Backbone

**Input**: [spec.md](spec.md), [plan.md](plan.md), research.md, data-model.md and contracts/protocol.md.
**Status convention**: Checked items are existing implementation or observed refactor validation. Unchecked items remain open; this documentation does not execute them.

## Existing implementation and source cleanup

- [x] T001 [US1] Retain strict request contracts in `src/domain/task-contracts.ts` and atomic admission in `src/store/task-store.ts`.
- [x] T002 [US1] Separate `src/runtime/` from `src/diagnostics/task/` and migrate daemon/MCP launch references to canonical runtime paths.
- [x] T003 [US1] Run authenticated disconnect/reconnect and duplicate-admission validation via `pnpm m1:smoke`.
- [x] T004 [US2] Validate cancellation, deadlines, queue capacity, recovery and fencing in `tests/m1-task-backbone.test.ts`.
- [x] T005 [US3] Extract the unchanged connectivity prompt to `src/prompts/analysis.ts` and retain historical live evidence in `docs/m1-status.md`.

## Remaining milestone gates

- [ ] T006 [US2] Extend transaction-boundary/daemon failure injection beyond existing regressions; record coverage in `docs/m1-status.md`.
- [ ] T007 [US1] Complete daemon supervision and private token provisioning described by `docs/m1-status.md`.
- [ ] T008 [US1] Run native macOS task-backbone and reconnect checks and append platform-specific evidence to `docs/m1-status.md`.

## Dependencies & Execution Order

Strict contracts and pinned runtime underpin the milestone. Run deterministic checks before optional live/topology checks. Native platform evidence and operational follow-ups require their own observation; do not mark them complete based on Windows fixture success.

## Implementation Strategy

Preserve existing behavior during organization changes. Follow the [quickstart](quickstart.md), then address each remaining gate separately with evidence in the milestone status document.

## HTTP 413 correction

- [x] T009 [US1] Implement bounded, deliverable overflow responses in src/shared/http-json.ts, src/runtime/daemon.ts and src/constants/http-status.ts (FR-007).
- [x] T010 [US1] Add real HTTP boundary, chunked, validation and recovery regressions in tests/m1-http.test.ts; run check/test and M1 smoke.
- [x] T011 [US1] Update contracts/protocol.md, docs/m1-status.md, architecture and indexed project memory with observed evidence.

Order: T009 -> T010 -> T011. Pre-implementation analysis: FR-007 is covered by each task; auth precedence, byte cap, persistence and M2 gates are unchanged. Only oversize HTTP/error classification changes.
