# Working conventions

- This repository is in M2 read-only exploration. Do not add repository mutation, worktree editing, arbitrary commands, or test execution until their later gates pass.
- Target Node 22.23.2, TypeScript strict/ESM and pnpm 11.7.0. Keep dependencies pinned and commit the lockfile when committing is requested.
- Use Node filesystem APIs and executable/argument arrays; no model-generated shell strings.
- Never inspect or log plaintext credentials. Local endpoint configuration and raw machine-specific reports belong in ignored `.local/`.
- Worktrees are not security sandboxes. No arbitrary command tool, model download, firewall changes, automatic merges or pushes.
- MCP stdout is protocol-only. Diagnostics use stderr.
- Run `pnpm check` and `pnpm test` after relevant changes. Run `pnpm spike:mcp` and `pnpm spike:process` for the respective M0 compatibility gates.
- Record observed evidence separately from assumptions in `docs/m0-status.md`. Windows success must not be reported as macOS or Cursor success.
