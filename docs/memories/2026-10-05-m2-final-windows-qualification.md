# Change: combined Windows M2 qualification and M3 entry criteria

**Date**: 2026-10-05
**Related spec/tasks**: [M2 quality](../../specs/001-m2-quality-gate/spec.md), [M3 entry](../../specs/010-m3-entry-criteria/spec.md), [M3 tasks](../../specs/010-m3-entry-criteria/tasks.md)
**Status**: Partial; M2 gate open, M3 planning complete and implementation blocked

## Request and scope

Evaluate the combined M2 implementation on Windows, record the actual quality decision, and prepare M3 entry criteria without enabling repository mutation. Native macOS/Cursor qualification remains deferred and unverified.

## Changes and decisions

- Recorded one frozen five-case Windows attempt in a sanitized [evidence report](../m2-windows-final-qualification-2026-10-05.md), separating runtime, exact-value, diagnostic semantic, preservation and human-review outcomes.
- Prepared planning-only [M3 criteria](../../specs/010-m3-entry-criteria/spec.md), [plan](../../specs/010-m3-entry-criteria/plan.md) and [tasks](../../specs/010-m3-entry-criteria/tasks.md). Entry requires a qualifying Windows M2 pair and separate authority, isolation, bounded mutation, verification and review designs. No M3 runtime tool or grant changed.
- Retained the M2 open gate because requested facts and semantic correctness failed despite runtime completion. The diagnostic review was agent-labelled and does not stand in for human review.

## Observed validation

On pinned Windows Node 22.23.2 / pnpm 11.7.0, `pnpm check`, `pnpm test` (130/130), `pnpm m2:smoke:mcp` and `pnpm m1:smoke` passed on the combined code. The live attempt completed 5/5, passed automated exact values 3/5, agent diagnostic acceptance 2/5 and preservation 25/25. There was no unchanged confirmation run. Documentation links, source references and diff whitespace were checked after the report and planning edits; runtime checks were not rerun for those documentation-only edits.

## Assumptions and remaining work

The live harness records target commit/model/settings but the uncommitted host source requires a byte manifest or immutable revision to prove a future unchanged pair. Independent human review remains pending. The next useful step is to correct the documented requested-fact and claim defects under a scoped Spec Kit change, then obtain two source-frozen fully accepted Windows runs. Native macOS/Cursor remains **DEFERRED / UNVERIFIED**. M3 mutation remains disabled.

## Related context

[Current status](../m2-status.md), [architecture](../architecture.md), [earlier M2.5 comparison](../m2-m25-context-evidence-2026-10-05.md).
