import { hasErrorCode } from "../shared/errors.js";
import { ERROR_CODES } from '../constants/error-codes.js';
import { EXPLORER_SYSTEM_PROMPT, EXPLORER_EVIDENCE_REMINDER, EXPLORER_COMPLETION_REMINDER, EXPLORER_ARGUMENT_REPAIR, EXPLORER_STATUS_BRANCH_REPAIR } from '../prompts/explorer.js';
import { coverageTerms, coverageChecklist, uncitedObservedRanges, retainedFindings, enrichObservedOperations } from './exploration-coverage.js';
import { z } from 'zod';
import type { AnalyzeRepoRequest } from '../domain/task-contracts.js';
import type { GitSnapshotTools } from '../exploration/git-snapshot.js';
import { SearchService } from '../exploration/search-service.js';
import type { CapabilityService } from '../exploration/capability-service.js';
import type { ExplorerMessage, ExplorerProvider } from '../provider/explorer-provider.js';
import { FinishAnalysisInput, type ExplorationResultV2 } from '../domain/exploration-result.js';
import type { ObservedLine } from './citation-validation.js';
import { finalizeExplorationResult } from './exploration-result-finalizer.js';
import { renderExplorationResult } from './exploration-result-renderer.js';

const Read = z.object({ path: z.string().min(1).max(512), startLine: z.number().int().min(1).default(1), endLine: z.number().int().min(1).optional() }).strict();
const List = z.object({ cursor: z.string().max(512).default('').describe('Omit or use empty string on the first page. Only reuse nextCursor returned by list_files. This is NOT a filename or directory filter.'), limit: z.number().int().min(1).max(100).default(50) }).strict();
const Search = z.object({ pattern: z.string().min(1).max(256), maxMatches: z.number().int().min(1).max(20).default(10) }).strict();
const definitions = [
  { name: 'read_file', description: 'Read line-numbered filtered snapshot text. Use short ranges, at most 100 lines.', schema: Read },
  { name: 'list_files', description: 'List snapshot file paths with lexical cursor pagination.', schema: List },
  { name: 'search_code', description: 'Find case-sensitive literal text in the filtered snapshot.', schema: Search },
  { name: 'finish_analysis', description: 'Complete with atomic grounded findings and exact observed citations. The host derives published excerpts from those citations. This is the only successful completion path.', schema: FinishAnalysisInput },
].map(({ name, description, schema }) => ({ type: 'function', function: { name, description, parameters: z.toJSONSchema(schema) } }));

export class ExplorerBlocked extends Error {
  constructor(readonly requiredAction: unknown) { super(ERROR_CODES.MISSING_CAPABILITY); }
}

export async function runExplorer(request: AnalyzeRepoRequest, snapshot: GitSnapshotTools, capabilities: CapabilityService, provider: ExplorerProvider, signal: AbortSignal, reserve: (kind: 'turn' | 'tool') => void = () => {}) {
  const secrets = snapshot.secrets;
  const safe = (text: string) => secrets.filter(text).text;
  const checklist = coverageChecklist(request.question);
  const checklistText = checklist.length > 1 ? `\nRequired coverage checklist; do not finish until each item has a finding or bounded limitation:\n${checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '';
  const messages: ExplorerMessage[] = [
    { role: 'system', content: EXPLORER_SYSTEM_PROMPT },
    { role: 'user', content: safe(`Objective: ${request.objective}\nQuestion: ${request.question}${checklistText}\nSuggested focus paths: ${request.focusPaths.join(', ')}\nEnforced path scope: ${request.scope ? JSON.stringify(request.scope) : 'all otherwise eligible committed files'}`) },
  ];
  const search = new SearchService(snapshot, capabilities);
  const evidence: Array<{ path: string; startLine: number; endLine: number; sha256?: string }> = [];
  let toolCalls = 0;
  let turns = 0;
  let invalidCalls = 0;
  let evidenceRepair = false;
  // A missing tool call and an invalid structured call need different feedback.
  // Keep both bounded without letting the former consume the latter's repair.
  let completionPrompted = false;
  let groundingRepairUsed = false;
  let coverageRepairs = 0;
  let argumentRepairs = 0;
  const successfulReads = new Set<string>();
  const issuedCursors = new Set<string>(['']);
  const unavailableReadPaths = new Map<string, 'outside_scope' | 'unavailable'>();
  const observedLines: ObservedLine[] = [];
  let unavailablePaths = 0;
  let coverageResult: ExplorationResultV2 | undefined;
  const seen = new Map<string, number>();
  const diagnostic = (value: Record<string, string | number | boolean | null>) => {
    if (process.env['LOCAL_AGENT_TOOL_METRICS'] === '1') process.stderr.write(JSON.stringify({ event: 'explorer.tool', turn: turns + 1, ...value }) + '\n');
  };
  const started = performance.now();
  for (; turns < request.budget.maxModelTurns; turns++) {
    signal.throwIfAborted();
    if (Buffer.byteLength(JSON.stringify(messages)) > 24_000) throw new Error(ERROR_CODES.EXPLORER_CONTEXT_LIMIT);
    reserve('turn');
    const offeredTools = coverageResult ? definitions.filter(tool => tool.function.name === 'finish_analysis') : definitions;
    const raw = await provider.chat(messages, offeredTools, signal);
    signal.throwIfAborted();
    if (raw.tool_calls && raw.tool_calls.length > 4) throw new Error(ERROR_CODES.EXPLORER_INVALID_RESPONSE);
    const content = safe(raw.content).slice(0, 6000);
    const calls = raw.tool_calls ?? [];
    if (!calls.length) {
      if (!evidence.length && toolCalls > 0 && !evidenceRepair) {
        evidenceRepair = true;
        messages.push({ role: 'user', content: EXPLORER_EVIDENCE_REMINDER });
        continue;
      }
      if (!evidence.length) throw new Error(unavailablePaths ? 'EXPLORER_SNAPSHOT_PATH_UNAVAILABLE' : 'EXPLORER_NO_EVIDENCE');
      if (completionPrompted) {
        if (coverageResult) return coverageResult;
        throw new Error(ERROR_CODES.EXPLORER_STRUCTURED_COMPLETION_REQUIRED);
      }
      completionPrompted = true;
      messages.push({ role: 'assistant', content: '' }, { role: 'user', content: EXPLORER_COMPLETION_REMINDER });
      continue;
    }
    const finishCalls = calls.filter(call => call.function.name === 'finish_analysis');
    if (finishCalls.length) {
      if (calls.length !== 1 || finishCalls.length !== 1) throw new Error(ERROR_CODES.EXPLORER_INVALID_COMPLETION);
      if (toolCalls + 1 > request.budget.maxToolCalls) throw new Error(ERROR_CODES.EXPLORER_TOOL_LIMIT);
      reserve('tool');
      toolCalls++;
      const finalized = finalizeExplorationResult(finishCalls[0]!.function.arguments, {
        observedLines,
        unavailablePaths: unavailableReadPaths,
        secrets,
        evidence,
        snapshot: snapshot.metadata,
        provider: 'ollama-explorer',
        model: provider.modelName ?? 'qwen3:8b',
        metrics: { modelTurns: turns + 1, toolCalls, wallMs: Math.round(performance.now() - started) },
      });
      if (finalized.success) {
        const combinedModel = coverageResult ? (() => {
          const findings = [...coverageResult.findings];
          const fingerprints = new Set(findings.map(finding => JSON.stringify({ statement: finding.statement, citations: finding.citations })));
          const ids = new Set(findings.map(finding => finding.id));
          for (const finding of finalized.result.findings) {
            const fingerprint = JSON.stringify({ statement: finding.statement, citations: finding.citations });
            if (fingerprints.has(fingerprint) || findings.length >= 24) continue;
            let id = finding.id;
            for (let suffix = 2; ids.has(id); suffix++) id = `${finding.id.slice(0, 60)}-${suffix}`;
            findings.push({ ...finding, id });
            fingerprints.add(fingerprint); ids.add(id);
          }
          const limitations = [...new Map([...coverageResult.limitations, ...finalized.result.limitations].map(limitation => [JSON.stringify(limitation), limitation])).values()].slice(0, 24);
          return { ...finalized.result, findings, limitations, summary: renderExplorationResult({ schemaVersion: 2, findings, limitations }) };
        })() : finalized.result;
        const combined = enrichObservedOperations(combinedModel, observedLines, request.question);
        const multiTopicQuestion = /[,;]|\bversus\b/i.test(request.question);
        const completionText = combined.findings.map(finding => finding.statement).join(' ').toLowerCase();
        const missingTerms = coverageTerms(checklist.join(' ')).filter(term => !completionText.includes(term));
        const cited = (line: ObservedLine) => combined.findings.some(finding => finding.citations.some(citation =>
          citation.path === line.path && citation.startLine <= line.line && citation.endLine >= line.line));
        const uncitedStatusBranches = /status codes?/i.test(request.question)
          ? observedLines.filter(line => /['"][A-Z][A-Z0-9_]{2,}['"]/.test(line.text) && !cited(line)) : [];
        const needsCoverageRepair = combined.findings.length === 1 || coverageRepairs > 0 && missingTerms.length >= 1 || uncitedStatusBranches.length > 0;
        if (coverageRepairs < 6 && multiTopicQuestion && unavailableReadPaths.size === 0 && needsCoverageRepair) {
          coverageRepairs++;
          coverageResult = combined;
          groundingRepairUsed = false;
          completionPrompted = false;
          diagnostic({ tool: 'finish_analysis', outcome: 'INCOMPLETE_COVERAGE', issues: 1, issueCodes: 'MULTI_TOPIC_SINGLE_FINDING', issuePaths: 'findings' });
          const focus = uncitedStatusBranches.length ? ['visible status/error branch'] : missingTerms.slice(0, 2);
          const gaps = focus.length ? ` Focus only on these still-missing topics: ${safe(focus.join(', '))}.` : '';
          const uncited = uncitedStatusBranches.length
            ? uncitedStatusBranches.map(line => `${line.path}:${line.line}-${line.line}`)
            : uncitedObservedRanges(observedLines, combined);
          const rangeHint = uncited.length ? ` Relevant facts may be in these previously observed but uncited ranges: ${safe(uncited.join(', '))}.` : '';
          const retained = safe(JSON.stringify(retainedFindings(combined)));
          messages.push({ role: 'assistant', content: '' }, { role: 'user', content: `The host retained these grounded findings: ${retained}. Call finish_analysis now with exactly one new brief direct_observation finding and limitations: [].${gaps}${rangeHint} Explicitly state the missing visible operation and outcome; cite only the smallest observed range needed. Do not reproduce retained findings. Do not cite a call site for behavior defined elsewhere. Do not call read_file, list_files, or search_code; all evidence is already available. Use only advertised fields.` });
          continue;
        }
        return combined;
      }
      const issueCodes = [...new Set(finalized.issues.map(issue => issue.code))]
        .filter(code => /^[A-Z_]{1,64}$/.test(code)).sort().join(',').slice(0, 512);
      const issuePaths = [...new Set(finalized.issues.map(issue => issue.path))]
        .filter(path => /^[A-Za-z0-9_.]{0,256}$/.test(path)).sort().join(',').slice(0, 512);
      diagnostic({ tool: 'finish_analysis', outcome: 'INVALID_GROUNDING', issues: finalized.issues.length, issueCodes, issuePaths });
      if (groundingRepairUsed) {
        if (coverageResult) return coverageResult;
        throw new Error(ERROR_CODES.EXPLORER_INVALID_COMPLETION);
      }
      groundingRepairUsed = true;
      if (finalized.issues.some(issue => issue.code === 'STATUS_BRANCH_CONTEXT_REQUIRED')) messages.push({ role: 'user', content: EXPLORER_STATUS_BRANCH_REPAIR });
      const feedback = finalized.issues.slice(0, 20).map(issue => ({ code: issue.code, path: issue.path }));
      messages.push({ role: 'assistant', content: '' }, { role: 'user', content: `The structured completion was rejected atomically. No result was published. Correct it once using only observed evidence. Issues: ${JSON.stringify(feedback)}` });
      continue;
    }
    // Validate entire batch before putting model arguments back into a request.
    let invalidBatch = false;
    const validated = calls.flatMap(call => {
      const def = call.function.name === 'read_file' ? Read : call.function.name === 'list_files' ? List : call.function.name === 'search_code' ? Search : null;
      if (!def) throw new Error(ERROR_CODES.EXPLORER_TOOL_DENIED);
      const checked = def.safeParse(call.function.arguments);
      if (!checked.success) {
        diagnostic({ tool: call.function.name, outcome: 'INVALID_ARGUMENTS', issues: checked.error.issues.length });
        invalidBatch = true;
        return [];
      }
      const args = checked.data;
      for (const value of Object.values(args)) if (typeof value === 'string' && secrets.filter(value).redacted) throw new Error(ERROR_CODES.SENSITIVE_TOOL_INPUT);
      return [{ function: { name: call.function.name, arguments: args } }];
    });
    if (invalidBatch) {
      if (++argumentRepairs > 2) throw new Error(ERROR_CODES.EXPLORER_INVALID_TOOL_ARGUMENTS);
      messages.push({ role: 'user', content: EXPLORER_ARGUMENT_REPAIR });
      continue;
    }
    if (toolCalls + validated.length > request.budget.maxToolCalls) throw new Error(ERROR_CODES.EXPLORER_TOOL_LIMIT);
    messages.push({ role: 'assistant', content, tool_calls: validated });
    for (const call of validated) {
      signal.throwIfAborted();
      reserve('tool');
      toolCalls++;
      let result: unknown;
      let found: typeof evidence = [];
      const key = JSON.stringify(call);
      const repeated = (seen.get(key) ?? 0) + 1; seen.set(key, repeated);
      let code = 'OK';
      let startLine: number | null = null, endLine: number | null = null;
      try {
        if (call.function.name === 'read_file' && successfulReads.has(key)) throw new Error(ERROR_CODES.READ_ALREADY_OBSERVED);
        if (call.function.name === 'read_file') {
          const args = Read.parse(call.function.arguments);
          const end = args.endLine ?? args.startLine + 39;
          startLine = args.startLine; endLine = end;
          if (end < args.startLine || end - args.startLine >= 100) throw new Error(ERROR_CODES.READ_RANGE_LIMIT);
          const file = await snapshot.readFile(request.repoId, args.path, args.startLine, end);
          if (file.endLine < file.startLine) {
            result = { error: 'READ_PAST_END', lastLine: file.endLine, message: 'The requested start is beyond EOF. Choose a range within lastLine or answer using earlier evidence.' };
            code = 'READ_PAST_END';
          } else {
            result = file;
            if (file.content.trim() && file.endLine >= file.startLine) found = [{ path: file.path, startLine: file.startLine, endLine: file.endLine, sha256: file.sha256 }];
          }
        } else if (call.function.name === 'list_files') {
          const args = List.parse(call.function.arguments);
          if (!issuedCursors.has(args.cursor)) throw new Error(ERROR_CODES.INVALID_LIST_CURSOR);
          const page = await snapshot.listFiles(request.repoId, args.cursor, args.limit, signal);
          if (page.nextCursor) issuedCursors.add(page.nextCursor);
          result = page;
        } else {
          const args = Search.parse(call.function.arguments);
          const value = await search.search({ schemaVersion: 1, repoId: request.repoId, ...args }, signal);
          if (value.status === 'blocked') throw new ExplorerBlocked(value.requiredAction);
          result = value;
          if ('matches' in value) found = value.matches.map(match => ({ path: match.path, startLine: match.line, endLine: match.line }));
        }
        signal.throwIfAborted();
        if (Buffer.byteLength(JSON.stringify(result)) > 12_000) throw new Error(ERROR_CODES.TOOL_OUTPUT_LIMIT);
        if (evidence.length + found.length > 100) throw new Error(ERROR_CODES.EXPLORER_EVIDENCE_LIMIT);
        evidence.push(...found);
        if (found.length) {
          const lines = call.function.name === 'read_file'
            ? (result as { path: string; content: string }).content.split('\n').flatMap(row => {
                const match = /^(\d+): ?([\s\S]*)$/.exec(row);
                return match ? [{ path: (result as { path: string }).path, line: Number(match[1]), text: match[2]! }] : [];
              })
            : (result as { matches: Array<{ path: string; line: number; preview: string }> }).matches.map(match => ({ path: match.path, line: match.line, text: match.preview }));
          const merged = new Map(observedLines.map(line => [`${line.path}\0${line.line}`, line]));
          for (const line of lines) merged.set(`${line.path}\0${line.line}`, line);
          const next = [...merged.values()];
          if (Buffer.byteLength(JSON.stringify(next)) > 24_000) throw new Error(ERROR_CODES.EXPLORER_CONTEXT_LIMIT);
          observedLines.splice(0, observedLines.length, ...next);
        }
        if (call.function.name === 'read_file' && found.length) successfulReads.add(key);
      } catch (error) {
        if (signal.aborted || error instanceof ExplorerBlocked || error instanceof Error && error.message === ERROR_CODES.EXPLORER_CONTEXT_LIMIT) throw error;
        if (++invalidCalls > 3) throw new Error(ERROR_CODES.EXPLORER_TOOL_FAILURES);
        code = hasErrorCode(error, [ERROR_CODES.SCOPE_PATH_DENIED, ERROR_CODES.INVALID_LIST_CURSOR, ERROR_CODES.READ_ALREADY_OBSERVED, ERROR_CODES.PATH_DENIED, ERROR_CODES.READ_RANGE_LIMIT, ERROR_CODES.TOOL_OUTPUT_LIMIT, ERROR_CODES.BINARY_FILE, ERROR_CODES.INVALID_UTF8]) ? error.message : 'TOOL_UNAVAILABLE';
        if (code === ERROR_CODES.PATH_DENIED || code === ERROR_CODES.SCOPE_PATH_DENIED) {
          unavailablePaths++;
          if (call.function.name === 'read_file') unavailableReadPaths.set(Read.parse(call.function.arguments).path, code === ERROR_CODES.SCOPE_PATH_DENIED ? 'outside_scope' : 'unavailable');
        }
        result = code === ERROR_CODES.PATH_DENIED ? { error: code, reason: 'SNAPSHOT_PATH_UNAVAILABLE', message: 'This path is not available in the eligible committed snapshot. It may be absent, excluded, or invalid. Working-tree existence was not checked. Use list_files to discover eligible paths.', baseCommit: snapshot.metadata.baseCommit } : { error: code };
        if (code === ERROR_CODES.READ_ALREADY_OBSERVED) result = { error: code, message: 'This exact read already succeeded in this immutable snapshot. Reuse its evidence above and finish the answer, or read a different range. Repeating cannot reveal redacted text.' };
        if (code === ERROR_CODES.READ_RANGE_LIMIT) result = { error: code, message: 'Use an inclusive range of at most 100 lines; omit endLine for 40 lines. Example: startLine 1, endLine 40.' };
        if (code === ERROR_CODES.INVALID_LIST_CURSOR) result = { error: code, message: 'Use cursor "" (empty string) for the first page. Only use a nextCursor returned by list_files afterward. Cursor is not a path filter.' };
        if (code === ERROR_CODES.SCOPE_PATH_DENIED) result = { error: code, reason: 'SCOPE_PATH_UNAVAILABLE', message: 'This path is outside the enforced task scope. Its existence or contents were not checked. Do not claim it is missing from the repository. Use list_files with empty cursor to find eligible alternatives.', baseCommit: snapshot.metadata.baseCommit };
      }
      diagnostic({ tool: call.function.name, outcome: code, repeated, startLine, endLine, evidenceCount: found.length, listedFiles: call.function.name === 'list_files' && code === 'OK' ? (result as { files: string[] }).files.length : null });
      messages.push({ role: 'tool', tool_name: call.function.name, content: JSON.stringify(result) });
    }
  }
  if (coverageResult) return coverageResult;
  throw new Error(ERROR_CODES.EXPLORER_TURN_LIMIT);
}
