---
id: DSY-001
title: Design system
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: from-user
---

# Design System

`DESIGN.md` is the repo-level design contract for frontend implementation. It follows the public DESIGN.md open format: YAML token frontmatter plus ordered markdown sections for Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, and Do's and Don'ts. This spec records the same product-level constraints; implementation agents must read `DESIGN.md` and `05-frontend/product-ux-concept.md` before changing `apps/frontend`.

## Component Library

Use shadcn/ui components backed by Tailwind CSS. Use the shadcn default theme as the baseline and prefer existing shadcn primitives for buttons, inputs, tables, tabs, popovers, sheets, tooltips, badges, separators, scroll areas, and command menus.

## Product Feel

The UI is an enterprise operational workspace, not a marketing page. It must prioritize project-first orientation, dense scanability, stable layout, quick filtering, readable telemetry detail, and low-friction onboarding.

The public website uses the same restraint with a marketing-specific hero treatment. Non-handbook website pages may use generated, realistic enterprise/product collage imagery as the first hero section background only. The imagery must show CloudGrid-relevant product and infrastructure concepts such as observability dashboards, telemetry flows, adapters, message bridge routing, SaaS packaging, or enterprise deployment. Do not use full-page image backgrounds, simple gradients, procedural SVGs, abstract blobs, or generic placeholder art. Handbook pages remain plain white/neutral documentation surfaces.

## Layout

- First screen is the application shell with project/company selection.
- No landing page.
- Before a project is selected, hide telemetry navigation and focus the user on selecting or creating a project.
- After a project is selected, use the project workspace topbar order defined in `05-frontend/product-ux-concept.md`.
- Detail pages use a split layout: trace/span waterfall on one side and contextual logs/details on the other side.
- Do not nest framed surfaces. A card, bordered panel, or rounded section must not be placed inside another card-like container; compose owned components directly and use separators or sticky headers for hierarchy.
- Use dialogs only for short focused confirmations, inspector drawers/sheets for related details and editors, popovers for compact anchored choices, and collapsibles for optional secondary groups.
- On public website marketing pages, keep hero title, description, eyebrow, and CTA placement aligned across routes. Let the generated hero background carry the visual weight; do not add separate right-side mockups or visualizations in the hero.
- Keep public website sections flat after the hero: white or neutral recessed bands, restrained borders, no decorative pill piles, no card-in-card layouts, and no nested rounded section wrappers.
- Marketing feature lists and related-page navigation use editorial stacks, alternating image/text rows, ruled lists, or image-led strips with generated product collage crops instead of generic card grids.

## Tokens

- Radius: 6px for cards and panels.
- Typography: system sans-serif; monospace for IDs, attributes, and payload snippets.
- Color: neutral base with semantic severity colors for error, warn, info, debug, trace.
- Theme modes: support light and dark mode through shadcn/Tailwind semantic tokens. Do not hard-code one mode with raw color values.
- Motion: under 150ms for interaction feedback; respect reduced-motion.

## Whitelabel Boundary

Licensed whitelabel builds customize product identity through the code-level
brand contract in `05-frontend/whitelabel-customization.md`. Frontend
implementation must keep functional CSS, layout behavior, shadcn primitive
behavior, and route UX in core. Brand modules may provide product name, mark,
title formatting, typography, radius, and complete light/dark semantic token
sets only.

Core components must consume semantic tokens and `useBrand()` for visible
product identity. They must not import customer CSS, hard-code brand colors, or
introduce brand settings pages.

## Internationalization

- UI copy must be routed through a frontend translation layer.
- English is the default locale for MVP.
- Components must not hard-code user-visible labels directly when the label is product copy, navigation, filters, states, or errors.

## Accessibility Target

WCAG 2.2 AA for contrast, keyboard navigation, focus states, table navigation, and form controls.

Stateful action controls must label the action that will happen when activated. For example, an expanded section's toggle says `Collapse` and uses a collapse-oriented icon, while a collapsed section's toggle says `Expand` and uses an expand-oriented icon. Apply the same rule to visible labels, icon-only tooltips, and `aria-label`s.

Keyboard focus must not be obscured by sticky topbars, drawers, sheets, bottom bars, or persistent filter headers. Interactive targets must be at least 24x24 CSS px, with primary desktop controls at least 32px high and touch controls at least 40px high.
