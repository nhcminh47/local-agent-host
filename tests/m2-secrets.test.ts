import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SecretFilter } from '../src/exploration/secret-filter.js';
import { RepoRegistry } from '../src/exploration/repo-registry.js';
import { ReadTools } from '../src/exploration/read-tools.js';
import { searchFiles } from '../src/exploration/search-engine.js';
import { matchBuiltin, ripgrepMatcher } from '../src/exploration/search-backends.js';
import { CapabilityRegistry } from '../src/exploration/capabilities.js';

// Synthetic fixture values only; no real credentials are read during testing.
const canary = 'fixture-only-private-value-123456';
const request = { schemaVersion: 1, repoId: 'fixture', pattern: 'safe', maxMatches: 100 };
async function fixture(run: (root: string, tools: ReadTools) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-secret-filter-'));
  try {
    const repos = new RepoRegistry();
    await repos.register('fixture', root);
    await run(root, new ReadTools(repos, new SecretFilter([canary])));
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('filter masks known multiline values, overlapping values and private key blocks without losing line numbers', () => {
  const input = 'safe\nleft MULTI\nLINE right\n-----BEGIN PRIVATE KEY-----\nfixture-body\n-----END PRIVATE KEY-----\nlast';
  const result = new SecretFilter(['MULTI\nLINE', 'MULTI']).filter(input);
  assert.equal(result.text, 'safe\n[REDACTED]\n[REDACTED]\n[REDACTED]\n[REDACTED]\n[REDACTED]\nlast');
  assert.equal(result.redacted, true);
  assert.equal(new SecretFilter().filter('-----BEGIN RSA PRIVATE KEY-----\nunterminated').text, '[REDACTED]\n[REDACTED]');
});

test('credential-shaped assignments, bearer values, URL userinfo and token prefixes are masked', () => {
  const input = ['safe text', '"api_key": "fixture-value"', 'password = example', 'Authorization: Bearer fixtureonly', 'https://user:fixture-password@example.invalid', 'token sk-proj-abcdefghijklmnopqrstuv', 'const ordinary = 12;'].join('\n');
  assert.equal(new SecretFilter().filter(input).text, ['safe text', ...Array(5).fill('[REDACTED]'), 'const ordinary = 12;'].join('\n'));
});

test('bearer prose is preserved while high-confidence bearer credentials remain redacted', () => {
  const result = new SecretFilter().filter('The route requires a Bearer API key.');
  assert.equal(result.redacted, false);
  assert.equal(result.text, 'The route requires a Bearer API key.');
  assert.equal(new SecretFilter().filter('Bearer abcdefghijklmnop').text, '[REDACTED]');
  assert.equal(new SecretFilter().filter("if (!authorization?.startsWith('Bearer ')) return false;").redacted, false);
});

test('completion safety allows auth terminology but rejects high-confidence credential material', () => {
  const filter = new SecretFilter(['fixture-known-secret']);
  assert.doesNotThrow(() => filter.assertSafeCompletion('The route parses a Bearer token and reports [REDACTED] lines as unknown.'));
  assert.throws(() => filter.assertSafeCompletion('fixture-known-secret'), /SENSITIVE_INPUT/);
  assert.throws(() => filter.assertSafeCompletion('Bearer abcdefghijklmnop'), /SENSITIVE_INPUT/);
  assert.throws(() => filter.assertSafeCompletion('api_key = exposed-value'), /SENSITIVE_INPUT/);
});

test('read filtering precedes line slicing and preview clipping, returns safe hash and preserves original bytes', async () => fixture(async (root, tools) => {
  const original = 'safe first\r\n' + 'x'.repeat(65_530) + canary + '\r\n' + 'safe last';
  await writeFile(join(root, 'source.txt'), original);
  const result = await tools.readFile('fixture', 'source.txt', 2, 3);
  assert.equal(result.content, '2: [REDACTED]\n3: safe last');
  assert.equal(result.redacted, true);
  assert.equal(result.hashScope, 'filtered-text');
  assert.equal(result.sha256, createHash('sha256').update('safe first\n[REDACTED]\nsafe last').digest('hex'));
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(await readFile(join(root, 'source.txt'), 'utf8'), original);
}));

test('both backend inputs and search previews contain only filtered text', async t => fixture(async (root, tools) => {
  await writeFile(join(root, 'source.txt'), `safe first\nconst password = "${canary}"; safe\nsafe last`);
  let matcherCalls = 0;
  const node = await searchFiles(tools, request, 'node', async (text, pattern, limit, signal) => {
    matcherCalls++;
    assert.equal(text.includes(canary), false);
    assert.equal(text.includes('password'), false);
    return matchBuiltin(text, pattern, limit, signal);
  });
  assert.equal(matcherCalls, 1);
  assert.equal(node.redactedFiles, 1);
  assert.deepEqual(node.matches.map(match => match.line), [1, 3]);
  assert.equal(JSON.stringify(node).includes(canary), false);
  const capability = await new CapabilityRegistry().ripgrep();
  if (capability.status !== 'available') { t.diagnostic('real-ripgrep comparison unavailable; Node boundary checked'); return; }
  const rg = await searchFiles(tools, request, 'ripgrep', ripgrepMatcher(capability.executable));
  assert.deepEqual({ ...rg, backend: 'node' }, node);
}));

test('known secret queries are rejected before backend invocation and secret filenames are excluded', async () => fixture(async (root, tools) => {
  await writeFile(join(root, canary + '.txt'), 'safe');
  assert.deepEqual((await tools.listFiles('fixture')).files, []);
  await assert.rejects(() => tools.readFile('fixture', canary + '.txt'), /PATH_DENIED/);
  await assert.rejects(() => searchFiles(tools, { ...request, pattern: canary }, 'node', async () => { throw new Error('BACKEND_MUST_NOT_RUN'); }), /SENSITIVE_SEARCH_PATTERN/);
}));

test('bounded read path rejects late binary data, bad UTF-8, invalid line range and oversized input', async () => fixture(async (root, tools) => {
  await writeFile(join(root, 'binary'), 'a'.repeat(9000) + '\0');
  await writeFile(join(root, 'bad'), Buffer.from([0xff]));
  await writeFile(join(root, 'large'), 'a'.repeat(1_048_577));
  await assert.rejects(() => tools.readFile('fixture', 'binary'), /BINARY_FILE/);
  await assert.rejects(() => tools.readFile('fixture', 'bad'), /INVALID_UTF8/);
  await assert.rejects(() => tools.readFile('fixture', 'large'), /FILE_NOT_READABLE/);
  await assert.rejects(() => tools.readFile('fixture', 'bad', NaN), /INVALID_LINE_RANGE/);
  assert.throws(() => new SecretFilter(['']), /INVALID_SECRET_FILTER_CONFIG/);
  assert.throws(() => new SecretFilter().filter('x'.repeat(2 * 1024 * 1024 + 1)), /SECRET_FILTER_INPUT_LIMIT/);
}));
