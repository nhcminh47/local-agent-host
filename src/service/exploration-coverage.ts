import type { ExplorationResultV2 } from '../domain/exploration-result.js';
import { validateStructuredFindings, type ObservedLine } from './citation-validation.js';
import { renderExplorationResult } from './exploration-result-renderer.js';

const COVERAGE_STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'any', 'cite', 'could', 'details', 'does', 'each', 'exact', 'explain', 'file', 'files',
  'from', 'implementation', 'into', 'line', 'lines', 'list', 'only', 'other', 'path', 'paths', 'read', 'state', 'that', 'their',
  'then', 'this', 'versus', 'what', 'when', 'where', 'which', 'without', 'with', 'would',
]);

export function coverageTerms(text: string) {
  const withoutPaths = text.replace(/\b\S*[\\/]\S+\b/g, ' ');
  return [...new Set((withoutPaths.toLowerCase().match(/[a-z0-9_]+/g) ?? [])
    .map(word => word.length > 5 && word.endsWith('s') ? word.slice(0, -1) : word)
    .filter(word => word.length >= 5 && !COVERAGE_STOP_WORDS.has(word)))];
}

export function coverageChecklist(question: string) {
  return question.split(/(?<=[.!?])\s+/).flatMap(sentence => {
    const match = /^(?:explain|list)\s+(.+?)[.!?]?$/i.exec(sentence.trim());
    return match ? match[1]!.split(/\s*,\s*|\s+and\s+/i).map(item => item.trim()).filter(item => item.length >= 3) : [];
  }).slice(0, 12);
}

export function uncitedObservedRanges(lines: readonly ObservedLine[], result: ExplorationResultV2) {
  const cited = (line: ObservedLine) => result.findings.some(finding => finding.citations.some(citation =>
    citation.path === line.path && citation.startLine <= line.line && citation.endLine >= line.line));
  const ranges: Array<{ path: string; startLine: number; endLine: number }> = [];
  for (const line of [...lines].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
    if (line.text === '[REDACTED]' || cited(line)) continue;
    const previous = ranges.at(-1);
    if (previous && previous.path === line.path && previous.endLine + 1 === line.line) previous.endLine = line.line;
    else ranges.push({ path: line.path, startLine: line.line, endLine: line.line });
  }
  return ranges.slice(0, 12).map(range => `${range.path}:${range.startLine}-${range.endLine}`);
}

export function retainedFindings(result: ExplorationResultV2) {
  return result.findings.slice(0, 24).map(finding => ({
    id: finding.id,
    statement: finding.statement,
    citations: finding.citations.map(citation => `${citation.path}:${citation.startLine}-${citation.endLine}`),
  }));
}

const SEMANTIC_CALL_STOP_WORDS = new Set([
  'array', 'buffer', 'catch', 'error', 'get', 'if', 'json', 'map', 'number', 'object', 'promise', 'string', 'switch', 'while',
]);

function semanticTokens(text: string) {
  return (text.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [])
    .map(token => token.toLowerCase().replace(/(?:es|s)$/i, ''))
    .filter(token => token.length >= 3 || /^\d+$/.test(token));
}

function semanticLineAnchors(text: string) {
  if (/^\s*(?:import\b|\/\/|\*|export\s+(?:async\s+)?function\b|(?:async\s+)?function\b)/.test(text)) return [];
  const anchors: string[] = [];
  for (const match of text.matchAll(/(?:new\s+)?(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\s*\(/g)) {
    const call = match[1]!.toLowerCase();
    if (!SEMANTIC_CALL_STOP_WORDS.has(call)) anchors.push(...semanticTokens(match[1]!));
  }
  for (const match of text.matchAll(/['"]([^'"]{1,80})['"]/g)) {
    const literal = match[1]!;
    if (/^[A-Z][A-Z0-9_ ]{2,}$/.test(literal) || /^SELECT\b/i.test(literal) || /\breturn\b/.test(text)) {
      anchors.push(...semanticTokens(literal));
    }
  }
  for (const match of text.matchAll(/"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    anchors.push(...semanticTokens(`${match[1]} ${match[2]}`));
  }
  if (/\bthrow\b/.test(text)) anchors.push('throw');
  if (/\breturn\b/.test(text)) anchors.push('return');
  if (/\bexitCode\s*=/.test(text)) anchors.push('exit', 'code');
  for (const number of text.match(/\b[1-5]\d{2}\b/g) ?? []) anchors.push(number);
  return [...new Set(anchors)];
}

function underreportedSemanticRanges(lines: readonly ObservedLine[], result: ExplorationResultV2) {
  const cited = (line: ObservedLine) => result.findings.some(finding => finding.citations.some(citation =>
    citation.path === line.path && citation.startLine <= line.line && citation.endLine >= line.line));
  const statementTokens = (line: ObservedLine) => new Set(semanticTokens(result.findings
    .filter(finding => finding.citations.some(citation => citation.path === line.path && citation.startLine <= line.line && citation.endLine >= line.line))
    .map(finding => finding.statement).join(' ')));
  const citationDistance = (line: ObservedLine) => Math.min(...result.findings.flatMap(finding => finding.citations
    .filter(citation => citation.path === line.path)
    .map(citation => line.line < citation.startLine ? citation.startLine - line.line : line.line > citation.endLine ? line.line - citation.endLine : 0)), 999);
  return lines
    .filter(line => line.text !== '[REDACTED]')
    .map(line => ({ line, anchors: semanticLineAnchors(line.text) }))
    .map(value => ({
      ...value,
      distance: citationDistance(value.line),
      isCited: cited(value.line),
      reportedTokens: statementTokens(value.line),
      priority: /['"][A-Z][A-Z0-9_ ]{2,}['"]|\b[1-5]\d{2}\b|\bthrow\b|\bexitCode\s*=/.test(value.line.text) ? 0
        : /Promise\.race|setTimeout|timingSafeEqual|\.once\(|\.listen\(|stderr\.write|mkdirSync|validateMigrations|\.prepare\(/.test(value.line.text) ? 1 : 2,
    }))
    .filter(({ anchors, isCited, reportedTokens }) => anchors.length > 0 && (isCited
      ? anchors.some(anchor => !reportedTokens.has(anchor))
      : true))
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.line.path.localeCompare(b.line.path) || a.line.line - b.line.line)
    .slice(0, 1)
    .map(({ line }) => `${line.path}:${line.line}-${line.line}`);
}

export function enrichObservedOperations(result: ExplorationResultV2, lines: readonly ObservedLine[], question: string) {
  const originalCitations = result.findings.flatMap(finding => finding.citations);
  const relevantLines = lines.filter(line => {
    const ranges = originalCitations.filter(citation => citation.path === line.path);
    if (line.path.endsWith('.json')) return ranges.some(citation => citation.startLine <= line.line && citation.endLine >= line.line);
    const distance = Math.min(...ranges.map(citation => line.line < citation.startLine
      ? citation.startLine - line.line : line.line > citation.endLine ? line.line - citation.endLine : 0), 999);
    const statusRelevant = /status codes?/i.test(question) && /['"][A-Z][A-Z0-9_]{2,}['"]|\b[1-5]\d{2}\b/.test(line.text);
    const readyRelevant = /\/ready\b/i.test(question) && distance <= 10;
    return distance <= 4 || (!ranges.length && question.includes(line.path)) || statusRelevant || readyRelevant;
  });
  const augmentedFindings = result.findings.map(finding => {
    const tokens = new Set(semanticTokens(finding.statement));
    const paths = new Set(finding.citations.map(citation => citation.path));
    const candidates = relevantLines
      .filter(line => line.text !== '[REDACTED]' && paths.has(line.path)
        && semanticLineAnchors(line.text).some(anchor => tokens.has(anchor))
        && !finding.citations.some(citation => citation.path === line.path && citation.startLine <= line.line && citation.endLine >= line.line))
      .sort((a, b) => {
        const distance = (line: ObservedLine) => Math.min(...finding.citations.filter(citation => citation.path === line.path)
          .map(citation => line.line < citation.startLine ? citation.startLine - line.line : line.line > citation.endLine ? line.line - citation.endLine : 0), 999);
        return distance(a) - distance(b) || a.path.localeCompare(b.path) || a.line - b.line;
      })
      .slice(0, Math.max(0, 8 - finding.citations.length));
    if (!candidates.length) return finding;
    const raw = { findings: [{ ...finding, citations: [...finding.citations, ...candidates.map(line => ({ path: line.path, startLine: line.line, endLine: line.line }))] }], limitations: [] };
    const validated = validateStructuredFindings(raw, lines);
    return validated.success ? validated.value.findings[0]! : finding;
  });
  let enriched = { ...result, findings: augmentedFindings, summary: renderExplorationResult({ schemaVersion: 2, findings: augmentedFindings, limitations: result.limitations }) };
  const used = new Set<string>();
  while (enriched.findings.length < 24) {
    const range = underreportedSemanticRanges(relevantLines, enriched).find(value => !used.has(value));
    if (!range) break;
    used.add(range);
    const match = /^(.*):(\d+)-(\d+)$/.exec(range);
    if (!match) continue;
    const path = match[1]!;
    const lineNumber = Number(match[2]);
    const source = lines.find(line => line.path === path && line.line === lineNumber);
    if (!source || source.text === '[REDACTED]') continue;
    const raw = {
      findings: [{
        id: `observed-operation-${enriched.findings.length + 1}`,
        statement: `Observed filtered source operation at ${path}:${lineNumber}: ${source.text.trim().slice(0, 900)}`,
        basis: 'direct_observation',
        citations: [{ path, startLine: lineNumber, endLine: lineNumber }],
      }],
      limitations: [],
    };
    const validated = validateStructuredFindings(raw, lines);
    if (!validated.success) continue;
    const findings = [...enriched.findings, ...validated.value.findings];
    enriched = { ...enriched, findings, summary: renderExplorationResult({ schemaVersion: 2, findings, limitations: enriched.limitations }) };
  }
  if (/do not infer internals? of functions? defined in other files/i.test(question)
      && !enriched.limitations.some(limitation => limitation.kind === 'not_observed')) {
    const limitations = [...enriched.limitations, {
      kind: 'not_observed' as const,
      description: 'Implementations of functions defined outside the eligible observed files were not inspected.',
      citations: [],
    }];
    enriched = { ...enriched, limitations, summary: renderExplorationResult({ schemaVersion: 2, findings: enriched.findings, limitations }) };
  }
  return enriched;
}
