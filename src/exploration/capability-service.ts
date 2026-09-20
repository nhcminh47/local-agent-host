import { ERROR_CODES } from '../constants/error-codes.js';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { CapabilityRegistry } from './capabilities.js';

export const CheckCapabilityInput = z.object({
  schemaVersion: z.literal(1), capability: z.literal('ripgrep'),
}).strict();
export const ResolveCapabilityInput = CheckCapabilityInput.extend({
  decision: z.enum(['install', 'use_builtin_fallback', 'cancel']),
}).strict();

// Host-owned state: callers cannot select an executable, state path or command.
export class CapabilityService {
  readonly #db: Database.Database;
  readonly #registry = new CapabilityRegistry();
  constructor(path: string, readonly executable = 'rg') {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`CREATE TABLE IF NOT EXISTS capability_decisions (
      capability TEXT PRIMARY KEY CHECK(capability = 'ripgrep'),
      decision TEXT NOT NULL CHECK(decision = 'use_builtin_fallback'),
      updated_at TEXT NOT NULL
    )`);
  }
  close() { this.#db.close(); }
  invalidate() { this.#registry.clear(); }
  async ripgrepExecutable() {
    const capability = await this.#registry.ripgrep(this.executable);
    if (capability.status !== 'available') throw new Error(ERROR_CODES.RIPGREP_UNAVAILABLE);
    return capability.executable;
  }

  async check(raw: unknown) {
    CheckCapabilityInput.parse(raw);
    const preference = this.#db.prepare('SELECT decision FROM capability_decisions WHERE capability=?').get('ripgrep');
    if (preference) return { schemaVersion: 1, capability: 'ripgrep', status: 'available', backend: 'node', source: 'persisted_decision' };
    const capability = await this.#registry.ripgrep(this.executable);
    if (capability.status === 'available') return { schemaVersion: 1, capability: 'ripgrep', status: 'available', backend: 'ripgrep', version: capability.version };
    return { schemaVersion: 1, capability: 'ripgrep', status: 'blocked', reason: ERROR_CODES.MISSING_CAPABILITY, requiredAction: { capability: 'ripgrep', choices: capability.choices } };
  }

  async resolve(raw: unknown) {
    const input = ResolveCapabilityInput.parse(raw);
    if (input.decision === 'cancel') {
      // Cancel this capability request, never a global preference or an unrelated task.
      return { schemaVersion: 1, capability: 'ripgrep', status: 'cancelled' };
    }
    if (input.decision === 'install') {
      // Re-probe after manual installation. No installer is implemented in M2 yet.
      this.#registry.clear();
      const capability = await this.#registry.ripgrep(this.executable);
      if (capability.status === 'missing') return { schemaVersion: 1, capability: 'ripgrep', status: 'blocked', reason: 'HOST_INSTALLER_UNAVAILABLE', requiredAction: { capability: 'ripgrep', choices: capability.choices } };
      this.#db.prepare('DELETE FROM capability_decisions WHERE capability=?').run('ripgrep');
      return this.check(CheckCapabilityInput.parse(inputWithoutDecision(input)));
    }
    this.#db.prepare(`INSERT INTO capability_decisions(capability, decision, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(capability) DO UPDATE SET decision=excluded.decision, updated_at=excluded.updated_at`)
      .run('ripgrep', input.decision, new Date().toISOString());
    return this.check(inputWithoutDecision(input));
  }
}

function inputWithoutDecision(input: z.infer<typeof ResolveCapabilityInput>) {
  return { schemaVersion: input.schemaVersion, capability: input.capability };
}
