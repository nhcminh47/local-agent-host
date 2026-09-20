# Change: Project guidance, architecture and memory workflow

**Date**: 2026-09-20
**Related spec/tasks**: [Guidance spec](../../specs/004-project-guidance/spec.md), [tasks](../../specs/004-project-guidance/tasks.md)
**Status**: Completed; documentation checks passed.

## Request and scope

Expand AGENTS.md with project/design context, coding and folder rules, GitHub Spec Kit workflow, project memories and quick documentation-first navigation. Create a project architecture document. This task changes documentation only.

## Changes and decisions

- AGENTS.md is the concise entry point; detailed architecture and workflow are linked documents.
- Reading starts with the memory index, relevant design/spec/status sections and targeted source. A whole-codebase search is not the default.
- Every change task needs a relevant specification, plan and tasks before implementation; artifact detail scales with task size.
- Project memories live in `docs/memories/`, with an index, template and dated evidence/decision records.
- Architecture describes implemented runtime behavior, including provider-mode differences, snapshot identity, lease ownership and result limitations. Roadmap capabilities are identified as future work.
- Original toolchain, credential, process and evidence constraints remain. The M2 gate is explicitly a product-capability restriction, not a ban on authorized host maintenance/tests.

## Observed validation

Spec Kit's installed plan setup script ran before the guidance edits. Final review checked **11 documents and 79 local links**. Required guide sections, preserved conventions, source references, Spec Kit artifact prerequisites and `git diff --check` passed on Windows. The spec, plan and tasks were reviewed for consistency with the delivered documents and current capability boundary.

Runtime tests are not required or rerun for this documentation-only change. The prior 90-test result is historical and recorded in the [source-organization memory](2026-09-20-source-organization.md).

## Assumptions and remaining work

“gh speckit” is interpreted as GitHub Spec Kit; its CLI is `specify`, not a GitHub CLI subcommand. Local scaffolding is not assumed to exist on other machines. This task does not install a root framework or close any runtime/platform gate.

## Related context

[AGENTS.md](../../AGENTS.md) · [Architecture](../architecture.md) · [Workflow](../development-workflow.md) · [Memory index](README.md)
