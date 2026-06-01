---
id: REV-012
title: Adaptive form UX review
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: user-directed
depends_on: [TEC-FE-006, TEC-FE-007, TEC-FE-008, TEC-FE-016]
---

# Adaptive Form UX Review

## Goal

Make CloudGrid setup, create, settings, and optimization flows clear for users
with limited product or technical knowledge by minimizing free-form entry,
providing valid defaults, adapting fields to current selections, and rendering
validation that explains how to fix the problem.

## Findings

- Existing AI Eval specs already require several good patterns: enum-backed
  evaluation family controls, schema editor visibility by value type, trace
  intake preview flows, and runtime mode selectors.
- The behavior was too scattered and did not apply consistently to dashboards,
  alert rules, provider settings, adapter settings, and future settings pages.
- Some specs allowed custom/free-form branches without clearly requiring
  progressive disclosure and field-specific help.
- The implementation plan needed an explicit frontend UX ticket so agents do
  not decide form dependency behavior locally.

## Decision

All product forms follow the adaptive input model now defined by PEX-017 through
PEX-020:

- valid defaults whenever a safe default exists;
- constrained controls for constrained domains;
- dependency-aware field and tab visibility;
- hidden fields never block submission;
- invalid dependent values are cleared or recomputed when controlling selections
  change;
- validation copy explains the problem, accepted values, and the next action.

AI Eval forms add concrete dependency examples for dataset type/schema,
evaluation family/metrics, target kind/model profile, optimizer kind/editable
parts, and runtime mode/adapter readiness.

## Implementation Impact

The implementation plan extends `plans/standards-first-interop-migration` with
`TICKET-306`, which owns frontend adaptive form behavior across product create
and settings flows.

## Verification

- Form tests must assert default drafts.
- Form tests must assert constrained controls for enum/read-model fields.
- Form tests must assert dependent fields hide/show and reset invalid values.
- Validation tests must assert summary focus/link behavior and field-level copy.
