# Tasks: M2.6 learning memory

- [x] T001 Define versioned candidate, decision and retrieval contracts with explicit provenance, bounds and status transitions.
- [x] T002 Add additive SQLite migration and atomic candidate/decision storage; preserve existing task/event data.
- [x] T003 Validate host-observed citation support, filtering and snapshot/scope identity before candidate admission.
- [x] T004 Implement explicit promotion, rejection and retirement with an auditable management surface; no model-facing promotion tool.
- [x] T005 Implement freshness recheck and bounded, provenance-labelled retrieval for M2.5 context assembly.
- [x] T006 Test unsupported claims, redaction, prompt injection, stale support, many-task limits, restart and migration compatibility.
- [x] T007 Run pinned check/test and explorer smoke; record any live quality effect and update architecture/status/runbook and indexed memory. No new live-model run was performed; quality effect is unverified and the existing Windows gate remains open.

Implementation ownership and ordered checks are in [plan.md](plan.md). The existing Spec Kit 0.14.2 prerequisite checker found the package artifacts on 5 October 2026; the agent reviewed requirement/plan/task alignment before implementation. The checker does not prove behavior.

Order: T001 → T002 → T003 → T004 → T005 → T006 → T007. No task checkbox closes from specification alone.
