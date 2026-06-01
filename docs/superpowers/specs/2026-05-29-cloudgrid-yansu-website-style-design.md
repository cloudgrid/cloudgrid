# CloudGrid Yansu-Inspired Website Style Design

## Context And Goal

CloudGrid's public website keeps its current route structure, sticky top navigation placement, hero/content positioning, and documentation layout. The visual style changes to a Yansu-inspired token system: soft raised pale surfaces in light mode and a black editorial treatment in dark mode.

## Approved Direction

- Light mode uses the selected visual companion option A: pale blue-gray page and recessed backgrounds, compact typography, black primary actions, blue-gray borders, and soft layered shadows.
- Dark mode uses the selected visual companion option C: black page background, dark raised surfaces, muted blue-gray text, stronger blue-gray borders, and restrained dark editorial contrast.
- The handbook remains documentation-first and must not receive marketing image backgrounds.
- Non-handbook marketing pages keep generated hero imagery only in the first hero section.

## Typography

- Use Vercel Geist as the website sans font, served from local website assets rather than CDN links.
- Use Geist Mono for code, IDs, diagrams, tables, and command snippets, also served locally.
- Keep the existing layout scale intact, but tune base rendering toward compact Yansu-like density: 16px base text, smaller metadata, tighter labels, and no viewport-based font scaling.

## Token Changes

- Replace the current neutral white/slate token set with Yansu-adjacent tokens:
  - `--color-page` light: `#f4f7fb`
  - `--color-surface` light: `#ffffff`
  - `--color-text` light: `#14181f`
  - `--color-text-secondary` light: `#6b7585`
  - `--color-border-default` light: `#e5e7eb`
  - `--color-page` dark: `#000000`
  - `--color-surface` dark: `#070a10`
  - `--color-text` dark: `#ffffff`
  - `--color-text-secondary` dark: `#9aa3b3`
  - `--color-border-default` dark: `#4c668c`
- Restore soft layered shadows for raised website surfaces while keeping CloudGrid's flat content hierarchy.

## Implementation Scope

- Update `website/src/styles/global.css` for local font faces, typography tokens, surface tokens, shadows, nav/menu colors, and hero treatment.
- Update `website/src/layouts/Layout.astro` to remove Google Fonts links and preload local Geist assets.
- Add local font assets under `website/public/fonts/geist/`.
- Update `DESIGN.md` and `specs/00-design-system.md` to record the website-specific font and color direction.

## Acceptance Criteria

- The built website must not include `fonts.googleapis.com` or `fonts.gstatic.com`.
- CSS must reference local `/fonts/geist/*.woff2` files.
- Light mode home/feature/enterprise pages use pale raised Yansu-like surfaces.
- Dark mode uses black editorial surfaces while preserving readable contrast.
- Navbar position and page layout remain unchanged.
- Handbook pages stay plain documentation pages.
