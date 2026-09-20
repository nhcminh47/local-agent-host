# Tasks: M0 Compatibility Foundation

**Input**: [spec.md](spec.md), [plan.md](plan.md), research.md, data-model.md and contracts/protocol.md.
**Status convention**: Checked items are existing implementation or observed refactor validation. Unchecked items remain open; this documentation does not execute them.

## Existing implementation and source cleanup

- [x] T001 [US1] Keep pinned toolchain and strict ESM configuration in `package.json` and `tsconfig.json`.
- [x] T002 [US1] Separate compatibility probes under `src/diagnostics/compatibility/` and share helpers in `src/utils/`.
- [x] T003 [US1] Validate Windows storage/protocol/process checks with `tests/m0.test.ts`, `pnpm spike:mcp` and `pnpm spike:process`.
- [x] T004 [US2] Separate fixture data and evaluator prompt in `src/diagnostics/compatibility/coding-fixtures.ts` and `src/prompts/coding-eval.ts`; preserve historical evaluation evidence.
- [x] T005 [US3] Record current Windows checks separately from historical live results in `docs/m0-status.md`.

## Remaining milestone gates

- [ ] T006 [US3] Execute `docs/mac-m0-runbook.md` on native macOS and record Mac Cursor plus Mac-to-PC connectivity evidence.
- [ ] T007 [US1] Close production orphan-ownership/recovery gates described in `docs/m0-status.md`; current guardian remains a feasibility spike.

## Dependencies & Execution Order

Strict contracts and pinned runtime underpin the milestone. Run deterministic checks before optional live/topology checks. Native platform evidence and operational follow-ups require their own observation; do not mark them complete based on Windows fixture success.

## Implementation Strategy

Preserve existing behavior during organization changes. Follow the [quickstart](quickstart.md), then address each remaining gate separately with evidence in the milestone status document.
