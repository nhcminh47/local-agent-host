import { ERROR_CODES } from '../constants/error-codes.js';
import { httpOrigin } from '../utils/http-origin.js';
import { ANALYSIS_SYSTEM_PROMPT } from '../prompts/analysis.js';
import { z } from 'zod';
import type { AnalyzeRepoRequest } from '../domain/task-contracts.js';

const ChatResponse = z.object({
  message: z.object({ content: z.string() }),
  model: z.string().optional(),
  load_duration: z.number().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
}).passthrough();

export type AnalysisProviderResult = {
  schemaVersion: 1;
  outcome: 'completed';
  verification: 'not_run';
  summary: string;
  findings: [];
  provider: 'ollama';
  model: string;
  metrics: { wallMs: number; loadMs: number; promptTokens: number | null; generatedTokens: number | null };
};

export class OllamaAnalysisProvider {
  readonly #origin: URL;
  readonly #token: string;
  readonly #model: string;

  constructor(origin: string, token: string, model = 'qwen3.5:latest') {
    this.#origin = httpOrigin(origin, ERROR_CODES.INVALID_OLLAMA_ORIGIN);
    if (!token) throw new Error(ERROR_CODES.OLLAMA_CREDENTIAL_UNAVAILABLE);
    if (!['qwen3.5:latest', 'qwen3:8b', 'gpt-oss:20b'].includes(model)) throw new Error(ERROR_CODES.MODEL_NOT_ALLOWED);
    this.#token = token;
    this.#model = model;
  }

  async analyze(request: AnalyzeRepoRequest, signal: AbortSignal): Promise<AnalysisProviderResult> {
    const started = performance.now();
    const response = await fetch(new URL('/api/chat', this.#origin), {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#token}` },
      body: JSON.stringify({
        model: this.#model,
        stream: false,
        keep_alive: '5m',
        think: false,
        options: { num_ctx: 8192, num_predict: 160, temperature: 0 },
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: `Objective: ${request.objective}\nQuestion: ${request.question}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OLLAMA_HTTP_${response.status}`);
    const body = ChatResponse.parse(await response.json());
    return {
      schemaVersion: 1,
      outcome: 'completed',
      verification: 'not_run',
      summary: body.message.content.trim().slice(0, 6_000),
      findings: [],
      provider: 'ollama',
      model: this.#model,
      metrics: { wallMs: Math.round(performance.now() - started), loadMs: Math.round((body.load_duration ?? 0) / 1e6), promptTokens: body.prompt_eval_count ?? null, generatedTokens: body.eval_count ?? null },
    };
  }
}
