# Combined M2 Windows qualification attempt — 5 October 2026

## Scope and fixed profile

This is one Windows live attempt on the combined M2.5, M2.6, repository-baseline and M2.7 implementation. The admitted target commit was `987d7891c42df700ec23fbf8f2f68521ed7c184c`. The model was `qwen3:8b`, digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, with 8,192 context tokens, 512 output tokens, temperature zero and thinking disabled. Each case retained the 180-second deadline, 12-turn and 16-tool limits. The case digest was `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39`; the rubric digest was `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e`.

The raw report is ignored at `.local/acceptance-ctx8192-out512-m2-final-windows-20261005-a.json`; the separate agent-labelled diagnostic review and graded report are ignored at `.local/review-m2-final-windows-20261005-a-agent.json` and `.local/acceptance-ctx8192-out512-m2-final-windows-20261005-a-reviewed.json`. These local paths are evidence locations, not portable attachments. The host checkout contained uncommitted implementation changes. A recorded Git HEAD alone does not freeze those source bytes for a future unchanged-run comparison; a future qualifying pair needs a source manifest captured around each run or an immutable host revision.

## Observed result

Pinned Windows Node 22.23.2 / pnpm 11.7.0 `pnpm check`, `pnpm test` (130/130), fake-provider `pnpm m2:smoke:mcp`, and `pnpm m1:smoke` all passed on the combined implementation.

| Case | Runtime | Turns / tools | Peak prompt tokens | Output-length stops | Inference wall time | Automated exact values | Agent diagnostic claim review |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Health | Complete | 8 / 8 | 4,229 | 0 | 20,437 ms | Fail | Reject: requested status/redaction coverage missing |
| Database | Complete | 2 / 2 | 2,719 | 0 | 8,081 ms | Pass | Accept |
| Startup | Complete | 5 / 4 | 4,074 | 1 | 19,142 ms | Pass | Accept |
| Dependencies | Complete | 2 / 2 | 2,803 | 0 | 3,722 ms | Fail | Reject: runtime dependency list/test command missing; build command escaped incorrectly |
| Scope denial | Complete | 4 / 4 | 2,891 | 0 | 5,261 ms | Pass | Reject: lead claim overstates observed source as proved implementation readiness |

Totals: **5/5 runtime completions**, **5/5 contract and evidence checks**, **3/5 automated exact-value checks**, **25/25 repository-preservation checks**, 21 turns, 20 tool calls, one output-length stop and 56,643 ms inference wall time. The agent-labelled diagnostic review accepted **2/5**; it is not an independent human review. `human_review = pending`. There was no second confirmation run because this first run failed the gate.

The report does not instrument live evidence-compaction events, so this attempt cannot establish that compaction occurred or quantify its savings. Deterministic tests independently cover over-limit compaction and preservation of early citations. M2.6 learning, baseline and M2.7 lifecycle have deterministic and synthetic integration evidence, but this run does not isolate their individual live-quality contribution.

## Decision and next evidence

The [M2 quality specification](../specs/001-m2-quality-gate/spec.md) requires two consecutive unchanged runs with 5/5 fully accepted answers and claim-level review. This attempt is not a qualifying first run. Earlier [M2.5 attempts](m2-m25-context-evidence-2026-10-05.md) completed 4/5, so the combined implementation improved runtime completion in this observed run, while requested-fact and semantic defects remain. No causal improvement is inferred from one changed profile.

The Windows quality gate stays **open**. Obtain a source-frozen five-case run with all dimensions accepted and human claim review, then an unchanged confirmation run. Native macOS/Cursor topology remains **DEFERRED / UNVERIFIED** and cannot be inferred from Windows SDK evidence. M3 edit, command and production test capabilities remain disabled.
