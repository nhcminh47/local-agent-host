import type { ExplorationResultV2 } from '../domain/exploration-result.js';
import type { SecretFilter } from '../exploration/secret-filter.js';
import { validateStructuredFindings, type EvidenceRange, type ObservedLine, type StructuredValidationIssue } from './citation-validation.js';
import { renderExplorationResult } from './exploration-result-renderer.js';

export const EXPLORER_PROMPT_CONTRACT_VERSION = 'm2-structured-findings-v32';
export const EXPLORER_RESULT_CONTRACT_VERSION = 2 as const;

export type FinalizationContext = {
  observedLines: readonly ObservedLine[];
  unavailablePaths: ReadonlyMap<string, 'outside_scope' | 'unavailable'>;
  secrets: SecretFilter;
  evidence: ReadonlyArray<EvidenceRange & { sha256?: string }>;
  snapshot: ExplorationResultV2['snapshot'];
  provider: string;
  model: string;
  metrics: { modelTurns: number; toolCalls: number; wallMs: number };
};

export function finalizeExplorationResult(raw: unknown, context: FinalizationContext):
  | { success: true; result: ExplorationResultV2 }
  | { success: false; issues: StructuredValidationIssue[] } {
  try { context.secrets.assertSafeCompletion(raw); }
  catch { return { success: false, issues: [{ code: 'SENSITIVE_COMPLETION', path: '', message: 'structured completion contains filtered material' }] }; }
  const validation = validateStructuredFindings(raw, context.observedLines, context.unavailablePaths);
  if (!validation.success) return validation;
  let summary: string;
  try { summary = renderExplorationResult(validation.value); }
  catch { return { success: false, issues: [{ code: 'SUMMARY_LIMIT', path: '', message: 'rendered summary exceeds the publication limit' }] }; }
  return { success: true, result: {
    schemaVersion: 2,
    outcome: 'completed',
    verification: 'not_run',
    provider: context.provider,
    model: context.model,
    promptContractVersion: EXPLORER_PROMPT_CONTRACT_VERSION,
    resultContractVersion: EXPLORER_RESULT_CONTRACT_VERSION,
    summary,
    findings: validation.value.findings,
    limitations: validation.value.limitations,
    evidence: [...context.evidence],
    snapshot: context.snapshot,
    validation: {
      status: 'grounded',
      evidence: 'observed_attempt_ranges',
      excerpts: 'exact_filtered_text',
      exactValues: 'observed_or_json_decoded_once',
      semanticVerification: 'not_performed',
    },
    metrics: context.metrics,
  } };
}
