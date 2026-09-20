# Quickstart: M0 Compatibility Foundation

Use Node 22.23.2 and pnpm 11.7.0 from the repository root. Install pinned dependencies if needed with `pnpm install --frozen-lockfile --ignore-scripts`; the SQLite native binding must be available for the target platform. Follow the [Mac runbook](../../docs/mac-m0-runbook.md) for platform setup.

~~~text
pnpm check
pnpm test
pnpm spike:mcp
pnpm spike:process
~~~

Expected: strict check/build pass; deterministic tests pass; each listed smoke emits a passed result and exits successfully. The checks use disposable fixtures. Model probes/evaluation require explicit opt-in and an existing installed model.

Observed on 2026-09-20: 90/90 tests passed on Windows; M0 MCP/process probes and M1 fake-provider reconnect smoke passed. This does not establish live-model, native macOS or Cursor UI success for the refactored build.

Live configuration remains private and operator supplied. Use the existing [README](../../README.md) and milestone status/runbooks for optional live checks. Review [contracts](contracts/protocol.md) and [remaining tasks](tasks.md) before declaring milestone closure.
