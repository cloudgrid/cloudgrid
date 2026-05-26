# Harness Skills

## Contents
- Skill Directory Shape
- Frontmatter
- Register And Allowlist
- Runtime Behavior
- Tool Interaction
- Skill Authoring Quality

Use this reference when creating skill folders consumed by `@purista/harness` agents.

## Skill Directory Shape
A harness skill is a directory with `SKILL.md` at its root:

```text
incident-responder/
├── SKILL.md
├── references/
│   └── incident-template.md
└── scripts/
    └── summarize-log.js
```

The harness mounts the entire directory at `/skills/<name>/` inside the active sandbox session.

## Frontmatter
`SKILL.md` frontmatter is intentionally small:

```md
---
name: incident-responder
description: Use for drafting incident summaries with impact, owner, timeline, and next action.
version: 1.0.0
---

# Incident Responder

Read `references/incident-template.md` before drafting postmortem-ready summaries.
```

Rules from implementation:
- `name` must match `/^[a-z][a-z0-9-]*$/`
- `name` must not include reserved words matched by `anthropic|claude|purista`
- `description` must be present and no longer than 1024 characters
- optional `version` is copied into resolved metadata
- harness config key must equal frontmatter `name`

## Register And Allowlist
Register skills globally, then allowlist them per agent:

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

defineHarness()
  .models(...)
  .skills({
    'incident-responder': {
      directory: join(here, 'skills/incident-responder')
    }
  })
  .agents(({ agent }) => ({
    incident_writer: agent({
      model: 'assistant',
      input: z.object({ incident: z.string() }),
      output: z.object({ summary: z.string() }),
      skills: ['incident-responder'],
      builtinTools: ['read', 'list', 'grep'],
      instructions: 'Use the mounted incident-responder skill when drafting.'
    })
  }))
```

Use absolute directories or resolve them from `import.meta.url`. Avoid brittle process-relative paths.

## Runtime Behavior
At run start, for each declared skill:
1. The harness recursively reads the skill directory from host disk.
2. It mounts all files into the sandbox at `/skills/<name>/`.
3. Mounting happens once per session per skill id.
4. Instructions get a compact skill index appended:

```text
Available skills (read /skills/<name>/SKILL.md for full instructions):
- incident-responder: Use for drafting incident summaries...
```

The full `SKILL.md` body is not injected. The model must use filesystem tools such as `read`, `list`, or `grep` to inspect `/skills/<name>/`.

## Tool Interaction
If an agent uses skills, keep enough read-only built-ins enabled for discovery. `builtinTools: false` means the model cannot read mounted skill files unless the instructions and custom tool path compensate.

Recommended skill-aware defaults:

```ts
builtinTools: ['read', 'list', 'grep']
```

Add `bash`, `write`, or `edit` only when the task genuinely needs command execution or file mutation, and pair them with permissions.

## Skill Authoring Quality
Use progressive disclosure:
- keep `SKILL.md` compact and navigational
- move provider-specific examples, long schemas, or workflows into `references/`
- include scripts only when deterministic execution is useful
- avoid extra README/changelog files inside the skill folder

When editing a reusable skill, run a frontmatter validator and verify every linked reference exists.
