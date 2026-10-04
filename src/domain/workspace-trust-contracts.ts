import { z } from 'zod';

export const WorkspaceRef = z.string().regex(/^ws-[a-f0-9]{32}$/);
export const WorkspaceIdentity = z.object({
  schemaVersion: z.literal(1),
  workspaceRef: WorkspaceRef,
  root: z.string().min(1).max(4096),
  marker: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const WorkspaceBinding = z.object({
  schemaVersion: z.literal(1),
  workspaceRef: WorkspaceRef,
  marker: z.string().regex(/^[a-f0-9]{64}$/),
  grantGeneration: z.number().int().positive(),
  capability: z.literal('read'),
}).strict();
export const WorkspaceGrant = WorkspaceBinding.extend({ mode: z.enum(['once', 'durable']) }).strict();
export type WorkspaceIdentityValue = z.infer<typeof WorkspaceIdentity>;
export type WorkspaceBindingValue = z.infer<typeof WorkspaceBinding>;
export type WorkspaceGrantValue = z.infer<typeof WorkspaceGrant>;
