# M2 — Exploration status

Started 18 September 2026 after the Windows M1 core gate passed.

Live checkpoint before the 413 fix (20 September): the live rerun after source reorganization completed **5/5** tasks and passed **25/25** preservation checks, but agent review graded **4/5** because health overgeneralized the 413 error branch. No confirmation run was started. Strict checking, **90/90** deterministic tests and the MCP smoke passed on Node 22.23.2 / pnpm 11.7.0. The historical v31 pair remains recorded, but its local review metadata identifies an agent reviewer, not an independently verified human review. Current-source qualification, human review and native Cursor/macOS topology remain open; M3 remains disabled. See the [live rerun report](m2-live-rerun-2026-09-20.md) and [historical v31 report](m2-quality-gate-v31-2026-09-19.md).

Latest fix checkpoint (20 September): prompt contract **v32** adds a narrow conditional-status context guard and targeted bounded repair; the daemon independently returns a usable **413 REQUEST_TOO_LARGE** for oversized bodies. Strict checking and **102/102** deterministic tests passed, as did M1 reconnect and M2 MCP smoke (seven canaries). The original overgeneralized claim is rejected in deterministic regressions. **Live v32 qualification has not been run**; human review, native topology and M3 gates are unchanged. See the [413 correction memory](memories/2026-09-20-413-corrections.md).

## Agreed capability policy

- Check optional tools before first use and cache path/version evidence.
- If ripgrep is missing, return `MISSING_CAPABILITY` with `install`, `use_builtin_fallback`, and `cancel` choices.
- Never install from model-generated commands. Installation requires an explicit user decision and a host-owned allowlisted installer.
- If installation is declined, use the bundled Node streaming search backend. Do not invoke shell-native grep/find commands.
- `read_file` and `list_files` use Node APIs and need no external capability.
- Git and verification executables block when missing because no safe equivalent fallback exists.

## Current implementation task

The first read-only vertical slice is implemented:

- Server-side repo registration with canonical root deduplication.
- Repo-relative path validation and realpath containment; absolute paths, traversal, and escapes are denied.
- `read_file` with file/binary/byte/line limits, line-numbered output, SHA-256 evidence, and truncation metadata.
- `list_files` with stable lexical cursor and limits; `.git`, `node_modules`, `.env`, and `.env.*` are excluded.
- Node literal-search fallback with bounded matches, previews, file-size/binary filtering, and the same denied paths.
- Ripgrep capability preflight is cached per daemon registry. Missing executable returns the three agreed decisions without invoking a shell or installer.

Seventeen deterministic tests now pass across M0–M2, including traversal rejection, secret canary exclusion, list pagination, Node fallback evidence, and missing-ripgrep choices.

## Capability service slice — 18 September 2026

- Added `check_capability` and `resolve_capability` to the MCP bridge and authenticated daemon IPC.
- Strict inputs accept only schema version 1, ripgrep, and the three agreed decisions. Executables, paths and commands are never accepted from MCP callers.
- User-selected Node fallback is stored transactionally in SQLite beside task state, survives service restart, and applies to this host. Availability probes remain in memory and are checked again in a new daemon.
- `cancel` cancels only the capability request; it neither changes the saved preference nor cancels a task. Task cancellation still uses `cancel_task`.
- `install` rechecks for a manually installed executable. If absent it returns `HOST_INSTALLER_UNAVAILABLE`; it does not invoke an installer. Existing fallback preference is preserved on failure and cleared only after a successful probe.
- Executable probes now cache by executable, bound captured version output, reject timeouts, and pass only a small environment allowlist.
- Windows validation: TypeScript check/build and 20/20 deterministic tests passed using Node 22.23.2. M0 SDK smoke and M1 fake-provider MCP smoke passed, including new tool discovery, fallback selection, rejected command input and saved preference after bridge reconnect.
- The environment's `pnpm` wrapper uses Node 24.19.0/pnpm 11.19.0 rather than the pinned toolchain. Equivalent compiler/test entrypoints were therefore run directly with the project's Node 22.23.2. No dependency or lockfile changes were made.
- Source continued in this chat's `local-agent-host/` workspace from the previous M2 source staging directory. Local `node_modules` links to the existing dependency installation on D:; it is not part of source delivery. No deployment to the D: checkout was performed.

At that stage these tools exposed capability decisions only. The following slice now connects decisions to an internal search dispatcher. No live model, Cursor UI, or macOS validation was performed.

## Ripgrep search slice — 18 September 2026

- Added internal `SearchService.search` with strict `SearchCodeInput`. It validates the registered repo, checks capability, returns the agreed blocked choices when missing, and selects ripgrep or the persisted Node fallback. Backend/executable/command overrides are rejected. This dispatcher is not yet connected to the model loop or exposed as a new MCP tool.
- Capability preflight resolves an absolute executable from host PATH, excludes current-directory lookup and Windows script launchers, and searches with the exact executable it probed. This fixes observed Windows `spawn('rg')` EPERM while the resolved `rg.exe` runs successfully. If the executable disappears after preflight, search invalidates the cache and returns `MISSING_CAPABILITY`, without silently choosing fallback.
- Host Node APIs enumerate and validate files, read a bounded UTF-8 buffer, normalize CRLF, and pass those bytes to ripgrep stdin. Both backends use the same candidates and one result per matching line. Search is case-sensitive literal matching; multiline, NUL, malformed Unicode and empty patterns are rejected.
- ripgrep uses argv with `shell:false`, `--fixed-strings`, `--no-config`, explicit stdin and an environment allowlist. It never independently traverses the repo. This follows the [ripgrep configuration guidance](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md#configuration-file). Returned line numbers and text are checked against the host-read buffer before publication.
- Shared limits: first 500 lexically sorted eligible paths; traversal capped at 20,000 entries / depth 64; 1 MiB per file plus one-byte growth check; 8 MiB of accepted text considered per search; 1–100 results; 500-character previews; 48 KiB serialized match budget. Four-second cooperative search deadline, two-second child timeout, two-MiB captured child output ceiling, and cancellation cleanup. Limit hits and skipped unreadable/binary/invalid-UTF-8/oversized files return explicit truncation reasons. The 8 MiB counter measures accepted text, not total filesystem I/O; excluded binary/invalid files may also have been read within per-file/time limits.
- Binary detection checks the whole bounded buffer. Sensitive path matching is case-insensitive, including `.ENV`. Listing does not follow symlinks/junctions, canonical path checks reject escapes, and Windows cross-drive absolute relative results are now rejected.
- Existing Node `searchBuiltin` uses the same engine. Real-ripgrep parity tests cover Unicode, BOM, CRLF, lone CR inside a line, leading `--`, shell-looking literal strings, repeated matches on one line, exact result limits, and no matches. Additional tests cover file/output limits, junction escape, denied-path canaries, late NUL, invalid UTF-8, persisted fallback after restart, stale executable, ignored config and active-child cancellation.
- Windows evidence: TypeScript check/build, **29/29 tests passed with zero skips**, M0 SDK and M1 fake-provider MCP smoke passed on Node 22.23.2 and ripgrep 15.2.0. The existing Windows process-tree smoke initially hit sandbox `taskkill` access denial, then passed with elevated test execution (three fixture processes, 120 ms). This remains the earlier live-parent process-tree gate, not crash containment.
- Validation used the same direct Node 22 compiler/test entrypoints described above. No dependency, lockfile, installed-tool or deployment changes were made. CI without ripgrep skips only real-ripgrep cases; this Windows run exercised all of them.

The reader still operates on a live registered directory. These checks do not claim protection against a concurrently malicious filesystem writer, nor a Git snapshot. Content secret-value filtering remains pending; path-based canaries do not establish full secret-pipeline coverage. No Cursor UI, macOS or live-model acceptance is claimed.

## Content filtering slice — 18 September 2026

- Added shared `SecretFilter` before any read line selection, search matching, ripgrep stdin or preview clipping. Detected lines become `[REDACTED]`; original line numbers remain stable. Filtering processes the complete bounded file, including multiline known values and private-key blocks; it does not emit partially scanned chunks.
- Host code can provision up to 128 known values in memory. Values are private fields, never discovered by scanning environment/credential files, never accepted from model inputs, and never persisted by this module. Default rules cover credential-shaped assignments, bearer strings, selected token prefixes and credential-bearing URLs. Unterminated private-key blocks are masked through EOF.
- Known-secret paths are excluded from listings and rejected by readers. Sensitive search patterns are rejected before matcher invocation. `redactedFiles` records affected search files; `readFile` reports `redacted`.
- `readFile` now shares the bounded UTF-8 reader with search, closing its previous size-check/read race for memory bounds and first-8-KiB-only binary detection. `sha256` now hashes the normalized, filtered full text, explicitly identified by `hashScope: filtered-text`; it is not a raw file identity and must not be used as a future patch precondition.
- Validation: **35/35 tests passed, zero skips** on Node 22.23.2, including real ripgrep. Tests verify multiline/overlapping known values, private-key blocks, masking before clipping, line preservation, safe hash scope, unchanged source bytes, safe matcher input, read/search outputs, sensitive filenames and query rejection. TypeScript check passed both through the environment pnpm wrapper and directly on pinned Node 22; the full test suite used direct Node 22 entrypoints because of the previously documented wrapper mismatch.

This is a read/search boundary filter, not a complete secret pipeline. Heuristics can produce false positives and miss unknown or encoded credentials; entropy detection and safe escaped-value handling are not implemented. Prompt, event/log, model transcript and artifact publication boundaries are still pending integration. No claim is made about live-model/MCP end-to-end canary coverage. Files remain live rather than immutable snapshots.

## Immutable Git snapshot and live test — 18 September 2026

- Added `GitSnapshotTools.capture` on a host-registered Git root. A simple ref is resolved once to a full commit ID; bounded tree entries and exact blob object IDs back subsequent reads. Read/search results carry snapshot provenance. No worktree, checkout, ref update or index write is performed by snapshot code.
- Only committed regular files are eligible. Dirty/untracked files, symlinks, gitlinks, denied paths, control-character/ambiguous paths and files above 1 MiB are excluded, with excluded-entry counts in metadata. Registrations below the Git root are rejected rather than exposing the surrounding repository.
- Uses NUL-delimited [Git ls-tree output](https://git-scm.com/docs/git-ls-tree). `cat-file blob` reads omit filters/textconv and verify blob length/hash before filtering content. SHA-1 and SHA-256 IDs are recognized; only default SHA-1 fixtures were tested. Snapshot IDs identify committed source, not filter policy.
- Fixed argv and resolved Git executable, environment allowlist, disabled global/system config, replacement objects and lazy fetch; see [Git controls](https://git-scm.com/docs/git). Local repo config is still read. Five-second process timeout; 2 MiB tree output / 10,000 entries / 1 MiB blob limits.
- Manifest is currently in memory, with lazy reads from the object database. Missing/pruned objects fail closed; there is no durable pin, retention or restart restore yet.
- Windows evidence: **39/39 tests passed, zero skips**, on Node 22.23.2 / Git 2.54.0.windows.1. TypeScript check/build and M0/M1 fake-provider MCP smoke passed. New tests cover dirty checkout, advancing HEAD, unchanged source/index, denied paths/refs, nested-root rejection, symlink/gitlink exclusion, replacement-ref immunity and missing-object failure without live-file fallback.
- **Live test passed with qwen3:8b**: one validated `read_file` call returned filtered snapshot content; model answered `731` while checkout contained `999`. Inference calls took 6,566 ms and 314 ms; prompt tokens 185/317, generated tokens 21/4. Canary absence and checkout/index preservation passed. [Sanitized evidence](live-snapshot-2026-09-18.json).
- Added opt-in `pnpm m2:smoke:live` after build. Uses the configured local Ollama endpoint and existing credential via environment or explicitly selected `OLLAMA_ENV_FILE`; checks the installed model, never pulls it. Only a temporary synthetic Git fixture is created/removed; model calls are restricted to one fixed read tool. Tests/live smoke ran via pinned Node 22 entrypoints because of the previously documented pnpm wrapper mismatch.

This validates snapshot reads with a real model, not the production explorer loop, durable task admission, Cursor UI or MCP-to-model snapshot end-to-end flow. M1 still sends only objective/question. macOS and broader prompt/log/artifact filtering remain open.

## Durable snapshot admission and restore — 18 September 2026

- Added `SnapshotTaskService` for host-side submission and restoration. Task payload, immutable snapshot identity and admission events commit in a single SQLite transaction. Store schema v4 adds a task-keyed snapshot table; no source content or native root paths are persisted there.
- Identity contains full commit ID, snapshot ID and canonical repo-root fingerprint. On restore the registered root must match, and Git capture uses the stored commit, never the original branch/ref. Identity validation rejects corrupt rows and inconsistent snapshot hashes. Current host secret-filter configuration is supplied again on restore; filter policy/secret provisioning is not snapshotted by this slice.
- Identical retries return the original admission before Git access, even if HEAD moved or the old object disappeared. Conflicting requests fail. Concurrent identical admissions return the winning transaction's identity and create one task. Legacy tasks without a snapshot are not retrofitted or silently mixed with snapshot tasks.
- Recovery preserves snapshot identity while requeueing interrupted tasks. Missing objects, changed root registration or malformed identities fail closed. The object database still owns retention: this does not pin commits against garbage collection or duplicate the raw object store.
- Verification: **43/43 tests passed, zero skips**, TypeScript check/build and M1 fake-provider MCP smoke passed on Windows with pinned Node 22. New cases exercise store close/reopen and recovery after HEAD advancement, duplicate requests without Git access, two simultaneous submissions, incompatible legacy mode, corrupt identity, root rebinding and injected event-write failure rolling back all three tables.
- Updated live fixture smoke to admit/claim a task, change checkout, close/reopen SQLite, recover, retry admission and restore before the model reads. **qwen3:8b live test passed** with committed value 731 versus dirty value 999, unchanged index/source and canary absence. Inference measured 6,414 ms + 302 ms. [Sanitized evidence](live-snapshot-recovery-2026-09-18.json). Same local credential/model reused without changing deployment or installing anything.

The durable service is internal and not yet wired to production daemon submission/execution. The restart test reopens the store and reconstructs the service; it does not claim a daemon-process or Cursor restart test. Existing M1 admission/provider behavior is unchanged. The next integration must schedule restored snapshots and apply task deadlines/cancellation plus remaining filtering boundaries.

## Daemon explorer integration — 18 September 2026

- Added opt-in `LOCAL_AGENT_PROVIDER=explorer` to the existing daemon. Host-owned repo config registers Git roots, snapshot admission is durable before replying, and a serial scheduler restores queued/recovered tasks on their saved commit. M1 fake/connectivity modes remain available. [Runbook](explorer-runbook.md).
- Added fixed `qwen3:8b` Ollama adapter and bounded read-only loop. Only read/list/literal-search tools are exposed; unknown tools and unsafe/invalid arguments fail closed. Repository text is marked untrusted in the system prompt. Successful read/search evidence is collected by the host and attached to results; answers without any evidence fail. Claims in model prose are not independently verified.
- Enforces admission deadline through queue, inference and tool checkpoints, cancellation abort, model-turn/tool-call limits, 24 KB transcript budget, 12 KB individual tool-result budget, 100 evidence entries and three recoverable tool errors. Git reads keep their existing bounded subprocess timeouts; cancellation during a Git call is cooperative and checked before inference/publication.
- Store schema v5 persists model/tool reservations before execution, so restart or capability resume cannot reset the task budget. Per-attempt result metrics and cumulative task counters are distinct. Blocked tasks retain their snapshot; resolving capability requeues them, and startup reconciles an already saved capability decision. Old read-only attempts are replayed from a new transcript, not a persisted raw transcript.
- Sensitive input is rejected before task persistence. Read/search content, model text and tool argument strings pass the filter/validation boundaries. Raw tool/model transcripts are not persisted or logged. API failures expose bounded codes. Host/Origin checks reject browser-origin requests; IPC timeout now accommodates the documented long-poll and Git admission timeouts.
- Deterministic Windows verification: **50/50 tests passed, zero skips**; TypeScript build/check and M1 MCP smoke passed. Tests include read/list/search evidence, forbidden tools, no-evidence failure, turn/tool budgets, cumulative budgets after block/resume, cancellation, deadline suppression and sensitive-input rejection. The process-level test kills a daemon during an outstanding fake-model request, restarts it, retrieves the correct old snapshot result via MCP and verifies checkout/index preservation plus captured model-request canary absence. Final counter/reconciliation changes passed the 18 directly affected tests again.
- **Live MCP → daemon → explorer → qwen3:8b passed**, producing the old snapshot value after HEAD advancement. Two model turns, one read call, 5,997 ms loop wall time. Completed task and duplicate request survived an actual daemon restart; source/index and task-result canary checks passed. [Sanitized evidence](live-explorer-mcp-2026-09-18.json). This uses the local MCP SDK client and a synthetic Git repo, not Cursor UI.

No permanent daemon was deployed or user repo configuration changed; only source and disposable tests were run. Secret detection remains heuristic, encoded/unknown secrets may be missed, and no complete artifact publication service exists. The loop has no automatic HTTP retry, model switch or installer. Scope profiles, production operational hardening, Git object retention and multi-daemon coordination remain future work.

## Next M2 slice

Validate the frozen read-only workflow through native Cursor and on each required macOS host, including restart, filtering, scope, snapshot and preservation checks. Keep the accepted Windows pair frozen as evidence and do not enable M3 edit/test tools until the remaining native gate passes.

## Real-repository feedback and citation validation — 18 September 2026

- Continued source in this thread's `local-agent-host/` directory; dependency junction reuses the existing D: installation. No deployment to the D: checkout or permanent daemon configuration change.
- Added explicit eligible-snapshot feedback for denied reads, without probing the working tree. No-evidence results after denied reads now return `EXPLORER_SNAPSHOT_PATH_UNAVAILABLE`.
- Added canonical citation range validation and one bounded repair attempt. Rejects unread paths, out-of-range lines, reversed ranges and gaps between observed ranges. This is range validation only; informal references and claim entailment remain outside the validator.
- Added result metadata for redacted reads, summary redaction and unavailable-path calls. Reproduced conservative false positives for `Bearer API key`; filtering protections remain unchanged.
- TypeScript check/build and 54/54 tests passed, zero skips. `pnpm check` and `pnpm test` passed; the installed pnpm wrapper still reports Node 24.19.0/pnpm 11.19.0, with Node 22.23.2 prepended for script execution. Direct pinned Node 22 compilation and the complete test suite also passed.
- Live MCP → daemon → qwen3:8b on the committed `novels-engine` health/readiness implementation completed in 15,498 ms, three model turns and two reads. Recognized citations app.ts:30, app.ts:31 and auth.ts:10 are in observed ranges. HEAD, status, index bytes and tracked-file contents remained identical. An earlier live answer was rejected for citation format; adding concrete allowed-range examples enabled the bounded repair.
- Two reads were marked redacted, while the final summary was not. The answer acknowledged hidden implementation details. This does not establish complete auth analysis, precise semantic citation quality, or coverage of every prose claim. Windows SDK-client acceptance only; Cursor/macOS, full filtering quality and M3 remain open.

## Provider failure injection — 18 September 2026

- Added the requested scale/load benchmark and limit recovery work to the technical plan's future-enhancement backlog. No stress run, capacity increase, automatic continuation or checkpoint system was implemented.
- Continued the M2 failure gate using local HTTP fixtures and the real Ollama adapter. HTTP 401/429/500/503 bodies are cancelled without publishing their content. Malformed JSON, invalid UTF-8 and invalid response schemas produce `EXPLORER_INVALID_RESPONSE`; transport disconnect/redirect failures produce `EXPLORER_TRANSPORT_FAILED`. Oversized responses retain `EXPLORER_RESPONSE_LIMIT`. Caller cancellation preserves its abort semantics.
- The adapter only returns a tool-call batch after receiving and validating the entire bounded response. A mid-body disconnect cannot return partial calls. No automatic HTTP retry or credential forwarding through redirects was added.
- Seven new tests cover HTTP errors without retries, malformed/invalid responses with a synthetic canary, response size, partial-body disconnect, redirect refusal, stalled-body cancellation/connection closure, and valid chunked Unicode/tool calls. These tests use a local fake HTTP service, no external endpoint, model or repo execution.
- `pnpm check` and `pnpm test` passed: **61/61 tests, zero skips**, including the existing MCP daemon restart test. The known pnpm wrapper version warning remains; script PATH prefers pinned Node 22.23.2. No dependencies or installed runtimes changed.

Next M2 gate: extend end-to-end canary evidence through persisted task failures and MCP output, then remaining scope/context handling and real-client acceptance. Full scale benchmarks, partial-result continuation, inference backoff/circuit breaker and GPU OOM behavior remain unimplemented. Do not advance to M3 yet.

## Persisted failure canaries through MCP — 18 September 2026

- Extended the existing process-level smoke rather than introducing another daemon harness. It now injects seven scenarios through fake Ollama → actual provider/daemon → SQLite → MCP SDK client: HTTP 500, malformed JSON, invalid response schema, oversized response, mid-body disconnect, sensitive tool arguments and a successful answer containing a credential-shaped synthetic canary line.
- The six failure scenarios finish with bounded expected error codes, zero executed tool calls and exactly one inference request each. The successful output case reads the committed fixture, redacts the canary line and reports summary redaction. Existing source-canary exclusion from model payloads remains checked; synthetic IPC/model credentials are also checked for absence from request bodies, stored data and published output (the model credential is intentionally present in the required HTTP authorization header).
- Scans include both MCP text and structured responses with events; tasks/events/snapshot SQLite rows; raw DB and WAL bytes while the writer is alive; daemon stdout/stderr and bridge stderr with overlap across chunks. Only fixture values are inspected. Raw responses/logs are not written as artifacts.
- Restarting the daemon preserves all seven terminal result JSON values, with no further inference calls. Checkout contents, status and index remain unchanged. This extends the earlier interrupted-running-task recovery test.
- Windows validation: `pnpm check`, **61/61 tests with zero skips**, and `pnpm spike:mcp` passed. The test count remains 61 because the seven scenarios extend the existing integration test; its wrapper now asserts all seven ran. Known pnpm wrapper version warning remains; Node 22.23.2 is first in script PATH.

Scope: deterministic local HTTP fixtures and the real MCP/daemon/storage path. Not a live-model or Cursor/macOS failure run, not proof against unknown/encoded secrets, and not an artifact-publication or GPU stress test. No production configuration or analyzed user repository was changed.

Next bounded M2 step: enforce read-only path scope through admission, persisted snapshot identity and read/list/search, with restart/idempotency coverage. Focus paths remain hints until that step is implemented. Scale/checkpoint/continuation work stays in future enhancements; M3 remains gated.

## Enforced task path scope — 18 September 2026

- Implemented optional `scope.allow/deny` in the MCP admission contract. Exact paths, `directory/**` and `**` only; strict bounded schema, deny precedence, case-sensitive Git paths, sorted/deduplicated lists. Existing callers without scope retain their previous payload and commit-only snapshot identity.
- Snapshot capture intersects scope with existing built-in exclusions before constructing the eligible entry map. Read/list/search (Node and available ripgrep) therefore share the same boundary; model tools and focus hints cannot broaden it. No new filesystem or mutation capability.
- Persisted payload carries scope and snapshot identity includes its hash. Restore verifies hash consistency and retains the saved commit after HEAD changes. Equivalent duplicate scope lists reuse the task; broader scope with the same key conflicts. Corrupted persisted scope fails closed. No database column migration is needed because identities already live in validated JSON.
- Added four tests for grammar/segment boundaries, pagination/read/search parity and built-in deny preservation, restart/idempotency/hash corruption, and the actual model loop attempting to read outside scope. The existing process-level MCP restart/canary smoke now submits a scoped task with a second committed file excluded and checks the restored eligible-file count/hash.
- Windows verification: `pnpm check`, **65/65 tests with zero skips**, and `pnpm spike:mcp` passed. Existing unscoped snapshot tests remain green. Installed pnpm wrapper warning is unchanged; Node 22.23.2 is first in script PATH.

Limitations: task scopes do not yet include configurable host repo profiles, arbitrary globs, scoped Git traversal, full-repo search pagination or context compaction. This slice was tested with deterministic fixtures, not live-model/Cursor/macOS scope acceptance. Next M2 gate is broader real-task/client acceptance and documenting unresolved quality/context constraints; M3 remains gated.

## Five live read-only acceptance tasks — 18 September 2026

Ran health/auth, SQLite setup, startup/shutdown, package dependencies and negative scope/fallback questions against the same committed novels-engine tree using the real qwen3:8b provider through the MCP SDK client. **1/5 runtime completions; 0/5 fully correct complete answers** under the recorded rubric. The completed dependency answer had correct locations/versions but misspelled better-sqlite3. Other tasks exhausted turns, lacked evidence or failed. All five preserved HEAD/status/index/tracked contents. See [full acceptance report](real-repo-acceptance-2026-09-18.md).

No production source change in this slice. The real-task quality gate is not accepted. Next step is bounded tool diagnostics and recovery quality, followed by the same fixed-commit rerun; Cursor/macOS acceptance and M3 remain pending. Do not increase budgets to hide these failures or treat range validation as semantic verification.

## Context/output hypothesis tested — 18 September 2026

Added host-only 8K/16K context and 512/2048 output profiles, with default unchanged at 8K/512. Opt-in numeric telemetry records prompt/generated tokens, normalized stop reason, bytes and duration without raw transcript. Typecheck and **66/66 tests passed**.

Completed all 20 live tasks in the controlled 2×2 matrix. 8K→16K did not change paired outcomes; 512→2048 increased runtime completions from 1/5 to 2/5 at either context. All 94 model responses reported stop, none length. API model-state samples confirmed actual requested contexts and about 1.14 GiB additional VRAM at 16K. Persistent database/startup/scope failures occurred with prompt maxima 542/2579/695 tokens. All 20 preservation checks passed. [Experiment details](context-experiment-2026-09-18.md).

Insufficient context is not supported as the main cause for this suite; runtime completion still does not establish content correctness. Keep 8K/2048 as a debugging candidate, not an automatic global/default change. Next action remains tool diagnostics/recovery and exact-fact quality. M2 quality gate, Cursor/macOS and M3 remain pending.

## Tool diagnostics and bounded recovery — 19 September 2026

Diagnosed repeated successful reads, listing-only answers and invalid tool arguments using content-free telemetry. Added one evidence reminder, two atomic schema-batch repair attempts, explicit EOF/range feedback and identical-read deduplication within the existing budgets. No raw arguments or transcripts are logged/replayed. The MCP canary smoke enables diagnostics to verify captured logs remain clean.

The diagnostic baseline completed 1/5; the same fixed-commit live rerun after changes completed **3/5**, with unchanged source/index/HEAD/status. Content grading remains partial, startup now fails citation validation, and unavailable-path recovery is still pending. Earlier context-experiment variability is retained in the report rather than presented as a guaranteed improvement. [Details](tool-recovery-2026-09-19.md).

Validation: `pnpm check`, **69/69 deterministic tests**, MCP smoke; Windows only, known wrapper version warning unchanged. M2 quality gate remains unaccepted; do not enable M3.

## Literal checks, scoped recovery and installed model candidates — 19 September 2026

Added recovery after denied reads without broadening scope, explicit scope-denial feedback that does not imply file absence, issued-cursor validation, broader citation-format support and bounded inline-literal validation. Host configuration can select the three installed candidate models; results/metrics identify the selected model and reasoning text is discarded. Default model/context/output remain unchanged; no pull, silent fallback or permanent deployment.

TypeScript check/build and **74/74 tests with zero skips** passed after the final source change. MCP SDK smoke passed, and the full suite includes process restart plus persisted canary checks with diagnostics enabled. Known pnpm wrapper warning remains. Tests cover denied-read recovery, literal typo repair/rejection, source token handling, citation variants, invalid cursor recovery and model-adapter configuration.

Retained six live five-case development runs on the same frozen real repository. All **30/30 repository-preservation checks passed**. Candidate/code combinations completed between 0/5 and 3/5 at runtime; these were not controlled model rankings. First Qwen 3.5 run completed 3/5 with 1/5 fully accepted; after clarified guidance it completed 2/5 with 0/5 fully accepted. Remaining defects include unsupported semantic inferences, inaccurate reconstruction of code/commands, and persistent citation/literal failures. [Full evidence and gate matrix](m2-quality-2026-09-19.md).

No claim that lexical checks verify prose semantics. The next quality slice is structured per-finding evidence plus acceptance fixtures for these observed errors, before another bounded live rerun. Actual Cursor/macOS checks remain separate; scale/capacity/continuation stay in the future-enhancement backlog. M2 is not complete and M3 remains gated.

## Claim-level quality-gate implementation — 19 September 2026

- Added strict schema-version-2 findings, citations, exact values and limitations. `finish_analysis` is the only new-success publication path; host validation checks attempt-local range coverage, exact filtered excerpts, redacted support, unavailable-path claims and exact/once-decoded values before rendering public text. New results keep `verification: not_run`; stored version-1 JSON remains readable.
- Invalid completion is atomic and has one bounded repair under the existing budgets. Free-form assistant prose cannot become a successful result. No edit, command, test, worktree, installer, fallback-model or budget-expansion capability was added.
- Added the versioned five-case rubric and independent runtime, contract, evidence, exact-value, requested-fact, semantic-review, limitation and preservation dimensions. Missing review cannot pass. Pair grading requires identical frozen inputs and two reviewed 5/5 runs.
- The acceptance fingerprint now covers HEAD, index bytes, Git status, tracked-file contents and contents of baseline untracked files. Reports freeze source revision/tree digest, prompt/result contract versions, model digest, inference settings, target commit, case/rubric digests and task budgets. Raw reports and reviews remain under ignored `.local/`.
- Observed on this Windows workspace under pinned Node **22.23.2** and pnpm **11.7.0**: `pnpm check` passed; `pnpm test` passed **83/83 with zero skips**; `pnpm m1:smoke` passed; deterministic `pnpm m2:smoke:mcp` passed all seven injected failure/output canaries, restart retention, scope/snapshot and preservation checks. An initial mixed-wrapper invocation was discarded before the pinned rerun.
- Frozen live run `m2-t33-20260919-a` used source-tree digest `unborn:c859cc8877c223f3ef91ddbe8ec184ed54981cbbc4bf24a6d836b09916b529ec`, prompt `m2-structured-findings-v2`, result schema 2, `qwen3:8b` digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`, context/output 8192/512, temperature 0, thinking disabled, fixed target `987d7891c42df700ec23fbf8f2f68521ed7c184c`, and the checked-in five-case scopes and budgets.
- All five live tasks were admitted, but each ended `EXPLORER_INVALID_COMPLETION` after an `INVALID_GROUNDING` rejection. Manual claim-level review and grading completed with **0/5 accepted**. All **25/25** measured preservation dimensions passed; no credential or unrestricted model prose was published.
- The unchanged confirmation was not run because the task plan requires an accepted first run. No qualifying pair exists. Raw run/review evidence remains under ignored `.local/`.

### Gate status

- **Windows deterministic implementation gate**: passed on the pinned Node 22.23.2 / pnpm 11.7.0 toolchain.
- **Windows real-task quality gate**: **not accepted** — reviewed run 1 accepted 0/5, the gated confirmation did not run, and no two-run 5/5 pair exists.
- **Native Cursor/macOS topology gate**: **not verified** — no native restart/filtering/scope/snapshot/preservation evidence exists.
- **M3 decision**: remain disabled.

## Completion-repair state fix — 19 September 2026

Observed cause in frozen run `m2-t33-20260919-a`: every case produced source evidence, then used the single completion-repair state on a missing/free-form completion before its first actual `finish_analysis` call. Health, database, startup and dependencies reached the output limit on that preceding turn; scope-denial returned prose. The following structured calls each had only one or two grounding issues, but the already-consumed state caused immediate `EXPLORER_INVALID_COMPLETION` instead of issue-directed correction.

The loop now tracks the missing/free-form reminder separately from the one allowed invalid-grounding correction. Both remain bounded by the admitted model-turn, tool-call, transcript and deadline limits; a second invalid structured completion still fails closed. A deterministic regression covers `read -> prose -> invalid exact value -> corrected finish`.

Observed validation after the change on pinned Node **22.23.2** and pnpm **11.7.0**: `pnpm check` passed; `pnpm test` passed **84/84 with zero skips**; `pnpm m1:smoke` passed; deterministic `pnpm m2:smoke:mcp` passed all seven failure/output canaries, restart retention, scope/snapshot and preservation checks. No live qualification rerun has been performed, so this does not establish semantic correctness or change the 0/5 gate result. M3 remains disabled.

### Frozen rerun after the repair-state fix

Authorized run `m2-repair-20260919-b` kept the fixed target, five cases/scopes, Qwen 3 8B digest, 8192/512 inference settings and task budgets. All five cases again failed before publishing schema-version-2 results; manual review therefore accepted **0/5**. All **25/25** preservation dimensions passed.

The state fix did change execution as intended: health, database, startup and scope-denial each received an issue-directed turn after their first invalid structured completion, but the next structured completion retained one grounding issue. Dependencies started with two grounding issues and then returned prose, which correctly failed `EXPLORER_STRUCTURED_COMPLETION_REQUIRED`. This shows that the shared repair state was a real failure cascade but not the only live-quality cause.

The retained report recorded issue counts but not issue-code categories, so it cannot establish whether the persistent defects were excerpt, exact-value, citation, limitation or contract failures. Content-free tool metrics now include only sorted bounded issue-code names in addition to counts; paths, rejected values, source and model text remain excluded. No further live run has been claimed. The Windows quality gate remains unaccepted and M3 remains disabled.

## Frozen Windows quality pair accepted — 19 September 2026

- Grounding and coverage work through prompt contract `m2-structured-findings-v31` added bounded retained-result repair, per-line semantic coverage, citation augmentation, exact-value preservation and canonical limitation handling. It did not add edit, command, test, network, installer or model-download tools.
- Frozen runs `m2-augmented-citations-v31-20260919-a` and `m2-augmented-citations-v31-20260919-b` used the same source-tree digest, target commit, five cases/scopes, rubric, model digest, 8192/512 inference settings and task budgets.
- Manual review accepted all five cases in run A. The normalized findings, citations and limitations in run B were then compared with run A and were identical for every case, so the same claim-level verdicts were applied to run B. The grader accepted **5/5** cases in each run and accepted the pair with no issues.
- Across the pair, all **50/50** HEAD, Git status, index-byte, tracked-content and baseline-untracked-content preservation checks passed. Verification remains `not_run`; these results describe static source exploration, not execution of the target application.
- Observed validation on Windows with Node **22.23.2** and pnpm **11.7.0**: `pnpm check` passed and `pnpm test` passed **90/90 with zero skips**.
- Native Cursor/macOS topology has not been exercised. M2 therefore remains open and M3 remains disabled. See the [v31 quality-gate report](m2-quality-gate-v31-2026-09-19.md).
