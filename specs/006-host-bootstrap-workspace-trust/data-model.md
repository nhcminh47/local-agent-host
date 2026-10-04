# Data Model: Host Bootstrap and Workspace Trust

**Date**: 2026-09-25 | **Spec**: [spec.md](spec.md)

## HostConfig v1

User-local JSON, strict/versioned. Fields: `schemaVersion`, loopback daemon port, database path, selected `clientAdapter`, provider kind (`explorer` using Ollama), endpoint and model. Separate private files in the same user-state directory hold bridge and management credentials; the config contains no plaintext credential. Unknown fields fail validation. Explicit environment overrides remain a development path and cannot silently persist as config.

## WorkspaceIdentity v1

Host-derived: opaque `workspaceRef`, canonical real path, exact Git top level, local Git marker fingerprint, creation/update timestamps. `workspaceRef` is an identifier, never an authorization secret. Identity lookup must re-resolve the root and compare marker data; ambiguous or changed identity yields renewed selection/trust rather than a guessed match. Case normalization follows the host filesystem, not unconditional lowercasing on macOS.

## WorkspaceGrant v1

Fields: identity reference, capability (`read` in this milestone), mode (`once` or `durable`), creation time and grant generation. Durable grants live in SQLite. Once-only grants live only in daemon memory and disappear on restart. A grant is created only by the authenticated host management path after interactive human confirmation. The schema can later represent `edit` and `verify`, but this milestone must reject their creation and use.

## TaskWorkspaceBinding v1

Persisted with each new v2 task: workspace reference, identity fingerprint, required capability, and grant generation at admission. Existing v1 task rows remain readable. On retry or restore, identity and current read grant are checked before snapshot restoration/inference; a mismatch blocks or cancels according to task state. Existing snapshot `baseCommit`, `snapshotId`, root hash and scope hash remain authoritative and unchanged.

## State transitions

```text
unselected -> candidate -> trust_required -> once_read | durable_read
candidate -> denied (attempt only; no permanent deny)
once_read -> trust_required on daemon restart
durable_read -> revoked -> trust_required
any grant -> identity_changed -> trust_required
```

Selection never implies authorization. Denial is not persisted as a permanent ban. Revocation increases the grant generation, prevents new admission, blocks resumed work and cancels active explorer work before further model-bound content. Grant management cannot mutate the admitted commit, scope, budget or result contract.
