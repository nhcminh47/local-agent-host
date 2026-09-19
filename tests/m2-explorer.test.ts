import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { CapabilityService } from '../src/exploration/capability-service.js';
import { SnapshotTaskService } from '../src/service/snapshot-task-service.js';
import { TaskStore } from '../src/store/task-store.js';
import { AnalyzeRepoInput } from '../src/domain/task-contracts.js';
import { ExplorerRunner } from '../src/service/explorer-runner.js';
import type { ExplorerMessage, ExplorerProvider } from '../src/provider/explorer-provider.js';

const call = (name: string, args: unknown): ExplorerMessage => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const finish = (overrides: Record<string, unknown> = {}): ExplorerMessage => call('finish_analysis', {
  findings: [{ id: 'value', statement: 'The observed value is 731.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] }],
  limitations: [],
  ...overrides,
});
const answer = (): ExplorerMessage => finish();
const input = (requestKey = 'explore') => AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey, baseRef: 'HEAD', objective: 'Read the fixture', question: 'What is VALUE?' });

async function fixture(run: (root: string, service: SnapshotTaskService, capabilities: CapabilityService) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-explorer-'));
  const git = await resolveExecutable('git');
  assert(git);
  const exec = promisify(execFile);
  const command = async (...args: string[]) => exec(git, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
  const store = new TaskStore(join(root, 'tasks.db'));
  const capabilities = new CapabilityService(join(root, 'tasks.db'), 'missing-rg-fixture');
  try {
    await command('init');
    await writeFile(join(root, 'facts.txt'), 'VALUE = 731\npassword = fixture-secret-canary\n');
    await command('add', 'facts.txt'); await command('commit', '-m', 'fixture');
    const repos = new RepoRegistry(); await repos.register('fixture', root);
    await run(root, new SnapshotTaskService(store, repos), capabilities);
  } finally { capabilities.close(); store.close(); await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}

test('explorer uses list/search/read, records host evidence and filters both directions', async () => fixture(async (root, service, capabilities) => {
  await capabilities.resolve({ schemaVersion: 1, capability: 'ripgrep', decision: 'use_builtin_fallback' });
  const admitted = await service.submit(input());
  await writeFile(join(root, 'facts.txt'), 'VALUE = 999\n');
  const replies = [call('list_files', {}), call('search_code', { pattern: 'VALUE' }), call('read_file', { path: 'facts.txt' }), answer()];
  const provider: ExplorerProvider = { async chat(messages, tools) {
    assert.equal(tools.length, 4);
    assert.equal(JSON.stringify(messages).includes('fixture-secret-canary'), false);
    return replies.shift()!;
  } };
  await new ExplorerRunner(service, capabilities, provider).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  const result = JSON.parse(task.resultJson!);
  assert(result.evidence.length >= 2);
  assert.equal(result.snapshot.baseCommit, admitted.snapshot.baseCommit);
  assert.equal(result.metrics.modelTurns, 4);
  assert.equal(task.resultJson!.includes('generated-canary'), false);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.validation.status, 'grounded');
  assert.equal(result.verification, 'not_run');
  assert(!task.resultJson!.includes('fixture-secret-canary'));
  assert.equal(await readFile(join(root, 'facts.txt'), 'utf8'), 'VALUE = 999\n');
}));

test('forbidden tools, missing evidence and turn/tool limits terminate without effects', async () => fixture(async (_root, service, capabilities) => {
  const cases: Array<[ExplorerMessage, string, number, number]> = [
    [call('run_command', { command: 'anything' }), 'failed', 4, 4],
    [answer(), 'failed', 4, 4],
    [call('read_file', { path: 'facts.txt' }), 'budget_exceeded', 1, 4],
    [call('read_file', { path: 'facts.txt' }), 'budget_exceeded', 4, 1],
  ];
  for (const [index, [reply, status, maxModelTurns, maxToolCalls]] of cases.entries()) {
    const request = input(`case-${index}`);
    const admitted = await service.submit({ ...request, budget: { ...request.budget, maxModelTurns, maxToolCalls } });
    await new ExplorerRunner(service, capabilities, { async chat() { return reply; } }).tick();
    assert.equal(service.store.get(admitted.task.id).status, status);
  }
}));

test('running cancellation aborts inference and persists cancelled state', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input());
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const runner = new ExplorerRunner(service, capabilities, { async chat(_messages, _tools, signal) {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
  } });
  const running = runner.tick(); await ready;
  service.store.cancel(admitted.task.id, 'cancel fixture'); runner.cancel(admitted.task.id);
  await running;
  assert(aborted);
  assert.equal(service.store.get(admitted.task.id).status, 'cancelled');
}));

test('deadline expiry stops inference and cannot publish completion', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input());
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const runner = new ExplorerRunner(service, capabilities, { async chat(_messages, _tools, signal) {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const running = runner.tick(); await ready;
  service.store.expireDue('2999-01-01T00:00:00.000Z');
  await running;
  assert.equal(service.store.get(admitted.task.id).status, 'budget_exceeded');
}));

test('capability block/resume preserves snapshot and cumulative model budget', async () => fixture(async (_root, service, capabilities) => {
  const base = input();
  const admitted = await service.submit({ ...base, budget: { ...base.budget, maxModelTurns: 2 } });
  const provider: ExplorerProvider = { async chat(messages) { return messages.some(message => message.role === 'tool') ? answer() : call('search_code', { pattern: 'VALUE' }); } };
  const runner = new ExplorerRunner(service, capabilities, provider);
  await runner.tick();
  assert.equal(service.store.get(admitted.task.id).status, 'blocked');
  await capabilities.resolve({ schemaVersion: 1, capability: 'ripgrep', decision: 'use_builtin_fallback' });
  assert.equal(service.store.resumeCapabilityTasks(), 1);
  await runner.tick();
  // One turn before block + one after resume consumes the total budget.
  assert.equal(service.store.get(admitted.task.id).status, 'budget_exceeded');
  assert.deepEqual(service.store.snapshot(admitted.task.id), admitted.snapshot);
}));

test('sensitive submission is rejected before payload persistence', async () => fixture(async (_root, service) => {
  await assert.rejects(() => service.submit({ ...input(), question: 'password = fixture-secret' }), /SENSITIVE_INPUT/);
  assert.equal(service.store.nextQueued(), null);
}));

test('missing snapshot path gives bounded feedback without consulting working tree', async () => fixture(async (root, service, capabilities) => {
  await writeFile(join(root, 'uncommitted.ts'), 'working tree only');
  const admitted = await service.submit(input('missing'));
  let turns = 0;
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (++turns === 1) return call('read_file', { path: 'uncommitted.ts' });
    if (messages.at(-1)!.role === 'tool') {
      const feedback = JSON.parse(messages.at(-1)!.content);
      assert.equal(feedback.reason, 'SNAPSHOT_PATH_UNAVAILABLE');
      assert.match(feedback.message, /Working-tree existence was not checked/);
      assert.equal(feedback.baseCommit, admitted.snapshot.baseCommit);
    }
    return finish();
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'failed');
  assert.equal(JSON.parse(task.resultJson!).error, 'EXPLORER_INVALID_COMPLETION');
}));

test('denied path can recover using eligible evidence without widening scope', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('denial-recovery'));
  const replies = [call('read_file', { path: 'absent.ts' }), { role: 'assistant', content: 'Cannot inspect it.' } as ExplorerMessage, call('list_files', {}), call('read_file', { path: 'facts.txt' }), finish({ limitations: [{ kind: 'unavailable', description: 'The path could not be inspected.', path: 'absent.ts', citations: [] }] })];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 3) assert.match(messages.at(-1)!.content, /do not retry it or widen scope/);
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  assert.equal(JSON.parse(task.resultJson!).limitations[0].kind, 'unavailable');
}));

test('model cannot use a filename as an unissued listing cursor', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('cursor-repair'));
  const replies = [call('list_files', { cursor: 'facts.txt' }), call('list_files', {}), call('read_file', { path: 'facts.txt' }), answer()];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 3) assert.equal(JSON.parse(messages.at(-1)!.content).error, 'INVALID_LIST_CURSOR');
    if (replies.length === 2) assert.deepEqual(JSON.parse(messages.at(-1)!.content).files, ['facts.txt']);
    return replies.shift()!;
  } }).tick();
  assert.equal(service.store.get(admitted.task.id).status, 'completed');
}));

test('host derives exact values from accepted citations and ignores unpublished model metadata', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('host-exact-values'));
  const replies = [call('read_file', { path: 'facts.txt' }), finish({ findings: [{ id: 'value', statement: 'The observed value is 731.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }], exactValues: [{ kind: 'identifier', value: 'VAULE' }] }] })];
  await new ExplorerRunner(service, capabilities, { async chat() { return replies.shift()!; } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  const result = JSON.parse(task.resultJson!);
  assert(result.findings[0].exactValues.some((value: any) => value.kind === 'identifier' && value.value === 'VALUE'));
  assert.equal(task.resultJson!.includes('VAULE'), false);
}));

test('a prose completion prompt does not consume the grounded completion repair', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('prose-then-grounding-repair'));
  const bad = finish({ findings: [{ id: 'value', statement: 'The observed value is 731.', basis: 'direct_observation', citations: [{ path: 'invented.ts', startLine: 99, endLine: 99 }] }] });
  const replies: ExplorerMessage[] = [
    call('read_file', { path: 'facts.txt' }),
    { role: 'assistant', content: 'The value is 731.' },
    bad,
    finish(),
  ];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 2) assert.match(messages.at(-1)!.content, /call finish_analysis now/i);
    if (replies.length === 1) assert.match(messages.at(-1)!.content, /UNOBSERVED_RANGE/);
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  assert.equal(task.explorerModelTurns, 4);
}));

test('a multi-topic question gets one bounded completeness repair for a single finding', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit({ ...input('coverage-repair'), question: 'Explain VALUE, its declaration, and its source.' });
  const complete = finish({ findings: [
    { id: 'value', statement: 'The observed value is 731.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] },
    { id: 'declaration', statement: 'The VALUE declaration appears in the observed source.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] },
  ] });
  const replies = [call('read_file', { path: 'facts.txt' }), answer(), complete];
  const provider: ExplorerProvider = { async chat(messages) {
    if (replies.length === 1) {
      assert.match(messages.at(-1)!.content, /host retained these grounded findings/i);
      assert.match(messages.at(-1)!.content, /exactly one new brief direct_observation finding/i);
      assert.match(messages.at(-1)!.content, /missing visible operation/i);
      assert.match(messages.at(-1)!.content, /The observed value is 731/);
    }
    return replies.shift()!;
  } };
  await new ExplorerRunner(service, capabilities, provider).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  assert.equal(JSON.parse(task.resultJson!).findings.length, 2);
  assert.equal(task.explorerModelTurns, 3);
  assert.equal(task.explorerToolCalls, 3);
}));

test('a grounding repair can still receive one prose-to-tool reminder', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('grounding-then-prose'));
  const unread = finish({ findings: [{ id: 'unread', statement: 'Unread.', basis: 'direct_observation', citations: [{ path: 'missing.txt', startLine: 1, endLine: 1 }] }] });
  const replies: ExplorerMessage[] = [call('read_file', { path: 'facts.txt' }), unread, { role: 'assistant', content: 'I should finish now.' }, answer()];
  const provider: ExplorerProvider = { async chat() { return replies.shift()!; } };
  await new ExplorerRunner(service, capabilities, provider).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  assert.equal(task.explorerModelTurns, 4);
  assert.equal(task.explorerToolCalls, 3);
}));

test('each retained coverage pass can correct one invalid grounded addition', async () => fixture(async (_root, service, capabilities) => {
  const request = input('coverage-grounding-reset');
  const admitted = await service.submit({ ...request, question: 'Explain VALUE, its declaration, and source.', budget: { ...request.budget, maxModelTurns: 6, maxToolCalls: 6 } });
  const invalid = finish({ findings: [{ id: 'invalid', statement: 'An extra declaration exists.', basis: 'direct_observation', citations: [{ path: 'missing.ts', startLine: 1, endLine: 1 }] }] });
  const expanded = finish({ findings: [{ id: 'declaration', statement: 'The VALUE declaration and source are observed.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] }] });
  const replies = [call('read_file', { path: 'facts.txt' }), invalid, answer(), invalid, expanded];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 1) assert.match(messages.at(-1)!.content, /UNOBSERVED_RANGE/);
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed');
  assert.equal(JSON.parse(task.resultJson!).findings.length, 2);
  assert.equal(task.explorerModelTurns, 5);
}));

test('unread citations get one repair turn and cannot be published after failed repair', async () => fixture(async (_root, service, capabilities) => {
  for (const repaired of [true, false]) {
    const admitted = await service.submit(input(`citations-${repaired}`));
    const invalid = finish({ findings: [{ id: 'value', statement: 'The value is observed.', basis: 'direct_observation', citations: [{ path: 'invented.ts', startLine: 99, endLine: 99 }] }] });
    const replies = [call('read_file', { path: 'facts.txt', endLine: 1 }), invalid, repaired ? finish() : invalid];
    await new ExplorerRunner(service, capabilities, { async chat() { return replies.shift()!; } }).tick();
    const task = service.store.get(admitted.task.id);
    assert.equal(task.explorerModelTurns, 3);
    assert.equal(task.status, repaired ? 'completed' : 'failed');
    if (!repaired) assert.equal(JSON.parse(task.resultJson!).error, 'EXPLORER_INVALID_COMPLETION');
  }
}));

test('listing-only answer gets one evidence repair within the original turn budget', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('listing-repair'));
  const replies = [call('list_files', {}), finish(), call('read_file', { path: 'facts.txt' }), answer()];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 2) assert.match(messages.at(-1)!.content, /structured completion was rejected/i);
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed'); assert.equal(task.explorerModelTurns, 4);
}));

test('invalid batches execute nothing, omit raw arguments, and allow two bounded repairs', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('argument-repair'));
  const invalid: ExplorerMessage = { role: 'assistant', content: '', tool_calls: [
    { function: { name: 'read_file', arguments: { path: 'facts.txt' } } },
    { function: { name: 'search_code', arguments: { query: 'sensitive-repair-canary' } } },
  ] };
  const replies = [invalid, call('read_file', { path: 'facts.txt' }), answer()];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    assert(!JSON.stringify(messages).includes('sensitive-repair-canary'));
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed'); assert.equal(task.explorerToolCalls, 2);
  const failed = await service.submit(input('argument-limit'));
  await new ExplorerRunner(service, capabilities, { async chat() { return invalid; } }).tick();
  const terminal = service.store.get(failed.task.id);
  assert.equal(terminal.explorerModelTurns, 3); assert.equal(terminal.explorerToolCalls, 0);
  assert.equal(JSON.parse(terminal.resultJson!).error, 'EXPLORER_INVALID_TOOL_ARGUMENTS');
}));

test('EOF and repeated reads return guidance without duplicating evidence', async () => fixture(async (_root, service, capabilities) => {
  const admitted = await service.submit(input('read-feedback'));
  const replies = [call('read_file', { path: 'facts.txt', startLine: 100, endLine: 120 }), call('read_file', { path: 'facts.txt' }), call('read_file', { path: 'facts.txt' }), answer()];
  await new ExplorerRunner(service, capabilities, { async chat(messages) {
    if (replies.length === 3) assert.equal(JSON.parse(messages.at(-1)!.content).error, 'READ_PAST_END');
    if (replies.length === 1) assert.equal(JSON.parse(messages.at(-1)!.content).error, 'READ_ALREADY_OBSERVED');
    return replies.shift()!;
  } }).tick();
  const task = service.store.get(admitted.task.id);
  assert.equal(task.status, 'completed'); assert.equal(JSON.parse(task.resultJson!).evidence.length, 1);
}));
