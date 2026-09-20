import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnalyzeRepoInput } from '../src/domain/task-contracts.js';
import { FakeTaskService } from '../src/service/fake-task-service.js';
import { IdempotencyConflict, InvalidTransition, QueueFull, StaleLease, TaskStore } from '../src/store/task-store.js';
import { DaemonClient } from '../src/runtime/ipc-client.js';

const request = (requestKey = 'request-1') => AnalyzeRepoInput.parse({
  schemaVersion: 1,
  repoId: 'fixture',
  requestKey,
  baseRef: 'main',
  objective: 'Map the fixture repository',
  question: 'Where is pagination implemented?',
  depth: 'quick',
});

async function fixture(run: (path: string) => void | Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-m1-tiếng-Việt-'));
  try { await run(join(dir, 'tasks.db')); }
  finally { await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}

test('analyze contract rejects unknown fields and unsafe focus paths', () => {
  assert.throws(() => AnalyzeRepoInput.parse({ ...request(), unexpected: true }));
  assert.throws(() => AnalyzeRepoInput.parse({ ...request(), focusPaths: ['../secret'] }));
  assert.throws(() => AnalyzeRepoInput.parse({ ...request(), focusPaths: ['C:\\secret'] }));
});

test('daemon client accepts only authenticated loopback HTTP origins', () => {
  const token = 'x'.repeat(32);
  assert.doesNotThrow(() => new DaemonClient('http://127.0.0.1:43127', token));
  assert.throws(() => new DaemonClient('http://192.168.1.2:43127', token));
  assert.throws(() => new DaemonClient('https://127.0.0.1:43127', token));
  assert.throws(() => new DaemonClient('http://user:pass@127.0.0.1:43127', token));
  assert.throws(() => new DaemonClient('http://127.0.0.1:43127/path', token));
  assert.throws(() => new DaemonClient('http://127.0.0.1:43127', 'short'));
});

test('submission is durable and idempotent while conflicting payload is rejected', async () => fixture(path => {
  const firstStore = new TaskStore(path);
  const first = firstStore.submit(request());
  assert.equal(first.created, true);
  assert.equal(first.task.status, 'queued');
  assert.equal(firstStore.events(first.task.id).length, 1);
  firstStore.close();

  const reopened = new TaskStore(path);
  const duplicate = reopened.submit(request());
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.task.id, first.task.id);
  assert.throws(() => reopened.submit({ ...request(), question: 'Different payload' }), IdempotencyConflict);
  reopened.close();
}));

test('fake provider records lifecycle and terminal result atomically', async () => fixture(path => {
  const store = new TaskStore(path);
  const service = new FakeTaskService(store);
  const submitted = service.submit(request());
  const completed = service.runOne(submitted.task.id);
  assert.equal(completed.status, 'completed');
  assert.equal(JSON.parse(completed.resultJson ?? '{}').provider, 'fake');
  assert.deepEqual(store.events(completed.id).map(event => event.type), ['task.queued', 'task.running', 'task.completed']);
  assert.throws(() => service.runOne(completed.id), InvalidTransition);
  store.close();
}));

test('queued cancellation is terminal and idempotent', async () => fixture(path => {
  const store = new TaskStore(path);
  const service = new FakeTaskService(store);
  const task = service.submit(request()).task;
  assert.equal(service.cancel(task.id, 'user request').status, 'cancelled');
  assert.equal(service.cancel(task.id, 'duplicate request').cancelReason, 'user request');
  assert.throws(() => service.runOne(task.id), InvalidTransition);
  store.close();
}));

test('restart recovery requeues running tasks and finishes cancellation', async () => fixture(path => {
  const store = new TaskStore(path);
  const running = store.submit(request('running')).task;
  store.transition(running.id, ['queued'], 'running', 'task.running');
  const cancelling = store.submit(request('cancelling')).task;
  store.transition(cancelling.id, ['queued'], 'running', 'task.running');
  store.cancel(cancelling.id, 'shutdown');
  store.close();

  const reopened = new TaskStore(path);
  assert.equal(reopened.recoverInterrupted(), 2);
  assert.equal(reopened.get(running.id).status, 'queued');
  assert.equal(reopened.get(cancelling.id).status, 'cancelled');
  assert.equal(reopened.events(running.id).at(-1)?.type, 'task.recovered');
  reopened.close();
}));

test('queue capacity rejects new work but preserves idempotent duplicates', async () => fixture(path => {
  const store = new TaskStore(path, 1);
  const first = store.submit(request('capacity'));
  assert.equal(store.submit(request('capacity')).task.id, first.task.id);
  assert.throws(() => store.submit(request('overflow')), QueueFull);
  store.cancel(first.task.id, 'free capacity');
  assert.equal(store.submit(request('after-cancel')).created, true);
  store.close();
}));

test('lease generation fences a stale worker after restart recovery', async () => fixture(path => {
  const firstStore = new TaskStore(path);
  const task = firstStore.submit(request('lease')).task;
  const firstLease = firstStore.claim(task.id, 'worker-old', 1_000);
  firstStore.close();

  const recovered = new TaskStore(path);
  assert.equal(recovered.recoverInterrupted(), 1);
  const secondLease = recovered.claim(task.id, 'worker-new', 1_000);
  assert.equal(secondLease.generation, firstLease.generation + 1);
  assert.throws(() => recovered.completeLeased(task.id, 'worker-old', firstLease.generation, {}), StaleLease);
  assert.equal(recovered.completeLeased(task.id, 'worker-new', secondLease.generation, { ok: true }).status, 'completed');
  recovered.close();
}));

test('lease renewal preserves generation and expired takeover fences prior owner', async () => fixture(path => {
  const store = new TaskStore(path);
  const task = store.submit(request('renew-takeover')).task;
  const first = store.claim(task.id, 'worker-a', 1_000);
  const renewed = store.renewLease(task.id, 'worker-a', first.generation, 2_000);
  assert.equal(renewed.leaseGeneration, first.generation);
  assert.throws(() => store.renewLease(task.id, 'worker-b', first.generation, 2_000), StaleLease);
  const takeover = store.takeoverExpired(task.id, 'worker-b', 2_000, '9999-12-31T23:59:59.999Z');
  assert.equal(takeover.generation, first.generation + 1);
  assert.throws(() => store.completeLeased(task.id, 'worker-a', first.generation, {}), StaleLease);
  assert.equal(store.completeLeased(task.id, 'worker-b', takeover.generation, { ok: true }).status, 'completed');
  store.close();
}));

test('deadline expiry is terminal and frees queue capacity', async () => fixture(path => {
  const store = new TaskStore(path, 1);
  const task = store.submit(request('deadline')).task;
  assert.equal(store.expireDue('9999-12-31T23:59:59.999Z'), 1);
  assert.equal(store.get(task.id).status, 'budget_exceeded');
  assert.equal(JSON.parse(store.get(task.id).resultJson ?? '{}').outcome, 'budget_exceeded');
  assert.equal(store.submit(request('after-deadline')).created, true);
  store.close();
}));

test('event pages expose stable cursors and hasMore', async () => fixture(path => {
  const store = new TaskStore(path);
  const service = new FakeTaskService(store);
  const task = service.submit(request('event-page')).task;
  service.runOne(task.id);
  const first = service.get(task.id, 0, 2);
  assert.equal(first.events.length, 2);
  assert.equal(first.eventPage.hasMore, true);
  const second = service.get(task.id, first.eventPage.nextEventSeq, 2);
  assert.equal(second.events.length, 1);
  assert.equal(second.eventPage.hasMore, false);
  assert.equal(second.events[0]?.type, 'task.completed');
  store.close();
}));
