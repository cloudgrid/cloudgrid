# AI Eval Dataset Model Brainstorm

Date: 2026-05-23

Status: brainstorming, not implementation-ready spec

## Direction

Datasets should be typed evaluation cases. A dataset defines the row contract
once, and every row follows it.

Dataset settings should include:

- `evaluationFamily`: `classification`, `extraction`, `freeform_answer`,
  `tool_use`, `agent_loop`, `workflow`, or `skill`.
- `inputType`: `text` or `json`.
- `expectedType`: `text` or `json`.
- `inputJsonSchema`: required when `inputType = json`, unless we explicitly
  allow any JSON.
- `expectedJsonSchema`: required when `expectedType = json`.
- examples for schema preview and validation.
- default split.
- intake/review policy.
- trace extraction settings.
- PII/anonymization policy.

Rows should not choose their own target shape in the normal UI. Mixed row
shapes make evaluation harder, while JSON Schema already supports optional
fields for controlled variation.

## Row Shape

Each row should store:

- `input`.
- `expected`.
- `reason`, optional and defaulting to `""`.
- `observedOutput`, optional value produced by the source trace/run/import.
- `curationStatus`: whether the row is ready, needs expected output, needs
  review, or is rejected.
- `curationNote`, optional explanation of why the row needs review or why the
  observed output differs from expected output.
- `split`, required.
- `reviewStatus`.
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- source pointers such as `sourceTraceId` and `sourceSpanId`.
- useful source labels such as service, operation, environment, or span name.
- anonymization provenance.
- optional user metadata JSON.

`reason` explains why the expected output is correct. It helps reviewers and
optional judge-style metric computation, but it must not be required.

`observedOutput` is the actual value produced by the source behavior when a row
comes from a trace, previous evaluation run, import, or failure review. It can
be a label/category, text value, or JSON value, matching the dataset's expected
output type. It is not ground truth.

A row is evaluation-eligible only when `expected` is present, validates against
the dataset schema, and `curationStatus` is ready/reviewed. Failure-derived rows
can be valuable edge cases, but they should remain in review until corrected
expected output is supplied.

The important distinction is:

- `observedOutput`: what the current or historical system produced.
- `expected`: what the system should produce.
- `reason`: why the expected value is correct.
- `curationNote`: why the row still needs review, or what was wrong with the
  observed value.

## Splits

Use a simple v1 split vocabulary:

- `training`: used for optimization, few-shot selection, calibration, and
  iterative improvement.
- `validation`: used to compare candidates during development.
- `test`: held back for final regression/confidence checks.

Every row has exactly one split. Random split assignment should not happen
implicitly. Dataset settings provide `defaultSplit`, and row creation uses that
default unless the user or import/extraction mapping overrides it.

Optimizers and prompt search must not read `test`.

## Manual Row UX

Manual row creation should ask only for:

- input;
- expected output;
- optional reason;
- optional observed output and curation note;
- optional split override.

For JSON fields, use a raw JSON editor/textarea. Validate JSON syntax first,
then validate against the dataset JSON Schema. Show validation errors by JSON
path.

Do not build a visual JSON Schema builder in v1. Copy/paste JSON Schema and row
JSON is simpler, more transparent, and easier to align with external tooling.

Manual rows should default to `reviewed` unless the dataset policy says new
manual entries require review.

Manual rows without corrected expected output are useful as candidate/review
items but should not be eligible for normal dataset evaluation.

## Trace-To-Dataset UX

Trace overview and trace detail should provide `Add to dataset` when AI Eval is
enabled.

The dataset picker should list only datasets that have trace extraction
settings. This avoids implying that arbitrary datasets can accept traces without
mapping.

Dataset extraction settings should define:

- service selector.
- span, operation, or function selector.
- optional attribute filters.
- source scope: selected span, root span, agent run, or bounded full-trace
  summary.
- mapping into dataset `input`, `expected`, `reason`, and metadata.
- validation and fallback behavior.

If extraction succeeds, schema validation passes, and policy allows direct
commit, CloudGrid can add the row immediately. Missing values, schema failures,
PII/anonymization uncertainty, or explicit review policy should create/open a
dataset candidate review flow instead.

Trace/import-derived rows should default to `unreviewed`, unless dataset policy
explicitly marks valid direct imports as reviewed.

Trace/import actions should make the observed value explicit:

- If the user says the observed value is correct, CloudGrid can copy it into
  `expected` when schema validation passes and policy allows it.
- If the user says the observed value is wrong or incomplete, CloudGrid stores
  it as `observedOutput`, keeps source pointers, and asks for corrected
  `expected` before the row becomes evaluation-eligible.

This prevents failed classifications, extractions, tool calls, or agent loops
from being accidentally stored as ground truth while still making them useful
for edge-case coverage and prompt/agent improvement.

## Intake And Review

Review should be dataset-level policy, not a hard global requirement.

Useful modes:

- `directCommit`: valid rows commit immediately.
- `candidateReview`: trace/import-derived rows become candidates first.
- `reviewOnPolicyIssue`: valid rows commit directly, but missing fields,
  schema errors, PII/anonymization uncertainty, or low-confidence extraction
  goes to candidate review.

Recommended default: `reviewOnPolicyIssue`.

## PII And Anonymization

PII and anonymization belong in dataset settings. Rows record what happened as
provenance.

Dataset settings should include:

- content treatment: `original`, `realistic_anonymized`, or `redacted`.
- PII categories to detect, anonymize, or remove.
- whether original trace content may be copied into dataset rows.
- whether anonymization failure blocks commit or sends the row to review.
- consistency scope, defaulting to `dataset`.
- policy version.

Rows should record treatment used, policy ID/version, transformed field paths,
entity categories, and transformation timestamp.

The system must not silently store sensitive original values when policy
requires anonymization or redaction.

## Import And Export

CloudGrid should keep a canonical schema-driven dataset format.

Supported formats remain:

- JSONL.
- JSON array.
- CSV.

Rows should include input, expected, reason, split, metadata, source pointers,
and provenance where appropriate.

Hugging Face compatibility is an interoperability target, not the internal
model. Later export can produce split files plus a dataset card:

- `train`/`validation`/`test`-style files mapped from CloudGrid splits.
- JSONL/CSV/Parquet-compatible files where practical.
- `README.md` dataset card with metadata, schema summary, usage notes, and
  responsible-use notes.

References:

- https://huggingface.co/docs/datasets/repository_structure
- https://huggingface.co/docs/hub/datasets-cards

## Open Questions

- Should `inputJsonSchema` be optional for `inputType = json`?
- Should `expectedJsonSchema` ever be optional for `expectedType = json`?
- Should trace extraction support multiple selectors per dataset in v1?
- Should extraction use only selected spans or bounded full-trace summaries?
- Should imported rows always default to `unreviewed`?
- Which metric computations should see `reason`?
- Should `observedOutput` be stored for all trace/import-derived rows, or only
  when the observed value differs from expected?
- Should rows without corrected `expected` live in the dataset table, a
  candidate queue, or both?
