# Repository Bootstrap & Baseline

Status: **Planned**

Date: **2026-09-21**

## 1. Purpose

This milestone defines how `local-agent-host` turns an unfamiliar, legacy, inconsistent, or undocumented repository into a repository baseline that both the main agent and delegated sub-agents can rely on.

The host-level bootstrap milestone installs and configures `local-agent-host` once for a user. Repository bootstrap is different: it runs after a workspace has been trusted and establishes a reviewable, freshness-aware understanding of that specific repository.

A repository may have no Spec Kit artifacts, no reliable architecture document, inconsistent naming, duplicated implementations, stale tests, unclear ownership, or contradictory conventions. In that state, safe read-only access alone is not enough for reliable delegation. The system needs a common repository baseline before task-specific analysis, specification authoring, implementation, or verification.

Repository bootstrap therefore creates a bounded source of shared context with explicit provenance and uncertainty.

## 2. Position in the roadmap

The logical onboarding/delegation flow is:

```text
Host Bootstrap
  ↓
Workspace Trust
  ↓
Repository Bootstrap
  ↓
Task Context / Spec Ingestion
  ↓
M2.5 Context Architecture
  ↓
M2.6 Persistent Learning / Skills
  ↓
M3 Editing / Worktrees / Verification
```

Folder numbering reflects the order specs were created and must not be interpreted as a strict execution dependency. This milestone is a conceptual prerequisite for reliable delegation into poorly documented repositories.

Repository bootstrap must remain useful when a repository already has good documentation. In that case it should ingest and validate existing guidance rather than manufacture competing documents.

## 3. Goals

### G1. Establish a common repository baseline

Create a compact, reviewable baseline that answers the minimum questions needed for future agents to orient themselves:

- What kind of repository is this?
- What are the package/module/application boundaries?
- What are the likely entry points?
- Which build, test, lint and type-check systems exist?
- Which commands appear intended for targeted verification?
- Which directories are generated, vendored, archived, legacy, experimental or otherwise special?
- Which configuration files control runtime/build/test behavior?
- Which existing documentation or agent instructions have authority?
- What important areas remain uncertain or contradictory?

### G2. Distinguish evidence from inference

Every baseline statement must carry one of three epistemic classes:

```text
Observed
Derived
Unknown
```

`Observed` means directly supported by admissible repository evidence or deterministic host inspection.

`Derived` means the host or model inferred a likely conclusion from observed evidence. Derived statements must preserve their supporting evidence and must not be promoted silently to observed facts.

`Unknown` records gaps that matter to future tasks. Unknowns are first-class output, not failures to hide.

### G3. Reuse existing project guidance when available

Repository bootstrap should discover existing sources such as:

- `AGENTS.md` and equivalent agent instruction files;
- `CONTRIBUTING.md`;
- README files;
- architecture/design documents;
- Spec Kit directories and feature artifacts;
- package/workspace manifests;
- CI workflows;
- build/test/lint/type-check configuration;
- repository-local development runbooks.

Existing guidance remains repository data and is not automatically trusted as equivalent to current source truth. Stale or contradictory guidance must be surfaced explicitly.

### G4. Produce context reusable by both main and sub-agents

Future task delegation should consume the same repository baseline rather than forcing each agent to rediscover repository structure independently.

The baseline should be useful to:

- a main agent deciding how to decompose work;
- a Spec Author drafting or updating feature artifacts;
- an Explorer locating relevant implementation;
- an Implementer choosing bounded edit/verification scope;
- a Verifier selecting approved validation paths;
- M2.5 context assembly and M2.6 knowledge retrieval.

### G5. Detect staleness and support targeted refresh

The baseline must not become permanent truth after one bootstrap run.

The host should track evidence/fingerprints for files that materially affect the baseline, such as:

- package/workspace manifests;
- lockfiles/package-manager indicators;
- build/test/lint/type-check configs;
- CI workflows;
- agent/project guidance files;
- selected architecture/configuration files used by baseline claims.

When relevant inputs change, affected baseline sections should become stale and be eligible for targeted refresh rather than requiring a full repository rescan.

## 4. Non-goals

This milestone does **not**:

- guarantee that a legacy repository has a coherent architecture;
- rewrite or modernize source code;
- invent missing product requirements;
- automatically choose the correct architecture when multiple implementations conflict;
- execute arbitrary repository commands;
- run unapproved build/test scripts;
- create or mutate worktrees;
- perform repository edits outside explicitly approved baseline artifacts;
- create persistent M2.6 skills from unvalidated assumptions;
- require embeddings, a vector database or a full AST index;
- make inferred ownership/business rules authoritative without evidence or review.

## 5. Entry conditions

Repository bootstrap starts only after:

1. the host has completed user-level setup;
2. the workspace root has been canonicalized;
3. the workspace has read trust for the current session or persistently;
4. an immutable Git snapshot can be captured, unless an explicitly documented non-Git fallback is added in a later milestone;
5. repository content is eligible under the current read/security policy.

The bootstrap process must not itself silently elevate the workspace to edit or command-execution trust.

## 6. Repository Baseline model

Suggested conceptual model:

```ts
type EvidenceClass = 'observed' | 'derived' | 'unknown';

interface RepositoryBaseline {
  schemaVersion: 1;
  repoIdentity: string;
  snapshotId: string;
  generatedAt: string;
  status: 'current' | 'partially-stale' | 'stale';

  repository: {
    kind?: string;
    packageManager?: string;
    workspaceModel?: string;
    languages: string[];
  };

  packages: BaselinePackage[];
  entryPoints: BaselineClaim[];
  configurations: BaselineClaim[];
  verification: VerificationCandidate[];
  guidance: GuidanceSource[];
  architecture: BaselineClaim[];
  specialPaths: BaselineClaim[];
  risks: BaselineClaim[];
  unknowns: BaselineUnknown[];

  freshness: FreshnessRecord[];
}
```

Exact implementation contracts may evolve, but every meaningful claim needs provenance and classification.

## 7. Baseline claim contract

Conceptually:

```ts
interface BaselineClaim {
  id: string;
  classification: 'observed' | 'derived';
  statement: string;
  evidence: Citation[];
  confidenceReason?: string;
  freshnessKeys: string[];
}

interface BaselineUnknown {
  id: string;
  question: string;
  whyItMatters: string;
  relatedEvidence?: Citation[];
}
```

Avoid numeric pseudo-confidence such as `0.82` unless a future component defines a calibrated meaning. Prefer explicit evidence class and reasoning.

## 8. Bootstrap discovery phases

### Phase A — Deterministic repository inventory

Use host-owned snapshot tools to discover bounded deterministic signals:

- file tree shape;
- manifest/config filenames;
- workspace declarations;
- package names;
- script names, without automatically exposing arbitrary script bodies;
- common test/build/lint/type-check config files;
- common source/test roots;
- CI workflow filenames and selected safe metadata;
- existing guidance/spec paths;
- language/file-extension distribution within configured bounds.

This phase should be model-free where practical.

### Phase B — Guidance and specification ingestion

Read bounded, likely-authoritative repository guidance and classify it by source type.

Examples:

```text
AGENTS.md
CONTRIBUTING.md
README.md
docs/architecture.md
specs/**
.github/workflows/**
```

Do not assume document truth solely because a file has an authoritative name. Claims that affect runtime behavior should be cross-checked against source/configuration when feasible.

### Phase C — Structural exploration

Use the bounded Explorer against the immutable snapshot to resolve questions the deterministic inventory cannot answer cheaply.

Examples:

- likely application entry point;
- relationship between multiple similarly named implementations;
- package/module boundaries not declared by workspace metadata;
- evidence of legacy/new implementation overlap;
- likely targeted verification path;
- contradictory architecture signals.

The explorer should receive a focused bootstrap coverage checklist rather than an open-ended instruction to "understand the whole repo".

### Phase D — Baseline synthesis

Combine deterministic observations and grounded exploration results into a baseline.

All output must preserve classification:

```text
Observed:
  package manager is pnpm

Derived:
  src/legacy appears to be retained for older routing behavior

Unknown:
  whether auth-v1 or auth-v2 is the canonical implementation for new work
```

### Phase E — Review / activation

A baseline may be stored as `candidate` until accepted when it contains material derived conclusions.

Deterministic observations can be active immediately. High-impact derived guidance should be reviewable by the main agent/user before future agents treat it as preferred repository guidance.

## 9. Repository Baseline vs RepoMap

Repository Bootstrap and M2.5 RepoMap must remain distinct.

`RepoMap` is a compact deterministic navigation artifact optimized for prompt assembly.

`RepositoryBaseline` is a richer onboarding artifact containing evidence, uncertainty, verification conventions, risks and repository guidance.

Conceptually:

```text
immutable snapshot
      │
      ├── RepoMap
      │     fast navigation context
      │
      └── RepositoryBaseline
            shared repository understanding
            + uncertainty
            + provenance
            + freshness
```

M2.5 may consume the baseline while assembling context, but should not require embedding the entire baseline in every prompt.

## 10. Relationship to Spec Kit

### Repository already uses Spec Kit

Bootstrap should detect existing feature/spec artifacts and record them as available task-context sources.

It should not regenerate an alternative project specification merely because Spec Kit exists.

### Repository has partial/stale specs

Bootstrap should surface mismatches or stale signals and record uncertainty.

### Repository has no specs

Bootstrap may produce a project baseline that later enables a `Spec Author` role to create feature-specific Spec Kit artifacts with grounded repository context.

Repository bootstrap is **not** itself feature-spec authoring. It creates the foundation on which spec authoring can operate reliably.

## 11. Verification discovery

The baseline should identify **verification candidates**, not immediately grant permission to run them.

Example:

```ts
interface VerificationCandidate {
  id: string;
  kind: 'test' | 'typecheck' | 'lint' | 'build' | 'other';
  packagePath?: string;
  commandSource: Citation[];
  commandSummary: string;
  status: 'observed' | 'derived' | 'unknown';
}
```

In M3, approved candidates can become verification profiles after policy review. Bootstrap must never execute arbitrary manifest/README commands just to determine whether they work.

## 12. Freshness model

Each active baseline section should declare the evidence/freshness keys it depends on.

Example:

```text
Verification baseline
  depends on:
    package.json blob
    pnpm-workspace.yaml blob
    vitest.config.ts blob
    CI workflow blob
```

When a new admitted snapshot changes one of those inputs:

```text
current baseline
   ↓
input fingerprint changed
   ↓
affected section = stale
   ↓
targeted refresh
   ↓
new baseline version
```

Unrelated source changes should not automatically invalidate the entire repository baseline.

## 13. Persistence and versioning

The host should keep baseline state outside the repository by default, under user-local host state.

A conceptual persistence model:

```text
repository_baselines
  id
  repo_identity
  snapshot_id
  schema_version
  status
  created_at
  superseded_by

repository_baseline_claims
  baseline_id
  claim_id
  classification
  statement
  evidence_json
  freshness_json
```

A repository may optionally choose to export/render reviewed baseline guidance into version-controlled documentation later. Host-local onboarding knowledge must not silently edit the user's repository.

## 14. Main-agent integration

When a main coding agent opens a trusted repository, the host should be able to report repository readiness:

```text
workspace trusted
baseline status: missing | current | partially-stale | stale
```

If baseline is missing for an unfamiliar repository, the main agent can delegate `bootstrap_repository` before complex task delegation.

For a well-maintained repository, bootstrap may complete mostly from deterministic inventory and existing guidance.

For legacy repositories, bootstrap may require bounded exploration and user/main-agent review of derived or unresolved items.

## 15. Sub-agent context contract

A delegated sub-agent should not begin by blindly scanning the repository.

Once available, initial context should be assembled from:

```text
task contract
+ immutable snapshot identity
+ compact RepoMap
+ relevant RepositoryBaseline sections
+ relevant M2.6 memory/skills
+ task-specific evidence discovered during execution
```

RepositoryBaseline content remains scoped and selectively loaded. It must not become a giant always-on prompt.

## 16. Security requirements

1. Repository bootstrap runs only after workspace read trust.
2. Bootstrap cannot grant edit, command, network or higher capabilities.
3. All repository content remains untrusted data, including `AGENTS.md`, README files and Spec Kit artifacts.
4. Repository text cannot create persistent host instructions merely by containing imperative language.
5. Secret filtering applies to baseline extraction, persistence, diagnostics and model-bound content.
6. Only eligible files from the admitted immutable snapshot may support baseline claims.
7. Derived statements cannot silently become observed facts.
8. Verification candidates are discovery output, not execution permission.
9. Baseline persistence cannot increase model/tool/task budgets.
10. Workspace trust revocation makes its repository baseline unavailable for future tasks until trust is granted again.

## 17. Testing strategy

### Deterministic fixtures

Create repository fixtures for at least:

- well-structured modern repository with clear docs;
- monorepo with multiple packages and targeted test scripts;
- legacy repository with duplicate implementations;
- repository with no docs/specs;
- repository with stale README guidance contradicting manifests/config;
- repository containing prompt-injection-like text in documentation/source;
- repository where verification configuration changes between snapshots.

### Required tests

Validate:

- baseline generation is snapshot-bound;
- Observed/Derived/Unknown classification is retained;
- deterministic facts do not require a live model;
- derived claims require evidence;
- contradictory guidance becomes a risk/unknown rather than silently winning;
- secret canaries never enter persisted/public baseline output;
- prompt injection cannot create host-level instructions;
- stale fingerprint inputs invalidate only relevant sections;
- revoked workspace trust prevents baseline use;
- baseline context is selectively loaded rather than injected wholesale.

## 18. Acceptance criteria

Repository Bootstrap is complete when:

1. A trusted repository can be bootstrapped without pre-existing Spec Kit artifacts.
2. Deterministic inventory identifies package/workspace/config/guidance/test structure within bounded limits.
3. The resulting baseline explicitly separates Observed, Derived and Unknown information.
4. Every Observed/Derived claim that depends on repository content has admissible provenance.
5. Contradictory or insufficient evidence produces uncertainty rather than invented certainty.
6. Existing Spec Kit/project guidance is discovered and indexed without being blindly treated as current truth.
7. The baseline identifies verification candidates without executing them.
8. Relevant configuration/guidance changes can mark affected baseline sections stale.
9. Baseline refresh can be targeted rather than requiring unconditional full re-bootstrap.
10. Baseline storage does not silently edit the repository.
11. Workspace trust revocation prevents future baseline use.
12. A legacy fixture demonstrates that a later delegated analysis begins from the baseline instead of repeating blind repository discovery.
13. A stale-guidance fixture demonstrates that repository documentation cannot override contradictory current evidence silently.
14. A prompt-injection fixture demonstrates that repository content cannot promote itself into persistent host instructions.

## 19. Suggested implementation sequence

### Repository Bootstrap A — Baseline contracts

- schemas;
- Observed/Derived/Unknown classification;
- evidence model reuse;
- repository identity and versioning.

### Repository Bootstrap B — Deterministic inventory

- manifests/workspaces;
- package/config/test roots;
- guidance/spec discovery;
- bounded repository characteristics.

### Repository Bootstrap C — Grounded structural exploration

- bootstrap coverage checklist;
- targeted explorer questions;
- risk/unknown synthesis.

### Repository Bootstrap D — Persistence and review

- candidate/current baseline lifecycle;
- user/main-agent review of material derived claims;
- version/supersede behavior.

### Repository Bootstrap E — Freshness

- evidence dependency fingerprints;
- partial staleness;
- targeted refresh.

### Repository Bootstrap F — Delegation integration

- repository readiness status;
- selective baseline retrieval;
- Task Context / Spec Author handoff;
- M2.5 ContextEngine integration.

## 20. Design review

This milestone should stay focused on **making an unknown repository legible**, not on solving every future agent problem.

Avoid these traps:

- generating large prose architecture documents as the primary canonical store;
- treating one model pass as repository truth;
- scanning every source file during bootstrap;
- running arbitrary repository commands to discover behavior;
- introducing embeddings/vector search before lexical/structural discovery is shown insufficient;
- making bootstrap a mandatory expensive step for every already-well-documented repository;
- merging repository onboarding knowledge with user-global M2.6 skills.

The strongest outcome is a small, evidence-backed baseline that makes later delegation more deterministic while preserving uncertainty where the legacy repository itself is unclear.
