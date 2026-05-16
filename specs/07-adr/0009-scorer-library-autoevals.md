---
id: ADR-0009
title: Autoevals for v1 scorer library
status: accepted
superseded_by: null
date: 2026-05-12
provenance: from-user
context: AI-eval needs RAG and LLM-judge scorer patterns without reimplementing every metric from scratch.
decision: Use the TypeScript `autoevals` package behind the harness adapter for v1 RAG and LLM-judge scorer implementations.
decision_rationale: Autoevals provides useful TypeScript scorer primitives and keeps model-provider calls inside harness-side execution.
consequences:
  positive: [Faster scorer coverage, no Python dependency]
  negative: [Scorer definition schema must version the wrapped library behavior]
affects: [CAP-AIE-002, CAP-AIE-003]
---

# ADR-0009: Autoevals For V1 Scorers

CloudGrid stores scorer definitions and results. The harness adapter executes built-in RAG and LLM-judge scorer implementations using `autoevals`.
