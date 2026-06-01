---
id: IDX-001
title: AI-native OTLP observability platform spec index
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-31
provenance: inferred-draft
---

# AI-Native OTLP Observability Platform

This directory is the implementation specification for the MVP. The original single-document draft has been decomposed into stable, ID-addressable specs so implementation agents can work from explicit contracts instead of making local decisions.

## Entry Points

- [Vision](./00-vision.md)
- [Architecture overview](./00-architecture-overview.md)
- [Technology stack](./00-stack.md)
- [Engineering conventions](./00-conventions.md)
- [Design system](./00-design-system.md)
- [Glossary](./glossary.md)
- [Registry](./_registry.yaml)
- [Provenance](./_provenance.yaml)
- [Implementation-ready feature and improvement index](./implementation-ready.md)

## Domains

- [Ingestion](./01-domains/ingestion.md)
- [Observability data](./01-domains/observability-data.md)
- [Storage](./01-domains/storage.md)
- [Runtime](./01-domains/runtime.md)
- [Frontend](./01-domains/frontend.md)
- [AI evaluation](./01-domains/ai-eval.md)
- [AI Chat](./01-domains/ai-chat.md)
- [Metrics](./01-domains/metrics.md)

## Contracts

- [HTTP API OpenAPI contract](./03-contracts/api/http-api.openapi.yaml)
- [Public GraphQL schema](./03-contracts/graphql/public-schema.graphql)
- [Message bridge AsyncAPI contract](./03-contracts/messages/message-bridge.asyncapi.yaml)
- [AI Eval v2 contract rewrite](./03-contracts/ai-eval-v2-contract-rewrite.md)
- [Error taxonomy](./03-contracts/errors.yaml)
- Entity JSON Schemas in [03-contracts/entities](./03-contracts/entities)

## Technical Specs

- [Service architecture](./04-backend/backend-architecture.md)
- [Bridge ports](./04-backend/bridge-ports.md)
- [SurrealDB persistence](./04-backend/surrealdb-persistence.md)
- [SurrealDB tenancy and native modeling](./04-backend/surrealdb-tenancy-and-modeling.md)
- [Telemetry query semantics](./04-backend/telemetry-query-semantics.md)
- [OTLP mapping](./04-backend/otlp-mapping.md)
- [Telemetry signal roadmap](./04-backend/telemetry-signal-roadmap.md)
- [Metrics signal](./04-backend/metrics-signal.md)
- [Project data retention policy](./04-backend/data-retention-policy.md)
- [Project alerting](./04-backend/alerting.md)
- [OTLP gRPC compatibility](./04-backend/otlp-grpc-compatibility.md)
- [Project membership and roles](./04-backend/project-membership.md)
- [Log ingestion boundary](./04-backend/log-ingestion-boundary.md)
- [Runtime configuration](./04-backend/runtime-configuration.md)
- [Authentication and authorization model](./04-backend/authentication-authorization.md)
- [Control plane and project management](./04-backend/control-plane.md)
- [Organization invitations and SSO membership lifecycle](./04-backend/organization-invitations.md)
- [Invitation email delivery and project onboarding](./04-backend/invitation-email-delivery.md)
- [Contract generation source and outputs](./04-backend/contract-generation.md)
- [AI evaluation protocol interop](./04-backend/ai-eval-protocol-interop.md)
- [AI evaluation project settings](./04-backend/ai-eval-project-settings.md)
- [Project and company AI provider settings](./04-backend/ai-provider-settings.md)
- [AI evaluation runner](./04-backend/ai-eval-runner.md)
- [AI runtime structure](./04-backend/ai-runtime-structure.md)
- [AI Chat runtime](./04-backend/ai-chat.md)
- [AI Chat implementation contract](./04-backend/ai-chat-implementation-contract.md)
- [AI evaluation query semantics](./04-backend/ai-eval-query-semantics.md)
- [AI evaluation message contracts](./04-backend/ai-eval-message-contracts.md)
- [Enterprise product experience contract](./05-frontend/product-experience-contract.md) - concise source of truth for shell modes, onboarding, disabled states, action placement, route state, and feedback behavior.
- [Frontend application](./05-frontend/frontend-application.md)
- [AI evaluation views](./05-frontend/ai-eval-views.md)
- [AI evaluation UX concept](./05-frontend/ai-eval-ux-concept.md)
- [AI Chat views](./05-frontend/ai-chat-views.md)
- [Dashboard widgets](./05-frontend/dashboard-widgets.md)
- [Enterprise product UX concept](./05-frontend/product-ux-concept.md) - source of truth for UX v2 shell, navigation, settings, modal, and layout rules.
- [Traces and metrics UX concept](./05-frontend/traces-and-metrics-ux-concept.md) - source of truth for trace search, trace detail, metric workspace, visualization, and detail-inspector behavior.
- [Logs, metrics explorer, and dashboards UX concept](./05-frontend/logs-metrics-dashboards-ux-concept.md) - source of truth for log search, metric exploration, dashboard composition, and cross-view pivots.
- [Alerts UX concept](./05-frontend/alerts-ux-concept.md) - source of truth for alert rule list, create/settings pages, company alert adapter settings, notification adapter selection, silences, and dashboard alert relationships.
- [Dashboard implementation contract](./05-frontend/dashboard-implementation-contract.md) - agent-facing contract for dashboard gap closure, frontend module boundaries, reuse requirements, ticket scopes, and verification.
- [Code-level whitelabel customization](./05-frontend/whitelabel-customization.md) - source of truth for licensed build-time branding, theme token boundaries, and upgrade-safe customer customization.
- [Frontend views](./05-frontend/views.md)
- [Trace investigation UX](./05-frontend/trace-investigation-ux.md)
- [Frontend execution spec](./05-frontend/frontend-execution-spec.md)
- [UI enhancements and visualization foundation](./05-frontend/ui-enhancements-and-visualizations.md)
- [Live trace subscription flow](./03-flows/observability/live-trace-subscription.md)
- [AI projection ingest](./02-capabilities/ai-eval/ingest-ai-projections.md)
- [Online AI evaluation](./02-capabilities/ai-eval/evaluate-online.md)
- [Offline AI evaluation](./02-capabilities/ai-eval/evaluate-offline.md)
- [Classification and extraction evaluation](./02-capabilities/ai-eval/evaluate-classification-extraction.md)
- [Prompt optimization](./02-capabilities/ai-eval/optimize-prompts.md)
- [Classification and extraction prompt optimization](./02-capabilities/ai-eval/optimize-classification-extraction.md)
- [Skill document optimization](./02-capabilities/ai-eval/optimize-skills.md)
- [Trace annotation for datasets](./02-capabilities/ai-eval/annotate-traces.md)
- [Project AI settings](./02-capabilities/ai-eval/manage-project-ai-settings.md)
- [Project AI providers](./02-capabilities/ai-platform/manage-project-ai-providers.md)
- [Company AI Chat provider](./02-capabilities/ai-platform/manage-company-ai-chat-provider.md)
- [Project AI Chat](./02-capabilities/ai-chat/use-ai-chat.md)
- [AI provider settings resolution flow](./03-flows/ai-platform/provider-settings-resolution.md)
- [AI Chat run flow](./03-flows/ai-chat/chat-run.md)
- [AI Chat action approval flow](./03-flows/ai-chat/action-approval.md)
- [AI Chat conversation compaction flow](./03-flows/ai-chat/conversation-compaction.md)
- [Dataset curation and splits](./02-capabilities/ai-eval/curate-datasets.md)
- [Production AI quality tracking](./02-capabilities/ai-eval/track-production-quality.md)
- [Dataset candidate suggestions](./02-capabilities/ai-eval/suggest-dataset-candidates.md)
- [Metric ingest](./02-capabilities/metrics/ingest-otlp-metrics.md)
- [Metric query](./02-capabilities/metrics/query-metrics.md)
- [Dashboards](./02-capabilities/metrics/manage-dashboards.md)
- [CloudGrid self-observability](./04-backend/self-observability.md)
- [Offline dataset evaluation run flow](./03-flows/ai-eval/offline-experiment-run.md)
- [Online evaluation flow](./03-flows/ai-eval/online-evaluation.md)
- [Live evaluation run subscription flow](./03-flows/ai-eval/live-experiment-subscription.md)
- [Dataset curation and split governance flow](./03-flows/ai-eval/dataset-curation-and-splits.md)
- [Skill optimization run flow](./03-flows/ai-eval/skill-optimization-run.md)
- [Classification and extraction optimization run flow](./03-flows/ai-eval/classification-extraction-optimization-run.md)
- [Metric ingest flow](./03-flows/metrics/metric-ingest.md)
- [Dashboard query flow](./03-flows/metrics/dashboard-query.md)
- [Performance and scaling](./06-nfr/performance-and-scaling.md)
- [Service resilience and self-healing](./06-nfr/service-resilience-self-healing.md)
- [Integration test suite](./06-nfr/integration-test-suite.md)
- [Release, CI/CD, and distribution](./06-nfr/release-distribution.md)
- [AI evaluation content capture](./06-nfr/ai-eval-content-capture.md)
- [AI evaluation cost bounds](./06-nfr/ai-eval-cost-bounds.md)
- [Message bridge adapter boundary ADR](./07-adr/0010-message-bridge-adapter-boundary.md)

## Decisions And Quality Gates

- NFRs in [06-nfr](./06-nfr)
- ADRs in [07-adr](./07-adr)
- [Autonomous refinement review](./99-reviews/autonomous-refinement.md)
- [Consistency pass](./99-reviews/consistency-pass.md)
- [Resolved decisions](./99-reviews/resolved-decisions.md)
- [Trace UX competitive research](./99-reviews/trace-ux-competitive-research.md)
- [AI evaluation implementation scope](./99-reviews/ai-eval-implementation-scope.md)
- [AI evaluation product concept and market synthesis](./99-reviews/ai-eval-product-concept.md)
- [Metrics implementation scope](./99-reviews/metrics-implementation-scope.md)
- [Standards-first simplification review](./99-reviews/standards-first-simplification-review.md) - source of truth for minimizing custom integration requirements and reusing OTLP, W3C Trace Context, OTel semantic conventions, OpenInference, RFC 9457, and standard contract formats.
- [Adaptive form UX review](./99-reviews/adaptive-form-ux-review.md) - source of truth for defaults, constrained inputs, dependency-aware form sections, and self-service validation behavior.
- [Frontend UX v2 migration plan](./99-reviews/frontend-ux-v2-migration-plan.md) - superseded by `plans/frontend-ux-migration-check/` until the frontend readiness gate is approved.
- [AI provider settings and AI Chat scope](./99-reviews/ai-chat-provider-settings-scope.md) - product and architecture direction; implementation requires matching contracts and readiness gate updates.
- [Enterprise product spec readiness review](./99-reviews/enterprise-product-spec-readiness-review.md) - current product/spec audit, closed gaps, remaining evidence gaps, and frontend implementation planning inputs.
- [Classification and extraction optimization research](./99-reviews/classification-extraction-optimization-research.md) - research-informed method selection for deterministic classification/extraction evaluation and hybrid prompt optimization.

## Implementation Rule

When implementation finds missing behavior, it must update the relevant spec first. Do not invent GraphQL fields, NATS subjects, database fields, UI states, retry rules, IDs, package names, or route semantics outside this spec set.
