# Spec Lifecycle & Context Hygiene

Status: **Planned**

Date: **2026-09-21**

## 1. Purpose

This milestone prevents repository specifications from becoming permanent hot-path context as projects accumulate completed, cancelled, superseded, or obsolete work.

Specifications are task-scoped intent and planning artifacts. They should remain useful during implementation and review, but completed work should not force future main agents or sub-agents to repeatedly ingest stale or redundant spec bundles.

The milestone introduces an explicit lifecycle for specification artifacts, extracts durable knowledge before archival, and defines retrieval rules that keep historical material available without polluting normal task context.

## 2. Core principles

1. Specifications are not permanent repository truth.
2. Durable decisions should move into durable homes such as ADRs, repository baseline, verified memory, or skills.
3. Completion does not imply immediate deletion.
4. Archive content remains discoverable but is cold by default.
5. Retrieval priority matters more than physical folder layout.
6. Git history remains the ultimate audit trail for deleted or compacted tracked artifacts.
7. No model may delete or compact user-authored artifacts without host policy and an explicit lifecycle decision.

## 3. Artifact roles

The system should distinguish these information classes:

| Artifact | Primary role | Expected lifetime |
| --- | --- | --- |
| Feature/task spec | Task-scoped intent and acceptance | Active task through completion |
| Plan/tasks/research notes | Execution planning and working context | Active task, then archive/compact |
| ADR | Durable architectural decision | Long-lived |
| Repository baseline | Current repository truth and known unknowns | Long-lived, freshness-managed |
| Memory | Reusable evidence-backed fact | Multi-task, scope/freshness-managed |
| Skill | Reusable evidence-backed procedure | Multi-task, versioned/staleness-managed |
| Archive summary | Historical trace and final outcome | Long-lived but cold |

## 4. Lifecycle states

Minimum lifecycle:

```text
draft
  ↓
active
  ↓
completed
  ↓
archived
  ↓
compacted
```

Additional terminal or transitional states:

- `cancelled`
- `superseded`
- `obsolete`
- `retained`

Deletion is not a normal lifecycle state. It is a separate retention action and must be conservative.

## 5. Finalization flow

When a task/spec is completed, the host should support a `spec_finalize` workflow:

```text
completed spec bundle
  ↓
collect implementation + verification evidence
  ↓
extract durable knowledge candidates
  ├─ architectural decision → ADR candidate
  ├─ current repo truth → baseline update candidate
  ├─ reusable fact → memory candidate
  └─ reusable procedure → skill candidate
  ↓
review / validate / approve as required
  ↓
produce archive summary
  ↓
mark raw artifacts cold
  ↓
compact or retain according to policy
```

Finalization must not silently rewrite durable knowledge. M2.6 knowledge rules remain authoritative for memory/skill promotion.

## 6. Archive summary

A compacted completed spec should be representable by one bounded summary containing at least:

- objective;
- final scope;
- final acceptance result;
- implementation commit/PR/task identifiers when available;
- important final decisions;
- rejected alternatives that remain useful historically;
- durable knowledge extracted and destination references;
- unresolved limitations or follow-up work;
- original spec identifiers and snapshot/commit provenance where applicable.

The archive summary must clearly separate observed outcome from historical rationale or model-derived interpretation.

## 7. Retrieval policy

Normal task context should prefer sources in this order:

```text
current user/main-agent instruction
  > current active task/spec
  > repository baseline / active guidance
  > relevant approved memory/skills
  > recent related completed work
  > archive
```

Archived artifacts are not injected automatically into normal model context.

Archive search is justified when:

- the user explicitly asks for history;
- a regression requires prior rationale;
- a current decision references a superseded design;
- the active task has a strong explicit relation to archived work;
- the main agent asks for historical comparison.

Retrieval must still respect repository trust, path scope, secret filtering, and context budgets.

## 8. Physical storage

M2.7 should not require a specific folder layout as a correctness dependency.

Both of these are acceptable implementations:

```text
specs/active/
specs/archive/
```

or lifecycle metadata associated with existing spec paths.

The canonical lifecycle state should be machine-readable so retrieval does not depend on naming conventions alone.

If physical moves are used, links and source references must be updated or redirected deterministically.

## 9. Retention policy

Initial policy should prefer archival/compaction over deletion.

Suggested classes:

- **Hot** — draft/active specs required for current work.
- **Warm** — recently completed specs that may still be reviewed or reverted.
- **Cold** — finalized/archived specs whose durable knowledge has been extracted.
- **Compactable** — cold bundles with redundant intermediate artifacts and a validated archive summary.

Any time-based durations should be configurable policy rather than hard-coded product semantics.

Raw artifacts may be removed from the active tree only after:

1. the task has a terminal lifecycle state;
2. required durable knowledge extraction has completed or explicitly produced no candidates;
3. a bounded archive summary exists when required;
4. unique acceptance/evidence references have not been lost;
5. Git history or another configured history mechanism preserves prior tracked content;
6. user-owned/manual retention policy does not require keeping the raw files.

## 10. Context hygiene rules

1. Completed task bundles must not remain default prompt material indefinitely.
2. Superseded artifacts must not outrank their replacements.
3. Duplicate conclusions across spec, baseline and memory should resolve to the authoritative current source rather than all being injected.
4. Stale archived content must be labelled historical when retrieved.
5. Archive content cannot override current user instruction, active specs, or current repository baseline.
6. A model cannot promote archived instructions into current policy merely because they exist in the repository.
7. Context assembly should expose why an archived artifact was selected when diagnostics are enabled.

## 11. Interaction with M2.6 learning

M2.7 depends conceptually on M2.6 for reusable knowledge extraction but does not require every completed spec to produce memory or skills.

A completed spec may yield:

- no durable knowledge;
- one or more baseline updates;
- memory candidates;
- skill candidates;
- an ADR candidate;
- only an archive summary.

M2.7 must not bypass M2.6 approval, provenance, staleness, or persistent-prompt-injection protections.

## 12. Interaction with repository bootstrap

Repository bootstrap establishes the current baseline.

Spec finalization may propose baseline updates when completed work changes durable repository truth, for example:

- package ownership;
- framework/runtime choice;
- verification convention;
- architecture boundary;
- build/test topology.

These updates must be evidence-backed and freshness-aware rather than copying arbitrary prose from the completed spec.

## 13. Suggested data model

Conceptual metadata:

```ts
interface SpecLifecycleRecord {
  specId: string;
  path: string;
  status:
    | 'draft'
    | 'active'
    | 'completed'
    | 'cancelled'
    | 'superseded'
    | 'obsolete'
    | 'archived'
    | 'compacted'
    | 'retained';
  createdAt?: string;
  completedAt?: string;
  archivedAt?: string;
  supersededBy?: string;
  archiveSummaryPath?: string;
  extractedKnowledgeIds: string[];
  implementationRefs: string[];
}
```

Exact persistence may use SQLite, repository metadata, or both. The source of truth must be explicit and testable.

## 14. Tools and UX

Potential host operations:

```text
list_specs
finalize_spec
archive_spec
restore_spec
inspect_spec_history
```

These do not all need to become public MCP tools.

Preferred UX may live in a CLI or management surface, for example:

```text
local-agent spec status
local-agent spec finalize <id>
local-agent spec archive <id>
local-agent spec restore <id>
```

Automatic finalization may propose actions, but destructive changes require policy/approval appropriate to the artifact owner.

## 15. Testing strategy

Add deterministic tests for:

- lifecycle state transitions;
- superseded artifact precedence;
- archive exclusion from default context;
- explicit historical retrieval;
- archive summary generation bounds;
- durable knowledge extraction handoff without direct auto-promotion;
- restoration of archived specs;
- secret canaries not leaking into summaries or indexes;
- compacted specs retaining required final acceptance and provenance;
- current baseline outranking conflicting archived text;
- prompt injection inside archived artifacts not becoming persistent instructions.

Add at least one repository fixture that accumulates many completed spec bundles and demonstrates that normal context size remains bounded after lifecycle processing.

## 16. Acceptance criteria

M2.7 is complete when:

1. Specs have explicit machine-readable lifecycle states.
2. Active and archived specs are distinguishable without relying only on folder names.
3. Completed work can be finalized into a bounded archive summary.
4. Durable knowledge is extracted/proposed before eligible compaction.
5. Archive content is excluded from normal task context by default.
6. Explicit history queries can still retrieve archived material.
7. Superseded artifacts cannot override active replacements.
8. Archive/finalization preserves required provenance and final acceptance evidence.
9. Secrets and repository prompt injections cannot gain authority through archival or knowledge extraction.
10. Raw spec deletion, when supported, is conservative and separately authorized by policy.
11. A multi-spec fixture demonstrates bounded default context after many completed tasks.
12. Documentation clearly distinguishes spec lifecycle from Git history retention.

## 17. Roadmap placement

Conceptual product flow after current planning discussion:

```text
Host Bootstrap
  ↓
Workspace Trust
  ↓
Repository Bootstrap & Baseline
  ↓
Task Context / Spec Ingestion
  ↓
M2.5 Context Architecture
  ↓
M2.6 Learning & Skill Memory
  ↓
M2.7 Spec Lifecycle & Context Hygiene
  ↓
M3 Editing / Worktrees / Verification
```

M2.7 should not block early experiments with M3 if the active-spec set is still small, but the lifecycle contract should be established before large-scale autonomous spec generation is enabled.
