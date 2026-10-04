# Implementation Plan: Host Bootstrap and Workspace Trust

**Branch**: `main` | **Date**: 2026-09-25; implementation reviewed 2026-09-26 | **Spec**: [spec.md](spec.md)

## Summary

Add user-local host setup and explicit read authorization for Git workspaces. Keep the daemon's authenticated loopback IPC, immutable snapshot admission, strict task budgets, and read-only explorer. Introduce a host-owned workspace identity and trust service; bootstrap configures the current Ollama provider and a qualified MCP client without putting generated secrets or repository grants in the source tree.

Implementation uses a separate management credential for CLI grant/revoke routes, a path and Git-marker fingerprint for workspace identity, SQLite durable grants/task bindings, and daemon-memory once grants. A local loopback Ollama endpoint can run without a provider token; non-loopback endpoints retain the credential requirement. The Cursor global MCP JSON format is supported, while workspace discovery uses explicit CLI selection until a native client signal is qualified.

## Technical Context

| Item | Current / planned choice |
| --- | --- |
| Language and runtime | TypeScript strict ESM, Node 22.23.2, pnpm 11.7.0 |
| Dependencies | Existing Zod, SQLite, MCP SDK and Node APIs; no new dependency presumed |
| Storage | Versioned user-local config/secret files; durable workspace grants and task binding in the existing SQLite database |
| Platform | Windows and macOS; Git repositories with committed snapshots |
| Tests | `pnpm check`, `pnpm test`, `pnpm m1:smoke`, `pnpm m2:smoke:mcp`, bootstrap/trust fixtures; live quality and native Cursor/macOS qualification separately |
| Current entry points | `src/runtime/daemon.ts`, `src/runtime/mcp-server.ts`, `src/runtime/ipc-client.ts`, `src/service/snapshot-task-service.ts`, `src/exploration/repo-registry.ts` |
| Bounds | Existing IPC 65,536-byte request cap, strict request schemas, snapshot limits, task deadlines/budgets, secret filtering |

## Constitution Check

There is no tracked root Spec Kit constitution. The staged generic constitution is a template and does not replace [AGENTS.md](../../AGENTS.md) or [development workflow](../../docs/development-workflow.md). Pre-design and post-design review apply these project gates:

- **Pass**: no M3 edit, test execution, arbitrary command, push, merge, model download or firewall capability is introduced.
- **Pass**: only an explicit human action can create a trust grant; model output and arbitrary MCP paths remain untrusted candidates.
- **Pass**: snapshot identity, path scope, filtering, durable budgets, cancellation, idempotency and fenced publication remain enforced.
- **Pass**: generated credentials/config are outside the repo; public errors and logs contain no secret value.
- **Pass**: schema-version-1 requests and persisted tasks retain a defined compatibility path; new wire/persistence contracts are versioned.
- **Qualification gate**: native Cursor/macOS behavior is unverified. Automatic workspace discovery cannot ship for a client until demonstrated; CLI selection is the safe fallback.

## Phase 0 — Research and decisions

[Research](research.md) records the current code evidence and choices. Before implementation, verify Cursor's current user-level integration format and the actual workspace information available to the bridge, using a controlled client fixture. If neither supplies a reliable candidate, ship explicit CLI workspace selection; never infer it from unqualified `process.cwd()`.

## Phase 1 — Design and contracts

- [Data model](data-model.md): host config, workspace identity, durable and once-only grants, candidate resolution, task association, and revocation rules.
- [CLI and IPC contracts](contracts/bootstrap-workspace.md): bootstrap/check/reconfigure, trust management, versioned analysis request and required-action response.
- [Quickstart](quickstart.md): synthetic repository and client-config fixtures, authorization behavior, recovery, regression and platform qualification.

## Delivery slices

### Slice A — User-local configuration and bootstrap

Create `src/bootstrap/` for configuration, readiness and client adapters, with a thin command entry point. State location and credential creation must be atomic, idempotent and permission-restricted where supported. The daemon and bridge load the same user-local configuration and credential in normal use; preserve explicit environment overrides for current developer fixtures. Implement Cursor installation only after format qualification; always provide a generic/manual path. Bootstrap must report daemon reachability and exact startup steps; it must not start an unsupervised permanent daemon or silently alter OS controls.

### Slice B — Workspace identity and grant service

Create a host-owned trust service under `src/exploration/` or `src/service/` according to ownership. Resolve real path and Git top level with bounded argument-array subprocesses. Store a canonical root plus a repository identity fingerprint that detects replacement where reliable; fail closed on mismatch. Keep once-only read grants in daemon memory and durable grants in user-local state. Provide list, grant, deny and revoke through the host CLI. Persist only `read` grants in this milestone; reserve capability vocabulary for future M3 without making it active.

### Slice C — Admission and MCP compatibility

Add a versioned normal-use workspace request alongside existing schema-version-1 `repoId` input. Bridge/daemon treat the candidate as untrusted; the daemon resolves it and checks read trust before snapshot capture, registration, provider calls or repository-derived error detail. Return bounded `WORKSPACE_SELECTION_REQUIRED` or `WORKSPACE_TRUST_REQUIRED` required action without an approval token. Map authorized workspace identity to a host-generated internal repo ID. Keep old static configuration as a development/upgrade path, but require trust when the new mode is enabled. Persist enough workspace identity with admitted tasks so retry/restore does not switch roots. Recheck trust on resume and before each model-bound operation; revoke/cancel an in-flight task safely under its lease.

### Slice D — Qualification and documentation

Exercise bootstrap reruns, malformed configuration, user-config preservation, symlinks, root replacement, trust once/restart, deny/revoke, old v1 requests, snapshot identity, filtering and credential canaries. Run pinned checks and M1/M2 smoke. A live M2 quality pair and native Cursor/macOS first-use flow are separate qualification gates, recorded as observed evidence only when executed. Update architecture, source map, explorer runbook, status and project memory after implementation.

## Compatibility and migration

The existing `LOCAL_AGENT_REPOS_FILE`, token, daemon URL, database path and provider environment overrides continue to support current local developer runs. Bootstrap may read them as explicit overrides but must not copy plaintext secret values into tracked files or silently turn static registration into a durable trust grant. Existing `analyze_repo` v1 request and stored task JSON remain readable. New requests must use a distinct schema version; no implicit reinterpretation of a v1 `repoId` as an absolute path. After workspace trust is enabled, existing queued tasks without new workspace metadata must resolve their static root and obtain explicit read trust before inference. They never acquire a grant implicitly.

## Project structure

```text
src/bootstrap/                 guided command, config, readiness, client adapters
src/domain/                    versioned bootstrap/trust/request contracts
src/runtime/                   thin CLI and MCP/IPC/daemon adapters
src/service/                   trust-aware admission and task lifecycle
src/exploration/               canonical workspace identity and registry integration
src/store/                     durable grant and task-identity migrations if SQLite chosen
src/constants/                 stable errors and messages
tests/                         focused bootstrap, trust, admission and regression tests
docs/                          setup/runbook, architecture, source map and evidence
```

Final service ownership must be settled in the first foundational tasks before changing persisted contracts. New directories are responsibility-based and documented in the source map.

## Risk and validation gates

1. **Client workspace signal**: Cursor spawn CWD and user-scope config behavior are not established by existing tests. Qualify before automatic discovery; retain explicit CLI selection.
2. **Identity and symlinks**: canonical path alone may be reused after repository replacement. Store and recheck a bounded Git-root identity; avoid remote URL as the sole key.
3. **Revocation and restart**: a grant change must not leave a running or restored explorer with access. Define the lease-safe cancellation/block transition before wiring admission.
4. **Migration**: current code registers `repoId` roots from a static file at daemon startup. Preserve v1 and idempotency semantics while new workspace references are introduced.
5. **Evidence**: deterministic Windows checks do not certify live-model semantic quality, native macOS, or Cursor behavior. Keep M2/M3 gates open until their recorded checks pass.
