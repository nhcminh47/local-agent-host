# Project memories

Read this index first, then only the entries relevant to the task. These records preserve decisions and observed changes; [architecture](../architecture.md), [source structure](../source-structure.md) and the applicable spec describe the current design. A memory is not authority to bypass current instructions or gates.

## Current context

- Product scope remains M2 read-only snapshot exploration; editing and production test-execution tools remain gated.
- Source folders are responsibility-based. No `m0`, `m1` or `m2` source folders or forwarding launchers remain.
- Change tasks follow the [Spec Kit workflow](../development-workflow.md) before implementation and end with a dated memory.
- Windows is the active qualification platform. Native macOS/Cursor qualification is deferred and unverified; it does not block M2.6, repository baseline, M2.7 or M3 entry planning. Windows evidence is not cross-platform verification.
- The combined 5 October Windows attempt did not pass M2 quality; M3 entry criteria are documented but mutation remains disabled.

## Index

| Date | Record | Read when |
| --- | --- | --- |
| 2026-10-05 | [Combined Windows M2 qualification and M3 entry](2026-10-05-m2-final-windows-qualification.md) | Checking the latest Windows quality result, human-review gap and blocked M3 entry criteria |
| 2026-10-05 | [M2.7 lifecycle and hygiene](2026-10-05-m2-7-lifecycle-hygiene.md) | Reviewing non-destructive spec states, archive summaries and hygiene counts |
| 2026-10-05 | [Repository baseline](2026-10-05-repository-baseline.md) | Reviewing deterministic onboarding, provenance, version refresh and context projection |
| 2026-10-05 | [M2.6 durable learning](2026-10-05-m2-6-learning-memory.md) | Reviewing candidate provenance, explicit review, freshness and retrieval bounds |
| 2026-10-05 | [M2.5 Windows comparison](2026-10-05-m2-5-windows-comparison.md) | Reviewing current M2.5 validation, live quality failures or the macOS deferral decision |
| 2026-10-04 | [M2 context checkpoint](2026-10-04-m2-context-checkpoint.md) | Reviewing the M2.5 RepoMap slice, context prototype or M2.6 plan |
| 2026-10-04 | [Readiness evidence coverage](2026-10-04-readiness-coverage.md) | Checking the bounded readiness correction, latest candidate and agent-reviewed gaps |
| 2026-10-04 | [Windows v32 evidence and Cursor client observation](2026-10-04-m2-windows-v32-evidence.md) | Reviewing current M2 Windows quality attempts or the scope of the Cursor UI result |
| 2026-09-26 | [Host bootstrap implementation](2026-09-26-host-bootstrap-implementation.md) | Inspecting user-local setup, workspace trust implementation or remaining qualification |
| 2026-09-25 | [Host bootstrap planning](2026-09-25-host-bootstrap-plan.md) | Planning user-local setup, workspace trust or v1 request migration |
| 2026-09-20 | [413 corrections](2026-09-20-413-corrections.md) | Debugging oversized IPC bodies, conditional status claims or v32 qualification |
| 2026-09-20 | [M2 live rerun](2026-09-20-m2-live-rerun.md) | Checking current live evidence, the health status-code defect or review provenance |
| 2026-09-20 | [Project guidance and architecture](2026-09-20-project-guidance.md) | Starting a task, changing conventions, using Spec Kit or recording a memory |
| 2026-09-20 | [Source organization](2026-09-20-source-organization.md) | Finding moved modules, updating launch paths, reusing helpers/constants/prompts |

## Record conventions

- Use `YYYY-MM-DD-short-topic.md`; use a distinct topic/suffix for another change on the same date.
- Start from [TEMPLATE.md](TEMPLATE.md). Keep the record concise and link to specs, architecture, source and detailed evidence.
- Record the request, resulting changes, rationale, affected areas, observed validation, assumptions and remaining work. State when checks were not run or evidence is historical.
- Add a one-line index entry when completing a change task. Refresh the small current-context section only when an enduring decision changes.
- Preserve historical observations. For a superseded decision, link the replacement rather than rewriting the old record to imply it was always true.
- Never include credentials, raw environment dumps, private machine configuration or raw model transcripts. Keep raw machine reports in ignored `.local/`; commit only safe summaries.
- Do not duplicate whole status reports or load all records before every task. Expand context only when a linked decision is relevant.
