import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAcceptanceCase, evaluateGatePair, type CaseRubric, type GateRun } from '../src/m2/acceptance-grader.js';

const rubric: CaseRubric = {
  caseId: 'fixture',
  requestedFacts: [{ id: 'fact', description: 'requested fact' }],
  exactValues: [{ kind: 'version', value: '1.2.3' }],
  forbiddenClaims: [{ id: 'unsupported', description: 'unsupported claim' }],
  requiredLimitations: ['not_observed'],
};
const result = {
  schemaVersion: 2,
  outcome: 'completed',
  verification: 'not_run',
  findings: [{ id: 'finding', statement: 'Declared version.', basis: 'direct_observation', citations: [{ path: 'package.json', startLine: 1, endLine: 1 }], excerpt: '"version":"1.2.3"', exactValues: [{ kind: 'version', value: '1.2.3', citation: { path: 'package.json', startLine: 1, endLine: 1 } }] }],
  limitations: [{ kind: 'not_observed', description: 'Runtime behavior was not observed.', citations: [] }],
  validation: { status: 'grounded' },
};
const review = { findingCorrectness: { finding: 'pass' as const }, requestedFactCoverage: { fact: 'pass' as const }, forbiddenClaims: { unsupported: 'pass' as const }, limitationHandling: 'pass' as const };
const preservation = { head: true, index: true, status: true, trackedContents: true, baselineUntrackedContents: true };

test('grader keeps runtime, grounding, exactness, completeness, semantics, limitations and preservation separate', () => {
  const accepted = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, review, preservation });
  assert(accepted.accepted);
  const missingReview = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, preservation });
  assert.equal(missingReview.dimensions.evidence, 'pass');
  assert.equal(missingReview.dimensions.semanticCorrectness, 'not_reviewed');
  assert.equal(missingReview.dimensions.requestedFacts, 'not_reviewed');
  assert.equal(missingReview.accepted, false);
});

test('valid citations cannot hide a wrong fact or an omitted requested fact', () => {
  const wrong = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, review: { ...review, findingCorrectness: { finding: 'fail' } }, preservation });
  assert.equal(wrong.dimensions.evidence, 'pass');
  assert.equal(wrong.dimensions.semanticCorrectness, 'fail');
  const omitted = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, review: { ...review, requestedFactCoverage: { fact: 'fail' } }, preservation });
  assert.equal(omitted.dimensions.requestedFacts, 'fail');
  const exact = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result: { ...result, findings: [{ ...result.findings[0], exactValues: [] }] }, rubric, review, preservation });
  assert.equal(exact.dimensions.exactValues, 'fail');
  const changedUntracked = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, review, preservation: { ...preservation, baselineUntrackedContents: false } });
  assert.equal(changedUntracked.dimensions.preservation, 'fail');
});

const frozen = {
  sourceRevision: 'source', promptContractVersion: 'prompt', resultContractVersion: 2, model: 'model', modelDigest: 'digest', inferenceSettings: { context: 8192 }, targetCommit: 'target', casesDigest: 'cases', rubricDigest: 'rubric', budgets: { turns: 12 },
};
const passCase = evaluateAcceptanceCase({ caseId: 'fixture', taskStatus: 'completed', result, rubric, review, preservation });
const run = (runId: string): GateRun => ({ runId, frozen, cases: ['a', 'b', 'c', 'd', 'e'].map(caseId => ({ ...passCase, caseId })) });

test('gate pair requires two unchanged reviewed 5/5 runs', () => {
  assert(evaluateGatePair(run('one'), run('two')).accepted);
  assert.equal(evaluateGatePair(run('one'), { ...run('two'), frozen: { ...frozen, modelDigest: 'other' } }).accepted, false);
  assert.equal(evaluateGatePair(run('one'), { ...run('two'), cases: run('two').cases.slice(0, 4) }).accepted, false);
  assert.equal(evaluateGatePair(run('one'), { ...run('two'), cases: run('two').cases.map((item, index) => index ? item : { ...item, accepted: false }) }).accepted, false);
});
