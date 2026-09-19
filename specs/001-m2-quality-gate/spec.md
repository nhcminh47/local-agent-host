# Feature Specification: M2 Claim-Level Quality Gate

**Feature Branch**: `001-m2-quality-gate`
**Created**: 2026-09-19
**Status**: Draft
**Input**: User description: "Create and document the work required to pass the M2 quality gate without enabling M3 capabilities."

## User Scenarios & Testing

### User Story 1 - Trust Every Published Finding (Priority: P1)

As a consumer of a read-only repository analysis, I can distinguish directly observed facts, bounded inferences, and unknown information, and I can inspect the exact evidence for every published finding.

**Why this priority**: The current runtime can complete tasks while publishing incomplete or factually incorrect prose. Claim-level trust is the blocking M2 defect.

**Independent Test**: Submit a fixture containing exact literals, imported calls, explicit and propagated errors, redacted lines, and an unavailable path; verify that every published finding is supported and every unsupported claim is withheld or labelled unknown.

**Acceptance Scenarios**:

1. **Given** source text was read from the admitted snapshot, **When** the analysis publishes a direct finding, **Then** the finding includes only observed ranges and an exact filtered excerpt from those ranges.
2. **Given** a finding contains an exact name, version, or JSON command, **When** it is published, **Then** the value matches the observed source and JSON escapes are decoded exactly once.
3. **Given** implementation details are redacted or outside scope, **When** the analysis finishes, **Then** it reports the limitation without asserting hidden contents, absence, or behavior.
4. **Given** a function is imported but its implementation was not observed, **When** the analysis describes the call, **Then** it does not claim knowledge of that function's internal behavior.
5. **Given** only implementation source was inspected, **When** the analysis describes readiness behavior, **Then** it does not claim the check ran successfully.

---

### User Story 2 - Grade Known Failure Modes Reproducibly (Priority: P1)

As an M2 maintainer, I can run deterministic fixtures and the frozen five-case real-repository suite and receive separate scores for runtime completion, evidence validity, requested-fact coverage, factual correctness, limitation handling, and repository preservation.

**Why this priority**: Citation ranges and runtime completion currently obscure semantic defects. The gate needs a stable rubric that cannot be loosened to match model output.

**Independent Test**: Run the deterministic evaluator against intentionally correct, incomplete, and incorrect structured findings and confirm that each failure is classified independently.

**Acceptance Scenarios**:

1. **Given** a response has valid citations but contains a wrong fact, **When** it is graded, **Then** evidence validity passes and factual acceptance fails.
2. **Given** every returned finding is correct but a requested fact is omitted, **When** it is graded, **Then** completeness fails.
3. **Given** a response correctly handles unavailable scope, **When** it is graded, **Then** the limitation passes without requiring or revealing excluded contents.
4. **Given** a suite run completes, **When** its report is written, **Then** the report records the fixed commit, model digest, inference settings, prompt/result contract version, and preservation evidence.

---

### User Story 3 - Make a Stable M2 Quality Decision (Priority: P2)

As the project owner, I can accept or reject the quality gate using an explicit threshold applied to unchanged consecutive runs rather than a single favorable sample.

**Why this priority**: Earlier runs varied from zero to three runtime completions. One run is not enough evidence for a stable decision.

**Independent Test**: Evaluate two consecutive frozen-suite runs with no code, prompt, model, configuration, commit, scope, or budget changes between them.

**Acceptance Scenarios**:

1. **Given** the first run passes all five cases, **When** the unchanged confirmation run also passes all five, **Then** the Windows real-task quality gate is accepted.
2. **Given** either run contains an incomplete, incorrect, unsupported, or unreviewed finding, **When** the gate is evaluated, **Then** the gate remains unaccepted.
3. **Given** any analyzed-repository preservation check fails, **When** the gate is evaluated, **Then** the run is invalid and M3 remains disabled.

---

### User Story 4 - Separate Quality from Deployment Topology (Priority: P3)

As the project owner, I can see that Windows SDK quality acceptance and native Cursor/macOS topology acceptance are distinct gates, with evidence recorded for each.

**Why this priority**: A Windows SDK run cannot certify behavior on the intended Cursor-to-Mac-to-Windows topology.

**Independent Test**: Review the final status report and verify that it never uses Windows-only evidence to mark the native topology verified.

**Acceptance Scenarios**:

1. **Given** the Windows quality gate passes, **When** native Cursor/macOS validation has not run, **Then** M2 remains open for topology validation.
2. **Given** the intended topology passes the documented restart, filtering, scope, snapshot, and preservation checks, **When** both gate records are complete, **Then** M2 may be considered for closure.

### Edge Cases

- A citation spans a gap between observed ranges.
- A supporting range contains one or more redacted lines.
- A model returns prose instead of the required structured completion.
- A repair produces a second unsupported claim or exceeds remaining task budget.
- An exact value is present only inside a decoded JSON string.
- A finding mixes direct observation with inference in one statement.
- An out-of-scope path may or may not exist in the working tree.
- A suite run changes an untracked file without changing `git status` text.
- A human semantic review is missing even though all lexical checks pass.

## Requirements

### Functional Requirements

- **FR-001**: The explorer MUST finish through a bounded structured result containing atomic findings and limitations rather than publishing unrestricted final prose.
- **FR-002**: Every finding MUST declare whether it is a direct observation or an inference and MUST contain at least one citation to evidence observed during the same attempt.
- **FR-003**: Every direct finding MUST include an exact filtered source excerpt, and the host MUST verify that excerpt against the cited snapshot range before publication.
- **FR-004**: The host MUST render the user-facing summary only from validated structured findings and limitations.
- **FR-005**: Exact identifiers, package names, versions, and decoded JSON commands MUST match observed source values exactly.
- **FR-006**: The result MUST distinguish explicit branches from errors propagated by calls whose implementations were not observed.
- **FR-007**: Redacted, unavailable, and out-of-scope information MUST be represented as limitations and MUST NOT support positive factual claims.
- **FR-008**: The result MUST distinguish implemented checks from runtime observations and MUST keep verification as `not_run` for M2 analysis.
- **FR-009**: Invalid structured results MUST receive at most one bounded grounding repair within the existing turn, tool, transcript, and deadline budgets.
- **FR-010**: Deterministic regression fixtures MUST cover every defect listed in the feature's acceptance scenarios and edge cases.
- **FR-011**: The acceptance evaluator MUST report runtime completion, evidence validity, requested-fact coverage, exact-value checks, semantic review, limitation handling, and preservation as separate dimensions.
- **FR-012**: Semantic acceptance MUST NOT be inferred from citation-range or exact-literal validation; the real-repository suite requires explicit claim-level review.
- **FR-013**: The frozen acceptance suite MUST retain the existing five questions, commit, scopes, 180-second deadline, 12-turn budget, and 16-tool-call budget.
- **FR-014**: Qualification MUST use the configured default model with one pinned digest and unchanged inference settings; there MUST be no automatic fallback, model swap, or budget increase during qualification.
- **FR-015**: Preservation MUST cover HEAD, index bytes, Git status, tracked contents, and the contents of untracked files present at baseline.
- **FR-016**: The Windows quality gate MUST require two consecutive unchanged runs with 5/5 runtime completions and 5/5 fully accepted answers.
- **FR-017**: Any missing semantic review, factual error, requested-fact omission, unsupported inference, secret exposure, or preservation failure MUST keep the gate unaccepted.
- **FR-018**: Reports MUST record model digest, inference settings, prompt/result contract version, snapshot commit, task budgets, per-case outcomes, and known limitations without credentials or raw sensitive transcripts.
- **FR-019**: Native Cursor/macOS topology acceptance MUST be reported separately from Windows SDK quality acceptance.
- **FR-020**: M3 edit, command, and test capabilities MUST remain disabled until all required M2 gates are accepted.

### Key Entities

- **Finding**: One atomic statement, its observation basis, supporting citations, and exact filtered excerpt.
- **Citation**: A repo-relative path and inclusive line range observed in the admitted immutable snapshot.
- **Limitation**: A bounded explanation of redacted, unavailable, out-of-scope, or unobserved information.
- **Acceptance Case**: A fixed question, snapshot commit, enforced scope, budget, requested facts, forbidden claims, and review rubric.
- **Case Evaluation**: Independent results for runtime, grounding, completeness, correctness, limitations, and preservation.
- **Gate Run**: Five case evaluations sharing the same code, prompt/result contract, model digest, inference settings, and repository snapshot.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All deterministic M0-M2 tests and the MCP smoke pass with zero skipped M2 tests on the qualification Windows host.
- **SC-002**: Two consecutive unchanged frozen-suite runs each achieve 5/5 runtime completions and 5/5 fully accepted claim-level reviews.
- **SC-003**: Both qualifying runs record zero unsupported published claims and zero omitted requested facts.
- **SC-004**: Both qualifying runs preserve every measured repository state and content dimension for all ten tasks.
- **SC-005**: Synthetic request, model-adapter, persistence, log, and MCP canaries remain absent from prohibited outputs.
- **SC-006**: The final report explicitly leaves native Cursor/macOS topology unverified until separate evidence passes its runbook.

## Assumptions

- The existing 74-test Windows baseline, fixed five-case suite, and frozen source commit remain available.
- The current default model is already installed; qualification does not download or switch models.
- Human claim-level review is available for semantic judgments that deterministic grounding cannot prove.
- Scale, automatic continuation, inference retry, circuit breaking, and M3 mutation capabilities remain outside this feature.

## Out of Scope

- Universal semantic verification for arbitrary source code.
- Increasing model context, output, turn, tool, or wall-clock budgets to obtain a pass.
- Model benchmarking or selecting a new default model.
- Repository edit tools, arbitrary command execution, test execution by the model, worktrees, commits, merges, or pushes.
- Capacity, throughput, and continuation-after-limit work from technical-plan section 19.
