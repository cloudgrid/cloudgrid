# CloudGrid Website

Static marketing + handbook site for CloudGrid. Built with [Astro](https://astro.build) and
[Tailwind CSS v4](https://tailwindcss.com).

> The strategic spine of this site — positioning, IA, visual system, page briefs — lives in
> [`CONCEPT.md`](./CONCEPT.md). Read that first if you're changing more than copy.

## Structure

```
src/
  layouts/
    Layout.astro              Base shell — meta, fonts, theme bootstrap, nav + footer slot
  components/
    Navigation.astro          Top nav: dropdowns, theme toggle, GitHub, mobile menu
    Footer.astro              5-column footer matching the IA
    Logo.astro                The grid mark
    Section.astro             Page section wrapper (tone: default | recessed | grid)
    PageHeader.astro          Standard eyebrow + H1 + lede block
    Button.astro              primary | secondary | ghost
    FeatureCard.astro         Linkable feature tile with icon + accent
    CheckList.astro           Bullet list — check or muted-dash variant
    RelatedFeatures.astro     "Related" three-up at the bottom of feature pages
    visuals/
      MockFrame.astro         "Window chrome" frame for inline mockups
      TraceWaterfall.astro    SVG waterfall mockup
      LogTable.astro          HTML/CSS log table mockup
      MetricChart.astro       SVG time-series chart with exemplar pin
      DashboardGrid.astro     Mock dashboard with 4 typed widgets
      AiEvalBoard.astro       Mock AI evaluation scoreboard
      ArchitectureDiagram.astro Flat SVG service graph + bridge
      AdapterDiagram.astro    Port → v1-implementation visualisation
      CompareTable.astro      Head-to-head competitor matrix
  data/
    compare.ts                Single source of truth for the comparison data
  pages/
    index.astro               Home
    404.astro                 Not found
    docs.astro                Legacy /docs → redirects to /handbook
    features/
      index.astro             Features overview
      traces.astro            Distributed tracing
      logs.astro              Logs
      metrics.astro           Metrics
      dashboards.astro        Dashboards
      ai-evaluation.astro     AI agent evaluation
      adapters.astro          Adapter-driven extensibility
    enterprise/
      index.astro             Enterprise overview
      compare.astro           Head-to-head with 9 competitors
    handbook/
      index.astro             Handbook hub
  content/
    handbook/
      evaluations/            Dataset, evaluation, and optimization user docs
      getting-started/
      architecture/
      configuration/
      adapters/
  styles/
    global.css                Tailwind v4 theme — light + dark via CSS variables
  sections/                   (legacy — unused; safe to delete)
public/
  favicon.svg, og-image.svg, ...
```

## Theming

Both themes are first-class. The default follows the OS `prefers-color-scheme`; the toggle in
the top-right of the nav overrides and persists to `localStorage` under `cg-theme`.

Theme tokens are defined as CSS variables in `:root` (light) and `.dark` (dark) inside
`src/styles/global.css`. Tailwind utilities are wired to those variables via `@theme inline`, so
`bg-surface`, `text-text-secondary`, `border-border-default`, etc. resolve correctly in either
theme without per-utility `dark:` modifiers.

To add a new colour, add it once under both `:root` and `.dark`, then reference it from
`@theme inline`.

## Development

```sh
bun install
bun run dev      # http://localhost:4321
```

## Build

```sh
bun run build    # outputs static HTML to dist/
```

## Deployment

GitHub Pages is the production host for `https://cloudgrid.dev`.

- The root workflow at `.github/workflows/deploy-website.yml` builds this Astro project from
  `website/` and deploys the generated `dist/` artifact to GitHub Pages.
- `public/CNAME` sets the custom Pages domain to `cloudgrid.dev`.
- `public/.nojekyll` ensures Astro's `_astro/` assets are served as static files.

Repository setup on GitHub:

1. Go to repository Settings → Pages.
2. Set Source to **GitHub Actions**.
3. Add `cloudgrid.dev` as the custom domain and enforce HTTPS once GitHub finishes certificate
   provisioning.
4. Point the DNS records for `cloudgrid.dev` at GitHub Pages. If `www.cloudgrid.dev` should work,
   add it as a redirecting/subdomain record at the DNS provider as well.

## Editorial principles

- **Honest about scope.** Every feature page has a "What you can do today" list and a muted
  "Honest about scope" list. Don't ship promises.
- **Name competitors.** The comparison page names Datadog, Honeycomb, Grafana, SigNoz,
  Jaeger, Langfuse, Arize, Braintrust, Helicone. Tone is respectful; no FUD.
- **No marketing adjectives.** No "powerful," "seamless," "blazing-fast." Use the concrete
  thing that would have justified the adjective.
- **The specs are the law.** When in doubt, link `https://github.com/cloudgrid/cloudgrid/tree/main/specs`.
        evaluations/            Dataset, evaluation, and optimization user docs
