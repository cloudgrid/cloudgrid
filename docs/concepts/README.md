# Concepts

These pages explain the mental model behind CloudGrid before you start configuring or operating it.

| Concept | Read |
| --- | --- |
| Companies, projects, users, and roles | [Companies, projects, and access](./companies-projects-access.md) |
| Traces, logs, metrics, and dashboards | [Telemetry signals](./telemetry-signals.md) and [Metrics and dashboards](./metrics-dashboards.md) |
| Realtime trace delivery | [Live traces](./live-traces.md) |
| Data lifecycle and alert management | [Retention and alerts](./retention-alerts.md) |

The important rule is simple: a selected project is the working boundary. CloudGrid never searches another project to satisfy a trace, log, metric, dashboard, alert, or AI-eval view.
