# Implementation Plan: M2 Claim-Level Quality Gate

**Branch**: `001-m2-quality-gate` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-m2-quality-gate/spec.md`

## Summary

Replace unrestricted final prose with a bounded structured findings contract, validate each finding against filtered snapshot evidence, render the public summary host-side, add deterministic regressions for every observed quality defect, and upgrade the frozen real-repository harness to produce claim-level review records. Qualify the unchanged default model with two consecutive 5/5 runs before separately validating the native Cursor/macOS topology.

## Technical Context

**Language/Version**: TypeScript strict/ESM on Node 22.23.2; acceptance harness uses ESM JavaScript
**Primary Dependencies**: Zod 4.6.5, MCP SDK 2.0.0, existing snapshot/search/filter services; no new dependency planned
**Storage**: Existing SQLite task result JSON and ignored `.local/` acceptance reports
**Testing**: Node built-in test runner through `pnpm check`, `pnpm test`, and existing M1/M2 smoke entrypoints
**Target Platform**: Qualification on Windows; separate native Cursor/macOS topology acceptance
**Project Type**: Local MCP bridge and daemon
**Performance Goals**: Stay within existing 24 KB transcript, 12 KB tool-result, 6 KB summary, 12-turn, 16-tool-call acceptance, and 180-second case limits
**Constraints**: Read-only M2; no arbitrary commands, source mutations, credential output, automatic model fallback, model download, or budget expansion
**Scale/Scope**: Five fixed real-repository cases plus bounded deterministic fixtures; scale testing remains deferred

## Constitution Check

The repository does not yet contain a Spec Kit constitution because full framework initialization was intentionally avoided. The applicable gates come from `AGENTS.md`, `docs/technical-plan.md`, and `docs/m2-status.md`.

### Pre-design gate

- **PASS**: Work remains read-only and does not add M3 mutation or command tools.
- **PASS**: Design uses Node filesystem/process APIs and fixed argument arrays; it adds no model-generated shell execution.
- **PASS**: Credentials, raw sensitive transcripts, and machine-specific reports remain out of committed artifacts.
- **PASS**: MCP stdout remains protocol-only; optional diagnostics remain bounded on stderr.
- **PASS**: Observed evidence and assumptions remain explicitly separated.
- **PASS**: Toolchain and dependencies remain pinned; no dependency change is planned.
- **PASS**: Windows evidence will not be reported as macOS or Cursor evidence.

### Post-design gate

- **PASS**: The proposed result contract preserves existing snapshot, scope, filtering, budget, persistence, and failure boundaries.
- **PASS**: Semantic review is explicit and is not replaced by lexical validation.
- **PASS**: Qualification commands occur only after implementation authorization and relevant changes.
- **PASS**: M3 remains disabled until both quality and required topology gates are accepted.

## Design

### Structured completion

Add a versioned domain schema for atomic findings, citations, excerpts, and limitations. Expose a `finish_analysis` tool alongside the existing read-only tools. Free-form assistant content is never published as the final result; the host validates the tool arguments and renders a concise summary from accepted records.

### Grounding validation

Keep range validation, but validate the excerpt against the filtered text actually observed in the same attempt. Exact-value fields use the observed corpus and decoded JSON strings. Mixed observation/inference statements, claims supported only by redacted text, and runtime-success claims fail closed. One repair is allowed within existing budgets.

### Acceptance evaluation

Extend the five cases with a versioned rubric describing requested facts, exact-value expectations, forbidden claims, and review prompts. Automated checks grade structure, exact values, limitations, evidence, and preservation. A human reviewer records semantic correctness and completeness per finding; missing review is a failure, not an implicit pass.

### Qualification

Run deterministic checks first. Freeze code, prompts, contract version, model digest, context/output settings, commit, questions, scopes, and budgets. Accept the Windows real-task gate only after two consecutive 5/5 runs. Record native Cursor/macOS evidence separately.

## Project Structure

### Documentation for this feature

```text
specs/001-m2-quality-gate/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── exploration-result.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Expected implementation areas

```text
src/
├── domain/
│   └── exploration-result.ts
├── service/
│   ├── citation-validation.ts
│   └── explorer-loop.ts
└── m2/
    └── acceptance-grader.ts

scripts/
├── acceptance.mjs
├── acceptance-cases.json
└── acceptance-rubric.json

tests/
├── m2-citations.test.ts
├── m2-explorer.test.ts
├── m2-findings.test.ts
└── m2-acceptance.test.ts

docs/
├── m2-status.md
└── m2-quality-YYYY-MM-DD.md
```

**Structure Decision**: Preserve the existing single-package layout. Domain contracts live under `src/domain`, runtime orchestration stays under `src/service`, qualification-only grading lives under `src/m2`, and reports remain in `docs` with raw machine output under ignored `.local/`.

## Delivery Phases

1. Define and test the structured completion contract.
2. Add claim-level grounding and host-side rendering.
3. Add deterministic regressions for the observed semantic failure classes.
4. Upgrade the acceptance rubric, evaluator, and preservation fingerprint.
5. Run deterministic validation and the two-run frozen qualification.
6. Record separate native Cursor/macOS topology evidence before considering full M2 closure.

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Add a structured completion tool | Every published claim must be independently gradeable and renderable | More prompt guidance has already produced 0/5 fully accepted answers in the final rerun |
| Retain human semantic review | Generic source-code semantics cannot be proven by citation or literal matching | Treating `ranges_verified` or exact literals as correctness reproduced accepted-looking false claims |
| Require two unchanged qualification runs | Prior live outcomes varied materially between runs | A single 5/5 run would not establish stable behavior |
