# Change: M2.5 Windows comparison

**Date**: 2026-10-05
**Related spec/tasks**: [M2.5 tasks](../../specs/005-m2-5-context-architecture/tasks.md)
**Status**: partial; implementation tested, quality qualification open.

## Request and scope

Finish M2.5 T007–T008 with pinned Windows validation and a frozen live quality comparison. Defer native macOS qualification without removing it or claiming cross-platform support. Keep M3 mutation gated.

## Changes and decisions

- Initial check, 116/116 tests and fake-provider MCP smoke passed. Two unchanged live comparisons each completed 4/5 and repeatedly failed startup after two output-limited prose responses.
- Added one narrow loop correction: the existing completion reminder advertises only `finish_analysis`. A regression verifies tool narrowing and repeated-prose failure. Pinned check, 117/117 tests and MCP smoke passed afterward. The follow-up live run completed startup but failed database after output-limited prose. No prompt, acceptance input, model setting or budget was relaxed.
- Updated architecture, source map, runbook, status and task evidence. Windows is the current qualification platform; native macOS/Cursor is deferred and unverified. M2.5 per-attempt memory remains separate from planned durable M2.6 learning.

## Observed validation

Three Windows attempts each completed 4/5; each preserved all 25 measured repository dimensions. Current source does not meet the Windows M2 quality gate. Human review is pending; no qualifying pair exists. The [sanitized comparison](../m2-m25-context-evidence-2026-10-05.md) contains frozen inputs and metrics; raw reports remain ignored in `.local/`. Deterministic compaction preserves early citation evidence, but live compaction occurrence was not measured.

## Assumptions and remaining work

The output-limited prose is a quality failure. Current reports do not prove whether RepoMap, compaction or model variability caused it, and the bounded correction did not resolve the overall five-case gate. Further changes require a general regression and renewed frozen comparison. Continue M2.6, repository baseline, M2.7 and M3 entry planning; keep production mutation disabled. Native macOS/Cursor qualification remains deferred/unverified, not failed or completed.

## Related context

[Architecture](../architecture.md), [M2 status](../m2-status.md), [explorer runbook](../explorer-runbook.md), [prior context checkpoint](2026-10-04-m2-context-checkpoint.md).
