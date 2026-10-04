# Implementation plan: M2.6 learning memory

Status: planned. Complete M2.5 context ownership before injecting retrieved knowledge.

Use versioned SQLite tables for candidates, decisions and support identities in `src/store/`, with a service in `src/service/` validating evidence and explicit promotion. Keep retrieval a bounded input to the M2.5 context assembler, with `candidate`/`stale` entries excluded. The management CLI may expose review and retirement; do not add model-facing authority-changing tools. Reuse snapshot reading and secret filtering for freshness checks. Migration must leave existing task/event databases valid. Tests cover promotion, changed support, prompt injection, redaction, provenance, retention and retrieval limits. Run check/test and explorer smoke, then qualify live behavior separately.

Pre-implementation analysis: package 005 memory is per-attempt and grounded; this package is durable and reviewable. Package 007 baseline is repository-level orientation rather than a candidate store. Package 008 lifecycle cannot auto-promote knowledge. No public schema or write capability is authorized by this plan.
