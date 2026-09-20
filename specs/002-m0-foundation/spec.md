# Feature Specification: M0 Compatibility Foundation

**Feature Branch**: Existing working branch; no branch created for retrospective documentation.
**Created**: 2026-09-20
**Status**: Existing implementation documented; remaining gates open.
**Input**: Source cleanup followed by Spec Kit documentation for M0 and M1.

Document the existing compatibility probes, restricted evaluation fixtures and evidence gates that precede a durable local-agent runtime.

## User Scenarios & Testing

### User Story 1 - Check local compatibility (Priority: P1)

An operator establishes whether the local machine can support the host before starting persistent work.

**Why this priority**: Establishes the milestone’s primary usable outcome.

**Independent Test**: Run the deterministic compatibility checks without a live model.

**Acceptance Scenarios**:

1. Given an installed supported runtime, when compatibility probes run, then protocol discovery, round-trip calls, storage rollback/reopen and disposable process-tree cancellation produce explicit pass/fail outcomes.

### User Story 2 - Assess an existing model (Priority: P2)

An operator tests an already installed model using synthetic requests and isolated coding fixtures.

**Why this priority**: Builds confidence and control around the primary outcome.

**Independent Test**: Opt in to the existing model probe or ten-case evaluator.

**Acceptance Scenarios**:

1. Given an available configured endpoint, when a selected model is evaluated, then the report distinguishes tool protocol success, hidden-test success and completed task lifecycle without downloading models.

### User Story 3 - Track platform evidence (Priority: P3)

A maintainer can identify which host and integration gates still require observation.

**Why this priority**: Builds confidence and control around the primary outcome.

**Independent Test**: Review evidence and the native Mac runbook.

**Acceptance Scenarios**:

1. Given Windows results, when a maintainer reviews readiness, then macOS, Mac Cursor and network gates remain separately visible.

### Edge Cases

- Malformed origins, embedded credentials, paths, queries and fragments are rejected.
- Missing executables, unavailable models and malformed endpoint responses produce bounded diagnostics.
- Process-tree cancellation with a live parent does not prove crash orphan containment.
- A fixture can pass hidden tests yet fail to call finish; reports retain that distinction.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide explicit local compatibility results for runtime, storage, protocol and disposable process handling.
- **FR-002**: System MUST reject ambiguous endpoint configuration and omit credentials from diagnostics.
- **FR-003**: System MUST evaluate only explicitly selected installed models; restrict coding work to disposable fixtures.
- **FR-004**: System MUST keep hidden-test results separate from lifecycle completion and timing observations.
- **FR-005**: System MUST record evidence by platform and client; preserve all unobserved gates as open.

### Key Entities

- Probe result: check identity, status, platform, bounded measurements and limitations.
- Evaluation fixture: id, objective, initial source and hidden tests; the runner uses a disposable directory.
- Evaluation result: model, fixture id, test status, finish state, turn/tool counts and elapsed time.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All deterministic compatibility probes pass on each platform before that platform is declared qualified.
- **SC-002**: Every model evaluation reports both correctness and lifecycle completion for every selected fixture.
- **SC-003**: Every readiness report labels its observed platform and identifies outstanding gates.

## Assumptions

- Existing installed models and private endpoint configuration are operator supplied.
- Historical live measurements are evidence from their recorded date, not guarantees or new measurements.
- Full macOS qualification is future work; Windows success does not close it.

## Evidence Boundary

Historical milestone evidence and open gates: [M0 status](../../docs/m0-status.md). Current refactor validation: [source structure](../../docs/source-structure.md). This specification records requirements; it does not claim all platform or operational gates have passed.
