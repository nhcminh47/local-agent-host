import { z } from 'zod';

const Path = z.string().min(1).max(512).refine(value =>
  !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(part => !part || part === '.' || part === '..') && !/[\x00-\x1f\x7f:]/.test(value));

export const BaselineEvidence = z.object({
  path: Path,
  kind: z.enum(['eligible_path', 'filtered_blob']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const BaselineClaim = z.object({
  category: z.enum(['identity', 'language', 'package', 'module', 'entry_point', 'command', 'tests', 'guidance', 'configuration', 'architecture']),
  classification: z.enum(['observed', 'derived']),
  value: z.string().min(1).max(256).refine(value => !/[\r\n\0]/.test(value)),
  evidence: z.array(BaselineEvidence).min(1).max(2),
}).strict();

export const RepositoryBaseline = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.enum(['current', 'superseded']),
  repoId: z.string().min(1).max(64),
  repoRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  claims: z.array(BaselineClaim).max(40),
  unknowns: z.array(z.string().min(1).max(256)).max(8),
  createdAt: z.string().datetime(),
}).strict();

export type RepositoryBaselineValue = z.infer<typeof RepositoryBaseline>;
