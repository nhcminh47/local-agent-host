# Research: Host Bootstrap and Workspace Trust

**Date**: 2026-09-25. This is a design review of checked-in code, not native-client or live-provider evidence.

## Current evidence

- `src/runtime/daemon.ts` reads `LOCAL_AGENT_REPOS_FILE` in explorer mode, registers every root at startup and uses environment variables for the IPC token, database and provider.
- `src/domain/task-contracts.ts` requires schema-version-1 `repoId`; `src/runtime/mcp-server.ts` forwards it unchanged. `src/service/snapshot-task-service.ts` captures a snapshot after registry lookup and persists snapshot identity.
- `src/exploration/repo-registry.ts` canonicalizes paths with `realpath`, but is an in-memory registry, not a durable trust store. `src/exploration/git-snapshot.ts` verifies the exact Git top level during capture and uses bounded Git subprocesses.
- The current Windows Cursor evidence covers a project-scoped MCP configuration and M0 echo, not user-scope installation or reliable workspace metadata. Native Cursor/macOS behavior remains open in `docs/m2-status.md`.

## Decisions

| Decision | Rationale | Alternative considered |
| --- | --- | --- |
| Use the existing SQLite database for durable workspace grants and task association, with migrations and strict schema validation. Keep host config and credential files user-local. | One writer/transaction boundary with task admission and revocation; avoids a second grant store with race-prone updates. | A JSON grant file is simple but would need separate locking and atomic coordination with task state. |
| Make the daemon the sole grant writer; CLI calls authenticated local management IPC. Require an interactive human confirmation for granting and revoking. | Trust once lives in daemon memory; one authority handles both transient and durable grants. | Direct CLI database writes cannot update active once-only state or running tasks safely. |
| Use a versioned `analyze_repo` v2 request with a host-generated `workspaceRef`, or a bridge-supplied candidate from a qualified adapter. Keep v1 parsing separate. | Users do not invent repository IDs and the model cannot turn a path into a grant. | Reinterpreting v1 `repoId` or accepting arbitrary paths as authorization would weaken compatibility/security. |
| Use CLI-selected path as the guaranteed fallback for workspace discovery. Automatic Cursor discovery is conditional on a controlled client fixture. | Existing evidence does not prove bridge CWD or metadata corresponds to the active workspace. | Assuming `process.cwd()` would risk selecting an unrelated root. |
| Derive identity from real path, verified Git top level and a bounded local repository marker fingerprint; revalidate it on admission/restore. | Catches path reuse or Git directory replacement when observable; does not depend on remote URL. | Path or remote-only identity is mutable or insufficient. |
| A missing/revoked read grant blocks new and resumed work; revocation cancels in-flight explorer work under the existing lease/cancellation controls. | Prevents further repository content reaching inference after revocation. | New-admission-only revocation leaves active work with continuing access. |
| Keep v1 static repo configuration as an explicit compatibility mode, with no implicit durable grant migration. | Existing fixtures and persisted requests remain intelligible; users explicitly opt into the new trust flow. | Automatically trusting all pre-registered roots would silently grant access. |

## Qualification still required

1. Verify the current Cursor user-level MCP configuration format, launch environment and workspace signal on Windows, then on macOS. Record exact client/host versions without credentials. Until verified, use the CLI fallback.
2. Verify the chosen Git marker fingerprint across ordinary checkout movement, linked worktrees, symlinked roots and repository replacement. If identity is ambiguous, require renewed trust.
3. Decide the exact legacy-mode sunset only after v1 task migration and smoke checks. This plan does not remove `LOCAL_AGENT_REPOS_FILE`.

## Implementation review — 2026-09-26

- The existing v1 request is strict: `schemaVersion: 1`, `repoId`, `requestKey`, `baseRef`, `objective`, `question`, optional depth/focus/scope/budget. Task rows key idempotency by `(repo_id, request_key)` and hash canonical parsed JSON. Snapshot rows store the admitted commit, snapshot ID, root hash and optional scope hash. The new v2 path normalizes to that same internal request and adds a separate task workspace binding; v1 rows remain readable.
- [Current Cursor MCP guidance](https://prod.cursor.com/help/customization/mcp) documents a global `~/.cursor/mcp.json` with `mcpServers` and `command`/`args`. A disposable JSON fixture verified that the adapter preserves peer entries and rejects malformed input. No reliable active-workspace signal was established, so automatic workspace discovery remains disabled. User selection through the host CLI is the supported path. Native Cursor and macOS qualification remain open.
- The dedicated management credential is separate from the MCP bridge credential. Grant and revoke require an interactive CLI confirmation. The daemon alone writes grants and cancels bound tasks on revocation.
