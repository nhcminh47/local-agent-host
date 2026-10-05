# M2.5 Windows context comparison — 5 October 2026

## Frozen setup and observed validation

Windows with Node 22.23.2 and pnpm 11.7.0: the initial M2.5 profile passed `pnpm check`, `pnpm test` (116/116, no skips) and fake-provider `pnpm m2:smoke:mcp`. After the bounded completion-tool correction, the same checks passed with 117/117 tests. The new test proves that the one existing completion reminder offers only `finish_analysis` and that repeated prose still fails.

All three live attempts used the frozen five-case suite, scopes, target commit `987d7891c42df700ec23fbf8f2f68521ed7c184c`, `qwen3:8b` digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, 8192/512 context/output, temperature 0, 180-second deadline, 12-turn and 16-tool limits. Case digest `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39` and rubric digest `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e` stayed fixed. Reports are ignored `.local/acceptance-ctx8192-out512-m25-context-20261005-{a,b,c}.json`. The harness records host HEAD `69fb4e446285ad281bb2b2b879d308709f59cd13`, but this does not identify dirty-tree source bytes; A/B preceded the completion-tool correction and C followed it.

| Attempt | Runtime completion | Turns / tools | Peak prompt tokens | Output-length stops | Inference wall time | Automated exact values | Preservation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A, initial context | 4/5; startup failed | 29 / 26 | 6,481 | 2 | 92.5 s | 4/5 | 25/25 |
| B, unchanged initial context | 4/5; startup failed | 22 / 20 | 4,122 | 2 | 60.0 s | 3/5 | 25/25 |
| C, bounded recovery correction | 4/5; database failed | 29 / 26 | 6,481 | 2 | 94.5 s | 4/5 | 25/25 |

Both A and B failed startup with `EXPLORER_STRUCTURED_COMPLETION_REQUIRED`: after three source tools, the model returned two responses at the fixed 512-token output limit rather than a structured completion. C completed startup, but database returned prose after one output-length stop and failed with the same code. This is a quality failure; the data do not establish that RepoMap or compaction alone caused it. No live compaction event counter is recorded, so a compaction occurrence or token-saving percentage cannot be claimed from these reports. Deterministic tests separately prove over-limit compaction and early-citation survival.

The previous Windows readiness candidate on 4 October completed 5/5 with 25/25 preservation and all automated exact values, but an agent-labelled, non-human semantic review rejected all five answers. The current attempts are therefore not qualifying, even where runtime and lexical checks pass. No human claim review was performed for A/B/C; `human_review = pending`. There is no accepted first run or confirmation pair. Windows is the active qualification platform. Native macOS/Cursor qualification is **DEFERRED / UNVERIFIED**; Windows evidence does not verify it. M3 mutation capabilities remain disabled.
