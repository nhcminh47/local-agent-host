import { z } from 'zod';

export const HostConfig = z.object({
  schemaVersion: z.literal(1),
  daemonPort: z.number().int().min(1).max(65535),
  databasePath: z.string().min(1),
  provider: z.literal('explorer'),
  ollamaUrl: z.url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; }),
  model: z.enum(['qwen3:8b', 'gpt-oss:20b', 'qwen3.5:latest']),
  clientAdapter: z.enum(['manual', 'cursor']),
}).strict();

export type HostConfigValue = z.infer<typeof HostConfig>;
