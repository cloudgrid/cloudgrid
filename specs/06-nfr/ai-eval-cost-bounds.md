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

Online scoring, offline scoring, and optimization must have explicit cost and concurrency bounds before calling harness.

## Defaults

- Online scoring is disabled until configured.
- LLM-judge online scoring samples at most 10 percent of matching runs unless a lower project limit is configured.
- One experiment run executes at most 4 dataset items concurrently by default.
- One optimization run executes at most 2 candidates concurrently by default.
- A project-level daily evaluation budget stops additional harness calls with `ERR-AIE-004` when the configured budget is exhausted.
- Project AI settings may lower these defaults. They must not raise global
  hard caps unless a later scaling/commercial spec explicitly changes the cap.
- Deterministic local scorers consume concurrency but not provider budget.
- Budget checks occur before every harness `/v1/run`, `/v1/score`, and
  `/v1/optimize` call.
- Skipped evaluations due to budget or sampling are recorded as bounded
  skip/summary records without prompt, completion, tool parameter, or retrieval
  document content.

## Verification

Default test suites use mock harness adapters and do not require model-provider credentials. Real provider integration tests must be opt-in through explicit environment variables and skipped when credentials are absent.
