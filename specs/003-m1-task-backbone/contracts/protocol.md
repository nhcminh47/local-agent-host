# M1 Task and IPC Contracts

## Task-level MCP interface

- `analyze_repo`: strict schemaVersion 1; repoId (1–64), requestKey (1–128), baseRef (1–256), objective/question (1–4,000 each), quick/standard depth, up to 32 relative focus paths. Budgets: wall 10–600 seconds, turns 1–12, tools 1–60. The current schema also accepts the M2 scope extension.
- `get_task`: UUID taskId, nonnegative afterEventSeq, waitMs 0–20,000, maxEvents 1–100. Returns task, bounded events and cursor metadata.
- `cancel_task`: UUID taskId and reason (1–500); terminal cancellation is idempotent.
- Current bridge additionally exposes M2 `check_capability` and `resolve_capability`; these are not original M1 functionality.

## Loopback transport

Client accepts HTTP loopback origins without URL credentials or a non-root path and requires a token of at least 32 characters. It uses POST, JSON, no redirects and a 25-second timeout. Server binds loopback, rejects Origin headers and invalid Host values, compares bearer credentials in constant time and caps request bodies at 65,536 bytes.

Routes: `/v1/submit`, `/v1/get`, `/v1/cancel`; M2 adds capability routes. Successful envelopes are `{ ok: true, value }`; failures are `{ ok: false, error }`.

| HTTP status | Condition |
| --- | --- |
| 200 | Successful operation |
| 400 | Invalid input or allowlisted admission failure |
| 401 | Missing/invalid authentication |
| 403 | Invalid origin/host |
| 404 | Unknown route or task |
| 405 | Non-POST request |
| 413 | Body exceeds 65,536 bytes; REQUEST_TOO_LARGE, then close connection after JSON response |

MCP wraps structured values in both JSON text content and structuredContent; errors include isError. Stable codes reside in `src/constants/error-codes.ts`. The refactor does not tighten existing client URL parsing or change transport error precedence.

## Connectivity result

The optional Ollama analysis provider admits only its existing model allowlist. It sends objective/question with the fixed connectivity prompt, records wall/load/token metrics, truncates summary output to the existing bound, and stores outcome completed with verification not_run and empty findings. The fake provider is the deterministic default.
