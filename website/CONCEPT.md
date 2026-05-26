# CloudGrid Website — Concept & Positioning

Status: working draft for the website redesign
Last updated: 2026-05-26
Scope: marketing site only (`/website`). Source code, specs, and product docs are unchanged.

---

## 1. Where CloudGrid sits in the market

CloudGrid is a source-available, self-hosted, AI-native observability platform built on OpenTelemetry, with a clean message-bridge architecture and customizable extension surface.

The market has three rough camps. CloudGrid does not sit cleanly in any of them — which is the opportunity.

| Camp | Examples | What they're great at | Where they hurt |
|---|---|---|---|
| **SaaS APM** | Datadog, New Relic, Honeycomb, Lightstep | Polished UI, fast onboarding, deep correlations | Your telemetry sits on someone else's disk. Per-host / per-GB pricing punishes the workloads that need observability most. Vendor lock-in via proprietary agents and query languages. |
| **OSS "LGTM" stacks** | Grafana + Loki + Tempo + Mimir/Prometheus, Elastic, SigNoz, Uptrace | You own the data. Components are interchangeable. | You operate three to five independent systems with three to five different query languages, retention models, and storage backends. Correlation across signals is glue you wrote yourself. AI workloads are an afterthought. |
| **AI-eval point tools** | Langfuse, Arize Phoenix, Helicone, Braintrust, LangSmith | Built specifically for LLM / agent traces and evaluations | They only see the AI slice. Your non-AI services are observed in a completely different tool. Evaluations live separately from your traces. |

**CloudGrid's wedge:** one self-hosted system, OpenTelemetry-native end to end, that does general-purpose traces / logs / metrics / dashboards / alerts *and* first-class AI agent evaluation, with brand, packaging, and adapter extension points.

You don't have to choose between "real observability" and "AI-aware evaluation." You don't have to choose between "I own my data" and "the UI is actually good." You don't have to choose between source availability and coherent product packaging.

## 2. Positioning statement

> CloudGrid is the source-available, OpenTelemetry-native observability platform you actually own. Traces, logs, metrics, dashboards, alerts, and first-class AI evaluation and optimization — in one self-hosted system with customization and adapter extensibility, so the brand, storage, message bridge, auth, alert delivery, and evaluation execution path you run today can be changed tomorrow.

Short form (hero):

> **Own your observability.**
> OpenTelemetry traces, logs, metrics, dashboards, alerts, and AI evaluation workflows — source-available, self-hosted, customizable. No vendor lock-in. No data leaving your network.

## 3. ICP and audiences

Three audiences read the site differently. The IA has to serve all three within two clicks.

1. **Platform / Infra engineer (primary).** Already runs OTel collectors and a Grafana stack or an APM. Wants to know: how it scales, how the message bridge isolates blast radius, what storage backends are pluggable, how to migrate, and how far the product can be customized. Cares about Architecture, Customizable, Handbook.
2. **AI / ML engineer (growth wedge).** Building LLM apps or agents, currently using Langfuse / Arize / Phoenix / Braintrust on top of (or instead of) observability. Wants: datasets, evaluation runs, comparisons, optimization, and trace-backed evidence for the rest of the system. Cares about AI Evaluation, Traces, Compare.
3. **Engineering manager / security buyer (decision lever).** Asks the procurement-grade questions: data residency, SSO, isolation, license clarity, total cost. Cares about Enterprise, Compare, Commons Clause license, governance posture.

## 4. "Unicorn" features — the 6 things only CloudGrid claims at once

These are the differentiators the entire site repeats. Every page should echo at least two.

1. **OTel-native, signal-complete, in one place.** Traces, logs, metrics, dashboards, alerts, *and* AI evaluation workflows. Not five tools glued together.
2. **Customizable infrastructure.** Brand identity, packaging, and every external dependency — storage backend, message bridge, auth providers, alert delivery, evaluation execution — sit behind explicit layers or ports. v1 ships with SurrealDB, NATS JetStream, GitHub/Google/Entra ID SSO, built-in in-app/email alert delivery, and adapter-backed AI execution. You can implement your own.
3. **Message-bridge isolation.** No public service touches the database. Every read and every write crosses NATS. The blast radius of a bad UI query is bounded by a request/reply contract, not a SQL connection pool.
4. **AI-evaluation, first-class — without giving up your trace data.** Datasets, evaluation runs, comparisons, optimization evidence, and promotion records live next to the telemetry that explains them. Prompt and completion content stays controlled by the originating trace data and dataset policy — never copied into a separate "AI database" workflow.
5. **You own the data, end of paragraph.** Self-hosted by default. No telemetry leaves your network unless you wire it to. Apache 2.0 + Commons Clause. No open-core bait-and-switch.
6. **Open development.** Source is on GitHub. Roadmap is in issues and milestones, not a closed-door deck. (We deliberately do not surface the internal `/specs` directory on the public website — that's an implementation artifact, not a marketing message.)

## 5. Information architecture

Four top-level entries. Nothing more, because every extra nav item costs comprehension.

```
/                                 Home
/features                         Features (overview)
  /features/traces                Distributed tracing
  /features/logs                  Log analytics
  /features/metrics               Metrics exploration
  /features/dashboards            Dashboards & widgets
  /features/alerts                Alerts
  /features/ai-evaluation         AI agent evaluation
  /features/adapters              Customizable foundation (brand, packaging, adapters)
/enterprise                       Enterprise (data ownership, SSO, isolation)
  /enterprise/whitelabel-solution White-label solution for commercial SaaS and partners
  /enterprise/compare             Head-to-head vs Datadog, Honeycomb, LGTM, Langfuse, ...
/handbook                         Handbook (technical hub)
  /handbook/getting-started       Run it in one command
  /handbook/architecture          Services, bridge, contracts
  /handbook/deployment            Local, deployed, Kubernetes
  /handbook/configuration         Env, modes, SSO providers
  /handbook/evaluations           Dataset, evaluation, and optimization guides
  /handbook/adapters              Adapter author guide (storage, evaluation execution, auth)
```

Cross-links:
- Every Feature page ends with a strip linking to Architecture (handbook) and Compare (enterprise).
- Compare links into the relevant feature pages so claims are backed by detail.
- Handbook subpages link out to the GitHub `specs/` directory for the authoritative spec.

## 6. Page briefs

### Home (`/`)
**Job:** in 8 seconds, prove this is a serious tool; in 60 seconds, get a platform engineer to click Handbook or an AI engineer to click AI Evaluation.

Sections in order:
1. **Hero** — headline "Own your observability." Sub: one-sentence positioning. CTAs: *Read the handbook*, *Star on GitHub*. The first section uses a generated realistic enterprise/product collage background, with the headline block aligned consistently with the other marketing pages.
2. **Capability stack** — seven editorial rows: Traces / Logs / Metrics / Dashboards / Alerts / AI Evaluation / Customizable. Each row pairs concise copy with a generated product collage crop and links to its feature page.
3. **The wedge** — "One self-hosted system. Signals, alerts, and evaluation." Three paragraphs against the three competitor camps, named.
4. **Architecture teaser** — flat SVG of the service graph. Caption: "No public service touches the database." CTA to Handbook → Architecture.
5. **Customizable** — brand, packaging, and runtime extension story with the four adapter slots (storage / bridge / auth / evaluation execution) as the technical foundation. CTA to Features → Customizable.
6. **AI-native, signal-complete** — small mockup of an evaluation scoreboard with row evidence and trace links. CTA to Features → AI Evaluation.
7. **Compare strip** — a 4-row preview of the comparison table. CTA to Enterprise → Compare.
8. **Source-available footer block** — Apache 2.0 + Commons Clause, public specs, public roadmap, GitHub.

### Features overview (`/features`)
Editorial stack of the seven feature pages, alternating text and generated product collage crops. Avoid card grids and generic "read more" tiles. Below the stack: the three architectural truths that hold across every feature (message bridge, project isolation, customization surface) as a flat ruled list.

### `/features/traces`
- Hero: "Every span, every attribute, every event — preserved."
- Mockup: SVG trace waterfall with span details panel.
- What you can do: waterfall view, span attribute search, span event inspection, status filtering, live trace receiving via GraphQL subscriptions.
- Honesty: OTLP HTTP today; OTLP gRPC is on the spec path.
- Related: Logs (trace-log correlation), AI Evaluation (trace evidence becomes dataset cases).

### `/features/logs`
- Hero: "Search-first logs that already know which trace they belong to."
- Mockup: SVG log table with severity chips and a "Jump to trace" pivot.
- What you can do: full-text search, severity filter, trace-id / span-id pivots, structured attribute filtering, time-range scoping.
- Honesty: log ingestion is on `/v1/logs`; log match and log count alerting live in the project alerting workspace.

### `/features/metrics`
- Hero: "Metric exploration that respects descriptors, attributes, and exemplars."
- Mockup: SVG time-series chart with descriptor inspector and an exemplar pin.
- What you can do: counters / gauges / histograms / summaries, group-by descriptor attributes, pivot from an exemplar into the trace.
- Honesty: long-term metric storage is a SurrealDB-backed v1; alternate backends are the natural next adapter.

### `/features/dashboards`
- Hero: "Saved views, typed widgets, pinned where you work."
- Mockup: SVG dashboard grid with four widget types (metric chart, log table, trace table, live trace feed).
- What you can do: compose dashboards from typed widgets, pin to project sidebar, share within the project.
- Distinction: `Dashboard` and `DashboardWidget` are the only saved-composition surface. Ad-hoc exploration lives in `/metrics`, `/traces`, `/logs`.

### `/features/alerts`
- Hero: "Core alerting with flexible delivery paths."
- Mockup: alert rule table plus delivery fan-out showing in-app, email, and bridge adapters.
- What you can do: configure project-scoped metric, log, and trace alert rules; manage silences and history; use in-app alert history and email summaries; extend delivery through bridge-backed adapters for Slack, Teams, WhatsApp, SMS, PagerDuty, or customer gateways.
- Key boundary: CloudGrid core owns evaluation, state transitions, deduplication, silences, cooldowns, history, and delivery result handling. Adapters deliver safe summaries and return bounded status; they do not evaluate rules or own provider secrets in the frontend.

### `/features/ai-evaluation`
- Hero: "Turn collected telemetry into better AI behavior."
- Mockup: dataset evaluation scoreboard with metric deltas, row evidence, and trace links.
- What you can do: build schema-backed datasets, import trace-derived cases, run dataset evaluations, inspect row evidence, compare candidates, optimize prompts or examples, and promote with validation evidence.
- Key honesty: production measurement is not the primary v1 workflow; complex targets can use an adapter; provider credentials stay in project/provider settings.
- Compare: Langfuse / Arize / Braintrust focus on AI slice only; CloudGrid evaluates AI inside the same system that observes everything else.

### `/features/adapters`
- Hero: "Make CloudGrid feel like your product."
- Focus: CloudGrid as a customizable, source-available foundation: logos, naming, colors, support/legal links, product copy, deployment packaging, auth, bridge, storage, and evaluation execution.
- Diagram: SVG showing adapter port surfaces with v1 implementation chips: storage (SurrealDB), message bridge (NATS JetStream), alert delivery (in-app / email / webhook), auth (GitHub / Google / Entra ID), evaluation execution.
- What you can do: customize the visible product surface, package CloudGrid for your environment, implement a Go storage adapter against the storage-read/write port, point the bridge at a different transport, add an SSO provider, or plug in an external evaluation execution path.
- License honesty: Apache 2.0 + Commons Clause covers self-hosted adoption; hosted resale, white-label SaaS, and commercial product-portfolio use require a separate agreement.
- Link to Enterprise → White-label Solution and Handbook → Adapters.

### Enterprise (`/enterprise`)
**Job:** answer the buyer-grade questions in one read.

Sections:
1. **Data ownership.** Self-hosted by default. No outbound telemetry. Apache 2.0.
2. **Deployment modes.** Local single-binary, Compose, Kubernetes. Single config flag flips local-mode auth into SSO mode.
3. **SSO & sessions.** GitHub, Google, Entra ID. BFF-managed HttpOnly cookies. No provider tokens in the browser.
4. **Project isolation.** Every project is a strict telemetry boundary. Users only see their company's projects. Isolation enforced at API, message, and persistence layers.
5. **Security posture.** No public service touches the database. Adapter packages keep DB drivers out of the public attack surface. Spec-driven contracts are reviewable.
6. **Operational characteristics.** Independent scale of collector, BFF, storage-read. Storage-write is the only mutator. Live subscriptions respect the same authorization as queries.
7. **License & governance.** Apache 2.0. Public specs. No hidden enterprise switches.
8. **CTA:** Compare to your current stack → `/enterprise/compare`.

### Enterprise — White-label Solution (`/enterprise/whitelabel-solution`)
**Job:** explain CloudGrid as a commercial white-label / partner foundation.

- Audience: enterprises adding observability to a platform, startups building SaaS around operational insight, and service providers bundling managed deployments.
- Focus: brand ownership, customer-facing packaging, deployment flexibility, and modular extension through bridge and adapter boundaries.
- Scaling: explain that the modular architecture lets customers scale data ingestion, persistence, and read/live-delivery capacity independently according to workload requirements.
- Spec-driven delivery: explain that CloudGrid ships with implementation specs, GraphQL and AsyncAPI contracts, error taxonomy, and architecture restrictions so AI agents, alternate language implementations, and third-party integrations can customize against defined behavior instead of guessing.
- License: clear line between public self-hosted use and commercial hosted / white-label / managed-service resale.
- CTAs to Features → Customizable and Enterprise → Overview.

### Enterprise — Compare (`/enterprise/compare`)
Two artifacts on this page:

1. **Big head-to-head table.** Rows are decision criteria, columns are vendors. Honest cells (✓ / partial / ✗ / "n/a") with a single sentence of nuance.
2. **Per-vendor notes.** Short paragraph for each of: Datadog, Honeycomb, Grafana+Tempo+Loki+Mimir, SigNoz, Jaeger (+ Tempo), Langfuse, Arize Phoenix, Braintrust, Helicone. Tone: respectful, specific, no FUD.

Comparison criteria (rows):
- Open source
- Self-hostable
- License (named)
- OTel-native (no proprietary agents)
- Traces, Logs, Metrics in one product
- AI-agent evaluation built in
- Adapter-swappable storage
- Adapter-swappable message bridge
- Live trace subscriptions (real-time)
- Project-level isolation primitive
- SSO included in OSS
- No telemetry-volume pricing
- Roadmap visible in the source repo

### Handbook overview (`/handbook`)
Card grid linking to the five subpages. Top strip: a single sentence explaining the Handbook is hand-authored, opinionated, and meant to be read top-to-bottom or jumped through.

### `/handbook/getting-started`
One-command local run. Compose snippet. First OTLP POST. First trace in the UI. Three "what now" links.

### `/handbook/architecture`
Service graph (SVG), data-flow narrative, message-bridge contract, why-this-shape rationale. Link to `specs/04-backend/backend-architecture.md`.

### `/handbook/deployment`
Local mode, deployed mode, Kubernetes, scaling guidance, observability of CloudGrid itself.

### `/handbook/configuration`
Env vars table, deployment-mode/auth-mode matrix, SSO provider setup, retention policy.

### `/handbook/adapters`
Adapter author guide. The port shapes (storage-read, storage-write, evaluation execution, auth provider). v1 implementations as references. How to contribute a new adapter.

## 7. Visual system

**Philosophy.** Flat. Professional. Data-rich. Read like Vercel docs or Linear changelog, not like a SaaS landing page from 2019. No animated canvases, no rainbow gradients on every heading, no card-in-card compositions, and no decorative pill piles. On marketing pages, the hero image carries the first-viewport visual weight; below the hero, sections are flat white or neutral recessed bands.

**Hero imagery.**
- Home, feature, and enterprise pages use generated realistic enterprise/product collage images as the first hero section background only.
- Hero images should look like polished product or infrastructure photography/render collages: observability dashboards, telemetry flows, message bridge routing, adapter blocks, SaaS packaging, cloud/server infrastructure, and operational evidence.
- Do not use full-page image backgrounds. Do not apply hero images to content sections, related-link sections, body backgrounds, or handbook pages.
- Do not use simple gradients, procedural SVG backgrounds, abstract waves, or generic stock-like filler as hero imagery.
- Keep eyebrow, headline, description, and CTA placement aligned across marketing pages to avoid visual jumps while navigating.
- Do not add a separate right-side mockup, animated canvas, SVG visualization, or card stack in the hero when the generated background already carries the visual focus.
- Handbook and handbook subpages stay plain white/neutral documentation pages without marketing hero imagery.

**Theme.** Dual-mode. Default follows OS preference. Manual toggle in the top-right of the nav, persisted in `localStorage`. Both themes are first-class — neither is an afterthought.

**Light theme tokens.**
- Background: `#ffffff` (page), `#f7f8fa` (recessed), `#ffffff` (card), `#f0f2f5` (card-hover)
- Text: `#0b1220` (primary), `#475569` (secondary), `#64748b` (muted)
- Borders: `rgba(15,23,42,0.08)` (subtle), `rgba(15,23,42,0.12)` (default), `rgba(15,23,42,0.18)` (strong)

**Dark theme tokens.**
- Background: `#0a0d14` (page), `#0f1320` (recessed), `#121826` (card), `#1a2030` (card-hover)
- Text: `#f8fafc` (primary), `#94a3b8` (secondary), `#64748b` (muted)
- Borders: `rgba(148,163,184,0.12)` (subtle), `rgba(148,163,184,0.16)` (default), `rgba(148,163,184,0.22)` (strong)

**Accent palette (theme-stable).**
- Brand indigo `#4f46e5` (primary)
- Cyan `#0891b2` (data / metrics)
- Emerald `#10b981` (success / ingest)
- Amber `#d97706` (live / warning)
- Violet `#7c3aed` (AI eval)
- Rose `#e11d48` (error / critical, used sparingly)

**Typography.**
- Sans: Inter Variable
- Mono: JetBrains Mono
- H1 clamp(2.25rem, 4.5vw, 3.5rem), tracking-tight, no gradient text on headlines (one accent per page max)
- Body 16px, line-height 1.65, secondary text at 14px

**Components.**
- Buttons: solid primary (filled with `--color-text-primary`-on-inverse), ghost secondary (1px border, hover background)
- Cards: 1px border, no shadow in light, soft 12px-blur shadow in dark; 16px or 24px padding; use cards only for repeated selectable items or genuinely framed tools, never as nested page-section wrappers
- Marketing feature/related navigation: prefer editorial rows, visual stacks, ruled lists, or image-led strips over grid cards. If a section links to multiple marketing pages, pair concise text with real generated product imagery instead of icon boxes.
- Tables: zebra rows off, sticky header on long tables, monospace for numeric columns
- Diagrams: SVG, stroke-based, accent color only at semantic emphasis points (e.g., the message bridge)
- No card-in-card. No gradient borders. No glowing pulses.

**Motion.**
- One global reveal (fade + 12px translate-up) on scroll-into-view.
- 150ms hover transitions on interactive surfaces.
- That's it. No scroll-jacking, no parallax, no canvas animations.

## 8. Voice

- **Declarative, not aspirational.** "Every read and write crosses the message bridge" — not "we believe in clean architecture."
- **Honest about scope.** Say "OTLP HTTP today; gRPC on the spec path" instead of pretending parity.
- **Respectful of competitors.** Name them, describe what they're great at, then describe where CloudGrid is different. No FUD, no jabs.
- **No marketing adjectives.** Strike "powerful," "blazing fast," "seamless," "enterprise-grade." Replace with the concrete thing that justified the adjective.

## 9. What changes vs the current site

| Today | After |
|---|---|
| Single long page, dark-only | Multi-page IA (Home / Features / Enterprise / Handbook), light + dark with toggle |
| Animated canvas hero + gradient stacks | Aligned hero sections with generated realistic enterprise/product collage backgrounds |
| Generic "AI-ready" mention | Dedicated AI Evaluation page with datasets, evaluation scoreboards, comparisons, and optimization |
| Architecture as a side note | Architecture as a first-class handbook page with named services + adapter slots |
| No competitor comparison | Named head-to-head page with 13 decision rows |
| No customization story | First-class Customizable feature page, white-label enterprise page, and adapter author handbook page |
| Docs = redirect to GitHub | Handbook with real content; docs subdir on GitHub still linked as the deep reference |

## 10. Out of scope for this iteration

- No CMS, no blog system. Handbook is hand-authored Astro pages for now.
- No i18n. English only.
- No search. Site is small enough that nav handles it.
- No analytics until a privacy posture is decided (consistent with own-your-data message).
- No screenshots of the actual UI yet. Generated hero backgrounds carry the marketing first viewport until the UI is shipped at a brag-worthy state; later product screenshots can replace page body mockups without changing the IA or hero alignment.
