---
id: REV-011
title: Standards-first simplification review
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: user-directed
depends_on: [CNV-001, TEC-BE-004, TEC-BE-013, TEC-BE-014, ADR-0007]
---

# Standards-First Simplification Review

## Goal

Reduce custom CloudGrid integration requirements wherever standards already
provide portable behavior. CloudGrid should be easy to adopt with existing
production telemetry, tool runtimes, and enterprise deployment patterns.

## Decision

CloudGrid uses standards first and custom fields last:

- OTLP and W3C Trace Context for telemetry transport and correlation;
- OpenTelemetry semantic conventions for trace, log, metric, resource, HTTP,
  RPC, database, messaging, filesystem, exception, GenAI, and MCP semantics;
- OpenInference as an accepted AI telemetry source where frameworks already
  emit it;
- RFC 9457 Problem Details for public HTTP errors;
- OpenAPI, GraphQL SDL, AsyncAPI, and JSON Schema for interface contracts;
- Helm, Kubernetes, OCI images, SBOM/provenance, and conventional environment
  variables for operations.

CloudGrid-specific fields remain valid only where CloudGrid owns the signal or
where no standard exists: internal self-observability, message bridge contracts,
typed derived entities, authorization context, product configuration, and
private service orchestration.

## Audit Findings

### Kept

- OTLP HTTP/gRPC compatibility and project routing outside telemetry payloads.
- W3C `traceparent` and `tracestate` propagation through HTTP, gRPC, NATS, and
  adapter calls.
- AI projection normalization from OTel GenAI and OpenInference.
- GraphQL as the public read/control surface and AsyncAPI as the private message
  bridge contract.
- RFC 9457-compatible public error mapping.
- Internal `cloudgrid.*` metrics and attributes for CloudGrid-owned
  self-observability.

### Changed

- External skill optimization adapters no longer need required
  `cloudgrid.ai_eval.*` source span attributes.
- External adapter evidence is standard-first: OTel GenAI, OTel MCP,
  OpenInference, and ordinary production spans.
- HTTP adapter responses are control/status and terminal result carriers, not a
  second trace format.
- `cloudgrid.ai.semconv.flavor` is no longer a source-span attribute
  requirement. Source flavor is projection metadata only.

### Deferred

- First-class projection support for OpenInference `RERANKER`, `GUARDRAIL`,
  `EVALUATOR`, and `PROMPT`.
- Custom CloudGrid AI Eval span attributes for cases not covered by standards.
  These require a future spec with rationale and migration plan.
- Tool/workflow/agent-config optimization beyond skill package text edits.

## Implementation Impact

The implementation needs a migration that removes source telemetry mutation and
implements standards-first evidence extraction without changing public
GraphQL/AsyncAPI contracts.

The implementation plan is:

- `plans/standards-first-interop-migration/implementation-plan.md`

## Verification

- Spec check must pass.
- `bun run contracts:check` must pass.
- Collector tests must prove source span attributes are not mutated.
- Storage-read and runner tests must prove optimizer evidence is derived from
  standard spans and trace refs.
