---
name: cloudgrid-whitelabel-customization
description: Implements or reviews CloudGrid licensed whitelabel customization. Use when changing product branding, customer brand modules, build-time white-label themes, logos, product names, semantic CSS tokens, @cloudgrid/brand, BrandProvider, frontend theme separation, or upgrade-safe customer customization boundaries.
---

# CloudGrid Whitelabel Customization

Use this skill for code-level whitelabel work in CloudGrid. The customer must be
able to sell CloudGrid as their own product or SaaS by replacing product
identity and theme at build time, without editing CloudGrid route components or
forking core behavior.

This skill is self-contained. Do not assume the specs are available. If specs
exist in the current repo, you may update them, but do not rely on them as the
only source of requirements.

## Non-Negotiable Model

Whitelabeling is code-level and build-time only.

Allowed customer customization:

- Product name, short name, document title format, and public product URL.
- Product mark/logo component.
- Complete light and dark semantic theme token sets.
- Typography families and base radius.
- Customer static assets referenced by the customer brand module.

Forbidden customer customization:

- In-product brand settings pages.
- Tenant-editable branding.
- Runtime admin branding workflows.
- Route, GraphQL, NATS, storage, auth, telemetry, dashboard, AI Chat, or AI Eval
  behavior changes.
- Customer-specific imports in route components, shared UI primitives, generated
  contracts, BFF, Go services, or storage code.

## Core Boundary

The only supported frontend customization boundary is `@cloudgrid/brand`.

Default CloudGrid builds resolve it to:

- `apps/frontend/src/brand/brand.ts`

Customer builds may replace that alias with `CLOUDGRID_FRONTEND_BRAND_MODULE`,
pointing at an external TypeScript module that exports:

```ts
export const brand = { ... } satisfies ProductBrand;
```

The customer module must satisfy `ProductBrand` from:

- `apps/frontend/src/brand/brand-contract.ts`

Do not solve whitelabel requests by editing app shell route code, shadcn
components, generated contracts, or backend services. If the brand contract is
too small, extend the contract in CloudGrid core first.

## Required First Reads

Read these files before editing:

1. `skills/cloudgrid-whitelabel-customization/references/contract.md`
2. `apps/frontend/src/brand/brand-contract.ts`
3. `apps/frontend/src/brand/brand.ts`
4. `apps/frontend/src/brand/cloudgrid-brand.tsx`
5. `apps/frontend/src/providers/brand-provider.tsx`
6. `apps/frontend/src/styles.css`
7. `apps/frontend/src/styles/base.css`
8. `apps/frontend/src/styles/cloudgrid-theme.css`
9. `apps/frontend/vite.config.ts`

If a file does not exist, create the missing boundary in the same shape instead
of scattering branding into routes.

## Implementation Workflow

1. Identify whether the request is default CloudGrid brand work, customer brand
   module work, CSS token work, or product identity usage cleanup.
2. Keep customer-specific values in the brand module only.
3. Keep functional CSS in core and theme values in brand/default-theme files.
4. Use `useBrand()` for visible product identity in React.
5. Use translation placeholders such as `{productName}` for product-name copy.
6. Keep technical CloudGrid names only where they describe package names,
   repository names, internal error classes, docs about CloudGrid itself, or
   default-brand tests.
7. Add or update focused tests when the contract, provider, alias, or identity
   placement changes.
8. Run targeted typecheck and formatting/lint checks.

## CSS Rules

Core UI components must use semantic tokens only:

- `bg-background`, `text-foreground`, `border-border`
- `bg-primary`, `text-primary-foreground`
- `bg-muted`, `text-muted-foreground`
- `text-info`, `text-success`, `text-warning`, `text-error`, `text-trace`
- sidebar semantic tokens for project/admin navigation

Do not hard-code brand colors in route code. Non-neutral colors remain
data-meaning colors: severity, status, chart series, trace focus, warning,
success, and error.

## Drift Guards

Before finishing, confirm:

- `@cloudgrid/brand` remains the only customer replacement boundary.
- `ProductBrand` requires complete light and dark token sets.
- The default CloudGrid build still works without customer configuration.
- Customer builds can swap the brand module without editing core files.
- No branding settings page, GraphQL field, NATS subject, database field, or
  backend config was added for whitelabeling.
- Topbar, login surfaces, mobile sheet title, document title, and backend
  unavailable copy use the active brand when touched.
- Functional CSS and default theme CSS remain separate.

## Verification

Minimum checks for frontend whitelabel code:

```sh
./node_modules/.bin/tsc -p apps/frontend/tsconfig.json --noEmit
./node_modules/.bin/biome check <changed-files>
```

If Bun is available, prefer the repo scripts:

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend lint
bun test apps/frontend/test/brand-contract.test.tsx
```

If the build is relevant, run `bun run --cwd apps/frontend build`. Report local
tooling failures separately from product failures.
