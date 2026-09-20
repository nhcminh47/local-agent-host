# Development workflow

This project uses GitHub Spec Kit to establish scope and acceptance criteria before changes. Read [AGENTS.md](../AGENTS.md) first. The workflow applies to code, refactors, configuration and documentation changes; an informational answer or read-only investigation does not require a new feature package.

## 1. Load the smallest useful context

Read the [memory index](memories/README.md), [architecture](architecture.md), [source map](source-structure.md), then the relevant spec/plan/tasks and status sections. Use their module paths to inspect source and tests. Search those paths first; broaden only for a specific unresolved dependency. Do not load the whole codebase or entire historical evidence archive by default.

Existing packages:

| Package | Scope |
| --- | --- |
| [001-m2-quality-gate](../specs/001-m2-quality-gate/spec.md) | Structured findings and exploration quality |
| [002-m0-foundation](../specs/002-m0-foundation/spec.md) | Compatibility probes and restricted model evaluation |
| [003-m1-task-backbone](../specs/003-m1-task-backbone/spec.md) | Durable tasks and authenticated reconnectable bridge |
| [004-project-guidance](../specs/004-project-guidance/spec.md) | Contributor guidance, architecture and memories |

Numbers are package identifiers, not milestone chronology. Reuse an existing package when its scope matches. For a distinct feature, choose the next unused number and a short kebab-case name; do not create milestone-named source folders.

## 2. Use Spec Kit before implementation

| Phase | Required output |
| --- | --- |
| `speckit.specify` | User outcome, scope/non-goals, requirements, acceptance scenarios and measurable success criteria in `spec.md` |
| `speckit.clarify` | Resolve material ambiguity; record safe assumptions and ask only questions needed to proceed |
| `speckit.plan` | Affected modules, constraints, design, migration/compatibility considerations and validation in `plan.md` |
| `speckit.tasks` | Ordered, traceable tasks with file ownership and verification in `tasks.md` |
| `speckit.analyze` | Check agreement between requirements, plan, tasks, contracts and current capability gates |
| `speckit.implement` | Execute scoped tasks and maintain truthful completion/evidence records |

These names identify Spec Kit agent commands/workflows. Invoke the integration available to the current agent, or follow its installed command guidance and templates. They are not standalone subcommands of the GitHub `gh` CLI. Do not claim that writing a document automatically executed a command or test.

Before editing implementation, the applicable specification, plan and task list must be concrete enough to review. A small fix or documentation task can add a short scoped section/task to an existing package. New behavior or changed public/persisted contracts generally needs research, data-model and contract artifacts as well. Use checklists where they make acceptance clearer; do not copy unfilled templates or introduce unrelated work.

## Spec Kit setup in this repository

At the time of this change, Spec Kit CLI **0.14.2** is installed on the current Windows host, but there is no tracked root `.specify/` directory. Shared milestone templates and scripts were initialized under ignored `.local/speckit-m0-m1/`. This is local tooling, not a prerequisite assumed to exist on every contributor machine.

Check the installed `specify --version` and `specify init --help` before using its setup options. Prefer a connected agent integration if already configured. When none is configured, initialize a fresh directory under `.local/` using the installed CLI and its documented generic-agent option. The session used the equivalent executable/argument array:

```text
executable: specify
arguments:
  init
  .local/speckit-workflow
  --integration
  generic
  --integration-options=--commands-dir .agent/commands/
  --script
  py
  --ignore-agent-tools
```

Use a fresh destination; do not force-overwrite existing scaffolding. Read the generated command guidance and templates. For the bundled Python scripts, set `SPECIFY_INIT_DIR` to that staging directory and `SPECIFY_FEATURE_DIRECTORY` to the intended absolute `specs/<package>` directory. `setup_plan.py --json` creates the plan template; `check_prerequisites.py --json --require-tasks --include-tasks` checks artifact presence. Neither script writes the full design or proves implementation correctness; the agent must populate and review the documents.

Keep generated machine-specific feature pointers local. Do not create branches, replace AGENTS.md or introduce a root constitution as a side effect of setup. Existing project rules remain authoritative. If the CLI is unavailable, report that fact and use the checked-in spec/plan/task structure to prepare the task; do not invent CLI success. Establish the required tooling before claiming a Spec Kit command has run.

## 3. Implement within the approved task scope

Follow folder ownership and coding conventions from AGENTS.md. Preserve the user's existing changes. Record any necessary design adjustment in the spec/plan before expanding implementation. Treat prompt, public schema and persistence changes as behavior changes, even when they occupy only a few lines.

M2's read-only restriction governs tools exposed by the product. Authorized maintenance of this host and its deterministic developer tests remain allowed. The workflow does not authorize adding repository-editing, arbitrary-command or production test-execution tools ahead of their gates.

## 4. Verify and record evidence

| Change | Verification |
| --- | --- |
| TypeScript/runtime code | `pnpm check`, `pnpm test` with pinned toolchain |
| MCP compatibility | Also `pnpm spike:mcp` |
| Process compatibility | Also `pnpm spike:process` |
| IPC/bridge lifecycle | Also `pnpm m1:smoke` using the fake provider by default |
| Explorer behavior | Relevant deterministic regressions and `pnpm m2:smoke:mcp` as appropriate; document whether live quality must be requalified |
| Documentation only | Links, source-path references, content consistency, preserved constraints and `git diff --check` |

Do not automatically run live inference or real-repository acceptance because a documentation file changed. Use existing private configuration for authorized live runs; keep raw reports in `.local/`. Distinguish tests run now from linked historical evidence, and identify the actual platform/client. A Spec Kit prerequisite check confirms artifact presence, not runtime acceptance.

## 5. Close the task with project memory

Update completed task checkboxes only after the work/check passes. Update architecture, source map, runbooks and milestone status when affected. Create a dated memory using [the template](memories/TEMPLATE.md) and add a one-line index entry. Include changes, rationale, scope limits, observed checks and remaining work.

Memories are a searchable project history; current architecture/specs remain the source of current design. Link to earlier decisions rather than duplicating entire reports. Preserve historical facts and add a superseding record when a decision changes. End the user-facing report with the concrete result and any material verification limits, without claiming open gates are closed.
