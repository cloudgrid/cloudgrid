---
id: CAP-AIE-012
title: Evaluate classification and extraction datasets
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: research-informed
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-003, REV-013]
implements:
  api: [GQL-Mutation-startEvaluationRun, MSG-eval-evaluation-run-start]
---

# Evaluate Classification And Extraction Datasets

## Business Intent

Make closed-label classification and structured extraction evaluations reliable,
explainable, deterministic by default, and useful with the least user setup
possible.

Users provide:

- dataset rows with AI input and expected AI result;
- a runnable target;
- only the label options or JSON Schema that define correctness.

CloudGrid resolves metrics, parsing, normalization, aggregation, failure
breakdowns, and trace-backed item evidence from those inputs.

## Classification Dataset Contract

Classification compares one predicted label, or an explicitly configured
multi-label set, against the expected label value.

V2 default is single-label classification. Multi-label classification is allowed
only when `expectedType = json`, the expected JSON Schema selects an array whose
items have an enum, and metric settings set
`options.classification.mode = "multi_label_set"`.

Label source resolution:

1. If `expectedType = text`, the expected label is the normalized expected text.
2. If `expectedType = json`, metric settings must resolve
   `options.classification.expectedLabelPath`.
3. When the expected JSON Schema contains exactly one required scalar enum field,
   storage-write may default `expectedLabelPath` to that field path.
4. When expected label path resolution is ambiguous, dataset health reports a
   blocking `metric_config_invalid` issue before run start.

Allowed label set resolution:

1. Prefer the selected JSON Schema enum at `expectedLabelPath`.
2. Else use `Dataset.settings.expectedValueOptions`.
3. Else derive a non-authoritative suggestion from ready row expected values and
   report a dataset health warning. The user must confirm the suggested options
   before optimization may start.

## Classification Metric Options

Classification metric settings are stored under
`Dataset.settings.defaultMetricSettings.options.classification` and
`EvaluationDefinition.metricSettings.options.classification`.

Fields:

| Field | Type | Default | Rule |
| --- | --- | --- | --- |
| `mode` | enum | `single_label` | `single_label` or `multi_label_set`. |
| `expectedLabelPath` | JSONPath-like string | family rule | Required for JSON expected values unless unambiguous. |
| `actualLabelPath` | JSONPath-like string | root for text, `$.label` for JSON when present | Required for JSON actual output when ambiguous. |
| `trimWhitespace` | boolean | true | Trim text before comparison. |
| `collapseWhitespace` | boolean | true | Collapse internal whitespace for text labels. |
| `caseFolding` | boolean | false | If true, compare labels case-insensitively after Unicode simple case folding. |
| `aliasMap` | object | `{}` | Keys are canonical label values. Values are arrays of accepted aliases. |
| `unknownLabelPolicy` | enum | `problem_and_mismatch` | `problem_and_mismatch` or `mismatch_only`. |
| `averaging` | enum | `macro` | Used for precision/recall/F1 aggregate payloads: `macro`, `micro`, or `weighted`. |
| `confidencePath` | JSONPath-like string | absent | Optional recorded confidence source. It is informational in v2 and not a gate input. |

Normalization order:

1. Select actual and expected label values.
2. Convert scalar JSON values to strings except booleans and numbers, which keep
   canonical JSON scalar representation.
3. Apply trimming, whitespace collapse, case folding, and alias mapping.
4. Validate the normalized actual label against the allowed label set.

Unknown actual labels create an item-run `invalid_actual_output` problem when
`unknownLabelPolicy = problem_and_mismatch`. They always count as mismatches in
accuracy and confusion-matrix denominators.

## Classification Metrics

Required item metrics:

- `classification.accuracy`: boolean item payload, true when normalized expected
  and actual labels match.
- `classification.predicted_label`: label payload with the normalized actual
  label when one exists.
- `classification.expected_label`: label payload with the normalized expected
  label.

Required aggregate metrics:

- `classification.accuracy`: matched item count divided by scored item count.
- `classification.per_label_support`: count of ready/scored expected labels.
- `classification.confusion_matrix`: cells keyed by normalized expected and
  actual label.
- `classification.precision_recall_f1`: per-label and aggregate precision,
  recall, F1, and support when at least two labels or configured positive labels
  make the calculation meaningful.

Items with execution failures remain item-run problems. They are included in
quality metric denominators only when metric settings explicitly configure
`countExecutionFailureAsMismatch = true`; default is false.

## Extraction Dataset Contract

Extraction compares structured actual JSON against expected JSON.

Required dataset settings:

- `evaluationFamily = extraction`;
- `expectedType = json`;
- `expectedJsonSchema` using JSON Schema 2020-12;
- ready rows with expected values that validate against the expected schema.

Actual output must parse as JSON. Text output that contains a complete JSON
object or array may be parsed only when the target declares
`metadata.outputMayContainJsonEnvelope = true`; otherwise text output is invalid
for extraction.

The dataset JSON Schema is ground truth. Evaluation and optimization must not
rewrite it. Prompt-facing schema hints or response-contract target parts are
candidate target changes, not dataset schema changes.

## Extraction Metric Options

Extraction metric settings are stored under
`Dataset.settings.defaultMetricSettings.options.extraction` and
`EvaluationDefinition.metricSettings.options.extraction`.

Fields:

| Field | Type | Default | Rule |
| --- | --- | --- | --- |
| `fieldPaths` | string array | all comparable leaf paths | Optional explicit field path allowlist. |
| `requiredOnly` | boolean | false | If true, compare only schema-required leaves and explicitly listed paths. |
| `extraFieldPolicy` | enum | `schema` | `schema`, `count_all`, or `ignore`. |
| `arrayModeByPath` | object | `{}` | Path to `ordered` or `set`. Default is `ordered`. |
| `stringComparisonByPath` | object | `{}` | Path to `exact`, `case_insensitive`, or `normalized_whitespace`. |
| `numericToleranceByPath` | object | `{}` | Path to absolute numeric tolerance. Default exact. |
| `nullPolicyByPath` | object | `{}` | Path to `null_matches_missing` or `null_is_value`. Default `null_is_value`. |
| `enumAliasMapByPath` | object | `{}` | Path to canonical enum alias map. |
| `dateFormatByPath` | object | `{}` | Path to `date`, `date_time`, or absent. Parsed dates compare as ISO strings when valid. |

Comparable leaf paths are derived from `expectedJsonSchema` and observed expected
values in the selected dataset version. Object nodes are not directly counted
unless their schema type is not `object`. Arrays are leaf values unless an
explicit future schema mode supports item-level extraction scoring.

## Extraction Metrics

Required item metrics:

- `extraction.valid_json_rate`: boolean item payload, true when actual output
  parses as JSON.
- `extraction.schema_validity`: boolean item payload, true when actual JSON
  validates against `expectedJsonSchema`.
- `extraction.exact_json_match`: boolean item payload, true when normalized
  actual and expected JSON are canonically equal.
- `extraction.field_match_rate`: numeric item payload:
  `matchedComparableFields / expectedComparableFields`.
- `extraction.missing_field_count`: count payload.
- `extraction.extra_field_count`: count payload.
- `extraction.type_mismatch_count`: count payload.

Required aggregate metrics:

- aggregate mean for boolean/rate metrics;
- sum and mean for missing, extra, and type-mismatch counts;
- `field_breakdown` payload grouped by field path with matched, missing, extra,
  and type mismatch counts;
- problem breakdown for invalid JSON, schema invalidity, and execution failures.

Field comparison rules:

- Missing expected field in actual output counts as missing and mismatch.
- Extra field counts according to `extraFieldPolicy`.
- Type mismatch counts when actual and expected JSON scalar/container types
  differ after null policy is applied.
- String comparison defaults to exact after whitespace normalization only when
  configured.
- Numeric comparison defaults to exact numeric equality.
- Arrays default to ordered canonical equality. Set mode is allowed only for
  arrays of scalar values.
- Objects recurse to comparable leaf paths.

## Run Behavior

- Runner computes item-level deterministic metrics after target execution and
  actual-output validation.
- Storage-read computes aggregate metrics, field/label breakdowns, comparison
  deltas, and GraphQL-ready read models.
- BFF and frontend must not recompute confusion matrices, precision/recall/F1,
  field match rates, or field breakdowns from item rows.
- Every item run stores trace refs and bounded previews as defined by `DOM-006`.
- Metric payloads use the typed payload shapes from `DOM-006`.

## Dataset Health

Storage-read dataset health must report:

- missing or ambiguous classification label paths;
- absent or unconfirmed classification label options;
- labels present in ready rows but missing from expected options;
- labels in expected options with zero ready-row support;
- extraction expected JSON Schema absence or invalidity;
- ready extraction rows whose expected JSON does not validate;
- small training/validation/test split warnings relevant to optimization;
- field paths with zero validation support.

## Example Evaluation Fixtures

Classification and extraction evaluation examples are maintained in the same
try-it packs used by prompt optimization:

- `test_data/ai_eval/classification`;
- `test_data/ai_eval/extraction`.

The dataset settings files use public GraphQL dataset settings shape, and the
JSONL rows use `curationStatus`, immutable split assignment, source refs,
reasons, and realistic anonymized content. These packs are the default fixture
source for local AI Eval integration scenarios and must remain valid whenever
dataset settings, import, metric, or optimization contracts change.

## Acceptance Criteria

- A classification run with text expected labels produces accuracy, support,
  confusion matrix, and precision/recall/F1 aggregates.
- A classification run with ambiguous JSON label paths fails preflight before
  target execution.
- Unknown classification labels are visible as item problems and confusion-matrix
  actual values.
- An extraction run with invalid actual JSON records `valid_json_rate = false`,
  `schema_validity = false`, and an `invalid_actual_output` problem.
- Extraction field breakdowns identify weak paths without the frontend reading
  all item results.
- Storage-read aggregation remains authoritative for label and field breakdowns.

## Verification

- Contract tests cover metric option field names under
  `defaultMetricSettings.options.classification` and
  `defaultMetricSettings.options.extraction`.
- Runner tests cover text-label classification, JSON-label classification,
  unknown labels, invalid extraction JSON, schema invalidity, field mismatch,
  missing fields, extra fields, type mismatches, and execution-failure denominator
  policy.
- Storage-read tests cover aggregate confusion matrix, per-label support,
  precision/recall/F1, field breakdowns, and cursor-paginated item reads.
- Frontend tests cover family-specific metric rendering, label/field breakdown
  display, disabled optimization with missing split/schema readiness, and
  trace-link preservation.
- Integration scenario tests parse the classification/extraction fixture packs
  and verify public settings shape, JSONL import shape, split coverage, primary
  metrics, and absence of legacy `reviewStatus` fields.
