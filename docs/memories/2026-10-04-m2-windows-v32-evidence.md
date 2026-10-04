# Change: Windows v32 evidence and Cursor client observation

**Date**: 2026-10-04
**Related spec/tasks**: [M2 T044–T046](../../specs/001-m2-quality-gate/tasks.md)
**Status**: Evidence recorded; M2 qualification remains open.

## Request and scope

Complete the available Windows evidence and account for the live Cursor result in the cross-platform app. Preserve the existing frozen quality and native topology gates; do not infer macOS behavior from Windows.

## Changes and decisions

- Ran two frozen v32 Windows candidate suites without changing case questions, scopes, model or budgets. Both completed 5/5 with 25/25 preservation checks, but the database case omitted required readiness exact values in both runs. No confirmation pair was started.
- Recorded the separate Cursor UI task as Windows client smoke evidence. Its two-file scope and custom budget cannot substitute for the frozen cases or restart/preservation gate.
- Added the [sanitized evidence report](../m2-windows-evidence-2026-10-04.md), updated [M2 status](../m2-status.md) and corrected stale Cursor statements in the [runbook](../explorer-runbook.md). Source/runtime behavior and acceptance thresholds were not changed.

## Observed validation

Windows 11 Pro 64-bit, Node 22.23.2 / pnpm 11.7.0: `pnpm check` passed; `pnpm test` passed 109/109 with zero skips; `pnpm m1:smoke` and `pnpm m2:smoke:mcp` passed. The real-model runs used `qwen3:8b` at the same pinned digest and frozen inputs. All ten runtime tasks completed; database exact values failed twice; semantic dimensions remain unreviewed. Spec Kit 0.14.2 was present, and the bundled prerequisite checker found the M2 feature artifacts.

## Assumptions and remaining work

The local source manifest was captured after the runs and cannot independently prove the complete dirty-tree identity during inference. Human claim-level review, a passing Windows pair, full native Cursor restart/preservation checks and macOS validation remain open. M2 remains open and M3 disabled. The repeated database omission needs a separately scoped quality correction before another qualification sequence.

## Related context

[M2 architecture](../architecture.md), [source ownership](../source-structure.md), [prior 413 correction](2026-09-20-413-corrections.md), [prior live rerun](2026-09-20-m2-live-rerun.md).
