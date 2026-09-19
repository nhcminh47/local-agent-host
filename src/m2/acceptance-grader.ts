import { FinishAnalysisResult, type FinishAnalysisValue } from '../domain/exploration-result.js';

export type DimensionStatus = 'pass' | 'fail' | 'not_reviewed';
export type CaseRubric = {
  caseId: string;
  requestedFacts: Array<{ id: string; description: string }>;
  exactValues: Array<{ kind: string; value: string }>;
  forbiddenClaims: Array<{ id: string; description: string }>;
  requiredLimitations: Array<'redacted' | 'outside_scope' | 'unavailable' | 'not_observed'>;
};
export type HumanReview = {
  findingCorrectness?: Record<string, 'pass' | 'fail'>;
  requestedFactCoverage?: Record<string, 'pass' | 'fail'>;
  forbiddenClaims?: Record<string, 'pass' | 'fail'>;
  limitationHandling?: 'pass' | 'fail';
  reviewer?: string;
  reviewedAt?: string;
};
export type CaseEvaluation = {
  caseId: string;
  dimensions: {
    runtime: DimensionStatus;
    contract: DimensionStatus;
    evidence: DimensionStatus;
    exactValues: DimensionStatus;
    requestedFacts: DimensionStatus;
    semanticCorrectness: DimensionStatus;
    limitations: DimensionStatus;
    preservation: DimensionStatus;
  };
  accepted: boolean;
};

const everyReview = (ids: readonly string[], values: Record<string, 'pass' | 'fail'> | undefined): DimensionStatus => {
  if (!values || ids.some(id => values[id] === undefined)) return 'not_reviewed';
  return ids.every(id => values[id] === 'pass') ? 'pass' : 'fail';
};

export function evaluateAcceptanceCase(input: {
  caseId: string;
  taskStatus: string;
  result: unknown;
  rubric: CaseRubric;
  review?: HumanReview;
  preservation: Record<string, boolean>;
}): CaseEvaluation {
  const result = input.result as Partial<{ schemaVersion: number; outcome: string; verification: string; findings: FinishAnalysisValue['findings']; limitations: FinishAnalysisValue['limitations']; validation: { status?: string } }> | null;
  const contract = result && FinishAnalysisResult.safeParse({ schemaVersion: result.schemaVersion, findings: result.findings, limitations: result.limitations }).success
    && result.outcome === 'completed' && result.verification === 'not_run';
  const findings = contract ? result!.findings! : [];
  const limitations = contract ? result!.limitations! : [];
  const exactValues = new Set(findings.flatMap(finding => finding.exactValues.map(exact => `${exact.kind}\0${exact.value}`)));
  const exactPass = input.rubric.exactValues.every(exact => exactValues.has(`${exact.kind}\0${exact.value}`));
  const requestedFacts = everyReview(input.rubric.requestedFacts.map(fact => fact.id), input.review?.requestedFactCoverage);
  const semanticFindings = everyReview(findings.map(finding => finding.id), input.review?.findingCorrectness);
  const forbiddenClaims = everyReview(input.rubric.forbiddenClaims.map(claim => claim.id), input.review?.forbiddenClaims);
  const semanticCorrectness: DimensionStatus = semanticFindings === 'not_reviewed' || forbiddenClaims === 'not_reviewed'
    ? 'not_reviewed' : semanticFindings === 'pass' && forbiddenClaims === 'pass' ? 'pass' : 'fail';
  const requiredKinds = input.rubric.requiredLimitations.every(kind => limitations.some(limitation => limitation.kind === kind));
  const limitationsStatus: DimensionStatus = input.review?.limitationHandling === undefined ? 'not_reviewed'
    : requiredKinds && input.review.limitationHandling === 'pass' ? 'pass' : 'fail';
  const dimensions: CaseEvaluation['dimensions'] = {
    runtime: input.taskStatus === 'completed' ? 'pass' : 'fail',
    contract: contract ? 'pass' : 'fail',
    evidence: contract && result?.validation?.status === 'grounded' ? 'pass' : 'fail',
    exactValues: contract && exactPass ? 'pass' : 'fail',
    requestedFacts,
    semanticCorrectness,
    limitations: limitationsStatus,
    preservation: Object.keys(input.preservation).length > 0 && Object.values(input.preservation).every(Boolean) ? 'pass' : 'fail',
  };
  return { caseId: input.caseId, dimensions, accepted: Object.values(dimensions).every(value => value === 'pass') };
}

export type FrozenGateInputs = {
  sourceRevision: string;
  promptContractVersion: string;
  resultContractVersion: number;
  model: string;
  modelDigest: string;
  inferenceSettings: unknown;
  targetCommit: string;
  casesDigest: string;
  rubricDigest: string;
  budgets: unknown;
};
export type GateRun = { runId: string; frozen: FrozenGateInputs; cases: CaseEvaluation[] };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function evaluateGatePair(first: GateRun, second: GateRun) {
  const issues: string[] = [];
  if (stable(first.frozen) !== stable(second.frozen)) issues.push('FROZEN_INPUT_DRIFT');
  for (const [label, run] of [['first', first], ['second', second]] as const) {
    if (run.cases.length !== 5) issues.push(`${label.toUpperCase()}_CASE_COUNT`);
    if (new Set(run.cases.map(item => item.caseId)).size !== run.cases.length) issues.push(`${label.toUpperCase()}_DUPLICATE_CASE`);
    if (!run.cases.every(item => item.accepted)) issues.push(`${label.toUpperCase()}_CASE_FAILURE`);
  }
  if (stable(first.cases.map(item => item.caseId).sort()) !== stable(second.cases.map(item => item.caseId).sort())) issues.push('CASE_SET_DRIFT');
  return { accepted: issues.length === 0, issues };
}
