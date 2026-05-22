---
id: CAP-AIE-010
title: Suggest and prepare dataset candidates
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [CAP-AIE-002, CAP-AIE-005, CAP-AIE-007, NFR-009]
implements:
  api: [GQL-Query-datasetCandidates, GQL-Mutation-prepareDatasetCandidates, GQL-Mutation-commitDatasetCandidates, MSG-eval-dataset-candidates-prepare, MSG-eval-dataset-candidates-commit]
---

# Suggest And Prepare Dataset Candidates

## Business Intent

Turn production failures, eval failures, coverage gaps, and dataset health
issues into reviewable dataset improvements without automatically changing
ground truth.

## Behavior

- Dataset candidates are review records, not dataset items. They never affect an
  experiment manifest until a user explicitly commits them.
- Candidate sources include selected traces/spans, failed production
  measurements, failed offline item runs, repeated failure clusters, duplicate
  and leakage warnings, coverage gaps, oversized items, invalid shape issues,
  missing expected output, and manual user selection.
- Storage-read owns candidate search, clustering inputs, coverage-gap
  computation, and bounded evidence view models.
- Storage-write owns candidate persistence, commit, and dataset version changes.
- Candidate preparation may run a dataset transformation pipeline before
  persistence. The approved v1 transformation stage is realistic
  anonymization.
- Candidate commit requires `expectedDatasetVersion`, target dataset ID, split,
  review status, target shape, and explicit user confirmation. Commit creates a
  new dataset version or draft mutation and records source candidate IDs.
- Suggested expected output may be drafted only from captured content, existing
  expected values, human-provided content, or a clearly configured generation
  step. Generated expected output must be marked as suggested and unreviewed.
- Auto-commit is not allowed. Auto-promotion is not allowed.

## Realistic Anonymization

When enabled, the pipeline replaces sensitive values with safe fake values that
preserve useful semantics:

- person names become plausible fake names;
- emails become fake emails under reserved or configured safe domains;
- payment card numbers become test-only Luhn-valid numbers;
- phone numbers and addresses keep locale-shaped structure while becoming fake;
- company names, URLs, IPs, account IDs, order IDs, and usernames are replaced
  with safe realistic equivalents when policy covers them;
- repeated original values map to repeated fake values within the configured
  consistency scope.

The committed item records:

- `contentTreatment = realistic_anonymized`;
- anonymization policy ID and version;
- transformation timestamp;
- transformed field paths and entity categories;
- consistency scope.

It must not store original sensitive values in the candidate, dataset item,
logs, GraphQL responses, generated assets, or scorer evidence.

An anonymization policy is implementation-ready only when it defines:

- enabled entity categories: `person_name`, `email`, `phone`, `address`,
  `payment_card`, `company_name`, `url`, `ip_address`, `account_id`, `order_id`,
  `username`, `free_text_secret`, and `date_time`;
- generator strategy per category: realistic fake, reserved-domain fake,
  Luhn-valid test value, locale-shaped fake, stable hash-derived fake, or
  redact;
- consistency scope: `dataset` or `project`;
- locale preservation: enabled by default;
- temporal-distance preservation for date/time values: enabled by default;
- blocked categories that force candidate `reviewing` instead of `ready`;
- maximum transformed field count and maximum transformed bytes per candidate;
- validation step proving no original sensitive value remains in the candidate
  payload, metadata, warnings, provenance, logs, or generated assets.

Replacement values must be deterministic within the configured consistency
scope and policy version. The same original value maps to the same fake value
inside that scope, and different original values should not intentionally map to
the same fake value unless the policy uses redaction. Policy version changes
must not rewrite historical dataset versions.

If the pipeline cannot confidently anonymize required content, preparation
creates a `reviewing` candidate with a warning and no auto-commit path. It must
not silently store original sensitive values.

## Candidate States

- `suggested`: prepared by policy or user selection.
- `reviewing`: a user is editing expected output, split, metadata, or treatment.
- `ready`: candidate has required fields and can be committed.
- `committed`: candidate was committed into a dataset version.
- `dismissed`: user rejected it.
- `superseded`: replaced by a newer candidate or merged into a cluster.

## Acceptance Criteria

- Given a failed production measurement, a user can prepare a dataset candidate
  with source trace/span pointers and bounded evidence.
- Given realistic anonymization is enabled, sensitive values are replaced with
  safe fake values before commit and provenance is recorded.
- Given content capture is disabled, candidate preparation requires explicit
  user-provided input before commit if the dataset item needs content.
- Given a candidate cluster contains duplicates, the UI can commit one selected
  representative and dismiss or supersede the rest.
- Given a coverage gap exists for a route/tool/model segment, storage-read can
  return a bounded candidate suggestion without exposing raw content.
- Given a candidate is committed, storage-write creates a new dataset version
  and historical experiment manifests remain unchanged.
