# CloudGrid Skills

This folder contains focused skills for agents that set up, configure, operate,
maintain, extend, and develop CloudGrid.

Skills are grounded in `specs/`. They must not invent product behavior, routes,
subjects, environment variables, storage fields, retry rules, or error codes.
If the needed behavior is missing, update the relevant spec first.

## Available Skills

| Skill | Use it for |
| --- | --- |
| `cloudgrid-setup-configuration` | Local setup, release Compose, deployed mode, SSO, SMTP invitations, self-observability, runtime environment validation. |
| `cloudgrid-operations-maintenance` | Health/readiness, start/stop/reset, release artifacts, Docker/Helm, CI gates, troubleshooting, production-readiness review. |
| `cloudgrid-extension-development` | Spec-first feature work, contracts, BFF/bridge/service boundaries, adapters, public API client, tests, and verification. |
| `cloudgrid-observability-ui` | Traces, logs, metrics, dashboards, widgets, pins, live trace UI, frontend/BFF observability contract alignment. |
| `cloudgrid-surrealdb` | SurrealDB schema, query, readiness, storage adapter, and credential-handling work. |

## Authoring Rules

- Keep each `SKILL.md` concise and task-oriented.
- Put triggering context in the frontmatter `description`.
- Keep detailed reference material one level away from `SKILL.md` when it grows.
- Prefer checklists and validation loops for fragile workflows.
- Use exact repo commands, paths, and spec filenames.
- For docs-only skill changes, run formatting/text checks; for code or contract
  changes, run the verification command required by the touched surface.
