# Tasks: M2.5 context architecture

- [x] T001 Define the bounded, filtered RepoMap contract and builder in `src/exploration/repo-map.ts`; use only the admitted `GitSnapshotTools` and deterministic ordering.
- [x] T002 Add fixture regressions for scope, committed-versus-dirty content, secret redaction, count/byte truncation and snapshot identity in `tests/m2-repo-map.test.ts`.
- [x] T003 Pass the RepoMap as bounded navigation context to `src/service/explorer-loop.ts` without changing model tools, budgets or final validation.
- [x] T004 Implement host-observed working memory with citation admission and size/version checks in `src/service/explorer-memory.ts`; test ungrounded/rejected facts.
- [x] T005 Extract context assembly and bounded compaction to `src/service/explorer-context.ts`; retain mandatory contracts, identity, coverage and recent interactions. Test a formerly over-limit exploration and citation survival.
- [x] T006 Tighten the provider-neutral boundary in `src/provider/` and regression-test Ollama metrics, cancellation and error mapping.
- [x] T007 Run pinned check/test and deterministic MCP smoke; compare frozen live Windows quality and context metrics without changing acceptance inputs. The comparisons failed live quality; see the evidence report.
- [x] T007a After the repeatable live startup failure, restrict the existing completion-reminder turn to `finish_analysis`, cover tool narrowing and repeated-prose failure deterministically, then rerun pinned checks and the frozen comparison. The correction is deterministic, but the follow-up live run failed database.
- [x] T008 Update architecture, source map, runbook, M2 status and indexed memory with observed results. Keep macOS/Cursor and independent review gates explicit.

Order: T001 → T002 → T003; T004 → T005; T006 follows stable context types; T007 → T008. T001–T003 are an independently reviewable navigation slice, not completion of M2.5.

Checkpoint (5 October 2026): T001–T008 and the bounded T007a correction have implementation/validation evidence. Pinned check, 117/117 tests and fake-provider MCP smoke pass. Three frozen Windows live runs each complete 4/5; no current M2.5 quality run qualifies, and human review is pending. [Evidence](../../docs/m2-m25-context-evidence-2026-10-05.md). M2.5 implementation tasks are closed; live qualification remains open. macOS/Cursor native qualification is deferred and unverified.
