---
title: "Deployment"
description: "Local and deployed runtime shapes, plus production-readiness status."
order: 6
accent: cyan
eyebrow: "Handbook - Deployment"
updated: 2026-05-18
---

CloudGrid supports local development today and has an explicit deployed-mode target for shared SSO environments. Use this page as the public entry point for deployment status and production-readiness work.

## Runtime Shapes

```mermaid
flowchart LR
  Local["Local mode\nBun + Go + Docker Compose"] --> Infra["NATS + SurrealDB"]
  Deployed["Deployed mode\nSSO + private services"] --> Private["Private NATS + SurrealDB"]
  Public["Public ingress"] --> BFF["BFF"]
  Public --> Collector["OTLP collector"]
  BFF --> Private
  Collector --> Private
```

## Start Here

| Goal | Read |
| --- | --- |
| Run locally | [Local quickstart](/handbook/getting-started/local-quickstart) |
| Understand runtime modes | [Runtime modes](/handbook/overview/runtime-modes) |
| Configure deployed services | [Deployed configuration](/handbook/configuration/deployed) |
| Check Kubernetes status | [Kubernetes and deployment status](/handbook/configuration/deployed/kubernetes) |
| Review production gaps | [Production readiness](/handbook/operations/production-readiness) |

The repository includes Helm chart and release workflow definitions. Signed service images, SBOM/provenance output, and release manifests are produced by the release workflow and remain production distribution concerns, not local runtime prerequisites.
