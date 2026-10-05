# Change: repository baseline

**Date**: 2026-10-05
**Related spec/tasks**: [baseline tasks](../../specs/007-repository-bootstrap/tasks.md)
**Status**: deterministic implementation complete; live qualification open.

## Request and scope

Give a newly trusted repository a compact orientation baseline derived from admitted filtered evidence. Keep it separate from the fast RepoMap and reviewed M2.6 learning, and keep M3 mutation disabled.

## Changes and decisions

- Added version-1 observed/derived/unknown baseline contracts and a deterministic builder over eligible snapshot paths and selected filtered manifests/guidance. It records language/path/package/command/test/configuration signals and likely entry points, with path or filtered-blob provenance. Commands are discovered, never executed.
- Added additive versioned SQLite persistence. A relevant path/support fingerprint reuses the current version or supersedes it without deleting audit history. A management-authenticated inspect command exposes the current baseline and versions for a trusted task.
- Added a 2 KiB source-data projection to the explorer context after trust-checked snapshot restore. RepoMap remains navigation and learning remains explicit reviewed knowledge; none grants authority.

## Observed validation

Windows Node 22.23.2 / pnpm 11.7.0: `pnpm check` passed, `pnpm test` passed 126/126 with no skips, and fake-provider `pnpm m2:smoke:mcp` passed after the context-integration test was added. Tests cover committed versus dirty content, scope, redacted/prompt-like guidance, missing docs, bounded projection, relevant refresh and retained superseded history. No live-model baseline qualification or human review occurred.

## Assumptions and remaining work

The baseline is deliberately conservative. It identifies guidance files and records that consistency with current source is unverified; it does not synthesize unreviewed architecture claims. It treats entry-point names as derived orientation. Final Windows M2 quality and human review remain open. Native macOS/Cursor qualification is deferred/unverified; M3 edit/test/command capabilities remain disabled.

## Related context

[Architecture](../architecture.md), [source map](../source-structure.md), [runbook](../explorer-runbook.md), [M2 status](../m2-status.md), [baseline specification](../../specs/007-repository-bootstrap/spec.md).
