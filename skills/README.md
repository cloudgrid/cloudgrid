# CloudGrid Skills

This folder contains skills that help AI agents use, configure, operate, and extend CloudGrid efficiently.

Skill files should be focused, task-oriented, and grounded in the specs. A skill must not introduce behavior that is absent from `specs/`.

Planned skill areas:

- Configure CloudGrid locally.
- Send OTLP test telemetry.
- Query telemetry through GraphQL.
- Implement or review observability UX for traces, logs, metrics, dashboards, and widgets: see `cloudgrid-observability-ui/`.
- Inspect NATS JetStream state.
- Troubleshoot SurrealDB storage issues: see `cloudgrid-surrealdb/`.
- Add a new telemetry read projection.
