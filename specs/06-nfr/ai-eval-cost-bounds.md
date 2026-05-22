---
id: NFR-010
title: AI evaluation cost bounds
layer: nfr
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-024]
---

# AI Evaluation Cost Bounds

## Requirement

Continuous production measurement, offline scoring, backfill, CI gates, and
optimization must have explicit cost, token, concurrency, rate-limit,
backpressure, retry, and timeout bounds before calling harness or a model-backed
scorer.

## Defaults

- Production measurement is disabled until configured.
- One run executes at most 10 concurrent harness/model/scorer requests by
  default unless a lower project or run policy is configured.
- A project-level daily evaluation budget stops additional harness calls with `ERR-AIE-004` when the configured budget is exhausted.
- Project AI settings may lower these defaults. They must not raise global
  hard caps unless a later scaling/commercial spec explicitly changes the cap.
- Deterministic local scorers consume concurrency but not provider budget.
- Budget checks occur before every harness `/v1/run`, `/v1/score`, and
  `/v1/optimize` call.
- Token budget checks occur before every item execution and scorer execution
  when the required evidence can be measured before scheduling. Oversized items
  are marked `needs_review` or `quarantined` according to policy rather than
  being counted as model-quality failures.
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
