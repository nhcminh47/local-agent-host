# CLI and IPC Contract: Bootstrap and Workspace Trust

**Proposed versioned contract**, to be finalized with strict Zod schemas before implementation. Existing v1 MCP/IPC contracts remain valid.

## User commands

| Command | Behavior |
| --- | --- |
| `pnpm bootstrap` | Interactive, idempotent user-local setup; prints sanitized readiness and manual client instructions when needed. |
| `pnpm bootstrap --reconfigure` | Updates selected setup fields; preserves tasks and grants. |
| `pnpm bootstrap --check` | Read-only, non-interactive readiness report; no writes/prompts. |
| `pnpm host workspace select <path>` | Canonicalizes a user-selected Git root and returns a host-generated `workspaceRef`; no grant. |
| `pnpm host workspace trust <workspaceRef> --once|--always` | Interactive confirmation, then read grant through authenticated daemon IPC. |
| `pnpm host workspace deny <workspaceRef>` | Rejects the current authorization attempt; no permanent ban. |
| `pnpm host workspace list` | Lists bounded path/identity and capability status; no secrets. |
| `pnpm host workspace revoke <workspaceRef>` | Interactive revocation; prevents further read access and cancels active work. |

Exact argument syntax may be adjusted for platform ergonomics without changing the required behaviors. Grant and revoke commands require a local interactive terminal in this milestone; non-interactive callers cannot approve trust.

## MCP analysis requests

`analyze_repo` accepts a discriminated union. Version 1 remains the current strict `repoId` request. Version 2 retains objective, question, ref, focus paths, scope, budget and request key constraints, but replaces `repoId` with an optional host-generated `workspaceRef`. A qualified bridge adapter may provide a candidate separately in a host-authenticated IPC envelope; it is never accepted as a grant. If both sources are present and disagree, fail closed. The daemon derives its internal repo ID only after identity and read-grant validation.

The request key remains idempotent within the resolved workspace identity and canonical payload. A missing or invalid candidate must not create a task or read repository content.

## Required action

When the workspace is missing or untrusted, the daemon returns a bounded error/result code to MCP:

```json
{"schemaVersion":2,"code":"WORKSPACE_TRUST_REQUIRED","capability":"read","workspaceRef":"host-generated-reference","action":"Review workspace trust with the host CLI, then retry the request."}
```

If no unambiguous candidate exists, use `WORKSPACE_SELECTION_REQUIRED` and omit repository-derived details. No response contains an approval token or credential. `workspace deny` records no grant and returns a denied acknowledgment; a later analysis still receives `WORKSPACE_TRUST_REQUIRED`. Malformed grants/config fail closed.

## Management IPC

The host CLI uses authenticated loopback management routes with strict input schemas and bounded bodies. Its credential is separate from the bridge credential. A management request is not an MCP tool and cannot be invoked through model tool output. The daemon is the sole writer of durable/once-only grants and coordinates revocation with task cancellation. Existing `/v1/submit`, `/v1/get`, `/v1/cancel` and capability routes retain wire compatibility.
