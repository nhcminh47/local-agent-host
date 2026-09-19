# Cursor Windows — M0 integration evidence

Date: 2026-09-17. Result: **PASS for Cursor → local MCP stdio echo and Cursor → MCP → Ollama marker round-trip**.

## Setup used

- Cursor 3.20.21, project `D:\Repo\local-agent-host`.
- Project-only `.cursor/mcp.json` config for `local-agent-m0`.
- Node 22.23.2 copied to ignored `.local/node22/node.exe`; system Node was unchanged.
- MCP server entrypoint `dist/src/m0/mcp-server.js`, built with SDK 2.0.0.
- Local config and runtime are Git-ignored and excluded from the source bundle. No global MCP configuration or Ollama credentials were added.

## Observed evidence

1. Cursor Customize → MCPs discovered `local-agent-m0` from the project's `.cursor/mcp.json`.
2. Enabling this entry produced `Connected` and `1 tool enabled`; the tool list contained `m0_echo`.
3. A new Cursor Agent request asked for one `m0_echo` call with `{"text":"m0-cursor-pc-ok"}`, without file reads/edits, shell commands or other tools.
4. Cursor displayed `Explored 1 tool`, identified `m0_echo`, and returned `m0-cursor-pc-ok`. The UI displayed `Worked for 11s` (whole Agent turn, not MCP latency).
5. The server-specific Cursor log recorded `Successfully connected to stdio server` at 23:27:35 and 23:28:54 local time. The tool result was verified in the UI; the connection log alone was not used as proof of tool execution.

The existing selected Cursor model was used. The test sent only a synthetic marker and did not exercise the Ollama adapter.

## Scope of this pass

An additional bounded `m0_ollama_probe` test passed through qwen3:8b: marker and output were `m0-cursor-ollama-ok`, MCP wall 5574ms, load 5127ms and 9 generated tokens. Cursor reported 16 seconds for the whole Agent turn.

Operational finding: changing `.cursor/mcp.json` disabled the project source. After reconnect, an already-open chat retained an old tool snapshot and failed with “MCP server does not exist”. Enabling the source and creating a fresh Agent fixed it. Cursor showed 2 enabled tools in the successful run.

This closes the **Windows Cursor discovery/tool round-trip and bounded Ollama path** gates. It does not prove the future task queue, daemon, full repo agent loop, macOS compatibility, network connectivity from Mac, or sandbox containment.

## Re-run on this PC

Open this project in Cursor. The project entry is already enabled. Ask Agent:

> Call local-agent-m0's m0_echo exactly once with {"text":"m0-cursor-pc-ok"}, and return the tool result. Do not read/edit files or run commands.

If source changes, rebuild using the pinned Node 22/pnpm setup and reload this MCP entry. A transferable Windows example is in `config/cursor-m0.windows.example.json`; replace the Node executable placeholder for another machine.

The live project config also sets `OLLAMA_ENV_FILE` to the existing local Ollama `.env`; the server reads only `OLLAMA_API_KEY`, never logs it, and the config remains Git-ignored. This is an M0 compatibility workaround because Cursor did not pass `envFile` content in the observed run. Production credential provisioning remains a separate decision.
