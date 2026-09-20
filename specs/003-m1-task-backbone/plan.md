# Implementation Plan: M1 Durable Task Backbone

**Branch**: Existing working branch | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)
**Input**: Existing source and milestone evidence, documented using Spec Kit 0.14.2 templates.

## Summary

Document the existing durable task admission, event journal, fenced worker lifecycle and reconnectable authenticated bridge. This is a retrospective baseline plus the current source-organization change; it is not a proposal to reimplement the milestone.

## Technical Context

**Language/Version**: Node 22.23.2, TypeScript strict/ESM; pnpm 11.7.0.

**Primary Dependencies**: MCP SDK 2.0.0, Zod 4.6.5, better-sqlite3 13.0.3; versions and lockfile unchanged.

**Testing**: Node test runner via `pnpm check` and `pnpm test`.

**Target Platform**: Windows observed; native macOS validation remains open.

**Project Type**: Single-package local MCP host.

**Constraints**: No production repository mutation, arbitrary command tools, automatic model downloads or credential logging. MCP stdout is protocol-only.

**Scale/Scope**: Local single-host foundation, not a multi-tenant service.

**Storage**: SQLite WAL tasks/events, schema metadata, unique request keys, leases and deadlines; daemon owns the database.

**Performance Goals**: Preserve the 65,536-byte request cap, 20-second maximum long poll, 25-second IPC timeout and existing per-task budgets.

## Constitution Check

No root Spec Kit constitution is installed. The authoritative conventions are [AGENTS.md](../../AGENTS.md) and [technical plan](../../docs/technical-plan.md). Pre-design and post-design checks pass for this documentation/refactor: dependency pins, wire contracts, budgets, credential boundaries and the M2 read-only capability boundary are preserved. Existing open platform and operational gates remain open; these documents do not authorize M3.

## Project Structure

### Documentation

This package contains spec.md, plan.md, research.md, data-model.md, contracts/protocol.md, quickstart.md, tasks.md and checklists/requirements.md.

### Source Code

~~~text
src/runtime/        # daemon, IPC client and MCP bridge
src/domain/         # task contracts
src/store/          # durable tasks/events/leases
src/service/        # orchestration and fake service
src/provider/       # connectivity provider
src/shared/         # transport envelopes and error matching
src/constants/      # errors, messages and HTTP status codes
src/prompts/        # connectivity and explorer prompts
src/diagnostics/task/ # reconnect smoke
tests/m1-task-backbone.test.ts
~~~

**Structure Decision**: Keep one package; separate runtime from milestone probes and share only concrete reused concerns. Import paths and package scripts use the new structure; configuration examples and local launch paths now use the canonical entry points.

## Complexity Tracking

No new dependencies, services, framework layers or compatibility launch wrappers. Launch configurations reference canonical paths.

## HTTP 413 correction plan — 20 September 2026

In src/shared/http-json.ts, consume the request with a non-destroying async iterator, retain the existing byte cap, and stop on overflow without destroying the response socket. The daemon returns 413 REQUEST_TOO_LARGE and closes that connection after sending the bounded JSON response, rather than draining an unbounded sender. Add the status in src/constants/http-status.ts; keep other error mappings unchanged. Verify through a real daemon process in tests/m1-http.test.ts, including a chunked request deliberately left open. Run pinned-toolchain check/test and M1 reconnect smoke.
