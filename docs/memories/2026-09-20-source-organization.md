# Change: Source organization and milestone documentation

**Date**: 2026-09-20
**Related specs**: [M0](../../specs/002-m0-foundation/spec.md), [M1](../../specs/003-m1-task-backbone/spec.md)
**Status**: Completed source cleanup; milestone gates remain separate.

## Request and scope

Separate shared behavior, utilities, messages/status codes and prompts; restructure source; generate M0/M1 documentation with Spec Kit. Follow-up requested removal of remaining milestone folders.

## Changes and decisions

- Production daemon, bridge and IPC client moved to `src/runtime/`; grading moved to `src/evaluation/`.
- Diagnostics are grouped as `compatibility`, `task` and `exploration`. All milestone-named source folders were removed.
- Extracted shared transport/error helpers, origin/process utilities, constants, named prompts, explorer coverage and evaluator fixture data. Extracted prompt literals were verified against their original text.
- Initial compatibility forwarding launchers were subsequently removed at the user's request. Scripts, configuration examples and matching local Cursor launcher paths now use canonical paths; stale generated milestone directories were removed.
- Spec Kit CLI 0.14.2 and bundled plan setup were used with ignored local scaffolding to produce M0/M1 specification packages. No root framework, dependency or branch was introduced.

## Observed validation

Historical observations from the completed source task on Windows, Node 22.23.2 and pnpm 11.7.0: `pnpm check`, all **90/90 tests**, `pnpm spike:mcp`, `pnpm spike:process` and `pnpm m1:smoke` passed. After folder removal they passed again; the latest process probe measured **117 ms** for three fixture processes.

Spec Kit artifact prerequisites, Markdown links, source-module references, prompt text preservation and absence of milestone-named folders under `src/` were checked. See [source validation](../source-structure.md) and [M0 evidence](../m0-status.md). These checks were not rerun while creating this memory.

## Assumptions and remaining work

Behavior preservation is supported by deterministic checks, not a fresh live-model qualification. Native macOS/Cursor and live inference were not rerun. Existing platform, supervision and failure-injection gates remain open; no editing/command/test tools were added to the product.

## Related context

[Architecture](../architecture.md) · [M1 status](../m1-status.md) · [M2 status](../m2-status.md)
