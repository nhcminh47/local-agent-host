# Tool diagnostics and recovery — 19 September 2026

Used the fixed five-question acceptance suite, same novels-engine commit and scopes, 8K context/2048 output, 12 turns and 16 tool calls. Baseline and post-change reports are retained separately in parent-workspace `.local/acceptance-ctx8192-out2048-diagnostics.json` and `...-recovery.json`.

## Observed causes before behavioral changes

- Health listed files, read useful source, then repeated one identical 31–100 read nine times until the 12-turn limit. The read succeeded but added duplicate evidence/context.
- Database only listed files before answering. It had zero source evidence; no context shortage was involved.
- Startup read both files, requested line 32 onward beyond one file's EOF, then submitted invalid search arguments. Diagnostics deliberately record only schema issue count, not the raw offending values.
- The diagnostic baseline completed only dependencies (1/5). Earlier 8K/2048 experiment completed 2/5. This variation means a single run must not be treated as a stable success-rate estimate.

## Changes

Added optional bounded tool telemetry; one evidence reminder; two schema-batch repairs without executing any invalid batch; explicit EOF/range feedback; and rejection of identical successful re-reads without duplicate evidence. Existing scope, secret filtering, turn/tool deadlines and error tolerance remain in force. Rejected raw arguments are never replayed into the model context. Diagnostics do not persist raw transcripts or source.

## Live rerun

| Case | Diagnostic baseline | After recovery changes |
|---|---|---|
| Health | Turn limit | Completed, still partial auth/redaction explanation |
| Database | No evidence | Completed after reminder; now reads the source |
| Startup | Invalid tool arguments | Invalid citations; observed trajectory now includes EOF feedback, not a repeated schema failure |
| Dependencies | Completed with name error | Completed; content-quality acceptance remains separately required |
| Scope denial | Snapshot path unavailable | Same terminal failure; automatic recovery after denied paths is not implemented |

Runtime completions: **3/5** after changes. This is not 3 fully accepted answers. The database answer correctly describes pragmas, migrations and failure cleanup, but omits the `validateMigrations` readiness step and uses broad/informal citations. Health retains overbroad redaction claims; exact dependency-name fidelity and semantic citation quality remain unresolved. M2 quality gate is not accepted.

All ten baseline/rerun tasks preserved HEAD, status, index bytes and tracked-file contents. No model-run tests or commands in the analyzed repo. Source code tests add coverage for listing-only recovery, atomic batch rejection/repair limit, and EOF/repeated reads. The existing MCP canary smoke now enables tool diagnostics so captured-log canary checks cover this opt-in path.

Next: improve safe fallback after unavailable paths, precise citation feedback and exact-fact evaluation. Keep the original acceptance rubric, do not loosen it to match current output. Cursor/macOS acceptance and M3 remain pending; default inference profile remains unchanged.
