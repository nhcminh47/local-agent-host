# M2 real-repository acceptance — 18 September 2026

## Setup

Five sequential read-only tasks used the same committed `novels-engine` tree: `987d7891c42df700ec23fbf8f2f68521ed7c184c`. Each task had an explicit file allowlist, 180-second deadline, 12 model turns and 16 tool calls. The path was MCP SDK client → current daemon → existing local Ollama `qwen3:8b`. No model/dependency download or deployment change. The temporary daemon and bridge were stopped afterward.

Cases and reproduction harness are `acceptance-cases.json` and `acceptance.mjs` in the parent workspace. Raw machine-specific task reports remain under its `.local/acceptance-suite.json`; they are not included here. This was one run per question, not a statistical benchmark or scale test.

## Results

| Case | Runtime outcome | Content acceptance |
|---|---|---|
| Health/auth/readiness, two-file scope | `budget_exceeded / EXPLORER_TURN_LIMIT` | No final answer; 12 turns and 12 tool calls exhausted |
| SQLite initialization/readiness, one-file scope | `failed / EXPLORER_NO_EVIDENCE` | No usable evidence accepted; implementation facts could not be graded |
| Startup/shutdown/cleanup, two-file scope | `failed / EXPLORER_FAILED` | No final answer; generic error does not expose enough diagnosis |
| Package dependencies/commands, one-file scope | `completed` | Partial: versions, Node range and scripts were correct, but `better-sqlite3` was incorrectly rendered as `better-sql.3` |
| Explicit read outside scope, then eligible DB file | `failed / EXPLORER_SNAPSHOT_PATH_UNAVAILABLE` | Unavailable-path feedback reached terminal result; the model did not complete the requested fallback analysis |

Runtime completion: **1/5**. Fully correct, complete content acceptance: **0/5** under this rubric. These outcomes are for this suite/run; they are not a general model success-rate estimate. Earlier successful single-task runs are not overwritten by this result.

The dependency answer cited package.json:19–21 for dependencies, :7 for Node engines and :10/:14/:15 for build/test scripts. Direct inspection confirms the locations and all requested versions, but line 19 spells `better-sqlite3`. Thus `ranges_verified` can coexist with a false statement: it verifies observed locations only, not exact factual fidelity.

## Preservation and limits

All five tasks preserved HEAD, Git status, index bytes and tracked working-tree file contents against the baseline. The host's evidence contains no excluded paths in the one completed case. The negative-scope task failed with the expected category, but this live test has no raw tool transcript; deterministic scope tests remain the stronger proof of enforcement across read/list/search. Untracked file contents were not individually hashed; Git status captures their names/status only.

No tests or commands were executed by the local model on the analyzed repo. This is Windows MCP SDK-client acceptance, not Cursor UI or macOS evidence. There was no new runtime change in this acceptance slice, so the prior 65-test result remains the code validation baseline rather than a newly rerun suite.

## Decision and next work

M2 real-task quality gate is **not accepted**; do not advance to M3. Before expanding scope or budgets:

1. Add bounded, content-free per-tool diagnostics (tool name, error category, line counts, repeated-call detection) so no-evidence/generic failures are explainable without storing raw source/model transcripts.
2. Improve recovery from invalid read ranges and missing/ineligible paths, and stop repeated reads within existing budgets. The precise cause of the failures above is not established by current task counters alone.
3. Add claim-level acceptance fixtures for exact names/versions; do not relabel range checking as semantic verification.
4. Rerun the same five cases on the same commit, retain the baseline and compare outcomes. Then perform Cursor integration acceptance; macOS remains separately pending.

Scale testing, automatic task splitting and continuation stay in the previously agreed future-enhancement backlog.
