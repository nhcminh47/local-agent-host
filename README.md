# local-agent-host

MCP/local-agent system for macOS and Windows. **Current phase: M2 read-only exploration.** The daemon supports opt-in snapshot-backed exploration with qwen3:8b, filtered read/list/search tools, durable budgets and capability decisions. Windows MCP/daemon restart checks and the frozen five-case real-repository quality pair pass. See [explorer setup](docs/explorer-runbook.md) and the [current Windows quality-gate report](docs/m2-quality-gate-v31-2026-09-19.md); native macOS/Cursor validation remains open. Repo editing tools are not implemented.

Architecture: Cursor on Mac mini → stdio MCP bridge → daemon near the repo → Ollama on Windows. Cursor delegates task-level work; the future runtime manages isolated Git worktrees and verification.

## Prerequisites

- Node **22.23.2** (see `.node-version`), pnpm **11.7.0**, Git and ripgrep.
- Existing Ollama installation for live inference checks. GPU is not required for deterministic tests.
- M0 diagnostic scripts do not download models or change global configuration. The optional bootstrap flow below writes user-local host and MCP configuration.

## First-run setup and workspace trust

Run `pnpm bootstrap` from the clone with the pinned toolchain. It creates private host configuration and separate bridge/management credentials in the user state directory, asks for the Ollama URL/model and Cursor or manual MCP setup, and prints readiness plus the daemon startup command. It does not download a model or start a permanent daemon. `pnpm bootstrap --reconfigure` changes selected settings; `pnpm bootstrap --check` reads readiness without changing user state. The build step may refresh ignored `dist/` output.

Start the daemon with `pnpm m1:daemon`. For a repository, run `pnpm host workspace select <absolute-path>`, then `pnpm host workspace trust <workspaceRef> --once` or `--always` in an interactive terminal. Use the returned `workspaceRef` in a schema-version-2 `analyze_repo` request; no repository ID is needed. `pnpm host workspace list` shows grants, `deny <workspaceRef>` declines the current prompt, and `revoke <workspaceRef>` removes read trust and cancels bound work. Trust is only for read-only exploration. If no workspace reference is supplied, analysis returns a selection action before reading repository content.

Cursor's documented global MCP file is `~/.cursor/mcp.json`. Bootstrap updates only the `local-agent-host` entry and backs up an existing parseable file. Cursor's active-workspace signal has not been qualified, so select the workspace with the host CLI. Native Cursor/macOS qualification remains open. The older explicit environment-variable setup below is preserved for development and migration.

## Run M0

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm test
pnpm spike:mcp
pnpm spike:process
pnpm spike:crash
pnpm doctor
```

`doctor` returns exit code 2 when a prerequisite or Ollama is unavailable. Set `OLLAMA_BASE_URL` to an HTTP(S) origin, e.g. `http://127.0.0.1:11435`. If a proxy requires a bearer token, supply `OLLAMA_API_KEY` through your existing local secret mechanism; never commit it or paste it into a report.

`pnpm spike:ollama qwen3:8b gpt-oss:20b` runs one synthetic tool-call round-trip per installed model, sequentially, at 8K context. It sends no repository content and does not execute model-provided code. This is a protocol/latency smoke check, not a coding-quality benchmark. Metrics go to stdout; model output and credentials do not.

`pnpm eval:coding qwen3:8b gpt-oss:20b` runs ten isolated TypeScript bug fixtures with a bounded read/write/test/finish tool loop and hidden tests. It is an M0 model comparison, not the production agent or the later end-to-end repository acceptance suite.

Set `M0_EVAL_CASE` to a fixture id printed in the report to rerun one fixture. Failed runs include the final fixture source and sanitized test output so a failure can be diagnosed; repository files and credentials are never included.

`pnpm discover:repo /absolute/path/to/repo` prints a small read-only inventory for M0. It lists convention files and package script names, not script bodies or secrets. Review conventions directly on the Mac before registering any execution profile.

For M1, run the daemon and stdio bridge separately with the same uncommitted `LOCAL_AGENT_IPC_TOKEN` (at least 32 characters). `pnpm m1:smoke` verifies authenticated loopback IPC and bridge disconnect with the fake provider. Setting `M1_LIVE_OLLAMA=1`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, and an allowlisted `OLLAMA_MODEL` runs the same smoke through Ollama; keep credentials in the existing local secret mechanism.

The Windows process spike uses `taskkill /T /F` on its own disposable fixture. macOS uses a POSIX process group. These only test cancellation while the fixture parent exists, not crash orphan containment or sandbox security.

## Documents

- [Contributor and agent guide](AGENTS.md)
- [Current project architecture](docs/architecture.md)
- [Spec Kit development workflow](docs/development-workflow.md)
- [Project memories](docs/memories/README.md)
- [Source structure and refactor validation](docs/source-structure.md)
- [M0 Spec Kit documentation](specs/002-m0-foundation/spec.md)
- [M1 Spec Kit documentation](specs/003-m1-task-backbone/spec.md)
- [Host bootstrap and workspace trust specification](specs/006-host-bootstrap-workspace-trust/spec.md)
- [Technical plan](docs/technical-plan.md)
- [M0 evidence and remaining gates](docs/m0-status.md)
- [M1 task-backbone status](docs/m1-status.md)
- [M2 exploration status](docs/m2-status.md)
- [Cursor Windows integration evidence](docs/cursor-windows-m0.md)
- [Run locally on Mac without SSH](docs/mac-m0-runbook.md)
- [Dependency and process decisions](docs/adr/0001-m0-decisions.md)

GitHub Actions includes a Windows/macOS workflow, but no remote has been created and no CI run has been claimed. Node 26 installed on the current PC was left unchanged; Windows checks used a separately downloaded Node 22 executable verified against the official SHA-256 manifest.

Cursor 3.20.21 on Windows has now passed the actual MCP echo test. This PC has an enabled project-scoped `.cursor/mcp.json` using the copied Node 22 runtime in `.local/node22/`; both are excluded from Git and bundles. See the evidence document above. macOS validation is still pending.

The planned `qwen3-coder:30b` model was tested on the RTX 5060 Ti 16GB PC on 18 September 2026. It passes the 8K tool protocol smoke test, but Ollama offloads about 25% to CPU and it passed only 1/2 coding fixtures (the failed fixture reproduced). Keep `qwen3:8b` as the provisional worker until the wider evaluation.
