# Implementation Plan: M0 Compatibility Foundation

**Branch**: Existing working branch | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)
**Input**: Existing source and milestone evidence, documented using Spec Kit 0.14.2 templates.

## Summary

Document the existing compatibility probes, restricted evaluation fixtures and evidence gates that precede a durable local-agent runtime. This is a retrospective baseline plus the current source-organization change; it is not a proposal to reimplement the milestone.

## Technical Context

**Language/Version**: Node 22.23.2, TypeScript strict/ESM; pnpm 11.7.0.

**Primary Dependencies**: MCP SDK 2.0.0, Zod 4.6.5, better-sqlite3 13.0.3; versions and lockfile unchanged.

**Testing**: Node test runner via `pnpm check` and `pnpm test`.

**Target Platform**: Windows observed; native macOS validation remains open.

**Project Type**: Single-package local MCP host.

**Constraints**: No production repository mutation, arbitrary command tools, automatic model downloads or credential logging. MCP stdout is protocol-only.

**Scale/Scope**: Local single-host foundation, not a multi-tenant service.

**Storage**: Disposable fixture files and SQLite test databases; sanitized machine reports remain ignored under `.local/`.

**Performance Goals**: Preserve the existing probe deadlines and evaluator turn/tool limits; no new latency claim.

## Constitution Check

No root Spec Kit constitution is installed. The authoritative conventions are [AGENTS.md](../../AGENTS.md) and [technical plan](../../docs/technical-plan.md). Pre-design and post-design checks pass for this documentation/refactor: dependency pins, wire contracts, budgets, credential boundaries and the M2 read-only capability boundary are preserved. Existing open platform and operational gates remain open; these documents do not authorize M3.

## Project Structure

### Documentation

This package contains spec.md, plan.md, research.md, data-model.md, contracts/protocol.md, quickstart.md, tasks.md and checklists/requirements.md.

### Source Code

~~~text
src/diagnostics/compatibility/  # probes, process fixtures, evaluator and fixture data
src/utils/           # origin policy and process liveness
src/constants/       # stable codes and messages
src/prompts/         # preserved fixture prompts
tests/m0.test.ts
~~~

**Structure Decision**: Keep one package; separate runtime from milestone probes and share only concrete reused concerns. Import paths and package scripts use the new structure; configuration examples and local launch paths now use the canonical entry points.

## Complexity Tracking

No new dependencies, services, framework layers or compatibility launch wrappers. Launch configurations reference canonical paths.
