# Change: Host bootstrap and workspace trust planning

**Date**: 2026-09-25

**Related spec/tasks**: [Spec](../../specs/006-host-bootstrap-workspace-trust/spec.md), [plan](../../specs/006-host-bootstrap-workspace-trust/plan.md), [tasks](../../specs/006-host-bootstrap-workspace-trust/tasks.md)

**Status**: Planning complete; implementation not started.

## Request and scope

After a fast-forward pull brought in four planned specifications, prepare the next implementation plan using the installed GitHub Spec Kit workflow. The chosen next slice is host bootstrap and workspace read trust. This change is documentation only.

## Decisions

- Reuse the existing repository and Spec Kit feature package. No branch or root constitution was created.
- Keep schema-version-1 `repoId` compatibility while defining a separate versioned workspace request. An untrusted candidate cannot authorize itself.
- Use host-owned CLI confirmation as the initial authorization channel, with explicit CLI workspace selection if a client's workspace signal is not qualified. Cursor user-level behavior requires controlled validation before automatic discovery.
- Use user-local configuration and credential storage, with durable grants in the existing SQLite store and once-only grants in daemon memory. Revocation must prevent new/resumed access and stop active work.
- Preserve the M2 read-only product boundary; M3 remains gated. Repository bootstrap and context architecture are later packages, not included in this implementation plan.

## Observed validation

Spec Kit CLI 0.14.2 was present. A fresh ignored staging directory was initialized and its bundled `setup_plan.py`, `setup_tasks.py` and prerequisite checker were run against the existing feature package. The prerequisite checker found the spec, plan, tasks, research, data model, contract and quickstart. The staged generic constitution was treated as a template; `AGENTS.md` and the checked-in workflow remained authoritative.

Only targeted source and documentation were inspected. The planning package has 26 pending tasks with sequential IDs and story labels; all seven planned artifacts are present. A scoped link check resolved 39 local links, and whitespace checks passed after cleanup. No runtime code changed and no runtime tests or live/client qualification were run.

## Remaining work

Execute the ordered tasks and record observed checks. In particular, qualify Cursor workspace discovery and native macOS separately; do not infer them from the current Windows project-scoped M0 echo evidence. Update milestone status and this memory trail when implementation produces evidence.
