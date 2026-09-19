import { createHash } from 'node:crypto';
import { z } from 'zod';
import { scopedSnapshotId } from './path-scope.js';

export const SnapshotIdentity = z.object({
  schemaVersion: z.literal(1),
  baseCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/),
  repoRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(value => value.snapshotId === scopedSnapshotId(value.baseCommit, value.scopeHash));
export type SnapshotRecord = z.infer<typeof SnapshotIdentity>;

export function repoRootHash(root: string) {
  return createHash('sha256').update(process.platform === 'win32' ? root.toLowerCase() : root).digest('hex');
}
