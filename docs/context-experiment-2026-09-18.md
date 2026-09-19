# Controlled context/output experiment — 18 September 2026

## Method

Ran the same five acceptance questions once in each of four host profiles, sequentially: 8192/512, 8192/2048, 16384/512, 16384/2048 (`num_ctx` / `num_predict`). Prompts, exact commit `987d7891c42df700ec23fbf8f2f68521ed7c184c`, path scopes, 180-second task deadlines, 12 model turns and 16 tool calls stayed unchanged. Agent transcript ceiling remained 24,000 bytes; only the two inference options changed.

Model: qwen3:8b, digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`. Existing local endpoint and credentials were reused. No model pull, global Ollama configuration change or user-repository mutation. This is a small paired diagnostic experiment, not a randomized/repeated benchmark or maximum-capacity test.

## Observed results

| Context / output | Runtime completions | Inference calls | Largest prompt | Largest output | Reported loaded VRAM |
|---|---:|---:|---:|---:|---:|
| 8192 / 512 | 1/5 | 25 | 7517 tokens | 218 tokens | 6,295,440,588 bytes |
| 8192 / 2048 | 2/5 | 22 | 3501 tokens | 526 tokens | 6,295,440,588 bytes |
| 16384 / 512 | 1/5 | 25 | 7517 tokens | 218 tokens | 7,520,177,356 bytes |
| 16384 / 2048 | 2/5 | 22 | 3501 tokens | 526 tokens | 7,520,177,356 bytes |

All 94 recorded model responses reported `done_reason=stop`; none reported `length`. `/api/ps` confirmed the requested 8192 or 16384 context after every task. Reported `size_vram` equalled `size` in every sample, consistent with no model CPU offload at those sampling points. These are loaded-model snapshots, not peak memory or utilization measurements. Increasing context consumed about 1.14 GiB more reported VRAM without improving outcomes in this suite.

| Question | 512 output, either context | 2048 output, either context |
|---|---|---|
| Health/auth | Turn budget exceeded: 12 turns/12 calls | Completed; auth details still partly hidden by redaction |
| Database | No evidence; maximum prompt 542 tokens | Same |
| Startup | Generic failure; maximum prompt 2579 tokens | Same |
| Dependencies | Completed but misspelled better-sqlite3 as better-sql.3 | Completed but misspelled it as better-sql.ite3 |
| Scope denial/fallback | Snapshot-path-unavailable failure; maximum prompt 695 tokens | Same |

The 2048-output health answer contained 526 generated tokens in its longest response. However, the 512-output health attempts emitted only short tool requests and ended with `stop`; their observed failure is not evidence of output being cut off at 512. A different inference allocation/output setting correlated with a different trajectory; the experiment does not establish its internal cause.

Runtime completion is not full correctness. The dependency name is incorrect in every profile. The health answer cites observed locations but generalizes redaction of individual lines to the exact implementation and asserts authentication outcomes despite portions being hidden. It is useful but remains partial under strict evidence-based grading. No profile establishes the M2 quality gate.

## Conclusion and next action

For these small tasks, insufficient Ollama context is not supported as the main cause: doubling the actual allocated context changed none of the paired outcomes, and persistent early failures used far below 8K prompt tokens. This does not rule out context pressure on larger tasks; health repetition grew its baseline prompt to 7517 tokens.

Use 8K/2048 as the candidate profile for subsequent debugging, while retaining 8K/512 as the default and baseline until acceptance improves. Do not increase turns or transcript limits to hide failures. Next work is bounded tool-result diagnostics and recovery: explain the no-evidence and generic errors, prevent redundant reads, and verify exact factual names before publication. Raw model/source transcripts remain disabled.

## Verification and evidence limits

All 20 task reports show unchanged HEAD, Git status, index bytes and tracked working-tree file contents. No tests were run in the analyzed repo. The harness stores separate reports at parent-workspace `.local/acceptance-ctx<value>-out<value>.json`, including per-call token counts, normalized stop reasons, byte counts and sampled model state; original acceptance-suite baseline remains intact.

Added bounded host profile configuration and opt-in numeric inference telemetry; `pnpm check` and **66/66 tests** passed before the matrix. The known pnpm wrapper version warning remains. Telemetry omits raw model content and arbitrary stop-reason strings; failed non-JSON/transport responses have no inference metrics. No Cursor UI/macOS or repeated-run statistical acceptance is claimed.
