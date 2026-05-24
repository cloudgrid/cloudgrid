# AI Eval v2 Concept

Date: 2026-05-24

Status: intermediate concept, not approved implementation spec

## Purpose

This folder turns the AI Eval brainstorm into a cleaner migration artifact
before changing the approved `specs/` tree.

Use it as the source for spec rewrite planning. Do not implement directly from
these notes until the relevant approved specs, GraphQL contracts, AsyncAPI
contracts, entity schemas, and tests are updated.

## Documents

- [Concept Spec](./concept-spec.md): consolidated product and architecture
  direction.
- [Decisions](./decisions.md): product and architecture decisions for the
  initial spec rewrite.
- [Migration Checklist](./migration-checklist.md): concrete work needed to
  migrate current AI Eval specs/contracts.
- [Pre-Spec Hardening Review](./pre-spec-hardening-review.md): remaining issues
  to close before the concept becomes approved specs.

## Source Brainstorm

The raw brainstorming remains in:

- [brainstorm/ai-eval](../../brainstorm/ai-eval/README.md)

## Core Direction

Rewrite the AI Eval model from:

```text
DatasetItem targetShape + Scorer + Experiment
```

to:

```text
Dataset evaluationFamily + dataset-level schemas
+ internal metric capabilities + dataset evaluations
+ immutable target snapshots + optimization comparisons
+ trace-backed item runs + external adapter targets
```
