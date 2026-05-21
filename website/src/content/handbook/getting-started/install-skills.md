---
title: "Install AI Skills"
description: "Install the CloudGrid agent skills with the Vercel Labs skills CLI so AI coding assistants can use the right CloudGrid setup, operations, observability, and extension guidance."
sidebar: "Install AI skills"
order: 1
accent: brand
eyebrow: "Handbook - Getting started"
updated: 2026-05-21
---

CloudGrid ships focused agent skills for setup, operations, observability
investigation, AI Chat, JSON render artifacts, extension development, SurrealDB,
and the PURISTA AI harness. Install them before asking an AI coding assistant to
modify or operate CloudGrid.

The skills are ordinary `SKILL.md` directories under the CloudGrid repository
`skills/` folder. They are grounded in the specs and are meant to keep agents
from inventing routes, contracts, environment variables, storage fields, retry
rules, or error codes.

## Install From GitHub

Use the Vercel Labs `skills` CLI:

```sh
npx skills add cloudgrid/cloudgrid --all
```

This installs the CloudGrid skill catalog from the public repository. Omit
`--all` if you want the CLI to prompt for individual skills.

## Install From A Local Checkout

When you are working from a local CloudGrid clone, install the checked-in skills
directly:

```sh
cd cloudgrid
npx skills add ./skills --all
```

This is the best path when you are changing skills locally and want your agent
to use the current branch.

## Install One Skill

Use `--skill` when the assistant only needs one workflow:

```sh
npx skills add cloudgrid/cloudgrid --skill cloudgrid-trace-investigation
```

Common choices:

| Skill | Use it when |
| --- | --- |
| `cloudgrid-setup-configuration` | Starting CloudGrid, configuring local/deployed mode, SSO, SMTP, or self-observability. |
| `cloudgrid-operations-maintenance` | Health checks, start/stop/reset, release verification, troubleshooting, and production readiness. |
| `cloudgrid-extension-development` | Changing contracts, adapters, BFF/service boundaries, public clients, or tests. |
| `cloudgrid-observability-ui` | Working on traces, logs, metrics, dashboards, live trace UI, or telemetry view models. |
| `cloudgrid-ai-chat-operations` | AI Chat provider setup, project-scoped chat, approvals, artifacts, telemetry privacy, and skill coordination. |
| `cloudgrid-json-render-artifacts` | JSON render artifacts, renderer catalog validation, Markdown sanitation, and approval cards. |
| `ai-harness` | PURISTA harness agents, workflows, tools, model aliases, provider adapters, telemetry, and tests. |

The full list lives in the repository at `skills/README.md`.

## How Agents Use Them

After installation, compatible AI assistants can load matching skills when a
task mentions CloudGrid setup, operations, telemetry investigation, AI Chat, or
extension work.

The skills do not replace the specs. They point the assistant to the right
source files, hard boundaries, commands, and verification loops. If behavior is
missing from the specs, update the spec first instead of letting an assistant
guess.

For skill authoring and maintenance, follow `skills/README.md` and run:

```sh
bun run skills:check
```

## Next Steps

- Continue with [Release Compose](/handbook/getting-started/docker-compose-release) to evaluate CloudGrid from images.
- Continue with [Local quickstart](/handbook/getting-started/local-quickstart) to develop CloudGrid from source.
- Read [AI Chat](/handbook/guides/ai-chat) for how CloudGrid mounts skills inside the AI Chat harness runtime.
