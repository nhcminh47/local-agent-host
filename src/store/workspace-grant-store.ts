import Database from 'better-sqlite3';
import { WorkspaceIdentity, type WorkspaceIdentityValue } from '../domain/workspace-trust-contracts.js';

export class WorkspaceGrantStore {
  readonly #db: Database.Database;
  constructor(path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`CREATE TABLE IF NOT EXISTS workspace_selections(ref TEXT PRIMARY KEY, identity_json TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0, durable INTEGER NOT NULL DEFAULT 0);`);
  }
  close() { this.#db.close(); }
  select(identity: WorkspaceIdentityValue): void {
    const old = this.get(identity.workspaceRef);
    if (old) {
      if (old.identity.marker !== identity.marker || old.identity.root !== identity.root) {
        this.#db.prepare('UPDATE workspace_selections SET identity_json=?, generation=generation+1, durable=0 WHERE ref=?').run(JSON.stringify(identity), identity.workspaceRef);
      }
    } else this.#db.prepare('INSERT INTO workspace_selections(ref,identity_json) VALUES(?,?)').run(identity.workspaceRef, JSON.stringify(identity));
  }
  get(ref: string): { identity: WorkspaceIdentityValue; generation: number; durable: boolean } | null {
    const row = this.#db.prepare('SELECT identity_json,generation,durable FROM workspace_selections WHERE ref=?').get(ref) as { identity_json: string; generation: number; durable: number } | undefined;
    if (!row) return null;
    if (![0, 1].includes(row.durable) || !Number.isSafeInteger(row.generation)) throw new Error('INVALID_WORKSPACE_GRANT');
    const identity = WorkspaceIdentity.parse(JSON.parse(row.identity_json));
    if (identity.workspaceRef !== ref) throw new Error('INVALID_WORKSPACE_GRANT');
    return { identity, generation: row.generation, durable: row.durable === 1 };
  }
  list() {
    const rows = this.#db.prepare('SELECT ref FROM workspace_selections ORDER BY ref LIMIT 100').all() as Array<{ ref: string }>;
    return rows.map(row => this.get(row.ref)!);
  }
  setDurable(ref: string, durable: boolean): number {
    const changed = this.#db.prepare('UPDATE workspace_selections SET durable=?, generation=generation+1 WHERE ref=?').run(durable ? 1 : 0, ref);
    if (!changed.changes) throw new Error('WORKSPACE_SELECTION_REQUIRED');
    return this.get(ref)!.generation;
  }
}
