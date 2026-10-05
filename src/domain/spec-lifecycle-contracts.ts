import { z } from 'zod';

export const SpecStatus = z.enum(['draft', 'active', 'completed', 'cancelled', 'superseded', 'archived', 'retired', 'eligible_for_cleanup']);
const Text = z.string().min(1).max(500).refine(value => !/[\r\n\0]/.test(value));
export const SpecSummary = z.object({
  schemaVersion: z.literal(1),
  provenance: z.literal('operator_reviewed'),
  objective: Text,
  acceptance: z.enum(['passed', 'failed', 'partial', 'not_verified']),
  decisions: z.array(Text).max(8),
  implementationRefs: z.array(Text).max(8),
  unresolved: z.array(Text).max(8),
  knowledgeReview: z.enum(['none', 'candidates_recorded']),
  knowledgeIds: z.array(z.string().uuid()).max(16),
}).strict().superRefine((value, context) => {
  if ((value.knowledgeReview === 'none') !== (value.knowledgeIds.length === 0)) context.addIssue({ code: 'custom', path: ['knowledgeIds'], message: 'knowledge review state and candidate IDs disagree' });
  if (Buffer.byteLength(JSON.stringify(value)) > 4_096) context.addIssue({ code: 'custom', message: 'summary exceeds byte limit' });
});
export type SpecSummaryValue = z.infer<typeof SpecSummary>;

export const SpecLifecycleRecord = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  specId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  specPath: z.string().min(1).max(512),
  repoId: z.string().min(1).max(64),
  sourceTaskId: z.string().uuid(),
  repoRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
  support: z.array(z.object({ path: z.string().min(1).max(512), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(8),
  status: SpecStatus,
  summary: SpecSummary.optional(),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type SpecLifecycleRecordValue = z.infer<typeof SpecLifecycleRecord>;

export const SpecLifecycleEvent = z.object({
  schemaVersion: z.literal(1),
  recordId: z.string().uuid(),
  from: SpecStatus.nullable(),
  to: SpecStatus,
  actor: z.enum(['user', 'host']),
  reason: Text,
  at: z.string().datetime(),
}).strict();
export type SpecLifecycleEventValue = z.infer<typeof SpecLifecycleEvent>;

export const SpecRegisterInput = z.object({ taskId: z.string().uuid(), specId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/) }).strict();
export const SpecTransitionInput = z.object({ recordId: z.string().uuid(), action: z.enum(['activate', 'archive', 'restore', 'retire', 'mark_cleanup_eligible', 'cancel', 'supersede']), reason: Text, supersededBy: z.string().uuid().optional() }).strict();
