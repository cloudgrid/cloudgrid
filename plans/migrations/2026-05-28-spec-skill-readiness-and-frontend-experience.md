---
id: MIG-2026-05-28-spec-skill-readiness-and-frontend-experience
title: Spec skill readiness and frontend experience contract migration
status: approved-spec-migration
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
---

# Spec Skill Readiness And Frontend Experience Contract Migration

## Impact

This migration updates specification structure and planning inputs only. It does
not change runtime behavior, public GraphQL/HTTP/AsyncAPI contracts, database
schemas, or generated code.

Changes:

- Flow specs move from `specs/02-flows` to `specs/03-flows` to match the
  updated spec-architect artifact shape.
- `specs/05-frontend/product-experience-contract.md` becomes the concise
  implementation contract for enterprise frontend UX.
- Frontend spec frontmatter IDs are deduplicated and registered.
- Readiness reports are updated to the current spec-architect gate schema.
- IR-006 status is corrected to complete based on current AI Chat and provider
  settings implementation evidence.

## Compatibility

Source references in specs, plans, and agent instructions are updated from
`specs/02-flows` to `specs/03-flows`. Historical commits and completed plan
ticket names remain unchanged. No compatibility shim is needed because runtime
code does not load specs by path.

## Rollout

1. Merge this spec-only change.
2. Regenerate executable frontend UX implementation tickets from
   `plans/frontend-ux-migration-check/02-agent-remediation-plan.md`, using
   `specs/05-frontend/product-experience-contract.md` as the first frontend
   read scope after `specs/spec.md`.
3. Keep future spec updates aligned with `specs/.readiness-report.yaml` gate
   names and `plans/migrations/` entries for implemented-behavior changes.

## Data Migration

No product data migration is required. No SurrealDB, NATS, object storage,
browser storage, generated contract, or runtime state changes are part of this
spec migration.

## Rollback

Rollback is a source revert. If reverting after FEUX tickets are generated,
also update those ticket read scopes back to the previous flow path structure
or regenerate them from the restored spec tree.

## Verification

- `node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs`
- YAML parse of `specs/.readiness-report.yaml`, `specs/_registry.yaml`, and
  `specs/.implementation-readiness.yaml`
- `rg -n "specs/02-flows|02-flows/" specs plans AGENTS.md .agent/IMPLEMENTATION.md`
- Targeted AI Chat status evidence:
  - `bun test apps/frontend/test/ai-chat-route.test.tsx apps/frontend/test/ux-v2-projects.test.ts`
  - `bun test apps/backend/src/ai-chat-catalog.test.ts apps/backend/src/ai-chat-stream.test.ts`

## Owner

Spec owner: `sebastian.wessel@egg-ai.com`.

Implementation planning owner: future FEUX planning pass.
