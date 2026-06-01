---
id: NFR-011
title: AI evaluation cost bounds
layer: nfr
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, TEC-BE-024]
---

# AI Evaluation Cost Bounds

## Requirement

Dataset evaluations, optimization, external adapter calls, and future
production measurement must have explicit cost, token, concurrency, rate-limit,
backpressure, retry, and timeout bounds before calling the harness, external
adapter, or model-backed metric.

## Defaults

- Production measurement is disabled until configured.
- One run executes at most 10 concurrent harness/model/metric/adapter requests by
  default unless a lower project or run policy is configured.
- A project-level daily evaluation budget stops additional harness calls with `ERR-AIE-004` when the configured budget is exhausted.
- Project AI settings may lower these defaults. They must not raise global
  hard caps unless a later scaling/commercial spec explicitly changes the cap.
- Deterministic local metrics consume concurrency but not provider budget.
- Budget checks occur before every harness, model-backed metric, optimizer, and
  external adapter call.
- Token budget checks occur before every item execution and metric execution
  when the required evidence can be measured before scheduling. Oversized items
  are marked `needs_review` or `quarantined` according to policy rather than
  being counted as model-quality failures.
- Skill optimization checks token and byte budgets before every optimizer
  reflection, merge/rank, slow-update, meta-memory, and validation call.
  Default optimized skill limits are 65536 UTF-8 bytes and 8000 estimated
  tokens. Oversized candidate skills are rejected before validation and recorded
  as bounded step problems.
- Classification and extraction prompt optimization checks token, byte, cost,
  concurrency, and response-size budgets before every training rollout, family
  diagnosis read, optimizer proposal call, custom optimizer adapter call,
  quick-shot run, validation run, and external adapter candidate execution.
  Oversized candidate prompt/example snapshots are rejected before quick-shot or
  validation and recorded as bounded step problems.
- Rejected-edit memory keeps at most 20 rejected step summaries or 64 KiB per
  optimization run, whichever is smaller. Slow-update and meta-memory sections
  are each capped at 8 KiB.
- Rejected prompt/example change summaries keep at most 20 rejected summaries or
  64 KiB per optimization run, whichever is smaller.
- Rate limits apply per project, provider profile, model alias, run, and
  harness adapter when configured.
- Backpressure behavior must be bounded and explicit: slow scheduling, pause the
  run, skip affected items, or fail the run. Silent unbounded queue growth is
  forbidden.
- Retry uses bounded exponential backoff with jitter. Default retry attempts are
  at most three for retryable harness, provider throttling, NATS, and
  storage-write errors.
- Skipped evaluations due to budget or sampling are recorded as bounded
  skip/summary records without prompt, completion, tool parameter, or retrieval
  document content.

## Verification

Default test suites use mock harness adapters and do not require model-provider credentials. Real provider integration tests must be opt-in through explicit environment variables and skipped when credentials are absent.
