# Project memories

Read this index first, then only the entries relevant to the task. These records preserve decisions and observed changes; [architecture](../architecture.md), [source structure](../source-structure.md) and the applicable spec describe the current design. A memory is not authority to bypass current instructions or gates.

## Current context

- Product scope remains M2 read-only snapshot exploration; editing and production test-execution tools remain gated.
- Source folders are responsibility-based. No `m0`, `m1` or `m2` source folders or forwarding launchers remain.
- Change tasks follow the [Spec Kit workflow](../development-workflow.md) before implementation and end with a dated memory.
- Windows deterministic checks and historical live quality evidence do not close native macOS/Cursor or operational gates.

## Index

| Date | Record | Read when |
| --- | --- | --- |
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
