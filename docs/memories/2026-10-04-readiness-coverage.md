# Change: Readiness evidence coverage

**Date**: 2026-10-04
**Related spec/tasks**: [M2 T047–T050](../../specs/001-m2-quality-gate/tasks.md)
**Status**: Code and evidence recorded; M2 qualification remains open.

## Request and scope

Continue the remaining M2 Windows evidence after two frozen v32 candidates omitted database readiness exact values. Preserve the frozen cases, read-only scope and cross-platform qualification boundaries.

## Changes and decisions

- Updated [observed-operation selection](../../src/service/exploration-coverage.ts) to recognize a natural-language readiness question within twelve lines of already-observed source. It does not read new source or expand the task scope. Added a focused [regression](../../tests/m2-findings.test.ts), including a non-readiness negative case.
- Kept the first ten-line correction's failed candidate as evidence. The twelve-line candidate passes automated exact values, but its published prose still misses requested facts or overstates a source observation. A separate agent-labelled review records those defects; it is not human approval. An unchanged confirmation run would not meet the existing prerequisite.
- Updated the [evidence report](../m2-windows-evidence-2026-10-04.md), [status](../m2-status.md) and M2 tasks without changing acceptance thresholds.

## Observed validation

Windows 11 Pro 64-bit, Node 22.23.2 / pnpm 11.7.0: `pnpm check`, `pnpm test` (110/110, zero skips) and `pnpm m2:smoke:mcp` passed. The fresh real-model candidate completed 5/5, passed five automated exact-value dimensions and 25/25 preservation checks; a 96-file before/after hash manifest matched. Agent-labelled claim grading accepted 0/5. Reports and review JSON remain ignored under `.local/`.

## Assumptions and remaining work

The source manifest does not identify every dirty-tree file or replace an immutable build. Human claim-level review, corrected full answers, an unchanged passing Windows pair, native Cursor five-case/restart/preservation evidence and macOS validation remain open. M2 is open and M3 disabled.

## Related context

[M2 architecture](../architecture.md), [source ownership](../source-structure.md), [prior Windows evidence](2026-10-04-m2-windows-v32-evidence.md).
