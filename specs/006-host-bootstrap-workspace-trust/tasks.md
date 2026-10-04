# Tasks: Host Bootstrap and Workspace Trust

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contract](contracts/bootstrap-workspace.md), [quickstart.md](quickstart.md).

Implementation and deterministic Windows validation tasks are complete. T025 remains open for authorized live quality and native Cursor/macOS qualification. `[P]` means file ownership is separate and the task may proceed beside another task after its prerequisites.

## Phase 1 — Setup and qualification

- [x] T001 Inspect current request, store migration and daemon lifecycle code in `src/domain/task-contracts.ts`, `src/store/task-store.ts`, `src/runtime/daemon.ts` and `src/service/snapshot-task-service.ts`; record the exact v1 compatibility contract in `specs/006-host-bootstrap-workspace-trust/research.md`.
- [x] T002 Verify current Cursor user-scope MCP config and workspace signal with an isolated fixture; record Windows/macOS observations or a manual fallback in `specs/006-host-bootstrap-workspace-trust/research.md` and `docs/explorer-runbook.md` without exposing user config.
- [x] T003 [P] Define deterministic fixture strategy and canaries in `tests/bootstrap-fixtures.test.ts` and `tests/workspace-trust.test.ts`; keep all test state under temporary directories.

## Phase 2 — Foundation

- [x] T004 Define strict versioned host config, workspace identity, grant and task-binding schemas in `src/domain/host-config-contracts.ts` and `src/domain/workspace-trust-contracts.ts`; reject unknown fields and all M2 edit/verify grants.
- [x] T005 Implement user-local path and atomic config/credential storage in `src/bootstrap/user-state.ts` and `src/bootstrap/host-config.ts`; preserve explicit developer environment overrides.
- [x] T006 Implement durable grant and task-binding migrations in `src/store/task-store.ts` or a focused `src/store/workspace-grant-store.ts`; use SQLite transactions, generation checks and strict reads.
- [x] T007 Implement canonical Git workspace identity resolution with bounded subprocesses and replacement detection in `src/exploration/workspace-identity.ts`; test symlinks, nested paths, worktrees and replaced roots in `tests/workspace-trust.test.ts`.
- [x] T008 Implement daemon-owned once/durable read-grant state, list, deny and revoke semantics in `src/service/workspace-trust-service.ts`; test restart and malformed durable data in `tests/workspace-trust.test.ts`.

## Phase 3 — US1: Configure the host once (P1)

**Independent check**: bootstrap an isolated fresh user profile twice; verify readiness, no secret output, preserved unrelated client config, and a read-only `--check`.

- [x] T009 [US1] Implement bounded Node/pnpm/Git, provider and model readiness checks in `src/bootstrap/readiness.ts`; report configured/reachable/credential/model conditions without downloading models.
- [x] T010 [US1] Implement the qualified Cursor adapter and generic/manual fallback in `src/bootstrap/client-adapters/`; parse/update only the host entry and back up an existing parseable config before mutation.
- [x] T011 [US1] Add guided setup, `--reconfigure` and read-only `--check` in `src/bootstrap/bootstrap.ts`, `src/runtime/bootstrap-cli.ts` and `package.json`; wire `src/runtime/daemon.ts` and `src/runtime/mcp-server.ts` to load the same user-local config/credential in normal use, report daemon startup steps, and preserve developer overrides, tasks and grants.
- [x] T012 [US1] Add fixture tests for idempotent bootstrap, malformed client config, credential redaction and `--check` immutability in `tests/bootstrap-fixtures.test.ts`.

## Phase 4 — US2: Authorize before analysis (P1)

**Independent check**: an untrusted synthetic repository returns a bounded required action before snapshot/inference; explicit once/durable authorization permits the same read-only task without a manually invented repo ID.

- [x] T013 [US2] Add strict v2 workspace request and required-action contracts while retaining v1 in `src/domain/task-contracts.ts` and `src/constants/error-codes.ts`.
- [x] T014 [US2] Add authenticated daemon-only workspace selection/grant/deny routes and client calls in `src/runtime/daemon.ts` and `src/runtime/ipc-client.ts`; keep management inaccessible as model tools.
- [x] T015 [US2] Add interactive select/trust/deny commands in `src/runtime/host-cli.ts`; refuse non-interactive grants and print a host-generated workspace reference.
- [x] T016 [US2] Resolve a v2 candidate, check read trust, then map to a host-generated internal repo ID before `GitSnapshotTools.capture` in `src/service/snapshot-task-service.ts` and `src/exploration/repo-registry.ts`.
- [x] T017 [US2] Extend `src/runtime/mcp-server.ts` for v2 forwarding and bounded required actions; preserve the v1 tool contract and avoid treating bridge CWD as authoritative without T002 qualification.
- [x] T018 [US2] Persist workspace identity and grant generation with each v2 task in `src/store/task-store.ts`; preserve v1 idempotency and snapshot restore behavior.
- [x] T019 [US2] Add tests for unknown/ambiguous candidate, untrusted path, once/durable grant, v1 compatibility, scope/secret filtering and zero pre-trust provider calls in `tests/workspace-admission.test.ts` and `tests/workspace-trust.test.ts`.

## Phase 5 — US3: Inspect and revoke trust (P2)

**Independent check**: listing exposes bounded grant status; revocation blocks new and resumed tasks and stops an active explorer before another model-bound read.

- [x] T020 [US3] Add list and interactive revoke commands in `src/runtime/host-cli.ts`, with daemon IPC management handlers in `src/runtime/daemon.ts`.
- [x] T021 [US3] Recheck identity/grant on restore and each model-bound operation; coordinate revoke with cancellation and lease fencing in `src/service/explorer-runner.ts` and `src/service/snapshot-task-service.ts`.
- [x] T022 [US3] Test revocation during queued, running and restarted tasks, plus root replacement and read-only capability separation, in `tests/workspace-trust.test.ts`, `tests/workspace-revocation.test.ts` and `tests/workspace-admission.test.ts`.

## Phase 6 — Cross-cutting validation and records

- [x] T023 Update `docs/architecture.md`, `docs/source-structure.md`, `docs/explorer-runbook.md` and `README.md` with implemented setup, migration and trust behavior, keeping future capability claims separate.
- [x] T024 Run `pnpm check`, `pnpm test`, `pnpm spike:mcp`, `pnpm spike:process`, `pnpm m1:smoke` and `pnpm m2:smoke:mcp`; record platform, counts, failures and preservation in `docs/m0-status.md`, `docs/m1-status.md` and `docs/m2-status.md` as applicable.
- [ ] T025 Run the frozen live M2 quality pair only with authorized configuration and review, and native Cursor/macOS first-use qualification when those environments are available; record exact evidence or leave the gates open in `docs/m2-status.md`.
- [x] T026 Update completed checkboxes in this file and add a dated implementation record to `docs/memories/README.md` using `docs/memories/TEMPLATE.md`; verify links and `git diff --check`.

## Dependencies and delivery

T001–T003 establish the existing contract and client evidence. T004–T008 form the shared foundation. US1 can then deliver setup and readiness. US2 depends on identity/trust storage and is the first usable read-only workspace flow. US3 depends on admission and cancellation integration. T023–T026 close documentation and evidence; do not mark T025 complete merely because deterministic checks pass.

The first useful checkpoint is T001–T019: a user-local host setup and a trusted read-only analysis request through the explicit CLI fallback. Cursor auto-discovery may be enabled only if T002 proves its signal. Separate-file tasks T003 and selected documentation work can proceed in parallel after their inputs are known; shared runtime/store files should be edited sequentially.
