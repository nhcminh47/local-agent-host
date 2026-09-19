import { z } from 'zod';

const RepoPath = z.string().min(1).max(512).refine(value =>
  !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value)
  && !value.includes('\\') && !value.split('/').some(part => !part || part === '.' || part === '..')
  && !/[\x00-\x1f\x7f:]/.test(value),
  'path must be a normalized repo-relative path',
);

export const FindingCitation = z.object({
  path: RepoPath,
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
}).strict().refine(value => value.endLine >= value.startLine, 'endLine must not precede startLine');

const ExactValueKind = z.enum(['identifier', 'package', 'version', 'json_string', 'command']);
const ExactValueKindInput = z.enum(['identifier', 'package', 'version', 'json_string', 'command', 'name', 'function', 'constant', 'dependency', 'string', 'literal', 'script'])
  .describe('Use package/dependency for package names, version for versions, command/script for decoded commands, json_string/string for other decoded JSON strings, and identifier/name/function/constant for code identifiers.');

export const ExactValueInput = z.object({
  kind: ExactValueKindInput,
  value: z.string().min(1).max(1_000).refine(value => !/[\r\n\0]/.test(value)),
  citation: FindingCitation,
}).strict();

export const ExactValue = z.object({
  kind: ExactValueKind,
  value: z.string().min(1).max(1_000).refine(value => !/[\r\n\0]/.test(value)),
  citation: FindingCitation,
}).strict();

const FindingInputFields = {
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  statement: z.string().min(1).max(1_500).refine(value => !/[\r\n\0]/.test(value)),
  citations: z.array(FindingCitation).min(1).max(8),
};

const GroundedFindingFields = {
  id: FindingInputFields.id,
  statement: FindingInputFields.statement,
  citations: FindingInputFields.citations,
  exactValues: z.array(ExactValue).max(32).default([]),
};

const FindingBasisInput = z.enum(['direct_observation', 'inference', 'observed', 'inferred', 'direct'])
  .describe('Use direct_observation/observed/direct for facts stated by cited lines; use inference/inferred for conclusions bounded by cited lines.');
const FindingBasis = z.enum(['direct_observation', 'inference']);

export const Finding = z.object({
  ...FindingInputFields,
  basis: FindingBasisInput,
}).strict();

export const GroundedFinding = z.object({
  ...GroundedFindingFields,
  basis: FindingBasis,
  excerpt: z.string().min(1).max(4_000),
}).strict();

export const Limitation = z.object({
  kind: z.enum(['redacted', 'outside_scope', 'unavailable', 'not_observed'])
    .describe('Use outside_scope/unavailable only after that exact path was denied. Use not_observed when code or runtime behavior was not inspected or executed without a denied read.'),
  description: z.string().min(1).max(1_000).refine(value => !/[\r\n\0]/.test(value)),
  path: RepoPath.optional().describe('Required only for outside_scope/unavailable and must equal the denied read path; omit for not_observed.'),
  citations: z.array(FindingCitation).max(8).default([]),
}).strict();

export const FinishAnalysisInput = z.object({
  findings: z.array(Finding).min(1).max(24),
  limitations: z.array(Limitation).max(24),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, finding] of value.findings.entries()) {
    if (ids.has(finding.id)) context.addIssue({ code: 'custom', path: ['findings', index, 'id'], message: 'finding ids must be unique' });
    ids.add(finding.id);
  }
});

export const FinishAnalysisResult = z.object({
  schemaVersion: z.literal(2),
  findings: z.array(GroundedFinding).min(1).max(24),
  limitations: z.array(Limitation).max(24),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, finding] of value.findings.entries()) {
    if (ids.has(finding.id)) context.addIssue({ code: 'custom', path: ['findings', index, 'id'], message: 'finding ids must be unique' });
    ids.add(finding.id);
  }
});

export type FindingCitationValue = z.infer<typeof FindingCitation>;
export type ExactValueValue = z.infer<typeof ExactValue>;
export type FindingInputValue = z.infer<typeof Finding>;
export type FindingValue = z.infer<typeof GroundedFinding>;
export type LimitationValue = z.infer<typeof Limitation>;
export type FinishAnalysisValue = z.infer<typeof FinishAnalysisResult>;

export type ExplorationResultV2 = {
  schemaVersion: 2;
  outcome: 'completed';
  verification: 'not_run';
  provider: string;
  model: string;
  promptContractVersion: string;
  resultContractVersion: 2;
  summary: string;
  findings: FindingValue[];
  limitations: LimitationValue[];
  evidence: Array<{ path: string; startLine: number; endLine: number; sha256?: string }>;
  snapshot: Readonly<{ baseCommit: string; snapshotId: string; scopeHash?: string; source: 'committed-tree'; excludesWorkingTree: true; eligibleFiles: number; excludedEntries: number }>;
  validation: {
    status: 'grounded';
    evidence: 'observed_attempt_ranges';
    excerpts: 'exact_filtered_text';
    exactValues: 'observed_or_json_decoded_once';
    semanticVerification: 'not_performed';
  };
  metrics: { modelTurns: number; toolCalls: number; wallMs: number };
};
