# Research: M2 Claim-Level Quality Gate

## Decision 1: Use structured findings as the publication boundary

**Decision**: The model completes analysis through a bounded `finish_analysis` contract. The host validates and renders the public result.

**Rationale**: Existing free-form answers can contain uncited side claims even when cited ranges and inline literals validate. Atomic findings create a reviewable unit without claiming semantic automation.

**Alternatives considered**:

- Prompt-only guidance: rejected because the final guidance run completed 2/5 with 0/5 fully accepted.
- Broader literal matching: rejected because paraphrases and control-flow semantics are not reducible to string membership.
- A second model as judge: rejected because it would add another unproven semantic dependency and complicate secret/context boundaries.

## Decision 2: Validate excerpts against filtered observed text

**Decision**: A direct finding carries an excerpt that must match the cited filtered snapshot range observed in the same attempt.

**Rationale**: This proves what source text was available to support the finding while preserving redaction and snapshot provenance.

**Alternatives considered**:

- Re-read source during final validation: rejected because validation should use attempt evidence and must not silently widen scope or context.
- Persist raw transcripts: rejected because it expands secret exposure and recovery complexity.

## Decision 3: Keep semantic acceptance explicit

**Decision**: Automated grading covers contract, ranges, excerpts, exact values, limitation categories, and preservation. A human claim-level review records correctness and requested-fact completeness for the live suite.

**Rationale**: The project evidence already demonstrates that lexical validity and semantic correctness are distinct.

**Alternatives considered**:

- Declare all structured findings correct: rejected because structure does not prove meaning.
- Use only end-to-end manual prose review: rejected because it makes omissions and known exact-value regressions harder to reproduce.

## Decision 4: Freeze the current operating profile during qualification

**Decision**: Pin the current default model digest and existing suite settings for qualification; do not swap models or increase budgets after a failed case.

**Rationale**: Earlier candidate runs were development observations, not controlled rankings, and context shortage was not supported as the main cause.

## Decision 5: Require two consecutive perfect runs

**Decision**: Accept the Windows quality gate only after two unchanged 5/5 runs, with every claim reviewed and every preservation check passing.

**Rationale**: Runtime completions varied significantly across prior runs. The small fixed suite permits a strict, understandable threshold.

## Decision 6: Keep topology acceptance separate

**Decision**: Record Windows SDK quality and native Cursor/macOS topology as separate evidence sets.

**Rationale**: Environment-specific success cannot be generalized across hosts or clients.

## Framework adoption note

The repository had no existing Spec Kit workspace. Full `specify init --force` was not used because it could overwrite repository files and conflicted with the current read-only M2 convention. This feature uses the official Spec Kit artifact model in an isolated `specs/001-m2-quality-gate/` directory.
