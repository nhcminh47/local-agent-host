import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExplorationResultV2 } from '../src/domain/exploration-result.js';
import type { ExplorerMessage } from '../src/provider/explorer-provider.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveExecutable } from '../src/exploration/capabilities.js';
import { GitSnapshotTools } from '../src/exploration/git-snapshot.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { CapabilityService } from '../src/exploration/capability-service.js';
import { AnalyzeRepoInput } from '../src/domain/task-contracts.js';
import { runExplorer } from '../src/service/explorer-loop.js';
import { compactExplorerContext } from '../src/service/explorer-context.js';
import { createExplorerMemory, recordObservedLines, recordUnavailablePath, recordValidatedFindings } from '../src/service/explorer-memory.js';

test('working memory admits only complete, non-redacted observed citation ranges', () => {
  const memory = createExplorerMemory('a'.repeat(64), ['health', 'startup']);
  recordObservedLines(memory, [
    { path: 'src/main.ts', line: 1, text: 'const status = 200;' },
    { path: 'src/main.ts', line: 2, text: 'reply.code(status);' },
    { path: 'src/main.ts', line: 3, text: '[REDACTED]' },
  ]);
  const result = (findings: Array<{ statement: string; startLine: number; endLine: number }>) => ({ findings: findings.map((finding, index) => ({
    id: `fact-${index}`, statement: finding.statement, basis: 'direct_observation',
    citations: [{ path: 'src/main.ts', startLine: finding.startLine, endLine: finding.endLine }],
  })) }) as unknown as ExplorationResultV2;
  recordValidatedFindings(memory, result([
    { statement: 'Observed code selects 200.', startLine: 1, endLine: 2 },
    { statement: 'Unsupported missing range.', startLine: 1, endLine: 4 },
    { statement: 'Secret line.', startLine: 3, endLine: 3 },
  ]));
  assert.deepEqual(memory.facts.map(fact => fact.statement), ['Observed code selects 200.']);
  assert.deepEqual(memory.candidateFiles, ['src/main.ts']);
  recordUnavailablePath(memory, 'private/file.ts', 'outside_scope');
  assert.deepEqual(memory.unavailablePaths, [{ path: 'private/file.ts', reason: 'outside_scope' }]);
});

test('context compaction preserves contract, task, snapshot, grounded evidence and recent repair', () => {
  const memory = createExplorerMemory('a'.repeat(64), ['health']);
  recordObservedLines(memory, [{ path: 'src/main.ts', line: 1, text: 'const status = 200;' }]);
  const messages: ExplorerMessage[] = [
    { role: 'system', content: 'system security contract' },
    { role: 'user', content: 'task and scope snapshot-one' },
  ];
  for (let index = 0; index < 10; index++) {
    messages.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'src/main.ts' } } }] });
    messages.push({ role: 'tool', tool_name: 'read_file', content: 'x'.repeat(3000) });
  }
  messages.push({ role: 'user', content: 'repair: cite the observed status' });
  compactExplorerContext(messages, memory);
  const serialized = JSON.stringify(messages);
  assert(Buffer.byteLength(serialized) <= 24_000);
  assert.equal(messages[0]?.content, 'system security contract');
  assert.equal(messages[1]?.content, 'task and scope snapshot-one');
  assert(serialized.includes('snapshot-one'));
  assert(serialized.includes('const status = 200;'));
  assert(serialized.includes('repair: cite the observed status'));
  assert(serialized.split('x'.repeat(3000)).length - 1 < 10);
});

test('incompatible working-memory version fails closed', () => {
  const memory = createExplorerMemory('a'.repeat(64), []);
  (memory as { schemaVersion: number }).schemaVersion = 2;
  assert.throws(() => compactExplorerContext([{ role: 'system', content: 'contract' }, { role: 'user', content: 'task' }], memory), /EXPLORER_CONTEXT_LIMIT/);
});

test('explorer completes with a cited early line after large read context is compacted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'explorer-compact-'));
  const executable = await resolveExecutable('git');
  assert(executable);
  const git = async (...args: string[]) => promisify(execFile)(executable, ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { windowsHide: true });
  const capabilities = new CapabilityService(join(root, 'capabilities.db'), 'missing-rg-fixture');
  try {
    await git('init');
    await writeFile(join(root, 'facts.txt'), ['VALUE = 731', ...Array.from({ length: 119 }, (_, index) => `filler-${index}: ${'x'.repeat(100)}`)].join('\n'));
    await git('add', 'facts.txt'); await git('commit', '-m', 'fixture');
    const repos = new RepoRegistry(); await repos.register('fixture', root);
    const snapshot = await GitSnapshotTools.capture(repos, 'fixture');
    const request = AnalyzeRepoInput.parse({ schemaVersion: 1, repoId: 'fixture', requestKey: 'compact', baseRef: 'HEAD', objective: 'Read facts', question: 'What is VALUE?', budget: { maxModelTurns: 12, maxToolCalls: 12, maxWallSeconds: 120 } });
    let turn = 0;
    let compacted = false;
    const provider = { async chat(messages: ExplorerMessage[]) {
      if (JSON.stringify(messages).includes('Earlier host-observed evidence')) compacted = true;
      if (turn++ < 8) return { role: 'assistant' as const, content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'facts.txt', startLine: (turn - 1) * 15 + 1, endLine: turn * 15 } } }] };
      return { role: 'assistant' as const, content: '', tool_calls: [{ function: { name: 'finish_analysis', arguments: { findings: [{ id: 'value', statement: 'VALUE is 731.', basis: 'direct_observation', citations: [{ path: 'facts.txt', startLine: 1, endLine: 1 }] }], limitations: [] } } }] };
    } };
    const result = await runExplorer(request, snapshot, capabilities, provider, new AbortController().signal);
    assert(compacted);
    assert.equal(result.findings[0]?.citations[0]?.startLine, 1);
    assert.equal(result.findings[0]?.statement, 'VALUE is 731.');
  } finally {
    capabilities.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});
