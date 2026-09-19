import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '../src/exploration/capabilities.js';
import { CapabilityService } from '../src/exploration/capability-service.js';
import { ReadTools } from '../src/exploration/read-tools.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { matchBuiltin, ripgrepMatcher } from '../src/exploration/search-backends.js';
import { SearchCodeInput, searchFiles } from '../src/exploration/search-engine.js';
import { SearchService } from '../src/exploration/search-service.js';

const request = { schemaVersion: 1, repoId: 'fixture', pattern: 'needle', maxMatches: 100 };
async function fixture(run: (root: string, tools: ReadTools) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-search-'));
  try {
    const repos = new RepoRegistry();
    await repos.register('fixture', dir);
    await writeFile(join(dir, 'text.txt'), 'needle needle\r\nTiếng Việt needle 😀\r\n--glob $(echo literal) needle\r\nlast needle');
    await run(dir, new ReadTools(repos));
  } finally { await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 }); }
}

test('real ripgrep matches Node for literal text, CRLF, Unicode, flags and exact limits', async t => {
  const capability = await new CapabilityRegistry().ripgrep();
  if (capability.status !== 'available') { t.skip('ripgrep is not installed'); return; }
  await fixture(async (root, tools) => {
    await writeFile(join(root, 'unicode.txt'), '\uFEFFneedle\u2028suffix\nneedle\rsuffix');
    for (const pattern of ['needle', 'Tiếng Việt', '😀', '--glob', '$(echo literal)', 'absent']) {
      for (const maxMatches of [1, 6, 100]) {
        const input = { ...request, pattern, maxMatches };
        const node = await searchFiles(tools, input, 'node', matchBuiltin);
        const rg = await searchFiles(tools, input, 'ripgrep', ripgrepMatcher(capability.executable));
        assert.deepEqual({ ...rg, backend: 'node' }, node);
      }
    }
    const exact = await tools.searchBuiltin('fixture', 'Tiếng Việt', 1);
    assert.equal(exact.truncated, false);
    const limited = await tools.searchBuiltin('fixture', 'needle', 1);
    assert.equal(limited.reason, 'MATCH_LIMIT');
  });
});

test('both backends exclude secrets by path, late binary bytes, invalid UTF-8 and large files', async t => {
  const capability = await new CapabilityRegistry().ripgrep();
  if (capability.status !== 'available') { t.skip('ripgrep is not installed'); return; }
  await fixture(async (root, tools) => {
    await mkdir(join(root, '.git'));
    await mkdir(join(root, '.env.d'));
    await writeFile(join(root, '.git', 'config'), 'needle SECRET_CANARY');
    await writeFile(join(root, '.ENV'), 'needle SECRET_CANARY');
    await writeFile(join(root, '.env.d', 'nested'), 'needle SECRET_CANARY');
    await writeFile(join(root, 'binary'), Buffer.concat([Buffer.from('needle SECRET_CANARY'), Buffer.alloc(9000, 65), Buffer.from([0])]));
    await writeFile(join(root, 'bad-utf8'), Buffer.from([0xff, 0xfe, 65]));
    await writeFile(join(root, 'huge'), 'needle SECRET_CANARY'.repeat(60_000));
    const node = await searchFiles(tools, request, 'node', matchBuiltin);
    const rg = await searchFiles(tools, request, 'ripgrep', ripgrepMatcher(capability.executable));
    assert.deepEqual({ ...rg, backend: 'node' }, node);
    assert.equal(node.skippedFiles, 3);
    assert.equal(JSON.stringify(rg).includes('SECRET_CANARY'), false);
    await assert.rejects(() => tools.readSearchText('fixture', '.ENV'), /PATH_DENIED/);
  });
});

test('search remains blocked until fallback is selected, then searches after restart', async () => fixture(async (root, tools) => {
  const state = await mkdtemp(join(tmpdir(), 'agent-search-state-'));
  let capabilities = new CapabilityService(join(state, 'state.db'), 'definitely-missing-rg');
  try {
    let service = new SearchService(tools, capabilities);
    assert.equal((await service.search(request)).status, 'blocked');
    await capabilities.resolve({ schemaVersion: 1, capability: 'ripgrep', decision: 'use_builtin_fallback' });
    capabilities.close();
    capabilities = new CapabilityService(join(state, 'state.db'), 'definitely-missing-rg');
    service = new SearchService(tools, capabilities);
    const result = await service.search(request);
    assert.equal(result.status, 'completed');
    assert('matches' in result);
    assert.equal(result.backend, 'node');
    assert.equal(result.matches.length, 4);
    assert.equal(root, tools.repos.root('fixture'));
    await assert.rejects(() => service.search({ ...request, repoId: 'unknown' }), /UNKNOWN_REPO/);
  } finally { capabilities.close(); await rm(state, { recursive: true, force: true }); }
}));

test('strict search rejects injected backend, commands, invalid bounds and multiline patterns', () => {
  for (const extra of [{ executable: 'evil' }, { command: 'evil' }, { backend: 'node' }, { maxMatches: 0 }, { maxMatches: 101 }, { maxMatches: 1.5 }, { pattern: '' }, { pattern: 'x\ny' }, { pattern: '\0' }, { pattern: '\ud800' }]) {
    assert.equal(SearchCodeInput.safeParse({ ...request, ...extra }).success, false);
  }
});

test('search reports output and file limits instead of silently returning complete results', async () => fixture(async (root, tools) => {
  await writeFile(join(root, 'many.txt'), ('needle' + '\t'.repeat(495) + '\n').repeat(100));
  const output = await tools.searchBuiltin('fixture', 'needle');
  assert.equal(output.reason, 'OUTPUT_LIMIT');
  assert(Buffer.byteLength(JSON.stringify(output)) < 64 * 1024);
  for (let i = 0; i < 501; i++) await writeFile(join(root, `file-${i}`), '');
  assert.equal((await tools.searchBuiltin('fixture', 'absent')).reason, 'FILE_LIMIT');
}));

test('search cancellation and missing executable return explicit failures', async () => fixture(async (_root, tools) => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => searchFiles(tools, request, 'node', matchBuiltin, abort.signal));
  await assert.rejects(() => ripgrepMatcher('definitely-missing-rg')('needle', 'needle', 1, new AbortController().signal), /RIPGREP_UNAVAILABLE/);
}));

test('listing does not follow a directory junction outside the registered repo', async () => fixture(async (root, tools) => {
  const outside = await mkdtemp(join(tmpdir(), 'agent-outside-'));
  try {
    await writeFile(join(outside, 'secret'), 'needle SECRET_CANARY');
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await tools.searchBuiltin('fixture', 'SECRET_CANARY');
    assert.deepEqual(result.matches, []);
    await assert.rejects(() => tools.readSearchText('fixture', 'escape/secret'), /PATH_DENIED/);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test('real search dispatcher detects an executable removed after successful preflight', async t => {
  const probe = await new CapabilityRegistry().ripgrep();
  if (probe.status !== 'available') { t.skip('ripgrep is not installed'); return; }
  const state = await mkdtemp(join(tmpdir(), 'agent-rg-copy-'));
  const executable = join(state, process.platform === 'win32' ? 'rg.exe' : 'rg');
  await copyFile(probe.executable, executable);
  const capabilities = new CapabilityService(join(state, 'state.db'), executable);
  try {
    await fixture(async (_root, tools) => {
      const service = new SearchService(tools, capabilities);
      const success = await service.search(request);
      assert('backend' in success);
      assert.equal(success.backend, 'ripgrep');
      assert('matches' in success);
      assert.equal(success.matches.length, 4);
      await unlink(executable);
      const blocked = await service.search(request);
      assert.equal(blocked.status, 'blocked');
      assert('reason' in blocked);
      assert.equal(blocked.reason, 'MISSING_CAPABILITY');
      assert.equal((await capabilities.check({ schemaVersion: 1, capability: 'ripgrep' })).status, 'blocked');
    });
  } finally { capabilities.close(); await rm(state, { recursive: true, force: true }); }
});

test('ripgrep ignores config and cancellation terminates an active child', async t => {
  const capability = await new CapabilityRegistry().ripgrep();
  if (capability.status !== 'available') { t.skip('ripgrep is not installed'); return; }
  const state = await mkdtemp(join(tmpdir(), 'agent-rg-config-'));
  const previous = process.env['RIPGREP_CONFIG_PATH'];
  try {
    const config = join(state, 'rg-config');
    await writeFile(config, '--invert-match\n');
    process.env['RIPGREP_CONFIG_PATH'] = config;
    const matcher = ripgrepMatcher(capability.executable);
    assert.deepEqual(await matcher('needle\nother', 'needle', 10, new AbortController().signal), [1]);
    const abort = new AbortController();
    const pending = matcher('needle\n'.repeat(100_000), 'needle', 100, abort.signal);
    abort.abort();
    await assert.rejects(() => pending, /SEARCH_CANCELLED/);
  } finally {
    if (previous === undefined) delete process.env['RIPGREP_CONFIG_PATH'];
    else process.env['RIPGREP_CONFIG_PATH'] = previous;
    await rm(state, { recursive: true, force: true });
  }
});
