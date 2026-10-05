# M3 entry criteria: gated repository mutation

**Created**: 2026-10-05
**Status**: Planning only; entry blocked by M2 quality gate
**Input**: Prepare M3 entry criteria after the Windows M2 qualification attempt without enabling mutation.

## Outcome and boundary

The owner can decide when implementation of repository editing and verification may begin, using explicit evidence and capability boundaries. This package authorizes no M3 runtime tools, schema exposure, edit, command or test execution. Current production behavior remains M2 read-only snapshot exploration.

## Acceptance scenarios

1. Given the Windows M2 quality gate is incomplete, the M3 entry decision remains blocked even when deterministic and synthetic tests pass.
2. Given a future accepted M2 gate, the operator can approve a specific M3 implementation scope with separate read, edit and verify grants; a read grant never implies edit or command authority.
3. Given a mutation task, all writes are confined to an isolated managed worktree created from an identified commit, with the user's checkout preserved and explicit diff review before any result is accepted.
4. Given verification is requested, the host selects only an approved executable and fixed argument profile within time/output/process bounds; the model cannot provide shell text or widen the profile.
5. Given a failed, cancelled or interrupted edit/verification attempt, the durable record identifies the worktree, diff, checks actually run and recovery state without replaying side effects blindly.
6. Given any proposed result, the main agent or user can inspect changed paths, patch, provenance, test evidence and limitations before deciding whether to apply or merge it. No automatic push, merge or deployment follows.

## Entry gates

- **EG-001 Windows M2 quality**: Two consecutive unchanged frozen five-case runs each pass runtime, evidence, requested-fact, exact-value, factual, limitation and 25/25 preservation dimensions, with independent human claim review. Record a host-source manifest or immutable revision for each run. The [5 October combined attempt](../../docs/m2-windows-final-qualification-2026-10-05.md) fails this gate.
- **EG-002 authority design**: Document separate read, edit and verify grants, trust elevation, revocation and authenticated management/audit boundaries. No model-facing authority escalation.
- **EG-003 isolation and recovery design**: Document managed worktree creation, canonical containment, branch/base identity, user-checkout preservation, restart and cancellation handling, retention and cleanup. Worktrees are not security sandboxes.
- **EG-004 bounded mutation design**: Document allowed file scope, preconditions against stale source, patch size limits, denied paths, secret filtering, atomic writes and diff/result publication.
- **EG-005 verification design**: Document operator-approved test/build profiles, executable/argument arrays, process-tree cancellation, deadlines, output limits and how verification results are distinguished from model assertions.
- **EG-006 review and rollout**: Define deterministic failure fixtures and an explicit review point before any M3 tool is exposed. Preserve the M2 read-only contract until these gates are implemented and validated.

Native macOS/Cursor qualification remains **DEFERRED / UNVERIFIED**. It is a separate topology gate before claiming cross-platform operation; Windows results cannot satisfy it. This deferral permits planning, not a cross-platform release claim or activation of M3 mutation.

## Non-goals

No implementation of M3 tools in this package. No arbitrary shell, automatic dependency installation, model-chosen tests, direct write to the user's checkout, push, merge, deployment or automatic application of generated patches.
