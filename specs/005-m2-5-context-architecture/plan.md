# Implementation plan: M2.5 context architecture

Status: active. The existing [specification](spec.md) defines the acceptance gate.

## Scope and ownership

1. `src/exploration/repo-map.ts` derives a bounded, deterministic navigation map solely through `GitSnapshotTools` eligible paths and filtered committed blobs. It is navigation context, not a runtime claim or repository baseline.
2. `src/service/explorer-memory.ts` admits host-observed lines and validated findings with citation provenance. Model prose alone never becomes a fact. Per-attempt memory can be rebuilt after restart; durable snapshot and budgets remain in the store.
3. `src/service/explorer-context.ts` assembles mandatory system/task/snapshot/scope context with the map, memory and recent messages. It compacts before the existing 24,000-byte hard cap without changing budgets or evidence validation.
4. `src/provider/` keeps one Ollama adapter behind the existing `ExplorerProvider` contract. Normalize provider-facing request/response types without changing network, cancellation or metric behavior.

## Compatibility and safety

No public MCP or persisted schema changes are planned. Snapshot identity, scope, filtering, task budgets and final citation validation remain authoritative. The repository map is capped by bytes and counts; manifests expose package names and script names only. Missing or malformed snapshot content is skipped for navigation, never read from the working tree. Raw transcripts are not persisted.

## Validation

Use fixture snapshots for deterministic map, scope, redaction, compaction, grounding and restart tests. Run `pnpm check`, `pnpm test` and `pnpm m2:smoke:mcp`. Then compare a frozen Windows acceptance run with the earlier profile; keep human review and native macOS/Cursor gates open until separately observed. Document source identity and any quality regression.

## Pre-implementation analysis

The spec's four capabilities map to the four owners above. RepoMap and memory must remain distinct from the richer repository baseline in package 007 and durable learning in M2.6. The current explorer stores an in-memory transcript and applies the hard cap before a turn; the first implementation should add bounded snapshot navigation without changing the tool/result contract. Later tasks are dependent and cannot be marked complete from a map-only test.
