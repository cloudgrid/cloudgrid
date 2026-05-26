# CloudGrid Skills

This folder contains focused skills for agents that set up, configure, operate,
maintain, extend, and develop CloudGrid.

Skills are grounded in checked-in product docs, source code, generated
contracts, and verified runtime behavior. They must not invent product
behavior, routes, subjects, environment variables, storage fields, retry rules,
or error codes. If the needed behavior is missing, report it as a product gap
instead of filling it in from the skill.

## Available Skills

| Skill | Use it for |
| --- | --- |
| `cloudgrid-setup-configuration` | Local setup, release Compose, deployed mode, SSO, SMTP invitations, self-observability, runtime environment validation. |
| `cloudgrid-operations-maintenance` | Health/readiness, start/stop/reset, release artifacts, Docker/Helm, CI gates, troubleshooting, production-readiness review. |
| `cloudgrid-extension-development` | Feature work, contracts, BFF/bridge/service boundaries, adapters, public API client, tests, and verification. |
| `cloudgrid-whitelabel-customization` | Licensed code-level whitelabel branding, customer brand modules, semantic theme tokens, product identity, and upgrade-safe customization boundaries. |
| `cloudgrid-observability-ui` | Traces, logs, metrics, dashboards, widgets, pins, live trace UI, frontend/BFF observability contract alignment. |
| `cloudgrid-surrealdb` | SurrealDB schema, query, readiness, storage adapter, and credential-handling work. |
| `cloudgrid-ai-chat-operations` | AI Chat provider setup, project-scoped usage, harness execution boundaries, unsupported adapters, approvals, artifacts, telemetry privacy, docs, and skill coordination. |
| `cloudgrid-trace-investigation` | AI Chat and UI trace investigation, waterfalls, critical path evidence, trace-to-log pivots, and trace renderer guidance. |
| `cloudgrid-logs-investigation` | AI Chat and UI log investigation, severity, correlation, log clusters, trace pivots, and log renderer guidance. |
| `cloudgrid-metrics-investigation` | AI Chat and UI metric investigation, series comparison, aggregations, exemplars, and metric renderer guidance. |
| `cloudgrid-ai-eval-investigation` | AI Eval v2 setup, datasets, row curation, dataset evaluations, metric results, comparisons, optimization evidence, target promotion, troubleshooting, and privacy-safe eval artifacts. |
| `cloudgrid-json-render-artifacts` | AI Chat JSON-render artifacts, Markdown sanitation, renderer catalog validation, and action approval cards. |
| `ai-harness` | PURISTA harness agents, workflows, tools, model aliases, provider adapters, state, sandbox, telemetry, and tests. |

## Authoring Rules

- Follow [agent skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
  concise `SKILL.md`, specific discovery metadata, progressive disclosure,
  concrete examples, and real usage evaluations.
- Keep each `SKILL.md` under 500 body lines and task-oriented.
- Put triggering context in the frontmatter `description`; write it as
  third-person discovery metadata and include `Use when`.
- Keep detailed reference material one level away from `SKILL.md` when it grows.
- Prefer checklists, validation loops, and machine-checkable intermediate
  outputs for fragile workflows.
- Use exact repo commands, paths, public docs, source files, and contract names.
- Keep at least three real usage eval prompts in `skills/evals/evals.json`.
- Run `bun run skills:check` before committing skill changes.
- For docs-only skill changes, run formatting/text checks; for code or contract
  changes, run the verification command required by the touched surface.
