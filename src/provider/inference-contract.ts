export type ExplorerMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
  tool_name?: string;
};

/** Agent-facing inference boundary; transport and model settings belong to adapters. */
export interface ExplorerProvider {
  readonly modelName?: string;
  chat(messages: ExplorerMessage[], tools: unknown[], signal: AbortSignal): Promise<ExplorerMessage>;
}
