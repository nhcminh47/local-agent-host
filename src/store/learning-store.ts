import Database from 'better-sqlite3';
import { LearningDecision, LearningItem, type LearningDecisionValue, type LearningItemValue } from '../domain/learning-contracts.js';

type ItemRow = { item_json: string };

/** Separate additive schema; task/event rows and their version are untouched. */
export class LearningStore {
  readonly #db: Database.Database;

  constructor(path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS learning_schema_meta(version INTEGER NOT NULL);
      INSERT INTO learning_schema_meta(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM learning_schema_meta);
      CREATE TABLE IF NOT EXISTS learning_items(
        id TEXT PRIMARY KEY, repo_root_hash TEXT NOT NULL, status TEXT NOT NULL,
        source_task_id TEXT NOT NULL, source_finding_id TEXT NOT NULL, kind TEXT NOT NULL,
        item_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(source_task_id,source_finding_id,kind)
      );
      CREATE INDEX IF NOT EXISTS learning_items_retrieval ON learning_items(repo_root_hash,status,created_at,id);
      CREATE TABLE IF NOT EXISTS learning_decisions(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL REFERENCES learning_items(id),
        decision_json TEXT NOT NULL, decided_at TEXT NOT NULL
      );
    `);
    const row = this.#db.prepare('SELECT version FROM learning_schema_meta').get() as { version: number };
    if (row.version !== 1) { this.#db.close(); throw new Error('LEARNING_SCHEMA_UNSUPPORTED'); }
  }

  close(): void { this.#db.close(); }

  add(raw: LearningItemValue): LearningItemValue {
    const item = LearningItem.parse(raw);
    if (item.status !== 'candidate') throw new Error('LEARNING_INVALID_TRANSITION');
    this.#db.prepare('INSERT INTO learning_items(id,repo_root_hash,status,source_task_id,source_finding_id,kind,item_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(item.id, item.repoRootHash, item.status, item.sourceTaskId, item.sourceFindingId, item.kind, JSON.stringify(item), item.createdAt, item.updatedAt);
    return item;
  }

  get(id: string): LearningItemValue {
    const row = this.#db.prepare('SELECT item_json FROM learning_items WHERE id=?').get(id) as ItemRow | undefined;
    if (!row) throw new Error('LEARNING_NOT_FOUND');
    return LearningItem.parse(JSON.parse(row.item_json));
  }

  list(repoRootHash: string, limit = 100): LearningItemValue[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('LEARNING_INVALID_LIMIT');
    const rows = this.#db.prepare('SELECT item_json FROM learning_items WHERE repo_root_hash=? ORDER BY created_at DESC,id DESC LIMIT ?').all(repoRootHash, limit) as ItemRow[];
    return rows.map(row => LearningItem.parse(JSON.parse(row.item_json)));
  }

  active(repoRootHash: string, limit = 128): LearningItemValue[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 128) throw new Error('LEARNING_INVALID_LIMIT');
    const rows = this.#db.prepare("SELECT item_json FROM learning_items WHERE repo_root_hash=? AND status='active' ORDER BY created_at DESC,id DESC LIMIT ?").all(repoRootHash, limit) as ItemRow[];
    return rows.map(row => LearningItem.parse(JSON.parse(row.item_json)));
  }

  decisions(id: string): LearningDecisionValue[] {
    this.get(id);
    const rows = this.#db.prepare('SELECT decision_json FROM learning_decisions WHERE item_id=? ORDER BY seq').all(id) as Array<{ decision_json: string }>;
    return rows.map(row => LearningDecision.parse(JSON.parse(row.decision_json)));
  }

  decide(id: string, action: LearningDecisionValue['action'], actor: LearningDecisionValue['actor'], reason: string): LearningItemValue {
    return this.#db.transaction(() => {
      const item = this.get(id);
      const next = action === 'promote' && item.status === 'candidate' ? 'active'
        : action === 'reject' && item.status === 'candidate' ? 'rejected'
        : action === 'retire' && ['active', 'stale'].includes(item.status) ? 'retired'
        : action === 'mark_stale' && item.status === 'active' ? 'stale' : null;
      if (!next) throw new Error('LEARNING_INVALID_TRANSITION');
      const decidedAt = new Date().toISOString();
      const decision = LearningDecision.parse({ schemaVersion: 1, itemId: id, action, actor, reason, decidedAt });
      const updated = LearningItem.parse({ ...item, status: next, updatedAt: decidedAt });
      const changed = this.#db.prepare('UPDATE learning_items SET status=?,item_json=?,updated_at=? WHERE id=? AND status=?')
        .run(next, JSON.stringify(updated), decidedAt, id, item.status);
      if (changed.changes !== 1) throw new Error('LEARNING_INVALID_TRANSITION');
      this.#db.prepare('INSERT INTO learning_decisions(item_id,decision_json,decided_at) VALUES(?,?,?)')
        .run(id, JSON.stringify(decision), decidedAt);
      return updated;
    })();
  }
}
