# Change: M2.7 lifecycle and hygiene

**Date**: 2026-10-05
**Related spec/tasks**: [M2.7 tasks](../../specs/008-spec-lifecycle-context-hygiene/tasks.md)
**Status**: metadata lifecycle implemented; live qualification open.

## Request and scope

Prevent accumulated spec and task artifacts from becoming default context or being cleaned up without a policy decision. Keep user-authored source and audit evidence intact; do not expose M3 mutation tools.

## Changes and decisions

- Added version-1 host SQLite spec lifecycle records and append-only events tied to filtered admitted spec-bundle hashes. Registration, finalization, archive, restore, retirement, supersession and cleanup eligibility are explicit states. None moves or deletes repository files.
- Finalization requires bounded operator-reviewed acceptance, decisions, references, unresolved work and a declared M2.6 knowledge handoff. Candidate IDs are checked for repository identity; finalization never promotes them.
- Added management-authenticated host CLI and a read-only hygiene report for spec states, stale learning, superseded baselines and terminal task counts. Archived summaries are excluded from normal explorer context and available through explicit inspection.

## Observed validation

Windows Node 22.23.2 / pnpm 11.7.0: `pnpm check` passed, `pnpm test` passed 130/130 with no skips, and fake-provider `pnpm m2:smoke:mcp` passed. Focused lifecycle tests passed 4/4: invalid transitions, summary/secret validation, candidate handoff without promotion, changed-source supersession, redacted-source rejection, many spec bundles, archive exclusion and source preservation. No live-model or human-review qualification is claimed.

## Assumptions and remaining work

`eligible_for_cleanup` is advisory metadata. There is no destructive cleanup policy or file deletion. The hygiene report counts terminal task artifacts but does not prune them. Windows M2 quality acceptance, independent human claim review and native Cursor topology remain open; macOS qualification is deferred/unverified. M3 edit/test/command capability remains disabled.

## Related context

[Architecture](../architecture.md), [source map](../source-structure.md), [runbook](../explorer-runbook.md), [M2 status](../m2-status.md), [M2.7 specification](../../specs/008-spec-lifecycle-context-hygiene/spec.md).
