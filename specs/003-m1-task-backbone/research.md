# Research: M1 Durable Task Backbone

## Separate runtime from probes

- Decision: Place daemon, IPC client and MCP bridge in `src/runtime`; keep reconnect smoke in `src/diagnostics/task`.
- Rationale: The production process boundary is clearer without altering the public tools or package command names.
- Alternatives considered: Keeping all production and smoke code under a milestone folder obscures ownership.

## Extract stable transport concerns

- Decision: Use `src/shared/http-json.ts`, `src/shared/mcp-response.ts`, `src/shared/errors.ts` and `src/constants/`.
- Rationale: HTTP framing, size rejection, MCP envelopes and symbolic errors can be reviewed independently of routing.
- Alternatives considered: A generic routing framework adds dependencies and unnecessary migration risk.

## Keep durable ownership in daemon

- Decision: Retain existing SQLite admission, events, deadlines and fenced leases.
- Rationale: A bridge disconnect must not destroy task state; a stale worker must not overwrite a terminal result.
- Alternatives considered: An in-memory bridge queue fails durability and reconnect requirements.

## Sources and limits

Inspected source paths are listed in [plan.md](plan.md). Historical evidence comes from [M1 status](../../docs/m1-status.md) and the [technical plan](../../docs/technical-plan.md). No new live inference, native macOS or Cursor UI execution was performed during this refactor.
