# Feature Specification: Project Guidance and Memory

**Created**: 2026-09-20
**Status**: Completed and documentation checks passed; no product behavior change.
**Input**: Project overview, design, coding/folder rules, GitHub Spec Kit workflow, project memories, documentation-first navigation and architecture.

## User Scenarios & Testing

### US1 — Find context quickly (P1)

A contributor reads the entry guide, relevant design/spec/memory, then only the affected source.
Acceptance: IPC and explorer tasks each have explicit documentation and source entry points.
Independent test: follow those routes without a repository-wide scan.

### US2 — Work from a specification (P1)

A contributor records scope, acceptance criteria, design and ordered tasks before implementation.
Acceptance: the workflow defines Spec Kit phases, setup fallback, task-size scaling and completion evidence.
Independent test: follow the workflow for this documentation task.

### US3 — Retain decisions (P2)

A contributor records what changed, why, validation and remaining uncertainty.
Acceptance: dated indexed records link to source/spec/evidence without secrets or raw reports.
Independent test: use the template to record this task and find the prior restructuring record.

### Edge Cases

- Stale documents require targeted source verification and document correction.
- Missing Spec Kit setup must not cause silent framework overwrite or invented command success.
- Small tasks use concise existing spec/plan/task updates.
- Historical Windows evidence is not a fresh run or native macOS/live-model qualification.

## Requirements

- FR-001: Describe the project, current capability gate, component boundaries and coding/folder rules.
- FR-002: Require relevant spec, plan and task review before implementation.
- FR-003: Provide an indexed memory folder and reusable change-record template.
- FR-004: Describe implemented data flow, persistence, trust boundaries and deferred capabilities.
- FR-005: Route contributors through concise docs before targeted source searches.
- FR-006: Preserve toolchain, credential, process and platform-evidence rules.

## Success Criteria

All new local links resolve. IPC and exploration have clear reading paths. Current behavior, history and future work are distinguished. No source, dependency, runtime configuration or product behavior changes are required.

## Assumptions

“gh speckit” means GitHub Spec Kit, whose installed CLI is `specify`, not a `gh speckit` subcommand. Project memories are reviewable Markdown under `docs/memories/`.
