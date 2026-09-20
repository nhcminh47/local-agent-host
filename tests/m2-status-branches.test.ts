import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStructuredFindings, type ObservedLine } from '../src/service/citation-validation.js';

const expression = "typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413 ? 413 : 500";
const lines: ObservedLine[] = [
  { path: 'app.ts', line: 49, text: `    const status = ${expression};` },
  { path: 'app.ts', line: 50, text: "    const code = status === 413 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';" },
  { path: 'app.ts', line: 51, text: '    return reply.code(status).send(errorBody(code));' },
];
const finding = (statement: string, startLine = 49, endLine = 51) => ({ id: 'failure_status_codes', statement, basis: 'direct_observation', citations: [{ path: 'app.ts', startLine, endLine }] });
const validate = (statement: string, observed = lines, start = 49, end = 51) => validateStructuredFindings({ findings: [finding(statement, start, end)], limitations: [] }, observed);

test('status label overgeneralization is rejected despite valid citations and literals', () => {
  for (const statement of [
    'Failure status codes include 401 for authentication errors, 404 for not found routes, 413 for validation errors, and 500/503 for internal errors or database unavailability.',
    '413 for VALIDATION_ERROR.',
    'All errors return 500.',
  ]) {
    const result = validate(statement);
    assert(!result.success);
    assert(result.issues.some(issue => issue.code === 'STATUS_BRANCH_CONTEXT_REQUIRED'));
  }
});

test('a status claim must quote the entire selection and cite its predicate', () => {
  assert(validate(`The handler selects its status using \`${expression}\`.`).success);
  assert(!validate('The handler uses `error.statusCode === 413` to select 413.').success);
  assert(!validate(`The handler selects \`${expression}\`.`, lines, 51, 51).success);
  assert(!validate('413 for validation errors.', lines, 51, 51).success);
  assert(!validate('413 for validation errors.', lines, 49, 49).success);
});

test('conditional status guard applies to other numeric branches and each finding separately', () => {
  const observed = [{ path: 'app.ts', line: 49, text: 'const statusCode = busy ? 429 : 503;' }];
  assert(!validate('429 for internal errors.', observed, 49, 49).success);
  assert(validate('The status is selected by `busy ? 429 : 503`.', observed, 49, 49).success);
  const result = validateStructuredFindings({ findings: [finding(`Selection: \`${expression}\`.`), { ...finding('413 for validation errors.'), id: 'overgeneralized' }], limitations: [] }, lines);
  assert(!result.success);
});

test('unobserved/redacted predicates and unrelated constants do not invent branch evidence', () => {
  for (const observed of [
    lines.slice(1),
    [{ ...lines[0]!, text: '[REDACTED]' }, ...lines.slice(1)],
    [{ ...lines[0]!, text: '// const status = busy ? 413 : 500;' }, ...lines.slice(1)],
    [{ ...lines[0]!, text: 'const limit = large ? 413 : 500;' }, ...lines.slice(1)],
  ]) assert(validate('The visible response line uses a status variable.', observed, 51, 51).success);
  // This narrow guard cannot verify arbitrary prose or unobserved predicates.
  assert(validate('413 for validation errors.', lines.slice(1), 51, 51).success);
  assert(validate('An unrelated response returns 401.').success);
});
