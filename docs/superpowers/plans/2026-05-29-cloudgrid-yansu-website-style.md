# CloudGrid Yansu-Inspired Website Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the CloudGrid public website with Yansu-inspired light and dark mode tokens while preserving layout and navigation.

**Architecture:** Keep the change at the website presentation layer. Local Geist font assets live in `website/public/fonts/geist/`; `Layout.astro` preloads those assets; `global.css` owns all typography, color, surface, and shadow token changes.

**Tech Stack:** Astro 6, Tailwind CSS v4, local WOFF2 font assets, existing CloudGrid website components.

---

### Task 1: Add Local Geist Font Assets

**Files:**
- Create: `website/public/fonts/geist/Geist-Variable.woff2`
- Create: `website/public/fonts/geist/GeistMono-Variable.woff2`

- [ ] Copy `Geist-Variable.woff2` and `GeistMono-Variable.woff2` from Vercel's `geist` npm package into `website/public/fonts/geist/`.
- [ ] Confirm both files exist with `find website/public/fonts/geist -type f`.

### Task 2: Replace Remote Font Loading

**Files:**
- Modify: `website/src/layouts/Layout.astro`

- [ ] Remove Google Fonts `preconnect` and stylesheet tags.
- [ ] Add `preload` tags for `/fonts/geist/Geist-Variable.woff2` and `/fonts/geist/GeistMono-Variable.woff2`.
- [ ] Keep existing metadata, theme bootstrap, navigation, and page structure unchanged.

### Task 3: Update Website Tokens

**Files:**
- Modify: `website/src/styles/global.css`

- [ ] Add `@font-face` rules for local Geist Sans and Geist Mono.
- [ ] Replace the Inter and JetBrains Mono theme font variables with Geist.
- [ ] Update light tokens to the approved pale raised direction.
- [ ] Update dark tokens to the approved black editorial direction.
- [ ] Keep handbook plain by using semantic tokens rather than image backgrounds.

### Task 4: Record Design Contract

**Files:**
- Modify: `DESIGN.md`
- Modify: `specs/00-design-system.md`

- [ ] Update website-specific typography notes to say the public website uses local Vercel Geist assets.
- [ ] Update website-specific visual direction to describe Yansu-inspired light and dark modes.

### Task 5: Verify

**Commands:**
- `bun run build` from `website/`
- Search built output for `fonts.googleapis.com` and `fonts.gstatic.com`; expected no matches.
- Use the in-app browser to inspect the local built or dev website in light and dark mode.
