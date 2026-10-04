# M2 Windows v32 evidence — 4 October 2026

## Readiness correction and fresh candidate

The host now recognizes the word `readiness` when selecting bounded operations from source already observed by the explorer. The shared `/ready`/readiness proximity limit is twelve lines; task scope, tools, budgets, model and frozen questions are unchanged. A focused test covers the observed `validateMigrations` and `SELECT 1 AS value` lines and an unrelated-question negative case. Pinned `pnpm check`, `pnpm test` (**110/110**, zero skips) and `pnpm m2:smoke:mcp` passed.

The first corrected candidate (`m2-readiness-20261004-a`, ten-line proximity) completed 5/5 with 25/25 preservation checks but still missed `SELECT 1 AS value` in the database case. After widening only the observed-line proximity to twelve, fresh candidate `m2-readiness-v2-20261004-a` completed **5/5**, passed **all five automated exact-value dimensions**, and passed **25/25 preservation checks**. Contract and evidence checks passed for every case. The source manifest captured before that run covers 96 files with digest `7d42a6582b862f8bc421c69eca40694e2804082acbd197af7132ca5ef829a14a`; all 96 hashes still matched after the run. The manifest brackets the run locally but is not a complete immutable identity of every dirty-tree file.

An explicitly **agent-labelled, non-human** claim review of candidate A was graded separately. It found **0/5 accepted cases** despite the automated passes:

| Case | Agent review gap |
| --- | --- |
| Health | The 413 claim cites the code mapping rather than its condition; timeout/success, 500/404 branches and auth implementation are not fully reported. |
| Database | Constructor timeout, settings verification and failure cleanup are incomplete in published findings. |
| Startup | The startup rejection's exit-code assignment is not reported. |
| Dependencies | The build command appears only as raw JSON with escaped quotes, not as a decoded command. |
| Scope denial | The lead finding overstates that migrations/settings were applied from source inspection alone. |

The ignored raw run, agent review and graded report are `.local/acceptance-ctx8192-out512-m2-readiness-v2-20261004-a.json`, `.local/review-m2-readiness-v2-20261004-a-agent.json` and `.local/acceptance-ctx8192-out512-m2-readiness-v2-20261004-a-reviewed.json`. This is diagnostic agent review, **not the required human review**. No unchanged confirmation run was started because candidate A fails claim-level acceptance. The quality gate remains open.

## Earlier frozen v32 attempts

Before the readiness correction, the Windows host completed two unchanged candidate runs of the frozen five-case suite. Both had **5/5 runtime completions** and **25/25 repository-preservation checks**, but each had an automated exact-value failure in the database case. Neither earlier run was claim-level reviewed. There is still no accepted first run or qualifying confirmation pair. M2 remains open and M3 remains disabled.

## Environment and frozen inputs

- Windows 11 Pro 64-bit, build 26200; Node 22.23.2 and pnpm 11.7.0.
- Host HEAD `810d2ca8c73b95ef924f9ee615e3de87d858c36d` with pre-existing uncommitted source. A post-run local SHA-256 manifest of 96 source, script, test and package/config files is in ignored `.local/m2-v32-windows-20261004-source-manifest.json` (digest `0f100a2c27e7565734c46a3f9ce7f1f624675400f702b70152ebe99ef79ceb41`). The harness records HEAD, not a full dirty-tree source identity; this manifest was captured after the runs, so it does not independently prove byte-for-byte source identity throughout both runs.
- Prompt `m2-structured-findings-v32`; result contract 2. `qwen3:8b` digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`; context/output 8192/512, temperature 0, thinking disabled.
- Target commit `987d7891c42df700ec23fbf8f2f68521ed7c184c`; unchanged five cases, scopes, 180-second deadline, 12-turn and 16-tool-call budgets. Case digest `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39`; rubric digest `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e`.

## Observed Windows checks

With the pinned toolchain, `pnpm check` passed; `pnpm test` passed **109/109** with zero failures/skips; `pnpm m1:smoke` passed authenticated IPC, bridge reconnect and durable task checks; `pnpm m2:smoke:mcp` passed its synthetic snapshot/restart/scope/preservation checks and seven failure/output canaries. The smoke provider was fake Ollama, separate from the real-model acceptance runs.

| Frozen case | Run `m2-v32-windows-20261004-a` | Run `m2-v32-windows-20261004-a2` | Automated exact values | Preservation |
| --- | --- | --- | --- | --- |
| Health | completed, 11 turns / 11 tools | completed, 11 / 11 | pass / pass | 5/5 each |
| Database | completed, 3 / 3 | completed, 3 / 3 | **fail / fail** | 5/5 each |
| Startup | completed, 4 / 4 | completed, 4 / 4 | pass / pass | 5/5 each |
| Dependencies | completed, 2 / 2 | completed, 2 / 2 | pass / pass | 5/5 each |
| Scope denial | completed, 4 / 4 | completed, 4 / 4 | pass / pass | 5/5 each |

Both database results omitted the required `validateMigrations` and `SELECT 1 AS value` exact values, although those expressions are present at lines 29–30 of the frozen `apps/story-engine/src/db/database.ts`. The answer therefore also omitted the requested readiness sequence. The automated contract and evidence dimensions passed for all ten cases, but claim-level correctness, requested-fact coverage and limitation handling remain `not_reviewed`. A repeated automated failure makes a confirmation run unjustified under the existing gate. Raw machine-specific reports and worksheets remain in ignored `.local/acceptance-ctx8192-out512-m2-v32-windows-20261004-a*.json`.

## Native Cursor observation on Windows

Cursor 3.22.12 connected to the user-local `local-agent-host` MCP bridge with five tools. After a one-time read grant for the selected workspace, Cursor submitted a read-only, two-file task to the live Ollama-backed daemon and polled it to `completed`: task `f85d1910-0f99-4e52-896e-009d646ef86f`, 4 model turns, 4 tool calls, about 8.1 seconds. Its answer cited the committed `apps/story-engine/src/server.ts` startup sequence and `apps/story-engine/src/app.ts` Fastify construction. An earlier broad ad hoc task reached `budget_exceeded` at its separate eight-turn limit.

This is positive **Windows Cursor client smoke evidence for the cross-platform app**. The question, scope and budget differ from the frozen five-case suite. That UI run did not perform an in-flight daemon restart, client reconnect, five-case review, canary scan or full preservation fingerprint. It does not certify the native topology gate or macOS behavior.

## Decision and remaining work

Windows quality acceptance requires two consecutive unchanged, claim-level human-reviewed 5/5 runs with all preservation dimensions passing. The readiness exact-value omission is corrected, but the new candidate fails diagnostic claim review; improve the published answers against those recorded gaps before starting a new qualification sequence. Separately complete the native Cursor five-case restart/preservation checks and macOS validation described in the [runbook](explorer-runbook.md). Until those gates pass, M2 is open and M3 mutation, command and test capabilities remain disabled.
