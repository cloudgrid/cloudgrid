---
name: cloudgrid-json-render-artifacts
description: Use when creating, validating, reviewing, or rendering CloudGrid AI Chat json-render artifacts, Markdown assistant text, action approval cards, Mermaid diagrams, trace waterfalls, metric charts, log lists, tables, diffs, or JSON trees.
---

# CloudGrid JSON-Render Artifacts

Use this skill when working on AI Chat assistant rendering, json-render catalog
artifacts, artifact validation, Markdown message rendering, action approval cards,
Mermaid diagrams, trace waterfalls, metric charts, log lists, tables, diffs, or
JSON trees.

## Source Order

Read the AI Chat route, BFF artifact validation, generated contracts, public
docs, and related tests before changing behavior.

If the behavior is not documented or implemented, report it as a product gap. Do not invent
renderer keys, artifact action handlers, executable UI schemas, route actions,
or error codes.

## Artifact Rules

- Assistant text renders as sanitized Markdown with paragraphs, lists, tables,
  inline code, fenced code blocks, links, emphasis, and headings.
- Raw HTML, scripts, iframes, event handlers, hidden provider reasoning,
  external embeds, and Mermaid click directives are stripped or disabled.
- Structured artifacts must use only approved CloudGrid json-render catalog
  keys: `metric_timeseries`, `metric_bar`, `table`, `key_value`,
  `trace_waterfall`, `log_list`, `mermaid`, `json_tree`, `diff`,
  `status_summary`, and `action_approval`.
- Unknown renderer keys fail validation. Do not fall back to arbitrary JSON,
  generated React components, raw HTML, iframe embeds, or external scripts.
- Action handlers are disabled by default. Allowed handlers are only
  BFF-approved CloudGrid route navigation and approval or rejection of
  server-issued `AiChatActionProposal` IDs.
- Artifacts should make CloudGrid evidence first-class instead of sending users
  to Jaeger, Zipkin, Datadog, or other external tools for primary analysis.

## Boundaries

- Frontend renders BFF-validated artifacts only.
- BFF validates render artifacts before streaming or persisting them.
- AI Chat tools and sandbox scripts may prepare data but must not call
  SurrealDB, NATS, model providers, arbitrary URLs, host paths, or frontend
  mutation shortcuts.
- Do not expose credentials, raw Authorization headers, provider tokens,
  SurrealDB URLs, NATS subjects used as user controls, or hidden prompts in
  artifacts, Markdown, screenshots, logs, docs, or skill output.

## Working Checklist

1. Read the AI Chat backend, frontend, generated contract, and public docs.
2. Choose an approved renderer key for every structured output.
3. Keep Markdown for explanation and json-render artifacts for evidence.
4. Validate size caps, row caps, chart point caps, and route-link approval in
   the BFF before frontend render.
5. Add focused tests for Markdown sanitation, unknown renderer rejection,
   action handler restrictions, and accessible labels.
6. Run the narrowest relevant checks; contract changes require
   `bun run contracts:check`.
