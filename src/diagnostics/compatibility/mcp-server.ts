import { ERROR_CODES } from '../../constants/error-codes.js';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { endpoint } from './doctor.js';
import { readFile } from 'node:fs/promises';

const server = new McpServer({ name: 'local-agent-m0', version: '0.0.0' });
server.registerTool('m0_echo', {
  description: 'M0 protocol compatibility probe; no repo access or task execution.',
  inputSchema: z.object({ text: z.string().max(128) }).strict(),
}, async ({ text }) => ({ content: [{ type: 'text', text }] }));

server.registerTool('m0_ollama_probe', {
  description: 'M0 end-to-end probe: send a synthetic marker to an allowlisted local Ollama model. No repo access or model-provided tool execution.',
  inputSchema: z.object({ marker: z.string().regex(/^m0-[a-z0-9-]{1,64}$/), model: z.enum(['qwen3:8b', 'qwen3-coder:30b', 'gpt-oss:20b']).default('qwen3:8b') }).strict(),
}, async ({ marker, model }) => {
  const base = endpoint(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11435');
  let token = process.env['OLLAMA_API_KEY'];
  if (!token && process.env['OLLAMA_ENV_FILE']) {
    try {
      const content = await readFile(process.env['OLLAMA_ENV_FILE'], 'utf8');
      const line = content.split(/\r?\n/).find(value => /^\s*OLLAMA_API_KEY\s*=/.test(value));
      token = line?.split('=', 2)[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
    } catch { /* Report the same bounded error below. */ }
  }
  if (!token) return { isError: true, content: [{ type: 'text', text: ERROR_CODES.OLLAMA_CREDENTIAL_UNAVAILABLE }] };
  try {
    const started = performance.now();
    const response = await fetch(new URL('/api/chat', base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, stream: false, keep_alive: '5m', messages: [{ role: 'user', content: `Return this exact marker and nothing else: ${marker}` }], options: { num_ctx: 8192, num_predict: 64, temperature: 0 }, ...(model.startsWith('qwen3') ? { think: false } : { think: 'low' }) }),
    });
    if (!response.ok) throw new Error(ERROR_CODES.HTTP_ERROR);
    const body = z.object({ message: z.object({ content: z.string() }), load_duration: z.number().optional(), eval_count: z.number().optional() }).parse(await response.json());
    const output = body.message.content.trim();
    return { content: [{ type: 'text', text: JSON.stringify({ status: output === marker ? 'passed' : 'failed', model, marker, output, wallMs: Math.round(performance.now() - started), loadMs: Math.round((body.load_duration ?? 0) / 1e6), generatedTokens: body.eval_count ?? null }) }] };
  } catch {
    return { isError: true, content: [{ type: 'text', text: ERROR_CODES.OLLAMA_PROBE_FAILED }] };
  }
});
await server.connect(new StdioServerTransport());
