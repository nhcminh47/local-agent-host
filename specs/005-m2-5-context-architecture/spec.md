# M2.5 Context Architecture

Status: **Planned**

Date: **2026-09-21**

## 1. Purpose

M2.5 strengthens context quality and inference efficiency before M3 introduces repository editing, worktrees, command execution, and verification profiles.

The current M2 explorer is intentionally safe and bounded, but it still relies primarily on a growing chat transcript of user input, model messages, tool calls, tool results, and repair prompts. That is acceptable for read-only qualification; it should not become the long-term context model for an implementation agent that may explore, edit, test, repair, and verify over a longer task.

M2.5 therefore introduces four host-owned capabilities:

1. deterministic repository maps;
2. structured working memory;
3. bounded context compaction;
4. cleaner inference-provider abstraction.

M2.5 must preserve the existing trust model: the model does not gain direct filesystem, process, Git mutation, network, policy, or budget authority.

## 2. Goals

### G1. Give the model a deterministic repository orientation artifact

The host should derive a compact `RepoMap` from the admitted immutable snapshot rather than requiring the model to discover basic repository structure from repeated `list_files` calls.

The initial map should prefer deterministic and cheap signals such as:

- repository/package roots;
- workspace manifests;
- package names and package-manager metadata;
- likely entry points;
- TypeScript/JavaScript configuration files;
- test roots and test-runner configuration;
- important framework/configuration files;
- script names without exposing secret-bearing script bodies by default;
- bounded import/dependency edges when they can be derived safely and cheaply;
- snapshot identity and scope identity.

The repository map is evidence for navigation, not proof of runtime behavior.

### G2. Introduce host-owned structured working memory

The explorer should maintain a structured summary of what has already been learned so that later turns do not require replaying all raw tool output.

The minimum working-memory model should be able to retain:

- grounded facts and their observed citations;
- candidate/relevant files;
- unavailable or out-of-scope paths;
- completed coverage topics;
- unresolved questions;
- important repository conventions discovered during exploration;
- bounded model/tool progress needed for continuation.

Working memory must be derived only from host-observed data and validated model output. It must not turn ungrounded model prose into trusted repository facts.

### G3. Compact context without losing provenance

The runtime should be able to replace older raw transcript/tool payloads with compact structured state when a bounded threshold is reached.

Compaction must:

- retain system/security/tool contracts;
- retain the task objective, question, path scope and snapshot identity;
- retain grounded facts with citation provenance;
- retain unresolved coverage requirements;
- retain only the recent raw interaction window needed for local continuity;
- never increase task/model/tool budgets;
- never silently rewrite the admitted snapshot or repository scope;
- remain deterministic enough to test without a live model.

Compaction is a host operation, not a model-requested capability.

### G4. Keep the explorer loop provider-neutral

The agent loop should depend on a small provider contract rather than Ollama request-shape details.

Ollama remains the first and only required live provider for this milestone. M2.5 should only make the boundary cleaner so a later provider can be added without changing exploration policy or tool dispatch.

The provider boundary should normalize:

- messages;
- tool schemas and tool calls;
- cancellation;
- model identity;
- bounded generation configuration;
- usage/latency metrics;
- transport/validation errors.

No additional provider implementation is required for M2.5 acceptance.

## 3. Non-goals

M2.5 does **not** add:

- repository editing tools;
- `implement_task`;
- `verify_task`;
- worktree creation or mutation;
- arbitrary shell or command execution;
- test execution against registered repositories;
- automatic commits, pushes, merges or pull requests;
- vector databases or embedding pipelines;
- full semantic code indexing;
- language-server integration;
- distributed scheduling or multiple active inference workers;
- automatic model installation or model routing;
- a second production inference provider.

These remain M3 or later work.

## 4. Architectural constraints

M2.5 must preserve the following existing guarantees:

1. MCP remains a thin task-level control plane.
2. The daemon owns durable task state and agent execution.
3. Analysis remains pinned to the immutable admitted Git snapshot.
4. Registered repository roots and path scope remain host-owned.
5. Model-provided paths and tool arguments remain validated before dispatch.
6. Secret filtering remains applied to model-bound and public result content.
7. The model cannot execute shell/process/filesystem operations directly.
8. Task deadlines and durable model/tool budgets remain authoritative in the store.
9. Successful completion remains grounded and host-validated.
10. Cursor/client reconnect must not require replaying the whole exploration transcript.

## 5. Proposed components

### 5.1 RepoMapBuilder

Suggested ownership:

```text
src/exploration/repo-map.ts
```

Conceptual output:

```ts
interface RepoMap {
  schemaVersion: 1;
  snapshotId: string;
  scopeHash?: string;
  packages: Array<{
    path: string;
    name?: string;
    manifest?: string;
  }>;
  entryPoints: string[];
  configFiles: string[];
  testRoots: string[];
  importantFiles: string[];
  scripts: Array<{
    packagePath: string;
    names: string[];
  }>;
  dependencyEdges: Array<{
    from: string;
    to: string;
    kind: 'workspace' | 'import';
  }>;
  truncated: boolean;
}
```

The exact contract may change during implementation, but the artifact must remain bounded, snapshot-derived, deterministic, and safe to send to the model.

Initial dependency extraction should be conservative. Do not build a complete AST index in this milestone.

### 5.2 AgentWorkingMemory

Suggested ownership:

```text
src/service/explorer-memory.ts
```

Conceptual model:

```ts
interface AgentWorkingMemory {
  schemaVersion: 1;
  snapshotId: string;
  facts: Array<{
    statement: string;
    citations: Array<{
      path: string;
      startLine: number;
      endLine: number;
    }>;
  }>;
  candidateFiles: string[];
  unavailablePaths: Array<{
    path: string;
    reason: 'outside_scope' | 'unavailable';
  }>;
  coveredTopics: string[];
  openQuestions: string[];
}
```

The host must validate and bound all memory fields. A statement without admissible evidence must not become a trusted `fact`.

### 5.3 ContextAssembler / ContextCompactor

Suggested ownership:

```text
src/service/explorer-context.ts
```

The current explorer loop should stop owning all prompt-history decisions directly.

A context layer should assemble model input from:

```text
system contract
+ task request
+ RepoMap
+ AgentWorkingMemory
+ recent interaction window
+ current repair/coverage instruction
```

Compaction should occur before the existing hard context failure where possible.

The current hard byte cap remains a fail-closed final guard. M2.5 must not simply raise the cap to avoid implementing compaction.

### 5.4 Provider boundary cleanup

Keep an agent-facing interface similar to:

```ts
interface InferenceProvider {
  readonly modelName: string;
  chat(request: InferenceRequest, signal: AbortSignal): Promise<InferenceResponse>;
}
```

Ollama-specific fields such as `/api/chat`, `keep_alive`, `num_ctx`, `num_predict` and Ollama response parsing should remain inside the Ollama adapter.

Do not introduce a framework abstraction layer or plugin system just to satisfy this milestone.

## 6. Context lifecycle

Expected exploration lifecycle after M2.5:

```text
admit task
  ↓
restore immutable snapshot
  ↓
build/load RepoMap
  ↓
initialize WorkingMemory
  ↓
assemble bounded context
  ↓
model tool request
  ↓
host validates and executes tool
  ↓
record observed evidence
  ↓
update WorkingMemory
  ↓
compact old raw context when threshold reached
  ↓
repeat
  ↓
host validates finish_analysis
```

The repository map and memory belong to the admitted snapshot. They must not be reused against a different snapshot identity unless rebuilt or explicitly proven snapshot-independent.

## 7. Persistence strategy

M2.5 should avoid making raw model transcript persistence a correctness dependency.

Durable state required for restart/reconnect should prefer compact structured data:

- snapshot identity already persisted by M2;
- durable task/model/tool budgets already persisted by M2;
- working-memory checkpoint when needed for resumability;
- repository-map cache keyed by snapshot/scope identity when useful.

Large raw tool outputs should not be persisted indefinitely by default.

If working memory is persisted, schema versioning and strict validation are required. Corrupt/incompatible memory should fail closed or be safely rebuilt from admissible state; it must not silently become trusted context.

## 8. Budget and size limits

Implementation must define explicit host limits for at least:

- RepoMap serialized bytes;
- package count;
- entry/config/test path counts;
- dependency-edge count;
- fact count;
- citations per fact;
- candidate-file count;
- open-question count;
- recent raw-message window;
- compacted prompt byte target.

Limits should be constants with deterministic tests.

M2.5 does not change request-level task budgets or allow a model to increase them.

## 9. Security requirements

1. RepoMap generation must operate only on eligible files from the admitted snapshot.
2. Denied paths and out-of-scope paths must not leak into model context through the map.
3. Secret filtering must apply before map/memory content reaches inference or public diagnostics.
4. Package scripts should expose names only by default; do not automatically place arbitrary script bodies/commands into model context.
5. Import/dependency extraction must not execute repository code, package scripts, build tools or hooks.
6. Context compaction must not turn model claims into trusted facts without observed evidence.
7. Provider cleanup must not widen network destinations or redirect policy.
8. No model-generated shell text may be executed.

## 10. Testing strategy

### Deterministic unit tests

Add tests for:

- repo-map generation from fixture snapshots;
- path scope filtering in RepoMap;
- map size/count truncation;
- secret canaries excluded/redacted from RepoMap and WorkingMemory;
- grounded fact admission;
- rejection of ungrounded memory facts;
- context assembly order;
- context compaction retaining required contracts and citations;
- compaction staying below target size;
- compaction preserving snapshot/scope identity;
- provider normalization/error mapping.

### Explorer regression tests

Existing M2 explorer tests must continue to pass.

Add cases where:

- repeated large reads would exceed the old transcript threshold but complete after compaction;
- the model revisits a previously observed topic and memory prevents unnecessary evidence loss;
- a compacted finding still passes final citation validation;
- restart/resume uses compatible structured state or safely rebuilds it;
- a malformed persisted memory object fails closed.

### Live quality check

Rerun the frozen real-repository M2 acceptance/quality pair with the same qualified model/settings after deterministic tests pass.

Compare at least:

- completion quality;
- model turns;
- tool calls;
- prompt/input bytes or available prompt token counts;
- wall time;
- failures/repairs.

M2.5 must not claim a token-saving percentage until measured.

## 11. Acceptance criteria

M2.5 is complete when all of the following are true:

1. A deterministic bounded RepoMap can be generated from an admitted immutable snapshot.
2. The explorer receives RepoMap context without requiring initial blind full-tree discovery.
3. Structured working memory retains grounded facts and unresolved coverage across turns.
4. Older raw tool context can be compacted while preserving task, snapshot, scope, security contract, citations and required coverage.
5. At least one deterministic regression demonstrates successful exploration that would otherwise hit the current transcript/context limit.
6. No ungrounded model claim can enter trusted working-memory facts.
7. Existing M2 read/list/search/finish trust boundaries remain unchanged.
8. Ollama remains fully functional behind the cleaned provider boundary.
9. All deterministic tests pass on the supported Node version.
10. Existing Windows M2 smoke/acceptance checks are rerun successfully or any regression is documented before M3 starts.
11. Documentation clearly states that M2.5 remains read-only and does not qualify repository editing or test execution.

## 12. Suggested implementation sequence

### M2.5-A — RepoMap

- define bounded schema;
- generate from `GitSnapshotTools` eligible content;
- add deterministic fixtures/tests;
- expose to context assembly only, not as a new client-facing MCP tool unless later justified.

### M2.5-B — Working memory

- define schema and evidence-admission rules;
- derive/update memory from observed operations and validated findings;
- add serialization/versioning only if restart requirements need it.

### M2.5-C — Context assembly and compaction

- extract prompt/context assembly from `explorer-loop.ts`;
- keep a bounded recent transcript window;
- compact prior observations into validated structured memory;
- preserve current fail-closed context cap as a final guard.

### M2.5-D — Provider cleanup

- isolate Ollama request/response details;
- keep one production provider;
- preserve metrics, cancellation, response bounds and credential handling.

### M2.5-E — Qualification

- run `pnpm check`;
- run deterministic tests;
- run M2 smoke/acceptance suite;
- compare context/token/turn/tool metrics with the recorded M2 baseline;
- document results and remaining M3 gates.

## 13. M3 entry gate

Do not start repository-editing implementation solely because the M2.5 code exists.

M3 may begin after M2.5 qualification confirms that:

- context remains bounded under representative multi-step exploration;
- snapshot provenance remains intact;
- grounded evidence survives compaction;
- read-only quality has not materially regressed;
- provider cleanup has not weakened cancellation/security behavior;
- native Mac/Cursor topology risks are either validated or explicitly accepted for the next phase.

M3 can then focus on side-effect safety: worktrees, edit contracts, command/test profiles, process containment, verifier isolation, artifacts, and delivery semantics rather than simultaneously redesigning context management.
