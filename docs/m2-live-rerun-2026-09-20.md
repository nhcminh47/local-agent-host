# M2 live rerun — 20 September 2026

The reorganized Windows host completed all five frozen live cases. Contract, evidence, exact-value and preservation checks passed for every case. Agent review graded **4/5**: the health answer overgeneralized the 413 error branch. This run does not qualify the current source; no confirmation run was started.

| Case | Runtime | Turns / tools | Task time | Automated checks | Agent assessment |
| --- | --- | --- | --- | --- | --- |
| Health | completed | 4 / 4 | 19.404 s | pass | fail: status-code claim |
| Database | completed | 2 / 2 | 7.858 s | pass | pass |
| Startup | completed | 4 / 4 | 9.992 s | pass | pass |
| Dependencies | completed | 2 / 2 | 6.450 s | pass | pass |
| Scope denial | completed | 4 / 4 | 4.821 s | pass | pass |

All **25/25** preservation dimensions passed: HEAD, Git status, index bytes, tracked contents and baseline untracked contents. The target application and its tests were not executed; result verification remains `not_run`.

## Validation and frozen profile

- Windows, Node **22.23.2**, pnpm **11.7.0**.
- `pnpm check`: passed; `pnpm test`: **90/90**, zero failures/skips.
- `pnpm m2:smoke:mcp`: passed with the deterministic provider, including seven failure/output canaries, restart, snapshot, scope and preservation checks. Those injected failures are separate from live inference.
- `pnpm m2:acceptance`: run `m2-refactor-20260920-a`, five completed live tasks.
- `pnpm m2:grade`: **4/5** under explicitly labelled agent review; no accepted pair.
- Model `qwen3:8b`, digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`.
- Context/output 8192/512, temperature 0, thinking disabled; prompt `m2-structured-findings-v31`, result schema 2.
- Target commit `987d7891c42df700ec23fbf8f2f68521ed7c184c`; unchanged five questions/scopes, 180-second / 12-turn / 16-tool-call budgets.
- Case digest `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39`; rubric digest `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e`.

The harness records host HEAD `4d54748574c2747e2ff66b1de7fa19f4017fc450`, but the workspace contains uncommitted source reorganization. HEAD alone therefore does not identify the tested source. A separate SHA-256 manifest of sorted source, scripts, tests and package/lock/TypeScript configuration paths was captured during the run and rechecked afterward: `7beb6d8a354b060eb100cbab76eda3dda8a14e22156da684f082fcc47a79c597`. No runtime source was edited during this task. The harness's dirty-tree identity limitation remains open.

## Review finding and provenance

The health finding `failure_status_codes` says “413 for validation errors.” At the frozen target's `apps/story-engine/src/app.ts:49–51`, the handler chooses 413 only for an error with `statusCode === 413`; every other error becomes 500. It then labels the 413 branch `VALIDATION_ERROR` and describes an oversized request body. The published wording omits that condition and overgeneralizes the branch. Its citations and exact literals are valid, illustrating why grounding does not establish semantic correctness.

The other four cases' findings, citations, excerpts, exact values and limitations exactly match the historical v31 run A. Their previous agent rubric judgments were retained after inspection. Health was reviewed separately and failed correctness and status-code coverage. The current reviewer is explicitly `codex-agent-review-not-human`. Historical local review metadata also identifies `codex-manual-review`; the historical report's phrase “manual review” must not be treated as evidence of an independent human review. The spec's human-review requirement remains unverified.

Ignored evidence: `.local/acceptance-ctx8192-out512-m2-refactor-20260920-a.json`, `.local/review-m2-refactor-20260920-a-agent.json`, `.local/acceptance-ctx8192-out512-m2-refactor-20260920-a-agent-reviewed.json`, `.local/m2-refactor-20260920-source.json` and `.local/m2-rerun-20260920-tests.log`.

## Remaining gates

The confirmation prerequisite was not met. Correcting the status-code behavior requires a separate scoped change and regression before requalification. Human semantic review and native Cursor/macOS topology remain unverified. M2 remains open and M3 remains disabled. Earlier [v31 evidence](m2-quality-gate-v31-2026-09-19.md) is preserved as historical evidence, not qualification of this rerun.
