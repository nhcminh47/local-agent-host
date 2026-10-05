# M2.6 Persistent Learning and Skill Memory

Status: deterministic implementation complete; live qualification open. Date: 2026-10-04.

## Outcome

The host can propose, review and retrieve reusable repository knowledge across tasks while retaining provenance, freshness and a clear distinction between observed fact and guidance. A task's raw model transcript is never promoted into durable instructions.

## Requirements

- LR-001: Store bounded, versioned knowledge candidates with type (`fact`, `convention`, `procedure`, `skill`), repository/snapshot identity, evidence citations, creator, time and status (`candidate`, `active`, `stale`, `rejected`, `retired`).
- LR-002: Derive candidates only from host-observed evidence or explicitly supplied trusted user guidance. A model can suggest a candidate but cannot activate it.
- LR-003: Validate citations against the admitted snapshot and scope before candidate creation; reject redacted, unavailable or out-of-scope support.
- LR-004: Require explicit human or host policy approval for promotion to reusable guidance. The policy must be inspectable and cannot be altered by repository content.
- LR-005: Retrieval is bounded, task-relevant and provenance-labelled. Current user instructions and active host policy outrank retrieved knowledge. Stale or superseded entries are excluded by default.
- LR-006: Detect changed snapshot/support hashes and mark affected knowledge stale before reuse; never silently treat old guidance as current truth.
- LR-007: Support listing, inspection, rejection, retirement and export without losing audit history. User-owned knowledge is not deleted by task cleanup.
- LR-008: Filter secrets and repository prompt injections at candidate, persistence, retrieval and diagnostic boundaries. Repository prose never gains instruction authority merely through repetition or archival.
- LR-009: Keep M2 read-only. Learning does not add edit, command, test, worktree, network, installation or model self-modification tools.

## Acceptance scenarios

1. A grounded candidate is stored with exact source identity and remains inactive until approved; the next task retrieves only its bounded provenance-labelled form.
2. An unsupported model assertion and a cited redacted line are rejected without creating active knowledge.
3. After a supporting commit changes, retrieval marks the entry stale and excludes it from ordinary context.
4. A malicious instruction inside a committed document can be recorded as source data but cannot become host policy or an active skill without independent approval.
5. Listing and retirement preserve the decision trail; retrieval stays under its byte/count budget after many completed tasks.

## Non-goals and dependencies

No autonomous skill installation, global cross-repository learning, vector index or automatic promotion. M2.5 supplies bounded context assembly; package 007 supplies a distinct repository baseline; package 008 consumes candidate decisions during spec finalization. The M2 quality and native client gates remain separate.

## Version-1 acceptance details (5 October 2026)

- Candidates originate only from a completed schema-2 host-grounded finding, selected by a management caller. Store its bounded statement and citation ranges with filtered support hashes, admitted commit/snapshot/scope and canonical root hash. Do not persist the full task transcript or cited source text.
- A management decision identifies the candidate and a review reason. `candidate → active/rejected`, `active → retired/stale`, and `stale → retired` are allowed; rejected/retired records remain auditable and are never retrieved. There is no model-side promotion path.
- On retrieval, re-read cited ranges through the current admitted filtered snapshot. A missing, redacted, out-of-scope or changed range excludes the entry and marks active support stale when the source actually changed. An unrelated commit change with identical support can remain active with the original provenance visible.
- Retrieval is limited to the same canonical repository identity, current scope, four entries and 2 KiB of model context. It is explicitly marked prior reviewed context, lower priority than current snapshot evidence and never an instruction or capability grant.
- A management token is required for proposal and review endpoints. If unavailable, learning remains dormant; analysis tasks retain their existing read-only behavior.
