# Change: Host bootstrap and workspace read trust

**Date**: 2026-09-26
**Related spec/tasks**: [Spec](../../specs/006-host-bootstrap-workspace-trust/spec.md), [plan](../../specs/006-host-bootstrap-workspace-trust/plan.md), [tasks](../../specs/006-host-bootstrap-workspace-trust/tasks.md)
**Status**: partial; implementation and deterministic Windows checks complete, live/native qualification open

## Request and scope

Implement the Host Bootstrap & Workspace Trust Spec Kit plan while retaining M2 read-only exploration, legacy v1 requests and developer environment overrides.

## Changes and decisions

- Added user-local, strict host config and private bridge/management credentials. Interactive bootstrap configures Ollama and Cursor or prints a manual MCP entry; `--check` reads readiness and `--reconfigure` preserves tasks/grants.
- Added canonical Git workspace selection, Git-marker replacement checks, daemon-memory once grants, SQLite durable read grants and task bindings. A separate management credential keeps grant routes away from the MCP bridge credential; the CLI requires interactive grant/revoke confirmation.
- Added v2 `workspaceRef` admission and bounded selection/trust required actions before snapshot capture. Legacy v1 static roots remain supported; trust applies to them when bootstrap mode is enabled. Restore and every model-bound operation recheck identity/grant. Revocation cancels queued and active bound work under existing lease controls.
- A local loopback Ollama endpoint can run without a bearer credential; non-loopback endpoints still require one. No model download or new model tool was added.

## Observed validation

- Windows Node 22.23.2 / pnpm 11.7.0: strict check, 109 deterministic tests, MCP SDK probe, final three-process probe (177 ms), M1 reconnect smoke and M2 fake-provider MCP smoke with seven failure/output canaries passed.
- Synthetic tests cover bootstrap idempotency and `--check`, Cursor peer-entry preservation, management authority separation, v2 admission, once/durable grants, restart, symlink/worktree identity, marker replacement, malformed grants, scope/secret exclusions and active revocation.
- Interactive `pnpm bootstrap` succeeded against an ignored isolated user-state fixture; rerun and `--check` succeeded. A separate fresh `--check` fixture created no user state. The fixture provider/model and daemon were intentionally offline.
- Spec Kit 0.14.2 prerequisite check found the feature research, model, contract, quickstart and tasks.

## Assumptions and remaining work

The documented Cursor user-level JSON format has a synthetic preservation fixture, but active-workspace metadata, actual Cursor first-use behavior and native macOS behavior are not qualified; users select a workspace through the CLI. Live v32 M2 quality was not rerun. Those gates remain open, as does M3. An ignored interactive bootstrap fixture remains under `.local/` because automatic approval review rejected its recursive cleanup; it is not tracked and no credential value was printed.

## Related context

See [architecture](../architecture.md), [source structure](../source-structure.md), [explorer runbook](../explorer-runbook.md) and [M2 status](../m2-status.md). The preceding [planning memory](2026-09-25-host-bootstrap-plan.md) records the design baseline.
