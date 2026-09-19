# M2 claim-level quality gate — 19 September 2026

M2 remains open. The pinned deterministic implementation checks pass, but the first reviewed live qualification run accepted 0/5 cases. The unchanged confirmation run is therefore gated off, the required two-run pair does not exist, and native Cursor/macOS topology evidence is still missing. M3 remains disabled.

## Gate matrix

| Gate | Observed evidence | Status |
|---|---|---|
| TypeScript | `pnpm check` completed successfully under Node 22.23.2 / pnpm 11.7.0 | Pass |
| Deterministic M0–M2 | `pnpm test`: 83/83 pass, zero skipped under the pinned toolchain | Pass |
| M1 process smoke | Authenticated loopback IPC, discovery, disconnect/reconnect, long-poll, cursor and idempotency checks passed | Pass |
| M2 MCP/canary smoke | Snapshot/scope, daemon restart/recovery, persistence, seven failure/output canaries, MCP/log/DB/WAL filtering and repository preservation passed | Pass |
| Pinned toolchain | Node 22.23.2 / pnpm 11.7.0 executed check, test and both deterministic smokes | Pass |
| Live qualification run 1 | `m2-t33-20260919-a`: all five tasks reached terminal `failed` with `EXPLORER_INVALID_COMPLETION`; every measured preservation dimension passed | 0/5, fail |
| Live qualification run 2 | Requires an accepted unchanged first run; not started after run 1 failed | Gated off |
| Claim-level review | All five run-1 worksheets reviewed and graded; requested facts were absent because no schema-version-2 result was published | Complete, 0/5 accepted |
| Native Cursor/macOS | No native topology run exists | Not verified |

## Implemented contract

New successful analyses publish schema version 2 through `finish_analysis`. Each atomic finding declares its basis, cites attempt-local observed lines, and supplies an exact filtered excerpt for direct observations. Exact identifiers, packages, versions and once-decoded JSON commands are checked at their cited ranges. Redacted lines cannot support findings; denied paths can only support bounded limitations without existence/absence claims. The host renders the public summary from validated fields and keeps verification at `not_run`.

The evaluator keeps runtime completion, contract validity, evidence/excerpt validity, exact values, requested-fact coverage, semantic correctness, limitation handling and preservation separate. A missing review is `not_reviewed`. A gate pair passes only when both runs contain five accepted cases and their frozen fields match.

## Frozen qualification record

- Source revision: `unborn:c859cc8877c223f3ef91ddbe8ec184ed54981cbbc4bf24a6d836b09916b529ec`
- Target commit: `987d7891c42df700ec23fbf8f2f68521ed7c184c`
- Cases: the five checked-in records in `scripts/acceptance-cases.json`; digest `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39`
- Rubric: `scripts/acceptance-rubric.json`, schema version 1; digest `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e`
- Prompt contract: `m2-structured-findings-v2`
- Result contract: schema version 2
- Model: `qwen3:8b`; digest `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`
- Inference defaults: context 8192, output 512, temperature 0, thinking disabled
- Per-case budgets: 180 seconds, 12 model turns, 16 tool calls
- Preservation: HEAD, index bytes, Git status, tracked contents and baseline untracked-file contents

The questions and allow scopes are the five exact checked-in case records covered by the cases digest. The ignored run report contains this complete frozen record. This workspace has an unborn `main` branch, so the harness-generated source-tree digest is used instead of claiming a nonexistent source commit.

## Observed toolchain

- `node --version`: 22.23.2
- `pnpm --version`: 11.7.0
- `pnpm check`: pass
- `pnpm test`: 83/83 pass, zero skipped
- `pnpm m1:smoke`: pass
- `pnpm m2:smoke:mcp`: pass, including seven failure/output canaries, restart retention, snapshot/scope and preservation checks

The private runtime was placed first on `PATH` so pnpm child scripts and direct commands used the same pinned Node executable. An initial mixed-wrapper attempt was discarded and is not counted as qualification evidence.

## First live qualification run

The repository owner authorized T032–T036, including the bounded live acceptance workflow. Run `m2-t33-20260919-a` reused the existing configured endpoint credential without printing or committing it and sent only the five fixed-commit, allow-scoped source selections. The harness used per-invocation Git safe-directory configuration; it made no global Git configuration change.

All five cases were admitted and used the configured `qwen3:8b` digest. Each ended with schema-version-1 `{ outcome: "failed", error: "EXPLORER_INVALID_COMPLETION" }` after `finish_analysis` was rejected as `INVALID_GROUNDING` (one issue for health, database, startup and scope-denial; two for dependencies). No unrestricted model prose was published. Every case passed HEAD, status, index, tracked-content and baseline-untracked-content preservation.

The separate manual review marked every requested fact absent, all forbidden claims withheld, and required limitation handling failed where the failed result could not publish it. The grader accepted 0/5 cases. Raw reports, metrics and the review remain in ignored `.local/`; they contain no raw credential or transcript. T034 was not started because the task plan requires an accepted first run before the unchanged confirmation. Consequently, T035 cannot evaluate a qualifying pair.

## Decision

- Windows deterministic implementation: passed on the pinned toolchain.
- Windows real-task quality: not accepted; reviewed run 1 is 0/5 and no qualifying pair exists.
- Native Cursor/macOS topology: not verified.
- M3: disabled.
