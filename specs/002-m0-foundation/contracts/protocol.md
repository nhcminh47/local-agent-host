# M0 Probe Contracts

## MCP stdio

Canonical server: `src/diagnostics/compatibility/mcp-server.ts`.

- `m0_echo`: strict input with text up to 128 characters; returns the same text.
- `m0_ollama_probe`: marker matching `^m0-[a-z0-9-]{1,64}$`; model allowlist is qwen3:8b, qwen3-coder:30b and gpt-oss:20b. Returns bounded marker, outcome and timing/count information. It does not execute model tools.
- Credential absence and probe failure use bounded error responses. Diagnostics must never enter MCP stdout.

## Command reports

`doctor` emits local runtime/executable/model availability. Exit 2 means an unavailable prerequisite or runtime mismatch; exit 1 means invalid configuration. The process spike owns disposable child fixtures and reports platform, process count, termination timing and its live-parent limitation.

The coding evaluator accepts explicit model names and optional `M0_EVAL_CASE`. Each report distinguishes hidden-test status from `finishedAfterPass`, includes bounded counters/timing, and may include only disposable fixture source and sanitized failure output. It is not the production task API.
