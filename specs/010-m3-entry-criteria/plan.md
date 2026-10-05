# M3 entry plan — planning only

**Date**: 2026-10-05
**Gate**: Blocked; see [specification](spec.md) and [tasks](tasks.md).

## Design sequence for a future authorized implementation

1. Close EG-001 with a source-frozen, human-reviewed qualifying Windows pair; retain separate macOS/Cursor topology status.
2. Specify independent read, edit and verify authorities in domain contracts and admission. Require an explicit trusted operator action for elevation; preserve revocation and durable audit semantics.
3. Design a managed worktree owner in `src/exploration/` or a more appropriate repository module after source-map review. Bind worktree to repo identity and base commit; contain path operations and preserve the user's checkout.
4. Design bounded patch application with host-validated path/precondition checks and secret-safe diff publication. Never interpret model output as a shell command.
5. Design verification profiles with host-owned executable/argv lists and strict time, output, cancellation and process-tree limits. Record checks run and their actual exit status.
6. Expose the smallest separate runtime contracts only after deterministic fixtures establish permission denial, path containment, stale-source rejection, cancellation/restart behavior, checkout preservation, and reviewable diff/result artifacts. Then run the applicable pinned check/test, process, IPC and explorer smoke checks.

## Compatibility and migration constraints

Existing M2 MCP tools, task/event schemas, authenticated IPC boundaries, snapshot identity and publication must remain compatible. New persisted state needs additive versioned migration and fenced transitions. Do not infer command authority from existing read trust or repository registration. Preserve the management/model boundary used by M2.6 and M2.7.

## Current analysis

The combined Windows run has 5/5 runtime completion but 3/5 exact values and 2/5 agent diagnostic semantic acceptance, with human review pending. It fails EG-001. The criteria and sequence are internally consistent with [M2 quality](../001-m2-quality-gate/spec.md), [architecture](../../docs/architecture.md), and the current read-only capability policy. Implementation tasks therefore remain blocked and unstarted. A future change must re-run Spec Kit specify/clarify/plan/tasks/analyze for its concrete M3 contracts before editing runtime code.
