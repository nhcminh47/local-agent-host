# Read-only explorer on Windows

Build with the pinned Node/pnpm toolchain. Copy `config/repos.example.json` to a host-owned configuration file outside the analyzed repository and replace its example ID/root with an actual Git root. Multiple IDs are supported. The model receives repo IDs and relative paths; it cannot register roots.

Configure the daemon process:

- `LOCAL_AGENT_PROVIDER=explorer`
- `LOCAL_AGENT_REPOS_FILE`: absolute path to that host-owned JSON file
- `LOCAL_AGENT_DB_PATH`: local durable SQLite path; use a dedicated explorer database
- `LOCAL_AGENT_IPC_TOKEN`: existing host-provisioned random token, at least 32 characters; give the same value to the MCP bridge without committing it
- `LOCAL_AGENT_DAEMON_PORT`: chosen loopback port, or 0 for an ephemeral test port
- `OLLAMA_BASE_URL`: configured Ollama origin (the tested local proxy uses port 11435)
- `OLLAMA_API_KEY` or `OLLAMA_ENV_FILE`: existing credential or explicit path to the file containing only the relevant key for this loader

Run `pnpm m1:daemon`. The existing daemon entrypoint now supports the opt-in explorer provider. It prints one ready record with its bound port. Configure the stdio MCP bridge with `LOCAL_AGENT_DAEMON_URL` and the same IPC token, then run `pnpm m1:mcp`. The bridge's tool names remain unchanged.

Submit `analyze_repo` with the configured repo ID, a unique request key, a simple Git ref, objective/question and budgets. Read `get_task` until completed, blocked or terminal failure. New successful explorer results use schema version 2 and include a host-rendered summary, validated atomic findings, limitations, host-collected evidence, immutable snapshot metadata and per-attempt metrics. Task fields `explorerModelTurns` and `explorerToolCalls` report cumulative reservations across restart/resume. Stored schema-version-1 results remain readable, but unrestricted assistant prose cannot become a new successful result.

Missing ripgrep can produce `blocked` with structured choices. `resolve_capability` selecting Node fallback or successfully rechecking installation requeues waiting tasks at their admitted commit. `cancel_task` cancels the task; choosing `cancel` for the capability request alone does not cancel tasks. Installation remains manual. Deadlines continue to run while queued or blocked.

Explorer runs one task at a time. Host-only `LOCAL_AGENT_MODEL` selects an existing `qwen3:8b` (default), `gpt-oss:20b` or `qwen3.5:latest`. Unsupported names fail configuration validation. The adapter neither pulls models nor switches models automatically. GPT-OSS uses `think: low`; the Qwen candidates use `think: false`. Reasoning text is not returned or logged. Results and inference metrics identify the selected model; record its digest separately because tags can change. Its model tools are `read_file`, `list_files`, `search_code` and the terminal `finish_analysis` contract. Focus paths are suggestions, not a scope allowlist. There are no edit, shell, test, network or installer model tools.

### Enforced task scope

`analyze_repo` accepts an optional `scope`, for example:

```json
{
  "scope": {
    "allow": ["apps/story-engine/src/**", "README.md"],
    "deny": ["apps/story-engine/src/generated/**"]
  }
}
```

Patterns support exact repo-relative file paths, `directory/**` for all descendants, or `**` for all eligible files. Matching uses case-sensitive Git paths with `/`, including on Windows. Other glob syntax, absolute paths, backslashes, empty segments and traversal are rejected. At most 32 entries per list; `allow` must be nonempty, `deny` defaults to empty and takes precedence. Lists are deduplicated and sorted for stable request identity. Omitting scope preserves the previous all-eligible-files behavior and legacy snapshot identity.

Scope is applied to snapshot entries before list pagination, either search backend, or blob reads. It can only narrow the built-in path/size/type/secret exclusions. `focusPaths` cannot widen it. The admitted task stores its scope and snapshot identity includes `scopeHash`; restart restores the admitted commit and checks the stored scope against that hash. A changed scope with the same request key is an idempotency conflict; a new scope requires a new task. Model tools cannot override the task scope.

This is task-level filtering, not a configurable per-repo host scope profile. Git still enumerates the complete bounded tree before filtering, so a narrow scope does not bypass the existing tree-size ceiling. Empty eligible scopes remain empty; there is no fallback to the full repo.

On restart, interrupted read-only tasks are requeued and start a fresh exploration transcript on the saved commit. Already reserved turns/tool calls remain spent. No raw transcript is persisted. Missing Git objects fail closed; commits are not pinned against Git GC. Run only one daemon per database; multi-daemon startup coordination is not implemented.

Verification commands after build:

- `pnpm test`: deterministic suite, including fake Ollama + actual MCP/daemon restart integration
- `pnpm m2:smoke:mcp`: the same deterministic process-level smoke
- Set `M2_LIVE_OLLAMA=1` plus the existing Ollama credential settings, then run `pnpm m2:smoke:mcp` for live model verification
- `pnpm m2:smoke:live`: narrower snapshot/store-recovery smoke retained from the preceding slice

All smoke commands use temporary synthetic repositories and clean them afterward. They do not start a permanent daemon or change a user's repository/deployment. The checked-in evidence documents Windows results; macOS and Cursor UI acceptance are still pending.

## Result quality and snapshot feedback

Read errors for ineligible snapshot paths include `SNAPSHOT_PATH_UNAVAILABLE`, the admitted commit and a suggestion to list eligible files. This does not establish whether a path exists in the working tree, was excluded, or was invalid. If no evidence can be collected after such an error, the task fails with `EXPLORER_SNAPSHOT_PATH_UNAVAILABLE`.

An out-of-scope path instead returns `SCOPE_PATH_DENIED` / `SCOPE_PATH_UNAVAILABLE` before checking snapshot membership. It means the task cannot inspect that path, not that the file is missing. Listing and subsequent reads remain within the original scope.

The model must call `finish_analysis` with schema version 2. Each atomic finding declares `direct_observation` or `inference` and cites exact ranges observed in that attempt. The model does not copy source excerpts into the tool call: after validating complete observed ranges and rejecting redacted support, the host derives each published excerpt from the cited filtered lines in citation order. The basis describes whether the statement is directly present or inferred; it does not relax citation grounding. Identifiers, package names, versions, JSON strings and commands declared as exact values must match their cited source; JSON strings are decoded exactly once.

The host validates the complete result atomically and renders public prose only from accepted fields. Free-form assistant prose is never copied into a new terminal success. After evidence exists, one missing/free-form completion may receive a bounded reminder to call `finish_analysis`. Independently, the first invalid structured completion may receive one correction with bounded issue codes; a second invalid structured result fails with `EXPLORER_INVALID_COMPLETION`. Free-form prose after either reminder fails with `EXPLORER_STRUCTURED_COMPLETION_REQUIRED`. All repair turns remain inside the original turn, tool, transcript and deadline budgets.

Limitations use `redacted`, `outside_scope`, `unavailable` or `not_observed`. A redaction limitation must cite an observed redacted line. An unavailable/scope limitation must match a denied read and cannot assert that the path exists or is absent. Imported calls, propagated failures and implemented checks whose execution was not observed should remain bounded inferences or limitations. `verification` is host-owned and always `not_run` in M2.

These checks establish contract, range, excerpt and exact-value grounding; they do not establish semantic correctness or requested-fact completeness. The qualification grader keeps runtime, contract, evidence, exact values, completeness, semantic review, limitation handling and preservation as separate dimensions. Missing human review is `not_reviewed`, never pass. The conservative secret filter remains defense in depth rather than a complete credential detector.

## Inference failures

The adapter publishes bounded error codes instead of HTTP bodies, JSON parse text or schema-validation input. `EXPLORER_HTTP_FAILED` covers non-success HTTP statuses; `EXPLORER_INVALID_RESPONSE` covers invalid JSON/UTF-8/schema; `EXPLORER_TRANSPORT_FAILED` covers connection/redirect failures; `EXPLORER_RESPONSE_LIMIT` covers the response byte ceiling. Failed responses do not yield partial tool calls. Cancellation aborts an outstanding body read. There is no automatic inference retry, backoff or model fallback in this slice; these codes do not retain HTTP status-specific retry advice.

The default deterministic `pnpm m2:smoke:mcp` also injects seven synthetic failure/output canary cases and verifies SQLite rows, DB/WAL bytes, MCP text/structured output and captured process logs. It restarts the daemon and checks terminal results are retained without inference replay. These additional cases run only with the fake provider, not when `M2_LIVE_OLLAMA=1`; no real credential values are scanned or published by them.

## Controlled context/output experiment

Host environment settings `LOCAL_AGENT_NUM_CTX` (8192 or 16384) and `LOCAL_AGENT_NUM_PREDICT` (512 or 2048) select bounded inference settings. Defaults remain 8192/512. These are host-only settings; MCP requests and model tool calls cannot change them. They do not raise task turns, tool limits, the 24,000-byte message budget or tool output limits.

Opt-in `LOCAL_AGENT_INFERENCE_METRICS=1` emits an `inference.metrics` JSON record to daemon stderr after decoding each complete JSON response, before validating its message. Records contain only the allowlisted model name, context/output settings, nonnegative token counts or null, normalized stop reason, elapsed milliseconds and serialized message/tool-schema byte counts. Arbitrary response text/reason strings are not logged. Non-JSON responses and transport failures have no such record. Metrics are per process and are not persisted as task events; the serial acceptance harness associates them with the current task. Do not use that association with concurrent inference.

The acceptance harness reads the five fixed cases, rubric and commit, pins the selected model digest from `/api/tags`, and stores each run separately under `.local/`. It freezes the source revision (or an unborn-tree digest), prompt/result contract versions, model/digest, inference settings, target commit, case/rubric digests and budgets. Increasing model context does not imply that the agent sends additional source.

After building, set a unique `ACCEPTANCE_RUN_ID` and run `pnpm m2:acceptance`. The machine-specific novels-engine/Ollama setup references the local D: repository and a host-owned credential file; obtain explicit authorization before reading that credential or sending repository contents to the endpoint. Each report includes claim-level review worksheets. Complete a separate ignored review JSON, then set `ACCEPTANCE_REPORT` and `ACCEPTANCE_REVIEW_FILE` and run `pnpm m2:grade`. Set `ACCEPTANCE_PAIR_WITH` to the first reviewed report when grading the unchanged confirmation run. The Windows gate passes only when both frozen runs are 5/5 and every preservation dimension passes.

## Tool diagnostics and bounded recovery

`LOCAL_AGENT_TOOL_METRICS=1` enables content-free `explorer.tool` stderr records: turn, allowlisted tool name, normalized error/status, repeated identical-call count, requested line bounds and evidence count. Structured-completion failures report the issue count plus sorted bounded issue-code names and schema-only field paths; rejected values and messages are omitted. Repository paths, query strings, raw arguments and source/model content are not logged. These are optional per-process observations, not persisted task events; interrupted/in-flight calls may have no final record. The serial acceptance harness collects them alongside inference metrics. `ACCEPTANCE_RUN_ID` distinguishes immutable run files.

The loop allows one evidence reminder after tools were called but no source evidence was collected, including after denied reads. The reminder forbids retrying denied paths or widening scope and directs the model to list eligible alternatives. It allows two corrections of invalid schema batches, executes none of a rejected batch and never sends raw rejected arguments back to the model. Unknown tools and sensitive validated inputs still fail closed. Repair turns use the existing persisted model budget.

`list_files` starts with an omitted/empty cursor. A subsequent cursor must be a `nextCursor` previously returned during this attempt; a guessed filename or directory fails with `INVALID_LIST_CURSOR`. Cursor feedback consumes the existing error and tool budgets. Finish diagnostics record only a normalized outcome, issue count and bounded issue-code names; correction feedback also contains schema paths, never rejected values.

Reading past EOF returns `READ_PAST_END` with the last line number. A repeated identical successful read returns `READ_ALREADY_OBSERVED` and asks the model to reuse prior evidence; it neither reads the blob again nor appends duplicate evidence. Attempts still consume tool budget and repeated errors remain subject to the existing three-error tolerance. This deduplication lasts for the current attempt only; it is not a durable checkpoint. Range-limit feedback gives a valid short-range example. None of these mechanisms widens scope, reveals redacted text or raises limits.

## Native Cursor/macOS topology gate

Windows SDK quality evidence does not certify the intended Cursor/macOS topology. After the two reviewed Windows runs pass, validate the native client and each required host separately with the same source revision, contract versions, model digest, inference settings, target commit, cases, scopes and budgets.

For each native environment, record the Cursor version, host OS/architecture, Node/pnpm versions, daemon/bridge configuration identifiers without credentials, and the exact frozen inputs. Submit all five cases through the native Cursor MCP connection, interrupt/restart the daemon during one in-flight read-only task, reconnect the client, and confirm that the admitted snapshot and cumulative budgets survive without inference replay of terminal tasks. Verify the request/result/log canaries, task scope, redaction, HEAD, index bytes, Git status, tracked contents and baseline untracked-file contents. Keep raw machine-specific output in ignored `.local/` files and commit only a sanitized evidence summary.

M2 remains open and M3 remains disabled if native Cursor/macOS evidence is missing, differs from the frozen profile, exposes a canary, mutates any preservation dimension, or produces fewer than two reviewed Windows 5/5 runs plus the required native pass.

## Conditional status claims — prompt contract v32

For supported single-line numeric status ternaries, findings mentioning a branch status must cite the selecting assignment and quote the complete conditional expression. Response labels such as VALIDATION_ERROR do not establish a broad error category. Missing context receives the existing bounded grounding repair; a repeated rejected finding is not published. The guard recognizes only const/let status-named assignments with numeric branches and cited or nearby directly consuming responses; it is a lexical check, not general semantic verification. Unobserved/redacted predicates and unsupported syntax still require human review.

Deterministic tests cover the recorded 413 overgeneralization, corrected claims, response-only citations and failed repairs. Prompt contract v32 changes behavior: historical v31 results do not qualify it. Keep the five frozen cases and budgets unchanged when requalifying; do not mark M2 accepted without the required reviewed pair and topology evidence.
