# Implementation plan: repository baseline

Status: active. The [specification](spec.md) defines the broader acceptance gate. This slice remains deterministic and read-only.

## Ownership and design

1. `src/exploration/repository-baseline.ts` derives a version-1 bounded baseline from `GitSnapshotTools` eligible paths and selected filtered committed manifests/guidance. It records observed facts, derived orientation and unknowns separately, with path/hash provenance. It discovers commands without executing them. Source text is never used as host policy.
2. `src/store/repository-baseline-store.ts` adds versioned SQLite tables without altering task/event or learning schema. A relevant fingerprint identifies current content; replacing it supersedes an older version while preserving audit metadata. No deletion.
3. `src/service/repository-baseline-service.ts` checks repository identity and current trust-checked snapshot, builds or returns a current baseline, and exposes a bounded context projection. The explorer runner loads it after restore and passes it to M2.5 context assembly. Baseline context is labelled source-derived orientation and cannot grant capabilities.
4. A management-authenticated host route/CLI can inspect the current baseline for a task. No model tool can create, activate or alter it.

## Fingerprint and bounds

The fingerprint covers the eligible path inventory plus selected support file hashes (manifests, configuration and guidance). It is scoped by canonical repository root and task path scope. A changed supporting file or structure yields a new baseline version; an unrelated source-content change without path/config change does not. Older versions become `superseded`. The stored baseline is capped at 8 KiB; model projection at 2 KiB; file scan at 10,000 eligible paths; selected source reads at 24.

## Safety and validation

Only admitted filtered snapshot APIs may supply paths/content. Redacted content is excluded from claims and persistence. Inferred entry-point guesses remain `derived`; missing documentation/runtime verification becomes `unknown`. Verification commands are candidates, never executed. Tests cover modern, monorepo, no-doc, stale guidance, prompt-like text, scope, dirty checkout, fingerprint refresh, persistence, trust/identity and context bound. Run pinned check/test and M2 MCP smoke; live quality effect is a separate qualification result.

Pre-implementation analysis: the existing RepoMap is fast navigation and not the baseline. M2.6 learning stores reviewed cross-task findings, not deterministic onboarding. This package adds a separate owner and read-only management inspection; no existing public MCP contract changes.
