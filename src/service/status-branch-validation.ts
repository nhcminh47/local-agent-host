import type { FindingCitationValue } from '../domain/exploration-result.js';
import type { ObservedLine, StructuredValidationIssue } from './citation-validation.js';

// A conservative lexical guard, not a parser or a proof of control-flow semantics.
// Requiring the whole expression avoids treating a response label as a predicate.
export function validateStatusBranches(statement: string, citations: readonly FindingCitationValue[], lines: readonly ObservedLine[]): StructuredValidationIssue[] {
  const cited = (line: ObservedLine) => citations.some(citation => citation.path === line.path
    && citation.startLine <= line.line && citation.endLine >= line.line);
  const quoted = [...statement.matchAll(/`([^`\r\n]+)`/g)].map(match => match[1]!.trim());
  for (const line of lines) {
    const assignment = /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\r\n]+?\?\s*([1-5]\d{2})\s*:\s*([1-5]\d{2}))\s*;?\s*$/.exec(line.text);
    if (!assignment || !/status/i.test(assignment[1]!)) continue;
    if (![assignment[3], assignment[4]].some(status => new RegExp(`\\b${status}\\b`).test(statement))) continue;
    const variable = assignment[1]!;
    // Inspect only a contiguous, observed, visible neighborhood. No hidden predicate lookup.
    let feedsResponse = false;
    for (let offset = 1; offset <= 3; offset++) {
      const next = lines.find(item => item.path === line.path && item.line === line.line + offset);
      if (!next || next.text === '[REDACTED]') break;
      const argumentsInCalls = [...next.text.matchAll(/\.(?:code|status|writeHead)\(\s*([A-Za-z_$][\w$]*)\s*\)/g)];
      if (cited(next) && argumentsInCalls.some(match => match[1] === variable)) feedsResponse = true;
    }
    if (!cited(line) && !feedsResponse) continue;
    if (!cited(line) || !quoted.includes(assignment[2]!.trim())) {
      return [{ code: 'STATUS_BRANCH_CONTEXT_REQUIRED', path: '', message: 'cite and quote the complete observed numeric status conditional expression, including its predicate and both branches' }];
    }
  }
  return [];
}
