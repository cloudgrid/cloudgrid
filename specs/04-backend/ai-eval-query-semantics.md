---
id: TEC-BE-015
title: AI evaluation query semantics
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-008]
---

# AI Evaluation Query Semantics

## Ownership

Storage-read owns AI-eval read semantics, including agent-run search, dataset
item filtering, dataset health, split leakage checks, scorer lookup,
experiment manifest resolution, experiment scoreboard aggregation, eval-result
search, transcript view-model derivation, production quality summaries, online
policy matching, and annotation queue facets.

## Required Pushdown

Storage-read adapters must push down supported filters, sorting, cursor predicates, counts, and bounded facets for:

- Agent runs by agent ID, agent name, status, time range, duration, token totals, cost estimate range, experiment run ID, and free text over safe indexed fields.
- Dataset items by dataset ID, version, split, review status, source trace/span
  presence, tags, metadata text, duplicate candidate status, synthetic flag, and
  schema validation status.
- Eval results by scorer ID, scorer version, target kind, target ID, pass/fail, score range, time range, and experiment run ID.
- Experiments and runs by dataset, split selector, scorer, solver, prompt
  version, skill snapshot, tool snapshot, provider profile, status, tag, and
  time range.
- Annotation queue by status, reason, assignee, target kind, and time range.
- Production quality summaries by agent, environment, route, service, tool,
  retrieval source, model, provider profile, prompt version, policy, scorer,
  and time bucket.
- Online policy matching by project ownership, policy selector, projection kind,
  source trace/span, agent identity, model/provider, tool name, retrieval source,
  service, route, environment, and safe indexed attributes.

## Allowed Adapter-Side Derivations

- Score histogram buckets when the database lacks native histogram functions.
- Dataset item by run cross-tab shape when the database cannot pivot cleanly.
- Transcript messages from already bounded source span events and OpenInference message attributes.
- Final scoreboard summary shape from pushed-down aggregate rows.
- Dataset health view models from pushed-down counts and bounded duplicate
  candidates.
- Production quality view models from pushed-down aggregate rows.
- Manifest resolution from stored dataset, scorer, settings, prompt, skill, and
  tool references.

All derivations remain inside storage-read. The BFF and frontend render returned view models only.

## Forbidden Derivations Outside Storage-Read

The BFF and frontend must not derive:

- dataset split counts or leakage state;
- production quality trend lines;
- online policy matches;
- experiment manifests;
- scoreboard deltas;
- prompt or tool regression summaries;
- scorer calibration summaries;
- token or cost totals from raw span rows.
