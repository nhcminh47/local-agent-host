import { ERROR_CODES } from '../constants/error-codes.js';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import type { AnalyzeRepoRequest, TaskEvent, TaskRecord, TaskStatus } from '../domain/task-contracts.js';
import { SnapshotIdentity, type SnapshotRecord } from '../domain/snapshot-contracts.js';

const terminal = new Set<TaskStatus>(['cancelled', 'completed', 'failed', 'budget_exceeded']);

export class IdempotencyConflict extends Error { constructor() { super(ERROR_CODES.IDEMPOTENCY_CONFLICT); } }
export class TaskNotFound extends Error { constructor() { super(ERROR_CODES.TASK_NOT_FOUND); } }
export class InvalidTransition extends Error { constructor() { super(ERROR_CODES.INVALID_TRANSITION); } }
export class QueueFull extends Error { constructor() { super(ERROR_CODES.QUEUE_FULL); } }
export class StaleLease extends Error { constructor() { super(ERROR_CODES.STALE_LEASE); } }

function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function now() { return new Date().toISOString(); }

export class TaskStore {
  readonly #db: Database.Database;
  readonly #queueCapacity: number;

  constructor(path: string, queueCapacity = 20) {
    if (!Number.isInteger(queueCapacity) || queueCapacity < 1) throw new Error(ERROR_CODES.INVALID_QUEUE_CAPACITY);
    this.#queueCapacity = queueCapacity;
    this.#db = new Database(path);
    this.#db.pragma('journal_mode = WAL');
    this.#db.pragma('foreign_keys = ON');
    this.#db.pragma('busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta(version INTEGER NOT NULL);
      INSERT INTO schema_meta(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_meta);
      CREATE TABLE IF NOT EXISTS tasks(
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, request_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL,
        cancel_reason TEXT, result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(repo_id, request_key)
      );
      CREATE TABLE IF NOT EXISTS task_events(
        seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id),
        type TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_events_task_seq ON task_events(task_id, seq);
      CREATE TABLE IF NOT EXISTS task_snapshots(
        task_id TEXT PRIMARY KEY REFERENCES tasks(id),
        identity_json TEXT NOT NULL
      );
    `);
    for (const migration of [
      'ALTER TABLE tasks ADD COLUMN lease_owner TEXT',
      'ALTER TABLE tasks ADD COLUMN lease_generation INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT',
      'ALTER TABLE tasks ADD COLUMN deadline_at TEXT',
      'ALTER TABLE tasks ADD COLUMN explorer_turns INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tasks ADD COLUMN explorer_tools INTEGER NOT NULL DEFAULT 0',
    ]) {
      try { this.#db.exec(migration); }
      catch (error) { if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error; }
    }
    this.#db.exec('UPDATE schema_meta SET version=5');
    this.#db.exec("UPDATE tasks SET deadline_at=datetime(created_at, '+10 minutes') WHERE deadline_at IS NULL");
  }

  close() {
    this.#db.pragma('wal_checkpoint(TRUNCATE)');
    this.#db.close();
  }

  findSubmission(request: AnalyzeRepoRequest): TaskRecord | null {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE repo_id=? AND request_key=?').get(request.repoId, request.requestKey) as Record<string, unknown> | undefined;
    if (!row) return null;
    const task = this.#mapTask(row);
    if (task.payloadHash !== hash(JSON.stringify(request))) throw new IdempotencyConflict();
    return task;
  }

  nextQueued(): TaskRecord | null {
    const row = this.#db.prepare("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at,id LIMIT 1").get() as Record<string, unknown> | undefined;
    return row ? this.#mapTask(row) : null;
  }

  reserveExplorerBudget(id: string, owner: string, generation: number, kind: 'turn' | 'tool', limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error(ERROR_CODES.INVALID_BUDGET);
    const column = kind === 'turn' ? 'explorer_turns' : 'explorer_tools';
    const changed = this.#db.prepare(`UPDATE tasks SET ${column}=${column}+1 WHERE id=? AND status='running' AND lease_owner=? AND lease_generation=? AND ${column}<?`).run(id, owner, generation, limit);
    if (!changed.changes) {
      const task = this.get(id);
      if (task.status !== 'running' || task.leaseOwner !== owner || task.leaseGeneration !== generation) throw new StaleLease();
      throw new Error(kind === 'turn' ? ERROR_CODES.EXPLORER_TURN_LIMIT : ERROR_CODES.EXPLORER_TOOL_LIMIT);
    }
  }

  blockLeased(id: string, owner: string, generation: number, requiredAction: unknown) {
    return this.#publishLeased(id, owner, generation, 'blocked', { schemaVersion: 1, outcome: 'blocked', error: ERROR_CODES.MISSING_CAPABILITY, requiredAction }, 'task.blocked');
  }

  budgetExceededLeased(id: string, owner: string, generation: number, error: string) {
    return this.#publishLeased(id, owner, generation, 'budget_exceeded', { schemaVersion: 1, outcome: 'budget_exceeded', error }, 'task.budget_exceeded');
  }

  resumeCapabilityTasks(): number {
    return this.#db.transaction(() => {
      const rows = this.#db.prepare("SELECT id,result_json FROM tasks WHERE status='blocked' AND deadline_at>?").all(now()) as Array<{ id: string; result_json: string }>;
      let count = 0;
      for (const row of rows) {
        if (JSON.parse(row.result_json).error !== ERROR_CODES.MISSING_CAPABILITY) continue;
        this.#db.prepare("UPDATE tasks SET status='queued',result_json=NULL,updated_at=? WHERE id=?").run(now(), row.id);
        this.#event(row.id, 'task.capability_resolved', { schemaVersion: 1 });
        count++;
      }
      return count;
    })();
  }

  snapshot(taskId: string): SnapshotRecord | null {
    this.get(taskId);
    const row = this.#db.prepare('SELECT identity_json FROM task_snapshots WHERE task_id=?').get(taskId) as { identity_json: string } | undefined;
    if (!row) return null;
    try { return SnapshotIdentity.parse(JSON.parse(row.identity_json)); }
    catch { throw new Error(ERROR_CODES.INVALID_PERSISTED_SNAPSHOT); }
  }

  submit(request: AnalyzeRepoRequest, snapshot?: SnapshotRecord): { task: TaskRecord; created: boolean } {
    const identity = snapshot === undefined ? undefined : SnapshotIdentity.parse(snapshot);
    const payloadJson = JSON.stringify(request);
    const payloadHash = hash(payloadJson);
    return this.#db.transaction(() => {
      const existing = this.#db.prepare('SELECT * FROM tasks WHERE repo_id=? AND request_key=?').get(request.repoId, request.requestKey) as Record<string, unknown> | undefined;
      if (existing) {
        const task = this.#mapTask(existing);
        if (task.payloadHash !== payloadHash) throw new IdempotencyConflict();
        if ((identity !== undefined) !== (this.snapshot(task.id) !== null)) throw new Error(ERROR_CODES.SNAPSHOT_MODE_CONFLICT);
        return { task, created: false };
      }
      const active = Number((this.#db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status NOT IN ('cancelled','completed','failed','budget_exceeded')").get() as { count: number }).count);
      if (active >= this.#queueCapacity) throw new QueueFull();
      const id = randomUUID();
      const timestamp = now();
      const deadlineAt = new Date(Date.now() + request.budget.maxWallSeconds * 1_000).toISOString();
      this.#db.prepare('INSERT INTO tasks(id,repo_id,request_key,payload_hash,payload_json,status,cancel_reason,result_json,created_at,updated_at,deadline_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, request.repoId, request.requestKey, payloadHash, payloadJson, 'queued', null, null, timestamp, timestamp, deadlineAt);
      this.#event(id, 'task.queued', { schemaVersion: 1 });
      if (identity) {
        this.#db.prepare('INSERT INTO task_snapshots(task_id,identity_json) VALUES(?,?)').run(id, JSON.stringify(identity));
        this.#event(id, 'task.snapshot_admitted', { schemaVersion: 1, baseCommit: identity.baseCommit, snapshotId: identity.snapshotId });
      }
      return { task: this.get(id), created: true };
    })();
  }

  claim(id: string, owner: string, leaseMs: number): { task: TaskRecord; generation: number } {
    if (!owner || !Number.isInteger(leaseMs) || leaseMs < 100) throw new Error(ERROR_CODES.INVALID_LEASE);
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (task.status !== 'queued') throw new InvalidTransition();
      if (task.deadlineAt <= now()) {
        this.#db.prepare('UPDATE tasks SET status=?, result_json=?, updated_at=? WHERE id=?').run('budget_exceeded', JSON.stringify({ schemaVersion: 1, outcome: 'budget_exceeded', error: 'DEADLINE_EXCEEDED' }), now(), id);
        this.#event(id, 'task.budget_exceeded', { phase: 'queued' });
        throw new InvalidTransition();
      }
      const generation = task.leaseGeneration + 1;
      const expiresAt = new Date(Date.now() + leaseMs).toISOString();
      const timestamp = now();
      this.#db.prepare('UPDATE tasks SET status=?, lease_owner=?, lease_generation=?, lease_expires_at=?, updated_at=? WHERE id=?').run('running', owner, generation, expiresAt, timestamp, id);
      this.#event(id, 'task.running', { owner, generation, leaseExpiresAt: expiresAt });
      return { task: this.get(id), generation };
    })();
  }

  renewLease(id: string, owner: string, generation: number, leaseMs: number): TaskRecord {
    if (!Number.isInteger(leaseMs) || leaseMs < 100) throw new Error(ERROR_CODES.INVALID_LEASE);
    return this.#db.transaction(() => {
      const expiresAt = new Date(Date.now() + leaseMs).toISOString();
      const changed = this.#db.prepare('UPDATE tasks SET lease_expires_at=?, updated_at=? WHERE id=? AND status=? AND lease_owner=? AND lease_generation=?').run(expiresAt, now(), id, 'running', owner, generation);
      if (changed.changes !== 1) throw new StaleLease();
      this.#event(id, 'task.lease_renewed', { owner, generation, leaseExpiresAt: expiresAt });
      return this.get(id);
    })();
  }

  takeoverExpired(id: string, owner: string, leaseMs: number, observedAt = now()): { task: TaskRecord; generation: number } {
    if (!owner || !Number.isInteger(leaseMs) || leaseMs < 100) throw new Error(ERROR_CODES.INVALID_LEASE);
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (task.status !== 'running' || task.leaseExpiresAt === null || task.leaseExpiresAt > observedAt) throw new InvalidTransition();
      const generation = task.leaseGeneration + 1;
      const expiresAt = new Date(Date.now() + leaseMs).toISOString();
      this.#db.prepare('UPDATE tasks SET lease_owner=?, lease_generation=?, lease_expires_at=?, updated_at=? WHERE id=?').run(owner, generation, expiresAt, now(), id);
      this.#event(id, 'task.lease_taken_over', { previousOwner: task.leaseOwner, owner, generation, leaseExpiresAt: expiresAt });
      return { task: this.get(id), generation };
    })();
  }

  expireDue(observedAt = now()): number {
    return this.#db.transaction(() => {
      const rows = this.#db.prepare("SELECT id,status FROM tasks WHERE status IN ('queued','running','blocked') AND deadline_at<=?").all(observedAt) as Array<{ id: string; status: TaskStatus }>;
      for (const task of rows) {
        this.#db.prepare('UPDATE tasks SET status=?, result_json=?, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=?').run('budget_exceeded', JSON.stringify({ schemaVersion: 1, outcome: 'budget_exceeded', error: 'DEADLINE_EXCEEDED' }), now(), task.id);
        this.#event(task.id, 'task.budget_exceeded', { phase: task.status });
      }
      return rows.length;
    })();
  }

  completeLeased(id: string, owner: string, generation: number, result: unknown): TaskRecord {
    return this.#publishLeased(id, owner, generation, 'completed', result, 'task.completed');
  }

  failLeased(id: string, owner: string, generation: number, code: string): TaskRecord {
    return this.#publishLeased(id, owner, generation, 'failed', { schemaVersion: 1, outcome: 'failed', error: code }, 'task.failed');
  }

  get(id: string): TaskRecord {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) throw new TaskNotFound();
    return this.#mapTask(row);
  }

  events(id: string, after = 0, limit = 100): TaskEvent[] {
    this.get(id);
    const rows = this.#db.prepare('SELECT * FROM task_events WHERE task_id=? AND seq>? ORDER BY seq LIMIT ?').all(id, after, limit) as Array<Record<string, unknown>>;
    return rows.map(row => ({ seq: Number(row['seq']), taskId: String(row['task_id']), type: String(row['type']), data: JSON.parse(String(row['data_json'])), createdAt: String(row['created_at']) }));
  }

  transition(id: string, from: TaskStatus[], to: TaskStatus, eventType: string, data: unknown = {}): TaskRecord {
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (!from.includes(task.status)) throw new InvalidTransition();
      const timestamp = now();
      this.#db.prepare('UPDATE tasks SET status=?, updated_at=? WHERE id=?').run(to, timestamp, id);
      this.#event(id, eventType, data);
      return this.get(id);
    })();
  }

  complete(id: string, result: unknown): TaskRecord {
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (task.status !== 'running') throw new InvalidTransition();
      const timestamp = now();
      this.#db.prepare('UPDATE tasks SET status=?, result_json=?, updated_at=? WHERE id=?').run('completed', JSON.stringify(result), timestamp, id);
      this.#event(id, 'task.completed', { schemaVersion: 1 });
      return this.get(id);
    })();
  }

  fail(id: string, code: string): TaskRecord {
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (task.status !== 'running') throw new InvalidTransition();
      const timestamp = now();
      this.#db.prepare('UPDATE tasks SET status=?, result_json=?, updated_at=? WHERE id=?').run('failed', JSON.stringify({ schemaVersion: 1, outcome: 'failed', error: code }), timestamp, id);
      this.#event(id, 'task.failed', { code });
      return this.get(id);
    })();
  }

  cancel(id: string, reason: string): TaskRecord {
    return this.#db.transaction(() => {
      const task = this.get(id);
      if (terminal.has(task.status)) return task;
      const status: TaskStatus = ['queued', 'blocked'].includes(task.status) ? 'cancelled' : 'cancelling';
      const timestamp = now();
      this.#db.prepare('UPDATE tasks SET status=?, cancel_reason=?, updated_at=? WHERE id=?').run(status, reason, timestamp, id);
      this.#event(id, status === 'cancelled' ? 'task.cancelled' : 'task.cancellation_requested', { reason });
      return this.get(id);
    })();
  }

  recoverInterrupted(): number {
    return this.#db.transaction(() => {
      const rows = this.#db.prepare("SELECT id FROM tasks WHERE status IN ('running','cancelling')").all() as Array<{ id: string }>;
      for (const { id } of rows) {
        const task = this.get(id);
        const next: TaskStatus = task.status === 'cancelling' ? 'cancelled' : 'queued';
        this.#db.prepare('UPDATE tasks SET status=?, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=?').run(next, now(), id);
        this.#event(id, 'task.recovered', { previousStatus: task.status, status: next });
      }
      return rows.length;
    })();
  }

  #event(taskId: string, type: string, data: unknown) {
    this.#db.prepare('INSERT INTO task_events(task_id,type,data_json,created_at) VALUES(?,?,?,?)').run(taskId, type, JSON.stringify(data), now());
  }

  #publishLeased(id: string, owner: string, generation: number, status: 'completed' | 'failed' | 'blocked' | 'budget_exceeded', result: unknown, eventType: string): TaskRecord {
    return this.#db.transaction(() => {
      const changed = this.#db.prepare('UPDATE tasks SET status=?, result_json=?, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=? AND status=? AND lease_owner=? AND lease_generation=?').run(status, JSON.stringify(result), now(), id, 'running', owner, generation);
      if (changed.changes !== 1) throw new StaleLease();
      this.#event(id, eventType, { schemaVersion: 1, generation });
      return this.get(id);
    })();
  }

  #mapTask(row: Record<string, unknown>): TaskRecord {
    return { id: String(row['id']), repoId: String(row['repo_id']), requestKey: String(row['request_key']), payloadHash: String(row['payload_hash']), payloadJson: String(row['payload_json']), status: String(row['status']) as TaskStatus, cancelReason: row['cancel_reason'] === null ? null : String(row['cancel_reason']), resultJson: row['result_json'] === null ? null : String(row['result_json']), createdAt: String(row['created_at']), updatedAt: String(row['updated_at']), leaseOwner: row['lease_owner'] === null ? null : String(row['lease_owner']), leaseGeneration: Number(row['lease_generation']), leaseExpiresAt: row['lease_expires_at'] === null ? null : String(row['lease_expires_at']), deadlineAt: String(row['deadline_at']), explorerModelTurns: Number(row['explorer_turns']), explorerToolCalls: Number(row['explorer_tools']) };
  }
}
