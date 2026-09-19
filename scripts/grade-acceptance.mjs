import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAcceptanceCase, evaluateGatePair } from '../dist/src/m2/acceptance-grader.js';

const host = fileURLToPath(new URL('../', import.meta.url));
const reportPath = process.env.ACCEPTANCE_REPORT;
const reviewPath = process.env.ACCEPTANCE_REVIEW_FILE;
if (!reportPath || !reviewPath) throw new Error('ACCEPTANCE_REPORT and ACCEPTANCE_REVIEW_FILE are required');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const reviews = JSON.parse(await readFile(reviewPath, 'utf8'));
const rubric = JSON.parse(await readFile(new URL('./acceptance-rubric.json', import.meta.url), 'utf8'));
const rubricById = new Map(rubric.cases.map(item => [item.caseId, item]));

for (const item of report.cases) {
  const review = reviews.cases?.[item.caseId];
  const caseRubric = rubricById.get(item.rubricRef);
  if (!review || !caseRubric) throw new Error(`MISSING_REVIEW:${item.caseId}`);
  item.evaluation = evaluateAcceptanceCase({ caseId: item.caseId, taskStatus: item.task.status, result: item.result, rubric: caseRubric, review, preservation: item.preservation });
  item.worksheet = {
    caseId: item.caseId,
    reviewer: review.reviewer ?? null,
    reviewedAt: review.reviewedAt ?? null,
    findings: (item.result.findings ?? []).map(finding => ({ id: finding.id, statement: finding.statement, status: review.findingCorrectness?.[finding.id] ?? 'not_reviewed' })),
    requestedFacts: caseRubric.requestedFacts.map(fact => ({ ...fact, status: review.requestedFactCoverage?.[fact.id] ?? 'not_reviewed' })),
    forbiddenClaims: caseRubric.forbiddenClaims.map(claim => ({ ...claim, status: review.forbiddenClaims?.[claim.id] ?? 'not_reviewed' })),
    limitationHandling: review.limitationHandling ?? 'not_reviewed',
  };
}
report.gateRun.cases = report.cases.map(item => item.evaluation);
report.reviewedAt = new Date().toISOString();
const outputPath = process.env.ACCEPTANCE_GRADED_REPORT ?? join(dirname(reportPath), basename(reportPath, '.json') + '-reviewed.json');
await writeFile(outputPath, JSON.stringify(report, null, 2));

let pair = null;
if (process.env.ACCEPTANCE_PAIR_WITH) {
  const previous = JSON.parse(await readFile(process.env.ACCEPTANCE_PAIR_WITH, 'utf8'));
  pair = evaluateGatePair(previous.gateRun, report.gateRun);
  await writeFile(join(dirname(outputPath), `acceptance-pair-${report.gateRun.runId}.json`), JSON.stringify({ schemaVersion: 1, firstRunId: previous.gateRun.runId, secondRunId: report.gateRun.runId, ...pair }, null, 2));
}
console.log(JSON.stringify({ outputPath, runId: report.gateRun.runId, acceptedCases: report.gateRun.cases.filter(item => item.accepted).length, pair }));
