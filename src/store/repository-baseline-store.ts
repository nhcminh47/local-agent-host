import Database from 'better-sqlite3';
import { RepositoryBaseline, type RepositoryBaselineValue } from '../domain/repository-baseline-contracts.js';

type Row = { baseline_json: string };

export class RepositoryBaselineStore {
  readonly #db: Database.Database;

  constructor(path: string) {
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS baseline_schema_meta(version INTEGER NOT NULL);
      INSERT INTO baseline_schema_meta(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM baseline_schema_meta);
      CREATE TABLE IF NOT EXISTS repository_baselines(
        id TEXT PRIMARY KEY, repo_root_hash TEXT NOT NULL, repo_id TEXT NOT NULL,
        scope_key TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
        fingerprint TEXT NOT NULL, baseline_json TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(repo_root_hash,repo_id,scope_key,version)
      );
      CREATE INDEX IF NOT EXISTS repository_baselines_current ON repository_baselines(repo_root_hash,repo_id,scope_key,status);
    `);
    const meta = this.#db.prepare('SELECT version FROM baseline_schema_meta').get() as { version: number };
    if (meta.version !== 1) { this.#db.close(); throw new Error('BASELINE_SCHEMA_UNSUPPORTED'); }
  }

  close(): void { this.#db.close(); }

  current(repoRootHash: string, repoId: string, scopeHash?: string): RepositoryBaselineValue | null {
    const row = this.#db.prepare("SELECT baseline_json FROM repository_baselines WHERE repo_root_hash=? AND repo_id=? AND scope_key=? AND status='current' ORDER BY version DESC LIMIT 1")
      .get(repoRootHash, repoId, scopeHash ?? '') as Row | undefined;
    return row ? RepositoryBaseline.parse(JSON.parse(row.baseline_json)) : null;
  }

  versions(repoRootHash: string, repoId: string, scopeHash?: string): RepositoryBaselineValue[] {
    const rows = this.#db.prepare('SELECT baseline_json FROM repository_baselines WHERE repo_root_hash=? AND repo_id=? AND scope_key=? ORDER BY version DESC LIMIT 100')
      .all(repoRootHash, repoId, scopeHash ?? '') as Row[];
    return rows.map(row => RepositoryBaseline.parse(JSON.parse(row.baseline_json)));
  }

  saveOrReuse(raw: RepositoryBaselineValue): RepositoryBaselineValue {
    const candidate = RepositoryBaseline.parse(raw);
    return this.#db.transaction(() => {
      const current = this.current(candidate.repoRootHash, candidate.repoId, candidate.scopeHash);
      if (current?.fingerprint === candidate.fingerprint) return current;
      if (current) {
        const previous = RepositoryBaseline.parse({ ...current, status: 'superseded' });
        const changed = this.#db.prepare("UPDATE repository_baselines SET status='superseded',baseline_json=? WHERE id=? AND status='current'")
          .run(JSON.stringify(previous), current.id);
        if (changed.changes !== 1) throw new Error('BASELINE_CONCURRENT_UPDATE');
      }
      const item = RepositoryBaseline.parse({ ...candidate, version: (current?.version ?? 0) + 1 });
      this.#db.prepare('INSERT INTO repository_baselines(id,repo_root_hash,repo_id,scope_key,version,status,fingerprint,baseline_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(item.id, item.repoRootHash, item.repoId, item.scopeHash ?? '', item.version, 'current', item.fingerprint, JSON.stringify(item), item.createdAt);
      return item;
    })();
  }
}
