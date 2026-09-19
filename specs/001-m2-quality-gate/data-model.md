# Data Model: M2 Claim-Level Quality Gate

## Finding

| Field | Type | Rules |
|---|---|---|
| `id` | string | Attempt-local stable identifier; bounded and unique |
| `statement` | string | One atomic claim; filtered and length-bounded |
| `basis` | enum | `direct_observation` or `inference` |
| `citations` | Citation[] | At least one; each range observed in this attempt |
| `excerpt` | string | Required for direct observations; exact filtered text from cited ranges |
| `exactValues` | ExactValue[] | Optional exact identifiers, versions, or decoded JSON values |

### Validation rules

- A statement cannot mix direct observation and inference.
- Direct findings require a non-empty exact excerpt.
- Inferences remain visibly labelled in the rendered result.
- Redacted content cannot be reconstructed inside the statement or excerpt.

## Citation

| Field | Type | Rules |
|---|---|---|
| `path` | repo-relative path | Must equal an observed eligible snapshot path |
| `startLine` | positive integer | Inclusive and inside observed evidence |
| `endLine` | positive integer | Inclusive, not before `startLine`, with no evidence gaps |

## ExactValue

| Field | Type | Rules |
|---|---|---|
| `kind` | enum | `identifier`, `package`, `version`, `json_string`, or `command` |
| `value` | string | Must match observed filtered source or a JSON string decoded exactly once |
| `citation` | Citation | Must identify the source of the value |

## Limitation

| Field | Type | Rules |
|---|---|---|
| `kind` | enum | `redacted`, `outside_scope`, `unavailable`, or `not_observed` |
| `description` | string | Filtered, bounded, and non-speculative |
| `path` | optional repo-relative path | Reporting only; does not imply existence |
| `citations` | Citation[] | Required only when the limitation refers to observed redacted text |

## ExplorationResultV2

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | literal `2` | Versioned publication contract |
| `outcome` | literal `completed` | Terminal success only after validation |
| `verification` | literal `not_run` | M2 does not execute analyzed-repository checks |
| `findings` | Finding[] | Bounded; non-empty |
| `limitations` | Limitation[] | Bounded; may be empty |
| `evidence` | evidence metadata[] | Host-derived, not trusted model claims |
| `snapshot` | snapshot metadata | Existing immutable snapshot provenance |
| `validation` | validation summary | Grounding status; semantic review remains separate |
| `metrics` | bounded counters | Existing turn/tool/wall metrics |

## AcceptanceCaseRubric

| Field | Type | Purpose |
|---|---|---|
| `caseId` | string | Links rubric to the fixed acceptance case |
| `requestedFacts` | record[] | Atomic completeness prompts for the reviewer |
| `exactValues` | record[] | Deterministically checked source values |
| `forbiddenClaims` | record[] | Known unsupported or misleading assertions |
| `requiredLimitations` | enum[] | Expected handling for scope/redaction scenarios |

## CaseEvaluation

Each dimension has its own `pass`, `fail`, or `not_reviewed` status:

- runtime completion
- contract validity
- evidence and excerpt validity
- exact-value validity
- requested-fact coverage
- semantic correctness
- limitation handling
- repository preservation

The aggregate case passes only when every required dimension passes. `not_reviewed` is never treated as pass.

## GateRun

A gate run contains five case evaluations plus the frozen code revision, snapshot commit, model digest, inference settings, contract/prompt version, budgets, timestamps, and sanitized environment evidence. A qualifying pair contains two consecutive passing GateRuns with identical frozen fields.
