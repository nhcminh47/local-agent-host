import { ERROR_CODES } from '../../constants/error-codes.js';
import { endpoint } from './doctor.js';
import { z } from 'zod';

// Synthetic data only. This spike never executes model-provided code or tools.
const origin = endpoint(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434');
const token = process.env['OLLAMA_API_KEY'];
const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const models = process.argv.slice(2);
if (!models.length) throw new Error('Supply installed model names; this spike does not pull models');
const Tool = z.object({ function: z.object({ name: z.literal('lookup_value'), arguments: z.object({ key: z.literal('m0') }).strict() }) });
type Message = { role: string; content: string; thinking?: string; tool_calls?: unknown[]; tool_name?: string };

async function chat(model: string, messages: Message[], withTools: boolean) {
  const started = performance.now();
  const response = await fetch(new URL('/api/chat', origin), {
    method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model, messages, stream: true, keep_alive: '5m',
      options: { num_ctx: 8192, num_predict: 512, temperature: 0 },
      ...(model.startsWith('qwen3') ? { think: false } : {}),
      ...(model.startsWith('gpt-oss:') ? { think: 'low' } : {}),
      ...(withTools ? { tools: [{ type: 'function', function: { name: 'lookup_value', description: 'Read the fixture value by key.', parameters: { type: 'object', properties: { key: { type: 'string', enum: ['m0'] } }, required: ['key'], additionalProperties: false } } }] } : {}),
    }),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP_${response.status}`);
  const decoder = new TextDecoder();
  let buffer = '', bytes = 0, firstOutputMs: number | undefined;
  const message: Message = { role: 'assistant', content: '' };
  let final: Record<string, unknown> | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(ERROR_CODES.MODEL_RESPONSE_ERROR);
    const part = chunk.message;
    if (part) {
      if (firstOutputMs === undefined && (part.content || part.thinking || part.tool_calls?.length)) firstOutputMs = performance.now() - started;
      message.content += part.content ?? '';
      if (part.thinking) message.thinking = (message.thinking ?? '') + part.thinking;
      if (part.tool_calls) message.tool_calls = [...(message.tool_calls ?? []), ...part.tool_calls];
    }
    if (chunk.done) final = chunk;
  };
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 2 * 1024 * 1024) throw new Error(ERROR_CODES.RESPONSE_LIMIT);
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
  }
  consume(buffer + decoder.decode());
  if (!final) throw new Error(ERROR_CODES.INCOMPLETE_STREAM);
  const evalCount = Number(final['eval_count'] ?? 0);
  const evalNs = Number(final['eval_duration'] ?? 0);
  return { message, metrics: {
    wallMs: Math.round(performance.now() - started), firstOutputMs: firstOutputMs === undefined ? null : Math.round(firstOutputMs),
    loadMs: Number(final['load_duration'] ?? 0) / 1e6,
    promptTokens: final['prompt_eval_count'] ?? null, generatedTokens: final['eval_count'] ?? null,
    tokensPerSecond: evalNs > 0 ? Math.round(evalCount / (evalNs / 1e9) * 100) / 100 : null,
  } };
}

for (const model of models) {
  try {
    const messages: Message[] = [{ role: 'user', content: 'Call lookup_value with key m0 to obtain the fixture value. Do not guess it. After receiving the tool result, reply only with the numeric value.' }];
    const first = await chat(model, messages, true);
    const calls = first.message.tool_calls ?? [];
    if (calls.length !== 1) throw new Error(ERROR_CODES.EXPECTED_ONE_TOOL_CALL);
    Tool.parse(calls[0]);
    messages.push(first.message, { role: 'tool', tool_name: 'lookup_value', content: '{"value":731}' });
    const second = await chat(model, messages, false);
    const passed = second.message.content.trim() === '731';
    console.log(JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), model, context: 8192, status: passed ? 'passed' : 'failed', toolCallValid: true, toolResultFollowed: passed, initial: first.metrics, followup: second.metrics, limitation: 'One synthetic tool round-trip, not coding quality or sustained performance' }));
    if (!passed) process.exitCode = 2;
  } catch (error) {
    const allowed = error instanceof Error && /^(HTTP_\d+|MODEL_RESPONSE_ERROR|RESPONSE_LIMIT|INCOMPLETE_STREAM|EXPECTED_ONE_TOOL_CALL)$/.test(error.message) ? error.message : 'NETWORK_TIMEOUT_OR_SCHEMA_ERROR';
    console.log(JSON.stringify({ model, status: 'failed', error: allowed }));
    process.exitCode = 2;
  }
}
