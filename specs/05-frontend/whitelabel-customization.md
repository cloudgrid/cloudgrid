---
id: TEC-FE-010
title: Code-level whitelabel customization
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-26
provenance: user-requested
depends_on: [TEC-FE-009, DSY-001]
---

# Code-Level Whitelabel Customization

## Intent

CloudGrid supports licensed whitelabel distribution for customers who sell the product as their own product or SaaS. Whitelabeling is a build-time and code-level customization boundary. It is not an in-product settings surface, not tenant-editable branding, and not a runtime admin feature.

The goal is to let customers customize product identity and visual theme while keeping CloudGrid core upgradeable. Customer customization must live behind stable frontend contracts so upstream CloudGrid updates do not require broad route, component, or CSS rewrites.

## Scope

Whitelabel customization may change:

- Product name, short name, document title formatter, and public home URL.
- Product mark/logo component used by the global topbar, login surfaces, mobile sheet, and other product-identity placements.
- Light and dark semantic theme token values.
- Typography families and base radius.
- Static assets referenced by the customer brand module, such as favicons, app icons, and social preview images, when packaging supports them.

Whitelabel customization must not change:

- Service boundaries, GraphQL fields, NATS subjects, telemetry semantics, authorization behavior, storage behavior, route semantics, or error taxonomy.
- The UX v2 shell model, topbar height, project sidebar behavior, project picker behavior, settings shell behavior, or telemetry route taxonomy.
- Product copy that describes CloudGrid-owned technical concepts unless the copy is explicitly product-name parameterized.
- shadcn component contracts, shared UI primitive behavior, or route-local data ownership.
- Any user-facing settings page for brand editing.

## Architecture

The frontend has one customization boundary: `@cloudgrid/brand`.

Default CloudGrid builds resolve `@cloudgrid/brand` to `apps/frontend/src/brand/brand.ts`. Licensed whitelabel builds may point `CLOUDGRID_FRONTEND_BRAND_MODULE` at an external TypeScript module that exports `brand` satisfying `ProductBrand` from `apps/frontend/src/brand/brand-contract.ts`.

Customer brand modules should live outside CloudGrid core, for example in a separate repository or deployment overlay. Customers must not edit route components, shadcn primitives, generated contracts, or core CSS to achieve branding. If a required visual customization cannot be expressed through `ProductBrand`, the contract must be extended in this spec and implemented in core before customers depend on it.

## CSS Boundary

Frontend CSS is split into:

- Functional CSS: Tailwind setup, shadcn setup, base element behavior, accessibility behavior, and layout mechanics.
- Theme CSS: semantic token defaults for the official CloudGrid brand.

Core React components consume semantic Tailwind tokens such as `bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `text-success`, `text-warning`, `text-error`, `text-trace`, and sidebar tokens. Route and feature components must not import customer CSS, read customer files, or use hard-coded brand colors.

The `BrandProvider` applies the active brand's light/dark token values as CSS custom properties on document startup. Theme toggling continues to switch the `.dark` class only; it does not know customer-specific colors.

## Required Brand Contract

`ProductBrand` is the stable frontend customization contract:

- `id`: lowercase build-stable identifier used for diagnostics and `data-brand`.
- `productName`: full product name for visible identity copy.
- `shortName`: compact name for constrained placements.
- `homeUrl`: optional public product URL.
- `mark`: React component for the product mark. The mark must render without network fetches and must remain legible at 14px, 16px, 24px, and 32px.
- `pageTitle(pageTitle?)`: document-title formatter.
- `theme.radius.base`: base CSS radius token.
- `theme.typography.sans` and `theme.typography.mono`: complete CSS font-family values.
- `theme.color.light` and `theme.color.dark`: complete semantic color token sets.

All token sets are complete. Partial theme overrides are not accepted because missing tokens create drift and unpredictable upgrades.

## Upgrade Rules

- CloudGrid upstream owns every file outside the brand module and customer static assets.
- Customer brand modules must import only `ProductBrand` types and ordinary React/icon dependencies already present in the frontend bundle.
- Customer brand modules must not import route components, providers, generated contracts, app session state, GraphQL clients, or backend code.
- Core changes that add a new required brand field must update this spec, `brand-contract.ts`, the default CloudGrid brand, and focused tests in the same change.
- Core changes that introduce new product-identity placements must use `useBrand()` or a shared brand component. They must not call `t("app.name")` directly for visible identity.
- Product-name interpolation uses translation placeholders such as `{productName}`. Hard-coded `CloudGrid` strings are allowed only for CloudGrid-specific technical names, package names, error class names, repository names, docs that explicitly discuss CloudGrid, and default-brand tests.

## Acceptance Criteria

- A default build without `CLOUDGRID_FRONTEND_BRAND_MODULE` renders the official CloudGrid identity and theme.
- A whitelabel build can replace `@cloudgrid/brand` without editing route components or core CSS.
- Topbar identity, login identity, login preview identity, mobile sheet title, backend-unavailable copy, and document title use the active brand contract.
- Functional CSS and default theme CSS are separate files.
- Frontend typecheck fails when a custom brand omits a required semantic token.
- No GraphQL, AsyncAPI, Go contract, BFF bridge, storage, or telemetry behavior changes are required for whitelabel branding.
