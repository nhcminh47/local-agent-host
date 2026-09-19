# Tasks: M2 Claim-Level Quality Gate

**Input**: Design documents from `/specs/001-m2-quality-gate/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/exploration-result.md`

**Tests**: Required because the feature specification makes deterministic and live acceptance evidence part of the gate.

## Format

`[ID] [P?] [Story] Description with exact file path`

- **[P]**: May run in parallel after its dependencies because it changes different files.
- **[US1-US4]**: Maps the task to a user story in `spec.md`.

## Phase 1: Setup

**Purpose**: Establish versioned contract and rubric locations without changing runtime behavior.

- [x] T001 Create strict finding, citation, exact-value, limitation, and version-2 result schemas in `src/domain/exploration-result.ts`
- [x] T002 [P] Add the versioned five-case requested-fact and forbidden-claim rubric in `scripts/acceptance-rubric.json`
- [x] T003 [P] Add prompt/result contract version identifiers to `src/service/explorer-loop.ts` and sanitized acceptance metadata in `scripts/acceptance.mjs`

---

## Phase 2: Foundational Grounding

**Purpose**: Implement reusable validation and rendering needed by all user stories.

**Blocking**: Complete before user-story phases.

- [x] T004 Add failing unit coverage for excerpt equality, decoded JSON exact values, redacted ranges, evidence gaps, and mixed-basis findings in `tests/m2-findings.test.ts`
- [x] T005 Extend citation and literal regression coverage for package names, versions, commands, Unicode paths, and source-token boundaries in `tests/m2-citations.test.ts`
- [x] T006 Implement claim-level excerpt and exact-value validation in `src/service/citation-validation.ts`
- [x] T007 Implement deterministic host-side rendering from validated findings and limitations in `src/service/exploration-result-renderer.ts`
- [x] T008 Wire schema parsing, secret filtering, validation, and bounded error codes into a reusable finalization function in `src/service/exploration-result-finalizer.ts`

**Checkpoint**: Structured findings can be validated and rendered without invoking a live model.

---

## Phase 3: User Story 1 - Trust Every Published Finding (Priority: P1)

**Goal**: Make structured claim-level completion the only publication path for new explorer results.

**Independent Test**: Fake-provider tasks publish supported findings and limitations, while incorrect excerpts, unseen implementation claims, reconstructed redactions, and runtime-success claims fail or repair within budget.

- [x] T009 [US1] Add fake-provider contract tests for `finish_analysis`, atomic publication, one bounded repair, and free-form-prose rejection in `tests/m2-explorer.test.ts`
- [x] T010 [US1] Add `finish_analysis` to the advertised tool definitions and require it for successful completion in `src/service/explorer-loop.ts`
- [x] T011 [US1] Integrate `exploration-result-finalizer.ts` and host-side rendering into `src/service/explorer-loop.ts`
- [x] T012 [US1] Preserve schema-version-1 stored result readability while publishing new completions as version 2 in `src/store/task-store.ts`
- [x] T013 [US1] Add end-to-end MCP assertions for structured findings, filtered excerpts, bounded failures, and sanitized terminal output in `tests/m2-mcp-integration.test.ts`

**Checkpoint**: No unrestricted assistant prose can become a new successful terminal result.

---

## Phase 4: User Story 2 - Grade Known Failure Modes Reproducibly (Priority: P1)

**Goal**: Turn every observed live defect into deterministic regression coverage and independently scored acceptance output.

**Independent Test**: Correct, incomplete, semantically rejected, and lexically invalid fixture results produce different expected dimension scores.

- [x] T014 [P] [US2] Add fixture coverage for exact dependency names, exact versions, and JSON command decoding in `tests/m2-findings.test.ts`
- [x] T015 [P] [US2] Add fixture coverage for explicit versus propagated errors and imported-call versus unseen-implementation claims in `tests/m2-findings.test.ts`
- [x] T016 [P] [US2] Add fixture coverage for partially redacted auth logic, negative scope recovery, and implemented-versus-observed readiness in `tests/m2-findings.test.ts`
- [x] T017 [US2] Implement separate runtime, grounding, exact-value, completeness, semantic-review, limitation, and preservation dimensions in `src/m2/acceptance-grader.ts`
- [x] T018 [US2] Add grader tests proving valid citations cannot hide wrong facts or omitted requested facts in `tests/m2-acceptance.test.ts`
- [x] T019 [US2] Extend each record in `scripts/acceptance-cases.json` with a stable rubric reference while preserving the fixed question, commit, scope, and budgets
- [x] T020 [US2] Update `scripts/acceptance.mjs` to emit versioned per-finding review worksheets and dimension scores without raw credentials or transcripts

**Checkpoint**: The known defects are reproducible without a live model, and live reports cannot collapse distinct quality dimensions into one pass flag.

---

## Phase 5: User Story 3 - Make a Stable M2 Quality Decision (Priority: P2)

**Goal**: Enforce preservation and the two-run 5/5 qualification rule.

**Independent Test**: Synthetic paired run reports pass only when all ten case evaluations pass and all frozen fields match.

- [x] T021 [US3] Extend repository fingerprinting to hash baseline untracked-file contents in `scripts/acceptance.mjs`
- [x] T022 [US3] Add gate-pair validation for identical frozen inputs and two 5/5 reviewed runs in `src/m2/acceptance-grader.ts`
- [x] T023 [US3] Add tests for model/config drift, missing review, one-case failure, and untracked-content mutation in `tests/m2-acceptance.test.ts`
- [x] T024 [US3] Add sanitized qualification summary generation to `scripts/acceptance.mjs`

**Checkpoint**: A single favorable run, unreviewed result, or any repository mutation cannot pass the gate.

---

## Phase 6: User Story 4 - Separate Quality from Deployment Topology (Priority: P3)

**Goal**: Prevent Windows quality evidence from being misreported as native Cursor/macOS acceptance.

**Independent Test**: Status documentation keeps the topology gate open until evidence from the intended client and hosts exists.

- [x] T025 [US4] Add native Cursor/macOS quality-gate prerequisites and restart/preservation steps to `docs/explorer-runbook.md`
- [x] T026 [US4] Add distinct Windows quality and native topology status fields to `docs/m2-status.md`
- [x] T027 [US4] Define the dated quality-report table and evidence fields in a new `docs/m2-quality-YYYY-MM-DD.md` during qualification

**Checkpoint**: Each environment claim has matching observed evidence and no cross-platform generalization.

---

## Phase 7: Validation and Qualification

**Purpose**: Produce the evidence required by the specification without loosening the gate.

- [x] T028 Run `pnpm check` and record the actual Node/pnpm versions in the dated M2 quality report
- [x] T029 Run `pnpm test` and require all deterministic M0-M2 tests to pass with zero skipped M2 tests
- [x] T030 [P] Run `pnpm m1:smoke` and record the sanitized result in the dated M2 quality report
- [x] T031 [P] Run `pnpm m2:smoke:mcp` and record canary, restart, snapshot, scope, and preservation results in the dated M2 quality report
- [x] T032 Freeze the source revision, prompt/result contract version, model digest, inference settings, target commit, questions, scopes, and budgets in the dated M2 quality report
- [x] T033 Run the first `pnpm m2:acceptance` qualification suite and complete claim-level review for all five cases
- [ ] T034 Run the unchanged confirmation `pnpm m2:acceptance` suite and complete claim-level review for all five cases
- [ ] T035 Evaluate both runs with `src/m2/acceptance-grader.ts` and keep M2 unaccepted unless both are 5/5 with every preservation dimension passing
- [ ] T036 Update `docs/m2-status.md` with observed evidence, assumptions, remaining topology status, and the explicit M3 decision

Qualification note (19 September 2026): reviewed run `m2-t33-20260919-a` accepted 0/5 cases, with every preservation dimension passing. Per the T033 → T034 dependency, T034 was not started; therefore no pair exists for T035. Status documents record the failed gate and M3-disabled decision, but T036 remains open behind T035.

---

## Dependencies

- Phase 1 precedes Phase 2.
- Phase 2 blocks US1 and US2.
- US1 and US2 both block US3 qualification logic.
- US3 blocks Phase 7 live qualification.
- US4 documentation may begin after Phase 2 but cannot be marked verified before native evidence exists.
- T033 blocks T034; no frozen input may change between them.
- T035 blocks T036.

## Parallel Opportunities

- T002 and T003 can run in parallel with T001.
- T014, T015, and T016 can run in parallel after the foundational validator exists.
- T030 and T031 can run in parallel only if their disposable fixtures and ports remain isolated.
- Documentation drafting in T025-T027 can proceed alongside US3 implementation, but evidence fields must remain explicitly unverified.

## Implementation Strategy

1. Deliver the minimum structured-result contract and deterministic validator first.
2. Convert explorer publication without changing snapshot, scope, filtering, budget, or persistence semantics.
3. Encode every observed failure as a deterministic regression before another live run.
4. Upgrade the evaluator and preservation fingerprint before qualification.
5. Freeze once, run twice, and accept only two complete 5/5 reviewed suites.
6. Validate native Cursor/macOS topology separately before full M2 closure.
