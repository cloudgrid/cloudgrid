---
title: "Concepts"
description: "These pages explain the mental model behind CloudGrid before you start configuring or operating it."
sidebar: "Concepts"
order: 3
accent: cyan
eyebrow: "Handbook - Concepts"
updated: 2026-05-18
---

These pages explain the mental model behind CloudGrid before you start configuring or operating it.

| Concept | Read |
| --- | --- |
| Companies, projects, users, and roles | [Companies, projects, and access](/handbook/concepts/companies-projects-access) |
| Traces, logs, metrics, and dashboards | [Telemetry signals](/handbook/concepts/telemetry-signals) and [Metrics and dashboards](/handbook/concepts/metrics-dashboards) |
| Realtime trace delivery | [Live traces](/handbook/concepts/live-traces) |
| Data lifecycle and alert management | [Retention and alerts](/handbook/concepts/retention-alerts) |

The important rule is simple: a selected project is the working boundary. CloudGrid never searches another project to satisfy a trace, log, metric, dashboard, alert, or AI-eval view.
