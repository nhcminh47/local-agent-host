# Change: M2.6 durable learning

**Date**: 2026-10-05
**Related spec/tasks**: [M2.6 tasks](../../specs/009-m2-6-learning-memory/tasks.md)
**Status**: implementation tested; live qualification open.

## Request and scope

Add durable, reviewable, provenance-backed learning after the M2.5 per-attempt context layer. Keep current source, workspace trust, filtering and M2 read-only capability authoritative. Do not add model-side review or M3 mutation tools.

## Changes and decisions

- Added strict version-1 learning contracts, separate additive SQLite tables, append-only review decisions and candidate lifecycle states. Task/event schema version and existing public MCP tools remain unchanged.
- A management caller selects a completed host-grounded finding. The service restores its admitted snapshot, verifies cited filtered lines and excerpt, and stores hashes and bounded metadata rather than transcripts or source text. Explicit management review promotes/rejects/retires it; inspection exposes the decision trail.
- Active items are rechecked before retrieval against the current task's repository identity, snapshot and scope. Changed support is marked stale, narrower scope is skipped, and at most four items / 2 KiB enter M2.5 context with a prior-source-data label. Current snapshot evidence outranks learning.

## Observed validation

On Windows with Node 22.23.2 and pnpm 11.7.0, `pnpm check` passed, `pnpm test` passed 121/121 with no skips, and fake-provider `pnpm m2:smoke:mcp` passed. Tests cover candidate/review lifecycle, rejection, invalid and redacted support, prompt-like text remaining inactive data, changed and unchanged commits, narrow scope, cross-repository identity, restart/migration preservation, 140 candidates, bounded retrieval, retirement and the model tool list excluding learning authority. No live-model quality run or human semantic review was performed for this feature.

## Assumptions and remaining work

This is host-controlled review, not automatic semantic truth verification. An operator must inspect a candidate before promotion. Windows M2.5 quality still fails its frozen gate, so final Windows M2 qualification is pending. Native macOS/Cursor qualification remains deferred/unverified; M3 mutation stays disabled. Continue repository baseline, M2.7 lifecycle, then final Windows gate and M3 entry criteria.

## Related context

[Architecture](../architecture.md), [source map](../source-structure.md), [explorer runbook](../explorer-runbook.md), [M2 status](../m2-status.md), [M2.5 comparison](2026-10-05-m2-5-windows-comparison.md).
