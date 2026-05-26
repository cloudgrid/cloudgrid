# AI Eval v2 Pre-Spec Hardening Review

Date: 2026-05-24

Status: concept review, not approved implementation spec

## Verdict

The product direction is coherent enough to move into spec rewriting, but only
after the hardening items below are carried into the authoritative specs. The
main risk is not product complexity anymore. The main risk is underspecified
contracts that would make evaluation evidence hard to reproduce or compare later.

## Must Fix Before Spec Approval

1. Dataset versioning must be first-class.

   Target snapshots are already immutable, but dataset content and settings also
   affect every metric. Specs must define dataset versions, item revisions,
   dataset digests, and exact run references.

2. External adapter protocol must be exact.

   The concept correctly chooses sync plus async polling and postpones webhooks.
   Specs still need authentication/signing, idempotency keys, status vocabulary,
   retryable versus terminal errors, timeout/cancellation behavior, payload
   limits, conformance fixtures, and how adapter failures become metric
   problems.

3. Target snapshot canonicalization must be deterministic.

   Specs must define normalized JSON/canonical encoding, which metadata affects
   behavior, how model/provider config is normalized, how external immutable refs
   are verified, and what degraded reproducibility means when full content cannot
   be stored.

4. Metric payloads and problems must be typed.

   The metric envelope is good, but core metrics cannot rely on arbitrary JSON.
   Each metric capability needs a typed result payload, unit/direction rules,
   aggregation rules, comparison behavior, and a shared problem taxonomy.

5. UX must keep the advanced model hidden by default.

   Users should see dataset, evaluation, run, comparison, and optimize flows.
   Snapshots, digests, target parts, metric capabilities, and retention roles
   should appear only as advanced/debug/audit details unless the user is
   configuring an enterprise adapter.

## Should Fix During Spec Rewrite

- Define focused evaluation family templates for classification, extraction, and
  freeform answer, including example JSON schemas and expected rows.
- Define trace import UX: dataset picker only shows datasets with extraction
  settings, then imports into `needs_expected` or `needs_review` when the
  expected value is not trusted.
- Define import/export mapping for JSONL/CSV and Hugging Face-style datasets.
  This should be a DX feature, not a separate row model.
- Define effective retention inspection: users should be able to see why a run
  or row has a certain retention role and when non-pinned details expire.
- Define default quick-shot selection per family as deterministic algorithms,
  not only prose.
- Define opt-in integration tests for external adapters so normal CI does not
  require customer services or credentials.

## Complexity Reductions To Preserve

- Do not reintroduce user-facing scorers, checks, gates, or experiments.
- Do not allow mixed row shapes inside one dataset.
- Do not expose raw retention TTLs in the primary UI.
- Do not build a JSON editor/builder for rows; raw JSON plus schema validation is
  the simpler and more reliable path.
- Do not make agent/workflow/skill optimization first-version functionality.
  The external adapter target gives enterprise coverage without rebuilding every
  private runtime inside CloudGrid.

## Readiness Rule

The concept is ready to become specs only when an implementation ticket can be
written without using words such as "decide", "figure out", "as appropriate",
"if needed", or "TBD" for dataset versions, target snapshots, external adapter
execution, metric results, retention, and frontend flows.
