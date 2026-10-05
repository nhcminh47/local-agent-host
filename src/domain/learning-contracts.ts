import { z } from 'zod';
import { FindingCitation } from './exploration-result.js';

export const LearningStatus = z.enum(['candidate', 'active', 'rejected', 'retired', 'stale']);
export const LearningKind = z.enum(['fact', 'convention', 'procedure', 'skill']);
export const LearningSupport = FindingCitation.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const LearningItem = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  kind: LearningKind,
  status: LearningStatus,
  statement: z.string().min(1).max(1_500).refine(value => !/[\r\n\0]/.test(value)),
  repoRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  repoId: z.string().min(1).max(64),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceTaskId: z.string().uuid(),
  sourceFindingId: z.string().min(1).max(64),
  support: z.array(LearningSupport).min(1).max(8),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type LearningItemValue = z.infer<typeof LearningItem>;

export const LearningDecision = z.object({
  schemaVersion: z.literal(1),
  itemId: z.string().uuid(),
  action: z.enum(['promote', 'reject', 'retire', 'mark_stale']),
  actor: z.enum(['user', 'host']),
  reason: z.string().min(1).max(500).refine(value => !/[\r\n\0]/.test(value)),
  decidedAt: z.string().datetime(),
}).strict();
export type LearningDecisionValue = z.infer<typeof LearningDecision>;

export const LearningProposeInput = z.object({
  taskId: z.string().uuid(),
  findingId: z.string().min(1).max(64),
  kind: LearningKind.default('fact'),
}).strict();
export const LearningDecisionInput = z.object({
  itemId: z.string().uuid(),
  action: z.enum(['promote', 'reject', 'retire']),
  reason: z.string().min(1).max(500),
}).strict();
