# Validation Quickstart: Host Bootstrap and Workspace Trust

The fixture scenarios below exercise the implemented trust path. Native Cursor/macOS and live model quality remain separate qualification work.

## Setup

Use the pinned Node 22.23.2 / pnpm 11.7.0 toolchain, an isolated temporary user-state directory, a disposable Git fixture, a disposable SQLite database, a fake provider, and synthetic client-config files. Do not use a real credential or mutate a real user MCP configuration during deterministic tests.

## Expected scenarios

1. Run `pnpm bootstrap` with fixture inputs. Confirm user-local config/credential creation, sanitized output and an exact/manual client integration path. Run it again and verify unrelated client entries, task data and grants are unchanged.
2. Run `pnpm bootstrap --check`. Confirm it makes no file or database changes and reports required versus degraded provider conditions.
3. Select the fixture Git root. Submit a v2 read-only request before trust. Expect `WORKSPACE_TRUST_REQUIRED`, zero snapshot capture and zero provider calls. Grant once interactively, retry and complete through the existing snapshot path.
4. Restart the daemon. The once-only grant is absent; a nonterminal task cannot resume inference until reauthorized. Add a durable read grant and verify restart recovery.
5. Deny and revoke fixture grants. New admission fails; an active task is cancelled before another model-bound read. Edit/verify requests remain unavailable.
6. Replace the Git root behind the same path or change symlink target. Identity mismatch requires renewed trust. Out-of-scope and filtered paths remain unavailable after trust.
7. Submit existing v1 `repoId` fixtures under explicit legacy mode. Confirm request/result and idempotency compatibility without silently adding durable grants.
8. Run `pnpm check`, `pnpm test`, `pnpm spike:mcp`, `pnpm spike:process`, `pnpm m1:smoke` and `pnpm m2:smoke:mcp`. Record actual results, platform and any failures.

## Live qualification

Only after deterministic checks pass, rerun the frozen M2 quality pair with the same inputs and review protocol. Separately exercise user-scope Cursor installation and first-use trust on Windows and native macOS with restart, filtering, scope, snapshot and preservation checks. Record observed evidence in the relevant status/runbook; do not infer one platform/client from another.
