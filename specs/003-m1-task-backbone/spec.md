# Feature Specification: M1 Durable Task Backbone

**Feature Branch**: Existing working branch; no branch created for retrospective documentation.
**Created**: 2026-09-20
**Status**: Existing implementation documented; remaining gates open.
**Input**: Source cleanup followed by Spec Kit documentation for M0 and M1.

Document the existing durable task admission, event journal, fenced worker lifecycle and reconnectable authenticated bridge.

## User Scenarios & Testing

### User Story 1 - Submit and reconnect (Priority: P1)

A caller submits analysis work, disconnects, and later retrieves the same durable task.

**Why this priority**: Establishes the milestone’s primary usable outcome.

**Independent Test**: Run the fake-provider MCP disconnect/reconnect smoke.

**Acceptance Scenarios**:

1. Given a submitted task, when the bridge disconnects while the daemon continues, then a new bridge retrieves its completed result; an identical submission returns the same task.

### User Story 2 - Control task lifecycle (Priority: P2)

A caller can cancel work and understand recovery, queue capacity and budget outcomes.

**Why this priority**: Builds confidence and control around the primary outcome.

**Independent Test**: Run task-store lifecycle and deadline regressions.

**Acceptance Scenarios**:

1. Given a queued or running task, when cancellation, recovery or deadline expiry occurs, then the stored state and event journal agree, and a stale worker cannot publish a result.

### User Story 3 - Verify connectivity without overstating analysis (Priority: P3)

An operator can optionally verify a configured model connection while callers receive bounded results.

**Why this priority**: Builds confidence and control around the primary outcome.

**Independent Test**: Use the opt-in live connectivity smoke; deterministic validation uses the fake provider.

**Acceptance Scenarios**:

1. Given an admitted objective/question, when the connectivity worker completes, then the persisted result identifies its provider and metrics without claiming that repository files were inspected.

### Edge Cases

- The same request key with a changed canonical payload is a conflict; exact duplicates do not consume queue capacity.
- Unauthenticated, browser-origin and non-POST requests are rejected; oversized or invalid bodies cannot be admitted.
- Expired/recovered leases fence stale publication; terminal cancellation cannot be overwritten.
- Long polling is bounded and event cursors support pagination.
- A failed provider yields a sanitized error; raw response bodies are not persisted as diagnostics.

## Requirements

### Functional Requirements

- **FR-001**: System MUST persist task admission and its initial event atomically, deduplicating equivalent submissions.
- **FR-002**: System MUST allow callers to retrieve bounded status/event pages after reconnecting.
- **FR-003**: System MUST authenticate daemon access and reject unsupported request shapes and origins.
- **FR-004**: System MUST enforce queue capacity, cancellation, persisted deadlines and lease ownership on publication.
- **FR-005**: System MUST preserve task and event state across restart and reject publication by stale workers.
- **FR-006**: System MUST clearly identify connectivity-only results and retain verification as not run.

### Key Entities

- Analysis request: repository label, request key, base reference, objective, question, depth, focus and budgets.
- Task: durable identity, canonical payload/hash, lifecycle state, cancellation/result, timestamps, deadline, lease and usage counters.
- Task event: monotonic sequence, task identity, type, bounded data and timestamp.
- Lease: owner, generation and expiry; publication requires the active owner and generation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Duplicate equivalent submissions return one durable task in all deterministic admission tests.
- **SC-002**: Disconnect/reconnect retrieves the admitted task and its result in the fake-provider smoke.
- **SC-003**: Every stale-publication and deadline regression rejects or terminates work as specified.
- **SC-004**: Every connectivity-only result identifies its limited evidence and never claims file inspection.

## Assumptions

- An operator supplies private IPC credentials and runs the daemon; installation/supervision are separate open gates.
- M2 extends the same daemon with snapshot exploration and capabilities; that extension is not retroactively part of the original M1 milestone.
- Current scope is one daemon host, with native macOS validation still pending.

## Evidence Boundary

Historical milestone evidence and open gates: [M1 status](../../docs/m1-status.md). Current refactor validation: [source structure](../../docs/source-structure.md). This specification records requirements; it does not claim all platform or operational gates have passed.

## HTTP 413 correction — 20 September 2026

FR-007: Authenticated POST bodies above 65,536 bytes MUST receive HTTP 413 with the stable REQUEST_TOO_LARGE envelope. Exactly 65,536 bytes remain eligible for normal JSON/schema validation; malformed or schema-invalid bodies within the cap remain HTTP 400 INVALID_INPUT. Authentication/origin/method precedence is unchanged. The server MUST deliver the rejection even when a chunked sender has not ended its request, retain only bounded body data, and continue serving subsequent requests.

Acceptance: test byte boundaries (including UTF-8), declared-length and chunked overflow, malformed JSON, schema errors, client propagation and a valid request following rejection. No body-size increase or schema/persistence migration.
