import { FinishAnalysisInput, type FindingCitationValue, type FinishAnalysisValue } from '../domain/exploration-result.js';
import { validateStatusBranches } from './status-branch-validation.js';

export type EvidenceRange = { path: string; startLine: number; endLine: number };
export type ObservedLine = { path: string; line: number; text: string };
export type StructuredValidationIssue = { code: string; path: string; message: string };

// This verifies observed ranges, not whether a sentence follows from the code.
export function validateCitations(summary: string, evidence: readonly EvidenceRange[]) {
  const citations: EvidenceRange[] = [];
  const add = (value: string) => {
    const match = /^([^:\r\n`]+):(\d+)(?:-(\d+))?$/.exec(value);
    if (match) citations.push({ path: match[1]!, startLine: Number(match[2]), endLine: Number(match[3] ?? match[2]) });
  };
  for (const match of summary.matchAll(/`([^`\r\n]+)`/g)) {
    const value = match[1]!;
    add(value.replace(/(\d)[–—](?=\d)/g, '$1-'));
    if (!value.includes(':')) {
      const suffix = summary.slice(match.index + match[0].length);
      const external = /^(?::|\s*\(lines?\s+)(\d+)(?:[-–—](\d+))?(?=$|[\s).,;])/i.exec(suffix);
      if (external) add(`${value}:${external[1]}${external[2] ? '-' + external[2] : ''}`);
    }
  }
  const unquoted = summary.replace(/`[^`\r\n]+`/g, ' ');
  for (const match of unquoted.matchAll(/(?:^|[\s(])([^\s`():]+:\d+(?:-\d+)?)(?=$|[\s).,;])/g)) add(match[1]!);
  const invalid = citations.filter(citation => {
    if (!Number.isSafeInteger(citation.startLine) || !Number.isSafeInteger(citation.endLine) || citation.startLine < 1 || citation.endLine < citation.startLine) return true;
    const ranges = evidence.filter(item => item.path === citation.path).sort((a, b) => a.startLine - b.startLine);
    let next = citation.startLine;
    for (const range of ranges) {
      if (range.startLine > next) break;
      if (range.endLine >= next) next = range.endLine + 1;
      if (next > citation.endLine) return false;
    }
    return true;
  });
  return { status: citations.length && !invalid.length ? 'ranges_verified' as const : 'invalid' as const, citations, invalid, semanticVerification: 'not_performed' as const };
}

// Inline code must occur in observed source (whitespace-insensitive), decoded
// JSON strings, or observed paths. This is still not semantic verification.
export function ungroundedLiterals(summary: string, observedText: string, paths: readonly string[]) {
  // read_file prefixes lines for display; those labels are not source tokens.
  observedText = observedText.replace(/^\d+: ?/gm, '');
  const decoded = [...observedText.matchAll(/"(?:\\.|[^"\\\r\n])*"/g)].flatMap(match => {
    try { return [JSON.parse(match[0]) as string]; } catch { return []; }
  });
  const corpus = observedText + '\n' + decoded.join('\n');
  const compact = corpus.replace(/\s+/g, '');
  const hasToken = (value: string) => {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value)) return compact.includes(value.replace(/\s+/g, ''));
    const boundary = /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? /[A-Za-z0-9_]/ : /[A-Za-z0-9_.-]/;
    for (let at = corpus.indexOf(value); at >= 0; at = corpus.indexOf(value, at + 1)) {
      const before = corpus[at - 1] ?? '', after = corpus[at + value.length] ?? '';
      if (!boundary.test(before) && !boundary.test(after)) return true;
    }
    return false;
  };
  return [...new Set([...summary.matchAll(/`([^`\r\n]+)`/g)].map(match => match[1]!)
    .filter(value => !/^[^:\r\n]+:\d+(?:[-–—]\d+)?$/.test(value) && !hasToken(value) && !paths.some(path => path === value || path.endsWith('/' + value))))];
}

function citationText(citation: FindingCitationValue, observedLines: readonly ObservedLine[]) {
  const byLine = new Map(observedLines.filter(line => line.path === citation.path).map(line => [line.line, line.text]));
  const lines: string[] = [];
  for (let line = citation.startLine; line <= citation.endLine; line++) {
    const text = byLine.get(line);
    if (text === undefined) return null;
    lines.push(text);
  }
  return lines.join('\n');
}

function decodedJsonStrings(text: string) {
  return [...text.matchAll(/"(?:\\.|[^"\\\r\n])*"/g)].flatMap(match => {
    try {
      const value = JSON.parse(match[0]) as unknown;
      return typeof value === 'string' ? [value] : [];
    } catch { return []; }
  });
}

function hasExactValue(text: string, value: string, kind: 'identifier' | 'package' | 'version' | 'json_string' | 'command') {
  if (kind === 'json_string' || kind === 'command') return decodedJsonStrings(text).some(decoded => decoded === value);
  if (kind === 'identifier') {
    for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
      const before = text[at - 1] ?? '';
      const after = text[at + value.length] ?? '';
      if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) return true;
    }
    return false;
  }
  for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
    const before = text[at - 1] ?? '';
    const after = text[at + value.length] ?? '';
    if (!/[A-Za-z0-9_.-]/.test(before) && !/[A-Za-z0-9_.-]/.test(after)) return true;
  }
  return false;
}

function sourceStrings(text: string) {
  const values = decodedJsonStrings(text);
  for (const match of text.matchAll(/'(?:\\.|[^'\\\r\n])*'/g)) values.push(match[0].slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  for (const match of text.matchAll(/`([^`\\\r\n]*)`/g)) if (!match[1]!.includes('${')) values.push(match[1]!);
  return [...new Set(values)];
}

function deriveExactValues(citations: readonly FindingCitationValue[], observedLines: readonly ObservedLine[]): FinishAnalysisValue['findings'][number]['exactValues'] {
  const candidates: Array<{ kind: 'identifier' | 'package' | 'version' | 'json_string' | 'command'; value: string; citation: FindingCitationValue; priority: number; order: number }> = [];
  const seen = new Set<string>();
  let order = 0;
  const add = (kind: 'identifier' | 'package' | 'version' | 'json_string' | 'command', value: string, citation: FindingCitationValue, text: string, priority: number) => {
    const key = `${kind}\0${value}`;
    if (!value || seen.has(key) || !hasExactValue(text, value, kind)) return;
    seen.add(key); candidates.push({ kind, value, citation, priority, order: order++ });
  };
  for (const citation of citations) {
    const text = citationText(citation, observedLines);
    if (text === null || text.split('\n').includes('[REDACTED]')) continue;
    if (citation.path.endsWith('package.json')) {
      for (const line of text.split('\n')) {
        for (const pair of line.matchAll(/"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
          let value: string;
          try { value = JSON.parse(`"${pair[2]}"`) as string; } catch { continue; }
          if (/^(?:[<>=~^]*\d[0-9A-Za-z.*+_-]*)(?:\s+[<>=~^]*\d[0-9A-Za-z.*+_-]*)*$/.test(value)) add('package', pair[1]!, citation, text, 98);
        }
      }
    }
    for (const value of sourceStrings(text)) {
      if (/^(?:tsc|node|pnpm|npm|yarn|vitest|jest|tsx|vite)\b/.test(value)) add('command', value, citation, text, 100);
      if (/^(?:[<>=~^]*\d[0-9A-Za-z.*+_-]*)(?:\s+[<>=~^]*\d[0-9A-Za-z.*+_-]*)*$/.test(value)) add('version', value, citation, text, 95);
      add('identifier', value, citation, text, 85);
      add('json_string', value, citation, text, 40);
    }
    for (const match of text.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) add('identifier', match[1]!, citation, text, 80);
    for (const match of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) add('identifier', match[0], citation, text, 10);
  }
  return candidates.sort((a, b) => b.priority - a.priority || a.order - b.order).slice(0, 32)
    .map(({ kind, value, citation }) => ({ kind, value, citation }));
}

function normalizeCompletion(raw: unknown, unavailablePaths: ReadonlyMap<string, 'outside_scope' | 'unavailable'>, observedLines: readonly ObservedLine[]) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const source = raw as Record<string, unknown>;
  const asArray = (value: unknown) => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const pickCitation = (value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    return typeof item.path === 'string' && Number.isInteger(item.startLine) && Number.isInteger(item.endLine)
      ? { path: item.path, startLine: item.startLine, endLine: item.endLine } : null;
  };
  const normalizeCitations = (value: unknown) => asArray(value).map(pickCitation).filter((item): item is NonNullable<typeof item> => item !== null);
  const basis = (value: unknown) => {
    if (typeof value !== 'string') return 'direct_observation';
    const key = value.toLowerCase().replace(/[^a-z]+/g, '_');
    if (key.includes('infer')) return 'inference';
    return 'direct_observation';
  };
  const findings = asArray(source.findings).map(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const item = value as Record<string, unknown>;
    return {
      id: item.id,
      statement: item.statement,
      basis: basis(item.basis),
      citations: normalizeCitations(item.citations),
    };
  });
  const limitations = asArray(source.limitations).map(value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const item = value as Record<string, unknown>;
    const rawCitations = normalizeCitations(item.citations);
    const mentioned = new Set<string>();
    if (typeof item.path === 'string' && unavailablePaths.has(item.path)) mentioned.add(item.path);
    for (const citation of rawCitations) {
      if (citation !== null && typeof citation === 'object' && !Array.isArray(citation)) {
        const path = (citation as Record<string, unknown>).path;
        if (typeof path === 'string' && unavailablePaths.has(path)) mentioned.add(path);
      }
    }
    if (typeof item.description === 'string') for (const path of unavailablePaths.keys()) if (item.description.includes(path)) mentioned.add(path);
    const deniedPath = mentioned.size === 1 ? [...mentioned][0] : undefined;
    const redactedPaths = [...new Set(observedLines.filter(line => line.text === '[REDACTED]').map(line => line.path))];
    const describesRedaction = item.kind === 'redacted' || typeof item.description === 'string' && /redact|filter/i.test(item.description);
    const redactedPath = !deniedPath && (describesRedaction || item.kind === 'outside_scope' || item.kind === 'unavailable')
      ? typeof item.path === 'string' && redactedPaths.includes(item.path) ? item.path : redactedPaths.length === 1 ? redactedPaths[0] : undefined
      : undefined;
    const kind = deniedPath ? unavailablePaths.get(deniedPath) : redactedPath ? 'redacted' : item.kind;
    const path = deniedPath ?? (kind === 'outside_scope' || kind === 'unavailable' ? item.path : undefined);
    const description = deniedPath
      ? kind === 'outside_scope'
        ? 'The requested path was outside the enforced task scope; its contents were not inspected.'
        : 'The requested path was unavailable in the eligible committed snapshot; its contents were not inspected.'
      : redactedPath ? `Some source lines in ${redactedPath} were filtered and their contents were not observed.` : item.description;
    const observedRedactions = observedLines.filter(line => line.text === '[REDACTED]').map(line => ({ path: line.path, startLine: line.line, endLine: line.line }));
    const normalizedCitations = redactedPath
      ? observedLines.filter(line => line.path === redactedPath && line.text === '[REDACTED]').map(line => ({ path: line.path, startLine: line.line, endLine: line.line }))
      : kind === 'redacted' && observedRedactions.length
        ? observedRedactions
      : kind === 'outside_scope' || kind === 'unavailable' ? [] : rawCitations;
    return { kind, description, ...(path === undefined ? {} : { path }), citations: normalizedCitations };
  });
  return { findings, limitations };
}

export function validateStructuredFindings(
  raw: unknown,
  observedLines: readonly ObservedLine[],
  unavailablePaths: ReadonlyMap<string, 'outside_scope' | 'unavailable'> = new Map(),
): { success: true; value: FinishAnalysisValue } | { success: false; issues: StructuredValidationIssue[] } {
  const parsed = FinishAnalysisInput.safeParse(normalizeCompletion(raw, unavailablePaths, observedLines));
  if (!parsed.success) {
    return { success: false, issues: parsed.error.issues.map(issue => ({ code: `INVALID_CONTRACT_${issue.code.toUpperCase()}`, path: issue.path.join('.'), message: issue.message })) };
  }
  const issues: StructuredValidationIssue[] = [];
  const cite = (citation: FindingCitationValue, path: string) => {
    const text = citationText(citation, observedLines);
    if (text === null) issues.push({ code: 'UNOBSERVED_RANGE', path, message: 'citation is not fully covered by lines observed in this attempt' });
    return text;
  };
  const groundedFindings: FinishAnalysisValue['findings'] = [];
  const redactedCitations = new Map<string, FindingCitationValue>();
  for (const [findingIndex, finding] of parsed.data.findings.entries()) {
    const prefix = `findings.${findingIndex}`;
    const visibleCitations: FindingCitationValue[] = [];
    for (const [citationIndex, citation] of finding.citations.entries()) {
      const text = cite(citation, `${prefix}.citations.${citationIndex}`);
      if (text === null) continue;
      let segmentStart: number | null = null;
      for (let line = citation.startLine; line <= citation.endLine + 1; line++) {
        const observed = line <= citation.endLine ? observedLines.find(item => item.path === citation.path && item.line === line)?.text : '[REDACTED]';
        if (observed === '[REDACTED]') {
          if (line <= citation.endLine) redactedCitations.set(`${citation.path}\0${line}`, { path: citation.path, startLine: line, endLine: line });
          if (segmentStart !== null) visibleCitations.push({ path: citation.path, startLine: segmentStart, endLine: line - 1 });
          segmentStart = null;
        } else if (segmentStart === null) segmentStart = line;
      }
    }
    if (!visibleCitations.length) continue;
    issues.push(...validateStatusBranches(finding.statement, visibleCitations, observedLines)
      .map(issue => ({ ...issue, path: `${prefix}.statement` })));
    const texts = visibleCitations.map(citation => citationText(citation, observedLines)!);
    const excerpt = texts.every((text): text is string => text !== null) ? texts.join('\n') : '';
    const exactValues = deriveExactValues(visibleCitations, observedLines);
    const basis = finding.basis === 'inference' || finding.basis === 'inferred' ? 'inference' : 'direct_observation';
    groundedFindings.push({ ...finding, citations: visibleCitations, basis, excerpt, exactValues });
  }
  const groundedLimitations: FinishAnalysisValue['limitations'] = [...parsed.data.limitations];
  if (redactedCitations.size) groundedLimitations.push({
    kind: 'redacted',
    description: 'Some cited source lines were filtered and could not support published findings.',
    citations: [...redactedCitations.values()],
  });
  if (!groundedFindings.length) issues.push({ code: 'NO_PUBLISHABLE_FINDINGS', path: 'findings', message: 'all proposed findings were unsupported or redacted' });
  for (const [index, limitation] of groundedLimitations.entries()) {
    const prefix = `limitations.${index}`;
    const texts = limitation.citations.map((citation, citationIndex) => cite(citation, `${prefix}.citations.${citationIndex}`));
    if (limitation.kind === 'redacted' && (!texts.length || !texts.some(text => text?.split('\n').some(line => line === '[REDACTED]')))) {
      issues.push({ code: 'REDACTION_NOT_OBSERVED', path: prefix, message: 'a redacted limitation requires an observed redacted line' });
    }
    if (limitation.kind === 'outside_scope' || limitation.kind === 'unavailable') {
      if (!limitation.path || unavailablePaths.get(limitation.path) !== limitation.kind) {
        issues.push({ code: 'UNAVAILABLE_PATH_NOT_OBSERVED', path: `${prefix}.path`, message: 'path and limitation kind must match a denied read in this attempt' });
      }
      if (/\b(?:exists?|does not exist|missing|absent|present)\b/i.test(limitation.description)) {
        issues.push({ code: 'UNAVAILABLE_PATH_ASSERTION', path: `${prefix}.description`, message: 'an unavailable path cannot establish existence or absence' });
      }
    }
  }
  return issues.length ? { success: false, issues } : { success: true, value: { schemaVersion: 2, findings: groundedFindings, limitations: groundedLimitations } };
}
