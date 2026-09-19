import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { FinishAnalysisInput, FinishAnalysisResult } from '../src/domain/exploration-result.js';
import { SecretFilter } from '../src/exploration/secret-filter.js';
import { validateStructuredFindings } from '../src/service/citation-validation.js';
import { finalizeExplorationResult } from '../src/service/exploration-result-finalizer.js';

const observed = [
  { path: 'package.json', line: 1, text: '{"dependencies":{"better-sqlite3":"12.2.0"},' },
  { path: 'package.json', line: 2, text: '"scripts":{"build":"node -e \\"hello\\""}}' },
  { path: 'src/app.ts', line: 4, text: 'const visible = importedCall();' },
  { path: 'src/app.ts', line: 5, text: '[REDACTED]' },
  { path: 'src/app.ts', line: 6, text: "throw new Error('explicit failure');" },
];
const citation = { path: 'package.json', startLine: 1, endLine: 1 };
const valid = {
  findings: [{ id: 'dependency', statement: 'The runtime dependency and version are declared.', basis: 'direct_observation' as const, citations: [citation] }],
  limitations: [],
};

test('strict tool and result schemas separate model claims from host excerpts', () => {
  assert(FinishAnalysisInput.safeParse(valid).success);
  assert.equal(FinishAnalysisInput.safeParse({ ...valid, verification: 'passed' }).success, false);
  assert.equal(FinishAnalysisInput.safeParse({ ...valid, findings: [{ ...valid.findings[0], excerpt: observed[0]!.text }] }).success, false);
  assert(FinishAnalysisResult.safeParse({ schemaVersion: 2, ...valid, findings: [{ ...valid.findings[0], excerpt: observed[0]!.text }] }).success);
  assert.equal(FinishAnalysisInput.safeParse({ ...valid, findings: [...valid.findings, { ...valid.findings[0], statement: 'duplicate' }] }).success, false);
});

test('tool JSON schema leaves exact excerpt construction to the host', () => {
  const schema = z.toJSONSchema(FinishAnalysisInput) as any;
  const finding = schema.properties.findings.items;
  assert.equal('excerpt' in finding.properties, false);
  assert.equal('exactValues' in finding.properties, false);
  assert.deepEqual(finding.properties.basis.enum, ['direct_observation', 'inference', 'observed', 'inferred', 'direct']);
});

test('validation ignores unpublished extras and normalizes singleton collections', () => {
  const normalized = validateStructuredFindings({ schemaVersion: 1, summary: 'ignored', findings: { ...valid.findings[0], basis: { label: 'observed' }, excerpt: 'ignored', citations: [citation, {}] }, limitations: { kind: 'not_observed', description: 'Runtime execution was not observed.', path: '', citations: [], extra: true } }, observed);
  assert(normalized.success);
  assert.equal(normalized.value.schemaVersion, 2);
  assert.equal(normalized.value.findings.length, 1);
  assert.equal(normalized.value.limitations.length, 1);
  assert.equal(normalized.value.findings[0]!.excerpt, observed[0]!.text);
  assert.equal(normalized.value.findings[0]!.basis, 'direct_observation');
  assert.deepEqual(normalized.value.findings[0]!.citations, [citation]);
  assert.equal('path' in normalized.value.limitations[0]!, false);
});

test('claim validation derives excerpts and exact values, downgrades redacted claims, and rejects gaps', () => {
  const accepted = validateStructuredFindings(valid, observed);
  assert(accepted.success);
  assert.equal(accepted.value.findings[0]!.excerpt, observed[0]!.text);
  assert(accepted.value.findings[0]!.exactValues.some(value => value.kind === 'package' && value.value === 'better-sqlite3'));
  assert(accepted.value.findings[0]!.exactValues.some(value => value.kind === 'version' && value.value === '12.2.0'));
  const alias = validateStructuredFindings({ ...valid, findings: [{ ...valid.findings[0], basis: 'observed' }] }, observed);
  assert(alias.success);
  assert.equal(alias.value.findings[0]!.basis, 'direct_observation');
  const redacted = validateStructuredFindings({ ...valid, findings: [
    valid.findings[0],
    { ...valid.findings[0], id: 'hidden', citations: [{ path: 'src/app.ts', startLine: 4, endLine: 5 }] },
  ] }, observed);
  assert(redacted.success);
  assert.equal(redacted.value.findings.length, 2);
  assert.deepEqual(redacted.value.findings[1]!.citations, [{ path: 'src/app.ts', startLine: 4, endLine: 4 }]);
  assert.equal(redacted.value.findings[1]!.excerpt, observed[2]!.text);
  assert.equal(redacted.value.limitations[0]!.kind, 'redacted');
  assert.deepEqual(redacted.value.limitations[0]!.citations, [{ path: 'src/app.ts', startLine: 5, endLine: 5 }]);
  const cases = [
    { ...valid, findings: [{ ...valid.findings[0], citations: [{ path: 'package.json', startLine: 1, endLine: 3 }] }] },
    { ...valid, findings: [{ ...valid.findings[0], citations: [{ path: 'src/app.ts', startLine: 5, endLine: 5 }] }] },
  ];
  for (const item of cases) assert.equal(validateStructuredFindings(item, observed).success, false);
});

test('JSON commands are decoded once and source token boundaries remain exact', () => {
  const commandCitation = { path: 'package.json', startLine: 2, endLine: 2 };
  const result = validateStructuredFindings({ ...valid, findings: [{ ...valid.findings[0], citations: [commandCitation] }] }, observed);
  assert(result.success);
  assert(result.value.findings[0]!.exactValues.some(value => value.kind === 'command' && value.value === 'node -e "hello"'));
  assert.equal(result.value.findings[0]!.exactValues.some(value => value.value === 'node -e \\"hello\\"'), false);
});

test('unavailable and redacted information can only become bounded limitations', () => {
  const unavailable = new Map<string, 'outside_scope' | 'unavailable'>([['src/auth.ts', 'outside_scope']]);
  const accepted = { ...valid, limitations: [
    { kind: 'outside_scope', description: 'The authentication implementation could not be inspected.', path: 'src/auth.ts', citations: [{ path: 'src/auth.ts', startLine: 1, endLine: 1 }] },
    { kind: 'redacted', description: 'The filtered line is unknown.', citations: [{ path: 'src/app.ts', startLine: 5, endLine: 5 }] },
    { kind: 'not_observed', description: 'The imported function implementation was not observed.', citations: [] },
  ] };
  assert.equal(validateStructuredFindings(accepted, observed, unavailable).success, true);
  const canonicalized = validateStructuredFindings({ ...valid, limitations: [{ kind: 'not_observed', description: 'src/auth.ts could not be inspected.', citations: [{ path: 'src/auth.ts', startLine: 1, endLine: 1 }] }] }, observed, unavailable);
  assert(canonicalized.success);
  assert.deepEqual(canonicalized.value.limitations[0], { kind: 'outside_scope', description: 'The requested path was outside the enforced task scope; its contents were not inspected.', path: 'src/auth.ts', citations: [] });
  const redactedAlias = validateStructuredFindings({ ...valid, limitations: [{ kind: 'unavailable', description: 'The filtered implementation could not be inspected.', path: 'src/app.ts', citations: [] }] }, observed, unavailable);
  assert(redactedAlias.success);
  assert.deepEqual(redactedAlias.value.limitations[0], { kind: 'redacted', description: 'Some source lines in src/app.ts were filtered and their contents were not observed.', citations: [{ path: 'src/app.ts', startLine: 5, endLine: 5 }] });
  const redactedWithoutCitation = validateStructuredFindings({ ...valid, limitations: [{ kind: 'redacted', description: 'The filtered implementation could not be inspected.', citations: [] }] }, observed, unavailable);
  assert(redactedWithoutCitation.success);
  assert.deepEqual(redactedWithoutCitation.value.limitations[0]!.citations, [{ path: 'src/app.ts', startLine: 5, endLine: 5 }]);
  const existenceClaim = validateStructuredFindings({ ...valid, limitations: [{ kind: 'outside_scope', description: 'src/auth.ts is missing.', path: 'src/auth.ts', citations: [] }] }, observed, unavailable);
  assert(existenceClaim.success);
  assert.equal(existenceClaim.value.limitations[0]!.description, 'The requested path was outside the enforced task scope; its contents were not inspected.');
  assert.equal(validateStructuredFindings({ ...valid, limitations: [{ kind: 'redacted', description: 'Unknown.', citations: [] }] }, observed).success, true);
});

test('contract keeps explicit observations separate from imported or runtime-unobserved behavior', () => {
  const input = { findings: [
    { id: 'explicit-error', statement: 'This source line explicitly throws an error.', basis: 'direct_observation', citations: [{ path: 'src/app.ts', startLine: 6, endLine: 6 }] },
    { id: 'imported-call', statement: 'The visible source calls an imported function; its propagated behavior is not established here.', basis: 'inference', citations: [{ path: 'src/app.ts', startLine: 4, endLine: 4 }] },
  ], limitations: [{ kind: 'not_observed', description: 'The imported implementation and runtime result were not observed.', citations: [] }] };
  const result = validateStructuredFindings(input, observed);
  assert(result.success);
  assert.equal(result.value.findings[0]!.excerpt, observed[4]!.text);
  assert.equal(result.value.findings[1]!.excerpt, observed[2]!.text);
});

test('finalization is atomic, filtered and renders only validated structured fields', () => {
  const context = {
    observedLines: observed,
    unavailablePaths: new Map<string, 'outside_scope' | 'unavailable'>(),
    secrets: new SecretFilter(['fixture-private']),
    evidence: [{ path: 'package.json', startLine: 1, endLine: 1 }],
    snapshot: { baseCommit: 'a'.repeat(40), snapshotId: 'b'.repeat(64), source: 'committed-tree' as const, excludesWorkingTree: true as const, eligibleFiles: 1, excludedEntries: 0 },
    provider: 'fixture',
    model: 'fixture-model',
    metrics: { modelTurns: 1, toolCalls: 1, wallMs: 1 },
  };
  const completed = finalizeExplorationResult(valid, context);
  assert(completed.success);
  assert.equal(completed.result.schemaVersion, 2);
  assert.equal(completed.result.verification, 'not_run');
  assert.equal(completed.result.findings[0]!.excerpt, observed[0]!.text);
  assert.match(completed.result.summary, /Observed:/);
  assert.equal(completed.result.validation.semanticVerification, 'not_performed');
  assert.equal(finalizeExplorationResult({ ...valid, findings: [{ ...valid.findings[0], statement: 'fixture-private' }] }, context).success, false);
});
