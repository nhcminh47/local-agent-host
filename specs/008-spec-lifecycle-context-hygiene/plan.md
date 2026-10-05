# Implementation plan: M2.7 lifecycle and context hygiene

Status: active. The [specification](spec.md) sets the broader policy.

## Bounded read-only slice

1. `src/domain/spec-lifecycle-contracts.ts` defines version-1 bundle identity, statuses, host/user finalization summary and transitions. The summary records objective, acceptance result, decisions, refs and unresolved work, with byte/count bounds and no raw transcripts.
2. `src/store/spec-lifecycle-store.ts` adds versioned lifecycle records and append-only events to SQLite. It never mutates repository files or deletes stored audit records. `eligible_for_cleanup` is metadata only.
3. `src/service/spec-lifecycle-service.ts` registers only eligible `specs/<id>/spec.md` bundles from an admitted filtered snapshot, checks canonical repository identity, and requires management-authenticated finalization. Finalization records whether M2.6 knowledge candidates were reviewed (`none` or explicit candidate IDs); it never auto-promotes learning. Archive/restore/retire transitions retain provenance and history.
4. Management-only daemon/host CLI operations list, inspect, finalize and change lifecycle status. Normal explorer context excludes lifecycle archive summaries; explicit history queries return bounded metadata. A read-only hygiene report counts stale learning, superseded baselines and lifecycle states without deleting anything.

## Safety and validation

No physical spec move or raw-file delete is implemented. Repository text is hashed after filtering but never promoted to host policy. A supplied summary is screened by the host secret filter and stored as explicit reviewer input, not a model-generated conclusion. Current user instructions, active specs, current baseline and active reviewed learning remain above archived history. Tests cover state transitions, invalid provenance, redaction, no auto-promotion, archive exclusion, restoration, many bundles, bounded summaries and reports. Run pinned check/test and M2 smoke; live qualification remains separate.

Pre-implementation analysis: this package consumes but cannot override M2.6 promotion and baseline freshness. Host metadata avoids changing the analyzed repository under M2 read-only scope. Cleanup eligibility is reviewable state rather than permission to delete.
