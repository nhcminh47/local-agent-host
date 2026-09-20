import { hasErrorCode } from "../shared/errors.js";
import { ERROR_CODES } from '../constants/error-codes.js';
import { httpOrigin } from '../utils/http-origin.js';
import { z } from 'zod';

export type ExplorerMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: Array<{ function: { name: string; arguments: unknown } }>; tool_name?: string };
export interface ExplorerProvider { readonly modelName?: string; chat(messages: ExplorerMessage[], tools: unknown[], signal: AbortSignal): Promise<ExplorerMessage> }

const Response = z.object({ message: z.object({ role: z.literal('assistant'), content: z.string().max(16_000), tool_calls: z.array(z.object({ function: z.object({ name: z.string().max(64), arguments: z.unknown() }) })).max(4).optional() }) });
export const ExplorerOptions = z.object({ model: z.enum(['qwen3:8b', 'gpt-oss:20b', 'qwen3.5:latest']).default('qwen3:8b'), num_ctx: z.union([z.literal(8192), z.literal(16384)]).default(8192), num_predict: z.union([z.literal(512), z.literal(2048)]).default(512) }).strict();
export type InferenceMetric = { model: string; context: number; outputLimit: number; promptTokens: number | null; generatedTokens: number | null; doneReason: 'stop' | 'length' | 'other' | null; wallMs: number; messageBytes: number; toolSchemaBytes: number };
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export class OllamaExplorerProvider implements ExplorerProvider {
  readonly #origin: URL;
  readonly #token: string;
  readonly #options: z.infer<typeof ExplorerOptions>;
  get modelName() { return this.#options.model; }
  constructor(origin: string, token: string, options: unknown = {}, readonly observe?: (metric: InferenceMetric) => void) {
    this.#options = ExplorerOptions.parse(options);
    this.#origin = httpOrigin(origin, ERROR_CODES.INVALID_OLLAMA_ORIGIN);
    if (!token) throw new Error(ERROR_CODES.OLLAMA_CREDENTIAL_UNAVAILABLE);
    this.#token = token;
  }
  async chat(messages: ExplorerMessage[], tools: unknown[], signal: AbortSignal): Promise<ExplorerMessage> {
    try {
      return await this.#chat(messages, tools, signal);
    } catch (error) {
      if (signal.aborted) { signal.throwIfAborted(); }
      // Do not propagate server bodies, malformed JSON or validation inputs.
      if (hasErrorCode(error, [ERROR_CODES.EXPLORER_HTTP_FAILED, ERROR_CODES.EXPLORER_RESPONSE_LIMIT, ERROR_CODES.EXPLORER_INVALID_RESPONSE])) throw error;
      throw new Error(ERROR_CODES.EXPLORER_TRANSPORT_FAILED);
    }
  }
  async #chat(messages: ExplorerMessage[], tools: unknown[], signal: AbortSignal): Promise<ExplorerMessage> {
    const started = performance.now();
    const response = await fetch(new URL('/api/chat', this.#origin), { method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#token}` },
      body: JSON.stringify({ model: this.modelName, messages, tools, stream: false, think: this.modelName === 'gpt-oss:20b' ? 'low' : false, keep_alive: '5m', options: { num_ctx: this.#options.num_ctx, num_predict: this.#options.num_predict, temperature: 0 } }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(ERROR_CODES.EXPLORER_HTTP_FAILED);
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 128 * 1024) throw new Error(ERROR_CODES.EXPLORER_RESPONSE_LIMIT);
      chunks.push(chunk);
    }
    let parsed: z.infer<typeof Response>['message'];
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const body = JSON.parse(text);
      this.observe?.({ model: this.modelName, context: this.#options.num_ctx, outputLimit: this.#options.num_predict, promptTokens: count(body?.prompt_eval_count), generatedTokens: count(body?.eval_count), doneReason: body?.done_reason === undefined ? null : body.done_reason === 'stop' || body.done_reason === 'length' ? body.done_reason : 'other', wallMs: Math.round(performance.now() - started), messageBytes: Buffer.byteLength(JSON.stringify(messages)), toolSchemaBytes: Buffer.byteLength(JSON.stringify(tools)) });
      parsed = Response.parse(body).message;
    } catch { throw new Error(ERROR_CODES.EXPLORER_INVALID_RESPONSE); }
    return { role: 'assistant', content: parsed.content, ...(parsed.tool_calls ? { tool_calls: parsed.tool_calls } : {}) };
  }
}
