# Contract: Structured Exploration Completion

The concrete implementation will use strict Zod schemas. This document defines the externally visible shape and invariants without committing to generated JSON Schema syntax.

## `finish_analysis` tool input

```ts
type FinishAnalysisInput = {
  schemaVersion: 2;
  findings: Array<{
    id: string;
    statement: string;
    basis: 'direct_observation' | 'inference';
    citations: Array<{
      path: string;
      startLine: number;
      endLine: number;
    }>;
    excerpt?: string;
    exactValues?: Array<{
      kind: 'identifier' | 'package' | 'version' | 'json_string' | 'command';
      value: string;
      citation: {
        path: string;
        startLine: number;
        endLine: number;
      };
    }>;
  }>;
  limitations: Array<{
    kind: 'redacted' | 'outside_scope' | 'unavailable' | 'not_observed';
    description: string;
    path?: string;
    citations?: Array<{
      path: string;
      startLine: number;
      endLine: number;
    }>;
  }>;
};
```

## Host validation

The host accepts the tool only when:

1. The entire input passes the strict schema and size/count limits.
2. All strings pass the existing secret filter.
3. Every citation is fully covered by evidence observed in this attempt.
4. Every direct excerpt equals filtered observed text from its cited ranges.
5. Every exact value occurs in observed text or in a JSON string decoded exactly once.
6. No limitation uses an unavailable path as proof that the path exists or is absent.
7. `verification` remains host-owned and is always `not_run` for this result type.

Invalid completion arguments execute no partial publication. The loop may request one correction if budget remains; otherwise it returns a bounded failure code.

## Published terminal result

The host converts validated input into `ExplorationResultV2`, appending host-owned evidence, snapshot provenance, validation status, limitations counters, and metrics. The public `summary` is rendered solely from validated findings and limitations. Free-form assistant content is not copied into the terminal result.

## Compatibility

- Existing stored schema-version-1 terminal results remain readable.
- New completions publish schema version 2.
- Task admission, idempotency, snapshot identity, path scope, filtering, budgets, cancellation, and capability blocking remain unchanged.
