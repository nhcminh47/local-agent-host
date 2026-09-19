import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { endpoint } from '../src/m0/doctor.js';

test('SQLite native binding: WAL, rollback, close and reopen on Unicode path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'local-agent M0 tiếng Việt-'));
  const path = join(dir, 'probe.db');
  let db: Database.Database | undefined;
  try {
    db = new Database(path);
    assert.equal(db.pragma('journal_mode = WAL', { simple: true }), 'wal');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL)');
    db.prepare('INSERT INTO tasks VALUES (?, ?)').run('task-1', 'queued');
    const connection = db;
    assert.throws(connection.transaction(() => {
      connection.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('running', 'task-1');
      throw new Error('injected rollback');
    }));
    assert.deepEqual(db.prepare('SELECT status FROM tasks').get(), { status: 'queued' });
    db.close();
    db = new Database(path);
    assert.deepEqual(db.prepare('SELECT * FROM tasks').get(), { id: 'task-1', status: 'queued' });
  } finally {
    db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('doctor rejects credentials and ambiguous endpoint origins', () => {
  for (const value of ['file:///tmp/x', 'http://user:secret@localhost', 'http://localhost/path', 'http://localhost/?key=x', 'http://localhost/#x']) {
    assert.throws(() => endpoint(value));
  }
  assert.equal(endpoint('http://127.0.0.1:11434').origin, 'http://127.0.0.1:11434');
});
