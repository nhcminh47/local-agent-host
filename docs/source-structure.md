# Source structure and refactor validation

Updated 20 September 2026. This is a behavior-preserving organization change within the existing M2 read-only product boundary.

| Directory | Responsibility |
| --- | --- |
| `src/runtime/` | Production daemon, authenticated IPC client and stdio MCP bridge |
| `src/domain/` | Request, task, snapshot, scope and result contracts |
| `src/service/` | Task orchestration, explorer loop, coverage analysis and result validation/rendering; status-branch-validation.ts guards supported conditional numeric status claims |
| `src/provider/` | Ollama connectivity and explorer adapters |
| `src/store/` | Durable task/event storage, leases and deadlines |
| `src/exploration/` | Repository registration, immutable snapshots, filtered read/search and capabilities |
| `src/shared/` | HTTP JSON framing, MCP response envelopes and allowlisted error matching |
| `src/utils/` | Reused origin validation and process-liveness helpers |
| `src/constants/` | Stable error identifiers, configuration messages and HTTP status codes |
| `src/prompts/` | Named system and repair prompts, preserved verbatim |
| `src/diagnostics/compatibility/` | Compatibility probes, disposable process fixtures and coding evaluator/fixture data |
| `src/diagnostics/task/` | Authenticated bridge reconnect smoke |
| `src/diagnostics/exploration/` | Snapshot and explorer integration smoke checks |
| `src/evaluation/` | Acceptance grading separate from runtime execution |

Shared modules contain concrete reused concerns. Domain-specific coverage logic stays in `service/exploration-coverage.ts`; it is not a generic utility. Prompt constants use descriptive names so changes can be reviewed independently of execution logic.

## Entry points and compatibility

Package command names are unchanged. They now target the canonical paths above. Tests, relative child-process URLs and acceptance harness imports follow those paths.

Milestone folders and forwarding launchers have been removed. Use `src/diagnostics/compatibility/mcp-server.ts` for the compatibility probe and `src/runtime/daemon.ts` plus `src/runtime/mcp-server.ts` for the task runtime. Package scripts, configuration examples and matching paths in the current local Cursor configuration use the canonical compiled paths. Generated `dist/` output is ignored and must be rebuilt from source.

## Observed validation

On Windows with Node 22.23.2 and pnpm 11.7.0:

- `pnpm check`: passed.
- `pnpm test`: 90/90 passed, including M2 MCP snapshot/restart and provider-failure containment regressions.
- `pnpm spike:mcp`: passed SDK initialization, discovery, tool call and invalid-input rejection.
- `pnpm spike:process`: passed disposal of all three fixture processes; observed termination 128 ms.
- `pnpm m1:smoke`: passed with the fake provider, including authentication, bridge disconnect/reconnect, long polling and idempotent duplicate submission.

These checks do not rerun live model qualification, Cursor UI or native macOS validation. Historical qualification results remain historical evidence; they are not a new qualification of this source revision.

After removal of the milestone folders and forwarding launchers, all checks above passed again, including 90/90 tests. The repeated process probe measured 117 ms. Source/module references, documentation links and the absence of milestone-named folders under `src/` were also verified.

## Spec Kit documentation

Spec Kit CLI 0.14.2 was run after source validation. Its bundled templates and generic-agent command guidance were initialized in ignored `.local/speckit-m0-m1/`. The bundled `setup_plan.py` ran for each milestone with an explicit feature directory. The resulting templates were populated from inspected source and existing milestone evidence.

- [M0 compatibility foundation](../specs/002-m0-foundation/spec.md)
- [M1 durable task backbone](../specs/003-m1-task-backbone/spec.md)

Each package contains a specification, plan, research, data model, protocol contracts, quickstart, tasks and requirements checklist. Completed implementation/checks and remaining platform/operational tasks are separated. Spec Kit scaffolding stays local; no root constitution, branch, dependency or existing M2 specification was replaced.
