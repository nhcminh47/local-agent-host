# Research: M0 Compatibility Foundation

## Keep probes outside runtime

- Decision: Move M0 executables to `src/diagnostics/compatibility`; update launch configurations to the canonical compiled path.
- Rationale: Milestone names describe experiments; production runtime must not import executable probe modules.
- Alternatives considered: Forwarding launchers were removed to complete the requested folder cleanup; matching local launcher paths were migrated.

## Share origin and liveness helpers

- Decision: Use `src/utils/http-origin.ts` and `src/utils/process.ts`.
- Rationale: They preserve existing validation and process-probe semantics without introducing a command facility.
- Alternatives considered: A general-purpose command runner would broaden scope and violate the current capability gate.

## Preserve evidence boundaries

- Decision: Keep historic live findings in `docs/m0-status.md`; append current deterministic evidence separately.
- Rationale: Synthetic model fixtures and platform-specific observations do not establish later real-repository acceptance.
- Alternatives considered: Marking all of M0 complete would conceal the remaining Mac and operational gates.

## Sources and limits

Inspected source paths are listed in [plan.md](plan.md). Historical evidence comes from [M0 status](../../docs/m0-status.md) and the [technical plan](../../docs/technical-plan.md). No new live inference, native macOS or Cursor UI execution was performed during this refactor.
