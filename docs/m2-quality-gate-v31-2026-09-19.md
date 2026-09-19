# M2 Windows real-repository quality gate — v31, 19 September 2026

The Windows frozen real-repository quality gate is accepted. Two unchanged five-case runs were reviewed at 5/5, pair grading returned `accepted: true` with no issues, and every repository-preservation check passed. This does not close M2: native Cursor/macOS topology is still unverified, and M3 remains disabled.

## Gate matrix

| Gate | Observed evidence | Status |
|---|---|---|
| TypeScript | `pnpm check` under Node 22.23.2 / pnpm 11.7.0 | Pass |
| Deterministic M0–M2 | `pnpm test`: 90/90, zero skipped | Pass |
| Frozen live run A | `m2-augmented-citations-v31-20260919-a`; manual claim review accepted every dimension for all five cases | 5/5, pass |
| Frozen live run B | `m2-augmented-citations-v31-20260919-b`; unchanged frozen identity and identical normalized claim set | 5/5, pass |
| Pair grader | First and second reviewed reports; no frozen-field mismatch or rejected case | Pass, no issues |
| Preservation | Five checks per case across ten case executions: HEAD, status, index bytes, tracked contents and baseline untracked contents | 50/50, pass |
| Native Cursor/macOS | No native topology run exists | Not verified |

## Frozen identity

- Source revision: `unborn:cc938f02fea4122651bf56320d7264c22e406a55bdf33702dcc85ca40a9beb2a`
- Prompt contract: `m2-structured-findings-v31`
- Result contract: schema version 2
- Model: `qwen3:8b`
- Model digest: `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`
- Inference: context 8192, output 512, temperature 0, thinking disabled
- Target commit: `987d7891c42df700ec23fbf8f2f68521ed7c184c`
- Cases digest: `6650d7cb459bff103ec5c6c134d78151414f1bc2e8d168621395fde682019c39`
- Rubric digest: `5523f18a36ef50bd670b5d560c1098747bd230c4e22986df18d6f7300e71d54e`
- Per-case budgets: 180 wall seconds, 12 model turns, 16 tool calls

The questions, allow scopes and grading rubric are the checked-in records covered by these digests. The workspace has an unborn branch, so the harness records its source-tree digest rather than claiming a source commit.

## Review and grading evidence

Run A was reviewed finding by finding for semantic correctness, requested-fact coverage, forbidden claims and limitation handling. Before applying those verdicts to run B, the normalized findings, citations and limitations were compared for all five cases; each claim set was identical. Automatic runtime, contract, evidence, exact-value and preservation dimensions also passed for every case in both runs.

The grader produced reviewed run reports and `acceptance-pair-m2-augmented-citations-v31-20260919-b.json` under ignored `.local/`. The pair record identifies run A and run B, reports `accepted: true`, and contains an empty issues list. Raw machine-specific reports remain ignored and no credential or unrestricted model transcript is committed.

## Observed boundaries

- The accepted evidence is Windows-only and uses the MCP SDK/harness path, not the native Cursor UI.
- `verification` remains `not_run`; findings are grounded static observations or bounded inferences, not proof that target code executed successfully.
- Secret filtering remains defense in depth and is not a claim that every unknown or encoded credential can be detected.
- No edit, arbitrary command, target-repository test, worktree, installer, model-download, automatic merge or push capability was enabled.

There is no assumption that Windows success implies macOS or Cursor success. The next gate is a native client/host run with the same frozen inputs plus restart, filtering, scope, snapshot and repository-preservation evidence. Until that passes, M2 remains open and M3 remains disabled.
