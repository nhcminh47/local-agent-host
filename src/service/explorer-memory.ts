import type { ExplorationResultV2 } from '../domain/exploration-result.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import type { ObservedLine } from './citation-validation.js';

export type ExplorerWorkingMemory = {
  schemaVersion: 1;
  snapshotId: string;
  observedLines: ObservedLine[];
  facts: Array<{ statement: string; citations: Array<{ path: string; startLine: number; endLine: number }> }>;
  candidateFiles: string[];
  unavailablePaths: Array<{ path: string; reason: 'outside_scope' | 'unavailable' }>;
  openTopics: string[];
};

export function createExplorerMemory(snapshotId: string, openTopics: string[]): ExplorerWorkingMemory {
  return { schemaVersion: 1, snapshotId, observedLines: [], facts: [], candidateFiles: [], unavailablePaths: [], openTopics: openTopics.slice(0, 12).map(topic => topic.slice(0, 256)) };
}

export function assertExplorerMemory(memory: ExplorerWorkingMemory): void {
  if (memory.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(memory.snapshotId) || Buffer.byteLength(JSON.stringify(memory)) > 40_000) {
    throw new Error(ERROR_CODES.EXPLORER_CONTEXT_LIMIT);
  }
}

export function recordObservedLines(memory: ExplorerWorkingMemory, lines: readonly ObservedLine[]): void {
  assertExplorerMemory(memory);
  const merged = new Map(memory.observedLines.map(line => [`${line.path}\0${line.line}`, line]));
  for (const line of lines) merged.set(`${line.path}\0${line.line}`, line);
  const next = [...merged.values()];
  if (Buffer.byteLength(JSON.stringify(next)) > 24_000) throw new Error(ERROR_CODES.EXPLORER_CONTEXT_LIMIT);
  if (Buffer.byteLength(JSON.stringify({ ...memory, observedLines: next })) > 40_000) throw new Error(ERROR_CODES.EXPLORER_CONTEXT_LIMIT);
  memory.observedLines = next;
  for (const line of lines) if (memory.candidateFiles.length < 24 && !memory.candidateFiles.includes(line.path)) {
    if (Buffer.byteLength(JSON.stringify({ ...memory, candidateFiles: [...memory.candidateFiles, line.path] })) <= 40_000) memory.candidateFiles.push(line.path);
  }
}

/** Call only with a result accepted by the host finalizer against this attempt's observed lines. */
export function recordValidatedFindings(memory: ExplorerWorkingMemory, result: ExplorationResultV2): void {
  assertExplorerMemory(memory);
  for (const finding of result.findings) {
    if (memory.facts.length >= 24 || finding.statement.length > 512 || finding.citations.length > 8) continue;
    if (!finding.citations.every(citation => {
      if (citation.endLine < citation.startLine || citation.endLine - citation.startLine >= 100) return false;
      for (let lineNumber = citation.startLine; lineNumber <= citation.endLine; lineNumber++) {
        const line = memory.observedLines.find(item => item.path === citation.path && item.line === lineNumber);
        if (!line || line.text.includes('[REDACTED]')) return false;
      }
      return true;
    })) continue;
    const fact = { statement: finding.statement, citations: finding.citations.map(({ path, startLine, endLine }) => ({ path, startLine, endLine })) };
    if (!memory.facts.some(previous => JSON.stringify(previous) === JSON.stringify(fact))) {
      if (Buffer.byteLength(JSON.stringify({ ...memory, facts: [...memory.facts, fact] })) <= 40_000) memory.facts.push(fact);
    }
  }
}

export function recordUnavailablePath(memory: ExplorerWorkingMemory, path: string, reason: 'outside_scope' | 'unavailable'): void {
  assertExplorerMemory(memory);
  if (path.length <= 512 && memory.unavailablePaths.length < 24 && !memory.unavailablePaths.some(item => item.path === path)) {
    const next = [...memory.unavailablePaths, { path, reason }];
    if (Buffer.byteLength(JSON.stringify({ ...memory, unavailablePaths: next })) <= 40_000) memory.unavailablePaths = next;
  }
}
