import type { FinishAnalysisValue } from '../domain/exploration-result.js';

function citation(value: { path: string; startLine: number; endLine: number }) {
  return `\`${value.path}:${value.startLine}${value.endLine === value.startLine ? '' : `-${value.endLine}`}\``;
}

export function renderExplorationResult(value: FinishAnalysisValue) {
  const findings = value.findings.map(finding => {
    const basis = finding.basis === 'inference' ? 'Inference' : 'Observed';
    return `- ${basis}: ${finding.statement} ${finding.citations.map(citation).join(', ')}`;
  });
  const limitations = value.limitations.map(limitation => {
    const path = limitation.path ? ` (${limitation.path})` : '';
    const citations = limitation.citations.length ? ` ${limitation.citations.map(citation).join(', ')}` : '';
    return `- ${limitation.kind}${path}: ${limitation.description}${citations}`;
  });
  const summary = [`Findings`, ...findings, ...(limitations.length ? ['', 'Limitations', ...limitations] : [])].join('\n');
  if (Buffer.byteLength(summary) > 6_000) throw new Error('EXPLORER_SUMMARY_LIMIT');
  return summary;
}
