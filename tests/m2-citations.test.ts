import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCitations, ungroundedLiterals } from '../src/service/citation-validation.js';

test('citations require observed paths and complete line coverage, not just endpoints', () => {
  const evidence = [{ path: 'src/a.ts', startLine: 2, endLine: 4 }, { path: 'src/a.ts', startLine: 6, endLine: 8 }];
  assert.equal(validateCitations('See `src/a.ts:2-4`.', evidence).status, 'ranges_verified');
  for (const text of ['No citation', 'src/b.ts:2', 'src/a.ts:1', 'src/a.ts:2-8', 'src/a.ts:4-2', 'src/a.ts:0']) {
    assert.equal(validateCitations(text, evidence).status, 'invalid', text);
  }
  assert.equal(validateCitations('src/a.ts:2-8', [...evidence, { path: 'src/a.ts', startLine: 5, endLine: 5 }]).status, 'ranges_verified');
  assert.equal(validateCitations('src/a.ts:2', evidence).semanticVerification, 'not_performed');
});

test('citation parser supports quoted Unicode and extensionless paths without matching suffixes', () => {
  const evidence = [{ path: 'src/đọc mã.ts', startLine: 1, endLine: 4 }, { path: 'README', startLine: 1, endLine: 2 }];
  assert.equal(validateCitations('`src/đọc mã.ts:1-4` and `README:1`', evidence).status, 'ranges_verified');
  assert.equal(validateCitations('`excluded/src/đọc mã.ts:1`', evidence).status, 'invalid');
  assert.equal(validateCitations('outside/README:1', evidence).status, 'invalid');
  assert.deepEqual(ungroundedLiterals('Use `better-sql.ite3` version `12.2.0`.', '"better-sqlite3": "12.2.0"', []), ['better-sql.ite3']);
  assert.deepEqual(ungroundedLiterals('Use `better-sql` version `12.2`.', '"better-sqlite3": "12.2.0"', []), ['better-sql', '12.2']);
  assert.deepEqual(ungroundedLiterals('Use `better-sql,sqlite3`.', '"better-sqlite3": "12.2.0"', []), ['better-sql,sqlite3']);
  assert.deepEqual(ungroundedLiterals('Run `node -e "hello"`.', '"script": "node -e \\"hello\\""', []), []);
  assert.deepEqual(ungroundedLiterals('Use `close` and `if (db.open) { db.close(); }`.', '1: if (db.open) {\n2: db.close();\n3: }', []), []);
  for (const value of ['`README`:1', '`README` (lines 1–2)', '`README:1–2`']) assert.equal(validateCitations(value, evidence).status, 'ranges_verified', value);
  assert.equal(validateCitations('`outside/README` (line 1)', evidence).status, 'invalid');
});
