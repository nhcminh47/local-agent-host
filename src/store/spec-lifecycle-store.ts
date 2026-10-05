import Database from 'better-sqlite3';
import { SpecLifecycleEvent, SpecLifecycleRecord, SpecSummary, type SpecLifecycleEventValue, type SpecLifecycleRecordValue, type SpecSummaryValue } from '../domain/spec-lifecycle-contracts.js';

type Row = { record_json: string };

export class SpecLifecycleStore {
  readonly #db: Database.Database;

  constructor(path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS spec_lifecycle_schema_meta(version INTEGER NOT NULL);
      INSERT INTO spec_lifecycle_schema_meta(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM spec_lifecycle_schema_meta);
      CREATE TABLE IF NOT EXISTS spec_lifecycle_records(
        id TEXT PRIMARY KEY, repo_root_hash TEXT NOT NULL, repo_id TEXT NOT NULL,
        spec_id TEXT NOT NULL, status TEXT NOT NULL, bundle_hash TEXT NOT NULL,
        record_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS spec_lifecycle_by_repo ON spec_lifecycle_records(repo_root_hash,repo_id,spec_id,created_at,id);
      CREATE TABLE IF NOT EXISTS spec_lifecycle_events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL REFERENCES spec_lifecycle_records(id),
        event_json TEXT NOT NULL, at TEXT NOT NULL
      );
    `);
    const meta = this.#db.prepare('SELECT version FROM spec_lifecycle_schema_meta').get() as { version: number };
    if (meta.version !== 1) { this.#db.close(); throw new Error('SPEC_LIFECYCLE_SCHEMA_UNSUPPORTED'); }
  }

  close(): void { this.#db.close(); }

  get(id: string): SpecLifecycleRecordValue {
    const row = this.#db.prepare('SELECT record_json FROM spec_lifecycle_records WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new Error('SPEC_LIFECYCLE_NOT_FOUND');
    return SpecLifecycleRecord.parse(JSON.parse(row.record_json));
  }

  latest(repoRootHash: string, repoId: string, specId: string): SpecLifecycleRecordValue | null {
    const row = this.#db.prepare('SELECT record_json FROM spec_lifecycle_records WHERE repo_root_hash=? AND repo_id=? AND spec_id=? ORDER BY rowid DESC LIMIT 1')
      .get(repoRootHash, repoId, specId) as Row | undefined;
    return row ? SpecLifecycleRecord.parse(JSON.parse(row.record_json)) : null;
  }

  list(repoRootHash: string, repoId: string): SpecLifecycleRecordValue[] {
    const rows = this.#db.prepare('SELECT record_json FROM spec_lifecycle_records WHERE repo_root_hash=? AND repo_id=? ORDER BY updated_at DESC,id DESC LIMIT 100')
      .all(repoRootHash, repoId) as Row[];
    return rows.map(row => SpecLifecycleRecord.parse(JSON.parse(row.record_json)));
  }

  events(id: string): SpecLifecycleEventValue[] {
    this.get(id);
    const rows = this.#db.prepare('SELECT event_json FROM spec_lifecycle_events WHERE record_id=? ORDER BY seq LIMIT 100').all(id) as Array<{ event_json: string }>;
    return rows.map(row => SpecLifecycleEvent.parse(JSON.parse(row.event_json)));
  }

  register(raw: SpecLifecycleRecordValue): SpecLifecycleRecordValue {
    const candidate = SpecLifecycleRecord.parse(raw);
    if (candidate.status !== 'draft') throw new Error('SPEC_LIFECYCLE_INVALID_TRANSITION');
    return this.#db.transaction(() => {
      const prior = this.latest(candidate.repoRootHash, candidate.repoId, candidate.specId);
      if (prior?.bundleHash === candidate.bundleHash && prior.snapshotId === candidate.snapshotId && prior.scopeHash === candidate.scopeHash) return prior;
      if (prior && !['superseded', 'retired', 'eligible_for_cleanup'].includes(prior.status)) {
        this.#update(prior, 'superseded', 'host', 'A changed admitted spec bundle superseded this source version.');
      }
      this.#db.prepare('INSERT INTO spec_lifecycle_records(id,repo_root_hash,repo_id,spec_id,status,bundle_hash,record_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(candidate.id, candidate.repoRootHash, candidate.repoId, candidate.specId, candidate.status, candidate.bundleHash, JSON.stringify(candidate), candidate.createdAt, candidate.updatedAt);
      this.#event(candidate.id, null, 'draft', 'host', 'Registered from admitted filtered snapshot.');
      return candidate;
    })();
  }

  finalize(id: string, rawSummary: SpecSummaryValue): SpecLifecycleRecordValue {
    const summary = SpecSummary.parse(rawSummary);
    return this.#db.transaction(() => {
      const item = this.get(id);
      if (!['draft', 'active'].includes(item.status)) throw new Error('SPEC_LIFECYCLE_INVALID_TRANSITION');
      const updated = this.#update(item, 'completed', 'user', 'Operator reviewed final outcome and knowledge handoff.', summary);
      return updated;
    })();
  }

  transition(id: string, action: 'activate' | 'archive' | 'restore' | 'retire' | 'mark_cleanup_eligible' | 'cancel' | 'supersede', reason: string, supersededBy?: string): SpecLifecycleRecordValue {
    return this.#db.transaction(() => {
      const item = this.get(id);
      const next = action === 'activate' && item.status === 'draft' ? 'active'
        : action === 'archive' && item.status === 'completed' && item.summary ? 'archived'
        : action === 'restore' && ['archived', 'eligible_for_cleanup'].includes(item.status) ? 'active'
        : action === 'retire' && ['cancelled', 'superseded', 'archived'].includes(item.status) ? 'retired'
        : action === 'mark_cleanup_eligible' && ['archived', 'retired'].includes(item.status) ? 'eligible_for_cleanup'
        : action === 'cancel' && ['draft', 'active'].includes(item.status) ? 'cancelled'
        : action === 'supersede' && ['draft', 'active', 'completed'].includes(item.status) && supersededBy ? 'superseded' : null;
      if (!next) throw new Error('SPEC_LIFECYCLE_INVALID_TRANSITION');
      return this.#update(item, next, 'user', reason, item.summary, supersededBy);
    })();
  }

  report(repoRootHash: string, repoId: string): { specs: Record<string, number>; learning: Record<string, number>; baselines: Record<string, number>; terminalTasks: number; deletionPerformed: false } {
    const counts = (table: string, column: string, where: string, args: string[]) => {
      try {
        const rows = this.#db.prepare(`SELECT ${column} AS status,COUNT(*) AS count FROM ${table} WHERE ${where} GROUP BY ${column}`).all(...args) as Array<{ status: string; count: number }>;
        return Object.fromEntries(rows.map(row => [row.status, row.count]));
      } catch (error) {
        if (error instanceof Error && /no such table/i.test(error.message)) return {};
        throw error;
      }
    };
    const task = this.#db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE repo_id=? AND status IN ('completed','failed','cancelled','budget_exceeded')").get(repoId) as { count: number };
    return {
      specs: counts('spec_lifecycle_records', 'status', 'repo_root_hash=? AND repo_id=?', [repoRootHash, repoId]),
      learning: counts('learning_items', 'status', 'repo_root_hash=?', [repoRootHash]),
      baselines: counts('repository_baselines', 'status', 'repo_root_hash=? AND repo_id=?', [repoRootHash, repoId]),
      terminalTasks: task.count, deletionPerformed: false,
    };
  }

  #update(item: SpecLifecycleRecordValue, status: SpecLifecycleRecordValue['status'], actor: 'user' | 'host', reason: string, summary = item.summary, supersededBy?: string): SpecLifecycleRecordValue {
    const updatedAt = new Date().toISOString();
    const updated = SpecLifecycleRecord.parse({ ...item, status, ...(summary ? { summary } : {}), ...(supersededBy ? { supersededBy } : {}), updatedAt });
    const changed = this.#db.prepare('UPDATE spec_lifecycle_records SET status=?,record_json=?,updated_at=? WHERE id=? AND status=?')
      .run(status, JSON.stringify(updated), updatedAt, item.id, item.status);
    if (changed.changes !== 1) throw new Error('SPEC_LIFECYCLE_INVALID_TRANSITION');
    this.#event(item.id, item.status, status, actor, reason);
    return updated;
  }

  #event(id: string, from: SpecLifecycleEventValue['from'], to: SpecLifecycleEventValue['to'], actor: 'user' | 'host', reason: string): void {
    const event = SpecLifecycleEvent.parse({ schemaVersion: 1, recordId: id, from, to, actor, reason, at: new Date().toISOString() });
    this.#db.prepare('INSERT INTO spec_lifecycle_events(record_id,event_json,at) VALUES(?,?,?)').run(id, JSON.stringify(event), event.at);
  }
}
