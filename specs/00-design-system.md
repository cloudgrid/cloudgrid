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

## Layout

- First screen is the application shell with project/company selection.
- No landing page.
- Before a project is selected, hide telemetry navigation and focus the user on selecting or creating a project.
- After a project is selected, use the project workspace topbar order defined in `05-frontend/product-ux-concept.md`.
- Detail pages use a split layout: trace/span waterfall on one side and contextual logs/details on the other side.
- Do not nest framed surfaces. A card, bordered panel, or rounded section must not be placed inside another card-like container; compose owned components directly and use separators or sticky headers for hierarchy.
- Use dialogs only for short focused confirmations, inspector drawers/sheets for related details and editors, popovers for compact anchored choices, and collapsibles for optional secondary groups.

## Tokens

- Radius: 6px for cards and panels.
- Typography: system sans-serif; monospace for IDs, attributes, and payload snippets.
- Color: neutral base with semantic severity colors for error, warn, info, debug, trace.
- Theme modes: support light and dark mode through shadcn/Tailwind semantic tokens. Do not hard-code one mode with raw color values.
- Motion: under 150ms for interaction feedback; respect reduced-motion.

## Internationalization

- UI copy must be routed through a frontend translation layer.
- English is the default locale for MVP.
- Components must not hard-code user-visible labels directly when the label is product copy, navigation, filters, states, or errors.

## Accessibility Target

WCAG 2.2 AA for contrast, keyboard navigation, focus states, table navigation, and form controls.

Stateful action controls must label the action that will happen when activated. For example, an expanded section's toggle says `Collapse` and uses a collapse-oriented icon, while a collapsed section's toggle says `Expand` and uses an expand-oriented icon. Apply the same rule to visible labels, icon-only tooltips, and `aria-label`s.

Keyboard focus must not be obscured by sticky topbars, drawers, sheets, bottom bars, or persistent filter headers. Interactive targets must be at least 24x24 CSS px, with primary desktop controls at least 32px high and touch controls at least 40px high.
