# ADR 0001 — M0 compatibility decisions

Date: 2026-09-17. Status: accepted for Windows spikes, including actual Cursor 3.20.21 tool round-trip; macOS compatibility remains open.

## Runtime and dependencies

Pin Node 22.23.2, pnpm 11.7.0, TypeScript 7.0.2, MCP server/client 2.0.0, Zod 4.6.5 and better-sqlite3 13.0.3. Versions were checked against the package registry before installation. `pnpm-lock.yaml` records transitive resolutions. Install used `--ignore-scripts`.

Evidence on Windows x64 under Node 22: strict typecheck and compilation pass; MCP SDK client/server initialize, list/call and invalid-input handling pass; better-sqlite3 native binding loads without running installation scripts and passes WAL, rollback and reopen tests on a Unicode path. This is not evidence for macOS; keep that gate open.

Use Node's built-in test runner during M0 to keep the bootstrap small. Reconsider a larger runner only when actual M1 test needs justify it.

## Inference

Reuse the existing Docker Ollama 0.31.1 deployment and Caddy bearer authentication. Local Windows proxy endpoint is port 11435; do not publish raw 11434 as a workaround. The existing key was used in-process and was not copied into the project. No network/proxy configuration was changed.

Use qwen3:8b and gpt-oss:20b as **evaluation candidates**, not a final model selection. Both are installed and pass a synthetic 8K-context tool round-trip. Both were observed as 100% GPU by Ollama when loaded sequentially. Keep one active inference request and initially 8K context. Sustained throughput and Mac-to-PC latency remain unmeasured.

After the two-task coding fixture, use qwen3:8b as the provisional M1 vertical-slice worker: it passed 2/2 in about 7 seconds each. gpt-oss:20b also passed 2/2 but took about 12–19 seconds; retain it as verifier/fallback candidate. qwen2.5-coder emitted no tool calls across both tasks and is excluded from the current tool-loop default. This is provisional until the planned 10-task evaluation.

The expanded 10-fixture M0 evaluation supersedes that provisional assignment. Use qwen3:8b for exploration (8/10, median 3.814s), qwen3.5:9b for implementation (10/10, median 9.600s), and gpt-oss:20b for verification/fallback (10/10, median 8.046s). Devstral:24b scored 8/10 but completed the finish lifecycle on only 5/10 and had a 55.890s median with CPU offload; it was removed after evaluation. These fixtures select M1 profiles but do not replace the M4 end-to-end repository evaluation.

On 2026-09-18, the user explicitly requested testing the planning discussion's qwen3-coder:30b, so it was downloaded into the existing Ollama Docker store. It passes the synthetic 8K tool round-trip. The first request took 26.407s including 23.749s load time; the warm follow-up took 0.863s. Ollama reports 75% GPU / 25% CPU placement and about 15.7GB VRAM used on the 16GB RTX 5060 Ti.

Do not select qwen3-coder:30b as the provisional worker on this PC. It passed pagination but failed dedupe, and a focused rerun reproduced the semantic ordering error after the 10-turn budget. Its 18GB model size also requires CPU offload. This evidence is limited to two small fixtures; reconsider only after a broader task suite or a different quantization/hardware profile.

## Process management

For the disposable M0 fixture, use taskkill `/PID <owned PID> /T /F` on Windows and a POSIX process group on macOS. Windows cancellation of parent/child/grandchild passed. An independent polling guardian also cleaned a worker about 260ms after a forced host crash and wrote a receipt. Production still needs PID creation-time/task identity validation, durable ownership/receipt, guardian recovery and macOS coverage; Job Objects remain an option. Do not promote this spike directly into a general arbitrary-command tool.

## Access constraints

Cursor runs on Mac mini. The user cannot share SSH due to policy. Provide a source bundle and local Mac runbook; do not request SSH again or create a tunnel to evade this constraint. Remote repo conventions and actual Cursor integration are user-run local checks.

## References

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cursor MCP configuration](https://cursor.com/docs/mcp)
- [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Node process APIs](https://nodejs.org/api/child_process.html)
- [Node 22.23.2 release artifacts and checksums](https://nodejs.org/dist/v22.23.2/)
