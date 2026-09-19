import { z } from 'zod';
import { PathScope } from './path-scope.js';

const RelativePath = z.string().min(1).max(512).refine(value =>
  !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes('..'),
  'focus paths must be repo-relative',
);

export const AnalyzeRepoInput = z.object({
  schemaVersion: z.literal(1),
  repoId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  requestKey: z.string().min(1).max(128),
  baseRef: z.string().min(1).max(256),
  objective: z.string().min(1).max(4_000),
  question: z.string().min(1).max(4_000),
  depth: z.enum(['quick', 'standard']).default('quick'),
  focusPaths: z.array(RelativePath).max(32).default([]),
  scope: PathScope.optional(),
  budget: z.object({
    maxWallSeconds: z.number().int().min(10).max(600).default(600),
    maxModelTurns: z.number().int().min(1).max(12).default(12),
    maxToolCalls: z.number().int().min(1).max(60).default(40),
  }).strict().default({ maxWallSeconds: 600, maxModelTurns: 12, maxToolCalls: 40 }),
}).strict();

export const GetTaskInput = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().uuid(),
  afterEventSeq: z.number().int().min(0).default(0),
  waitMs: z.number().int().min(0).max(20_000).default(0),
  maxEvents: z.number().int().min(1).max(100).default(50),
}).strict();

export const CancelTaskInput = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().uuid(),
  reason: z.string().min(1).max(500),
}).strict();

export type AnalyzeRepoRequest = z.infer<typeof AnalyzeRepoInput>;
export type TaskStatus = 'queued' | 'running' | 'blocked' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'budget_exceeded';

export type TaskRecord = {
  id: string;
  repoId: string;
  requestKey: string;
  payloadHash: string;
  payloadJson: string;
  status: TaskStatus;
  cancelReason: string | null;
  resultJson: string | null;
  createdAt: string;
  updatedAt: string;
  leaseOwner: string | null;
  leaseGeneration: number;
  leaseExpiresAt: string | null;
  deadlineAt: string;
  explorerModelTurns: number;
  explorerToolCalls: number;
};

export type TaskEvent = { seq: number; taskId: string; type: string; data: unknown; createdAt: string };
