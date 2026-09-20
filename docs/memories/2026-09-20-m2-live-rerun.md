# Change: M2 live rerun after source reorganization

**Date**: 2026-09-20
**Related spec/tasks**: [M2 specification](../../specs/001-m2-quality-gate/spec.md), [T037–T039](../../specs/001-m2-quality-gate/tasks.md)
**Status**: Requested rerun completed; qualification remains open.

## Request and scope

Rerun M2 live testing using the existing frozen five-case suite and configured inference endpoint. No runtime, model, budget or capability changes.

## Changes and decisions

- Extended the existing spec, plan and ordered tasks using installed Spec Kit guidance; ran its artifact prerequisite checker successfully. No scaffold, branch or runtime change was needed.
- Added the [sanitized report](../m2-live-rerun-2026-09-20.md) and refreshed [M2 status](../m2-status.md).
- Stopped before confirmation because health failed agent semantic review; preserved the original gate and labelled review provenance explicitly.

## Observed validation

Windows Node 22.23.2 / pnpm 11.7.0: strict check passed, 90/90 tests passed with zero skips, deterministic MCP smoke passed including seven canaries, and all five live tasks completed. All automated result dimensions and 25 preservation checks passed. Agent grading accepted 4/5; the health answer overgeneralized 413 to validation errors. Documentation links and diff whitespace were checked. No compatibility probes or native topology tests were rerun.

## Assumptions and remaining work

Human review is not established by historical `codex-manual-review` metadata. Native Cursor/macOS remains unverified. The acceptance harness records only HEAD when a commit exists, so a separate local code manifest identifies this dirty working tree. Fix/requalify the status-code claim and address source-identity/review provenance in separately scoped work. M2 remains open; M3 remains disabled.
