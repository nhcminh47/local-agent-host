import { WorkspaceRef, type WorkspaceBindingValue } from '../domain/workspace-trust-contracts.js';
import { resolveWorkspace } from '../exploration/workspace-identity.js';
import { WorkspaceGrantStore } from '../store/workspace-grant-store.js';

export class WorkspaceTrustService {
  readonly #once = new Map<string, number>();
  constructor(readonly grants: WorkspaceGrantStore) {}
  async select(path: string) {
    const identity = await resolveWorkspace(path);
    const previous = this.grants.get(identity.workspaceRef);
    this.grants.select(identity);
    if (previous && previous.identity.marker !== identity.marker) this.#once.delete(identity.workspaceRef);
    return identity;
  }
  async inspect(ref: string) {
    WorkspaceRef.parse(ref);
    const selected = this.grants.get(ref);
    if (!selected) throw new Error('WORKSPACE_SELECTION_REQUIRED');
    const actual = await resolveWorkspace(selected.identity.root);
    if (actual.marker !== selected.identity.marker || actual.root !== selected.identity.root) throw new Error('WORKSPACE_IDENTITY_CHANGED');
    return selected;
  }
  async grant(ref: string, mode: 'once' | 'durable') {
    const current = await this.inspect(ref);
    if (current.durable && mode === 'once') return { workspaceRef: ref, capability: 'read' as const, mode: 'durable' as const, generation: current.generation };
    const generation = this.grants.setDurable(ref, mode === 'durable');
    if (mode === 'once') this.#once.set(ref, generation);
    else this.#once.delete(ref);
    return { workspaceRef: ref, capability: 'read' as const, mode, generation };
  }
  revoke(ref: string) {
    WorkspaceRef.parse(ref);
    this.#once.delete(ref);
    return this.grants.setDurable(ref, false);
  }
  list() { return this.grants.list().map(row => ({ workspaceRef: row.identity.workspaceRef, root: row.identity.root, capability: row.durable || this.#once.get(row.identity.workspaceRef) === row.generation ? 'read' : null, durable: row.durable })); }
  async requireRead(ref: string): Promise<{ root: string; binding: WorkspaceBindingValue }> {
    const row = await this.inspect(ref);
    if (!row.durable && this.#once.get(ref) !== row.generation) throw new Error('WORKSPACE_TRUST_REQUIRED');
    return { root: row.identity.root, binding: { schemaVersion: 1, workspaceRef: ref, marker: row.identity.marker, grantGeneration: row.generation, capability: 'read' } };
  }
  async assertBinding(binding: WorkspaceBindingValue): Promise<void> {
    const current = await this.requireRead(binding.workspaceRef);
    if (current.binding.marker !== binding.marker || current.binding.grantGeneration < binding.grantGeneration) throw new Error('WORKSPACE_TRUST_REQUIRED');
  }
}
