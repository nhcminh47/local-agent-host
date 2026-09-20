# Project guide for contributors and agents

## Project

`local-agent-host` is a single-package TypeScript MCP host. A client such as Cursor delegates durable tasks through a small stdio bridge to a separate daemon. The daemon owns task state, repository access and a bounded Ollama tool loop.

**Current product scope: M2 read-only repository exploration.** Tasks inspect filtered committed Git snapshots and return grounded findings. Production repository mutation, worktree editing and model-invoked arbitrary commands or tests remain gated future capabilities. This restriction does not prohibit authorized maintenance of this host repository or its developer regression tests.

## Read first; search narrowly

1. Read this file and the short [memory index](docs/memories/README.md); select only records relevant to the task.
2. Read [current architecture](docs/architecture.md) and consult the [source map](docs/source-structure.md) for module ownership.
3. Read the relevant specification, plan and tasks, using the routing table below, then the applicable status/runbook sections.
4. Open the identified source files and their tests. Use scoped `rg` searches for unresolved symbols or behavior; expand the search only when the relevant documents/modules do not answer the question.

Do not start by reading every source file, every historical report or all memories. Documentation is a navigation aid, not proof of implementation: verify the affected code before changing behavior. Correct stale documentation when discovered.

| Task area | Start here |
| --- | --- |
| Compatibility probes and model fixtures | [M0 spec](specs/002-m0-foundation/spec.md), [M0 evidence](docs/m0-status.md) |
| MCP, IPC, tasks, leases and persistence | [M1 spec](specs/003-m1-task-backbone/spec.md), [M1 evidence](docs/m1-status.md) |
| Snapshot exploration, findings and quality | [M2 spec](specs/001-m2-quality-gate/spec.md), [M2 status](docs/m2-status.md), [explorer runbook](docs/explorer-runbook.md) |
| Contributor workflow and project memory | [workflow](docs/development-workflow.md), [guidance spec](specs/004-project-guidance/spec.md) |
| Future capabilities | [technical roadmap](docs/technical-plan.md); distinguish planned design from implemented architecture |

## High-level design

- **Runtime adapters** (`src/runtime/`) validate/forward MCP requests and expose authenticated loopback HTTP. The bridge owns no durable task state.
- **Domain and services** (`src/domain/`, `src/service/`) define contracts, admission, scheduling, budgets, cancellation and result publication.
- **Persistence** (`src/store/`) owns SQLite task/event transactions, idempotency, deadlines and fenced leases.
- **Exploration** (`src/exploration/`) owns registered repositories, immutable snapshots, scope, filtering, read/search and capability choices.
- **Providers** (`src/provider/`) perform bounded inference. The host validates and dispatches model tool requests; the provider does not execute them.
- **Diagnostics/evaluation** (`src/diagnostics/`, `src/evaluation/`) verify compatibility and quality separately from production entry points.

See [architecture](docs/architecture.md) for execution flow, trust boundaries and known limitations.

## Coding conventions

- Target Node **22.23.2**, TypeScript **strict/ESM** and pnpm **11.7.0**. Keep dependency versions pinned; update the lockfile with intentional dependency changes and include it when committing is requested.
- Use explicit types at boundaries, `unknown` plus validation for external data, and existing strict Zod contracts. Preserve schema versions, error identifiers and persisted/wire compatibility unless the spec explicitly changes them.
- Use `.js` extensions for relative ESM imports, `import type` for type-only dependencies, kebab-case filenames, PascalCase types/classes and camelCase functions/variables. Follow nearby formatting.
- Keep entry points thin and functions focused. Extract concrete reused behavior; keep domain-specific logic with its owner. Avoid duplicate `common`, `helpers` and `utils` catch-all layers or speculative abstractions.
- Put stable errors, configuration messages and HTTP statuses in `src/constants/`; named system/repair prompts in `src/prompts/`. Domain state and schema constants stay with their domain when that preserves ownership. Treat prompt changes as behavior changes requiring applicable regressions and qualification review.
- Use Node filesystem APIs and executable/argument arrays for process work; no model-generated shell strings. Bound subprocess lifetime/output, propagate cancellation and use `windowsHide` for background processes.
- Preserve atomic task/event publication, lease fencing, snapshot identity, scope and budget enforcement. Never relax them to make a test or model response pass.
- MCP stdout is protocol-only; diagnostics use stderr. Do not serialize raw provider errors, request bodies or credential-bearing URLs into public errors.

## Folder conventions

- Reuse the owning directory in the [source map](docs/source-structure.md) before creating a new folder.
- Name folders by responsibility, not milestones: do not recreate `src/m0`, `src/m1`, `src/m2`, or equivalent milestone folders elsewhere under `src`. Milestone labels may remain in specs, evidence and existing package commands.
- `shared/` is for reused application/protocol helpers; `utils/` is for small general helpers without runtime/service dependencies. Avoid importing startup entry points for helper reuse.
- Keep tests in `tests/`, developer harnesses in `scripts/`, design/runbooks in `docs/`, feature artifacts in `specs/`, and dated project changes in `docs/memories/`.
- Create a subfolder only for a cohesive responsibility with a clear owner. Add its purpose to the source map; update architecture for boundary changes. Update imports, scripts, examples and documented launch paths when moving code; remove empty folders and obsolete forwarding wrappers.
- Generated builds belong in ignored `dist/`; local endpoint configuration and raw machine-specific reports belong in ignored `.local/`. Never put them in project memories.

## Required task workflow

Follow [GitHub Spec Kit workflow](docs/development-workflow.md) **before implementing every change task**:

1. Read the relevant docs/memories/spec and inspect only enough source to establish scope.
2. Create or update the specification, acceptance criteria, plan and ordered tasks. Use `speckit.specify` → `speckit.clarify` when needed → `speckit.plan` → `speckit.tasks` → `speckit.analyze` before implementation. Scale artifact detail to the task; small changes can extend an existing package.
3. Implement the scoped tasks, validate appropriately, then update task checkboxes and affected architecture/status/runbook documents.
4. Add a dated [project memory](docs/memories/README.md) recording decisions, changed areas, observed validation and open work; add it to the index. Report what changed and any unverified limits.

Spec Kit commands are agent workflows, not invented `gh speckit` shell subcommands. Use installed CLI/templates and report actual tool execution accurately. Do not overwrite project instructions or initialize branches merely to scaffold documentation.

## Validation and boundaries

- After relevant code changes run `pnpm check` and `pnpm test`. Run `pnpm spike:mcp` and `pnpm spike:process` when their compatibility areas change, `pnpm m1:smoke` for IPC/bridge lifecycle changes, and the applicable explorer checks for exploration changes.
- For documentation-only work, verify links, source references, consistency and diff whitespace; state that runtime tests were not rerun.
- Never inspect or log plaintext credentials. Use existing secret mechanisms without exposing values. Do not add arbitrary command tools, download models, change firewalls, or automatically merge or push. Worktrees are not security sandboxes.
- Record observed evidence separately from assumptions in the relevant milestone status and memory. Compatibility evidence belongs in `docs/m0-status.md`; task/explorer evidence also belongs in its corresponding status document.
- Windows success is not macOS or Cursor success. A deterministic fixture pass is not live inference qualification, semantic correctness or completion of a future gate. Preserve open gates until their required evidence exists.
