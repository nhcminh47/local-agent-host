# Implementation plan: M2.6 learning memory

Status: planned. Complete M2.5 context ownership before injecting retrieved knowledge.

Use versioned SQLite tables for candidates, decisions and support identities in `src/store/`, with a service in `src/service/` validating evidence and explicit promotion. Keep retrieval a bounded input to the M2.5 context assembler, with `candidate`/`stale` entries excluded. The management CLI may expose review and retirement; do not add model-facing authority-changing tools. Reuse snapshot reading and secret filtering for freshness checks. Migration must leave existing task/event databases valid. Tests cover promotion, changed support, prompt injection, redaction, provenance, retention and retrieval limits. Run check/test and explorer smoke, then qualify live behavior separately.

Pre-implementation analysis: package 005 memory is per-attempt and grounded; this package is durable and reviewable. Package 007 baseline is repository-level orientation rather than a candidate store. Package 008 lifecycle cannot auto-promote knowledge. No public schema or write capability is authorized by this plan.

## Concrete slice and contracts (5 October 2026)

- `src/domain/learning-contracts.ts`: strict version-1 candidate, citation support and decision contracts. Persist only a bounded finding statement, identifiers, hashes, citations, status and audit metadata; no raw transcripts or unrestricted source excerpts.
- `src/store/learning-store.ts`: additive `learning_schema_meta`, `learning_items` and append-only `learning_decisions` tables in the existing SQLite database. Keep task/event schema version 6 unchanged. Candidate and decision updates are transactional. No automatic deletion.
- `src/service/learning-service.ts`: propose only from a completed host-grounded finding; restore the admitted snapshot and re-read every cited filtered range. Promotion/rejection/retirement require the separate management authority. A changed supporting range marks an active item stale; unchanged support on a new commit may remain active after recheck. Retrieval requires the same canonical repository-root hash and current scope, with a count/byte cap and data-only label.
- `src/runtime/daemon.ts` and `host-cli.ts`: management-authenticated review endpoints and an explicit interactive CLI decision. The MCP/model tool list stays unchanged. `ExplorerRunner` calls bounded retrieval after trust-checked snapshot restore and passes labelled prior learning to the M2.5 context assembler. Current source and system/task contracts retain priority.
- `tests/m2-learning-memory.test.ts`: migration/restart, lifecycle, bad support/redaction/scope, prompt-injection text as data, freshness, identity and retrieval bounds. Existing check/test/MCP smoke remain required. Live qualification stays a separate gate.

The analysis phase confirms ownership and contract agreement: review writes cannot be reached through model tools; retrieval cannot widen scope or grant capabilities; a candidate must carry exact snapshot, root and support hashes. The only public addition is management-authenticated host control, not an MCP or explorer tool.
