# CloudGrid Whitelabel Customization Contract

This reference is the complete whitelabel requirement set for agents. It must be
usable even when repository specs are not available.

## Product Goal

CloudGrid can be licensed as a whitelabel product. A customer can brand it as
their own observability product or SaaS while still upgrading to newer
CloudGrid releases with low migration effort.

The customization boundary must be stable, small, typed, and separate from
CloudGrid core.

## What Customers Can Customize

Customers may provide a brand module with:

- `id`: lowercase, build-stable identifier used for diagnostics and
  `data-brand`.
- `productName`: full visible product name.
- `shortName`: compact name for narrow placements.
- `homeUrl`: optional public product URL.
- `mark`: React component for the product mark/logo. It must render without
  network fetches and remain legible at 14px, 16px, 24px, and 32px.
- `pageTitle(pageTitle?)`: document title formatter.
- `theme.radius.base`: base radius token.
- `theme.typography.sans`: complete CSS font-family value for interface text.
- `theme.typography.mono`: complete CSS font-family value for code, IDs, and
  telemetry values.
- `theme.color.light`: complete semantic token set for light mode.
- `theme.color.dark`: complete semantic token set for dark mode.

Partial token overrides are not allowed. Missing tokens must fail typecheck.

## Required Semantic Color Tokens

Every light and dark token set must include:

- `background`
- `foreground`
- `card`
- `cardForeground`
- `popover`
- `popoverForeground`
- `primary`
- `primaryForeground`
- `secondary`
- `secondaryForeground`
- `muted`
- `mutedForeground`
- `accent`
- `accentForeground`
- `destructive`
- `border`
- `input`
- `ring`
- `chart1`
- `chart2`
- `chart3`
- `chart4`
- `chart5`
- `info`
- `success`
- `warning`
- `error`
- `trace`
- `sidebar`
- `sidebarForeground`
- `sidebarPrimary`
- `sidebarPrimaryForeground`
- `sidebarAccent`
- `sidebarAccentForeground`
- `sidebarBorder`
- `sidebarRing`

## Module Boundary

CloudGrid core owns:

- `apps/frontend/src/brand/brand-contract.ts`
- `apps/frontend/src/providers/brand-provider.tsx`
- route components
- shared UI primitives
- generated contracts
- BFF/backend services
- storage services
- telemetry semantics
- auth/session behavior
- dashboard, AI Chat, and AI Eval behavior

The customer owns only:

- an external `brand` module satisfying `ProductBrand`
- static assets referenced by that module or deployment packaging

The build chooses the customer brand module through:

```text
CLOUDGRID_FRONTEND_BRAND_MODULE=/absolute/or/relative/path/to/customer-brand.tsx
```

The Vite alias `@cloudgrid/brand` must resolve to either the default CloudGrid
brand or that customer module.

## CSS Boundary

Split CSS into two concepts:

- Functional CSS: Tailwind imports, shadcn imports, base element rules, layout
  mechanics, focus behavior, accessibility behavior, and token-to-Tailwind
  mapping. This stays in core.
- Theme CSS: official CloudGrid fallback/default token values. Customer values
  are applied by the active brand module/provider and do not require route CSS
  edits.

Core route and feature code must consume Tailwind semantic tokens. It must not
know whether the active values are CloudGrid values or customer values.

## Product Identity Placements

When touched, these surfaces must use `useBrand()` or an equivalent shared brand
component:

- Global topbar product identity/home link.
- Mobile navigation sheet title.
- Login header identity.
- Login product preview identity.
- Document title.
- Backend-unavailable title/description when the product name appears.
- Any future visible product-name placement.

Use translation placeholders for product-name copy:

```ts
t("auth.login.title", { productName })
```

Do not call `t("app.name")` for new visible identity placements unless the
translation layer is explicitly connected to the active brand.

## What Must Not Be Added

Do not add any of these for whitelabeling:

- GraphQL fields or mutations for branding.
- NATS subjects for branding.
- database records for branding.
- frontend settings pages for branding.
- organization/project brand settings.
- localStorage as product identity truth.
- backend environment variables that inject CSS strings or product names into
  the frontend at runtime.
- route-specific customer forks.
- compatibility layers that preserve old brand APIs.

## Safe CloudGrid Hard-Coded Names

Hard-coded `CloudGrid` is allowed only for:

- package names such as `@cloudgrid/*`
- repository names
- Go module paths
- class/type names such as `CloudGridGraphQLError`
- internal diagnostics that explicitly identify the upstream product
- docs that explicitly explain CloudGrid
- default brand definitions and default brand tests

Visible user-facing product identity should use the active brand.

## Example Customer Brand Shape

```tsx
import { Grid3X3 } from "lucide-react";
import type { ProductBrand } from "./path/to/brand-contract";

function CustomerMark({ className }: { className?: string }) {
  return <Grid3X3 aria-hidden className={className} />;
}

export const brand = {
  id: "acme-observe",
  productName: "Acme Observe",
  shortName: "Observe",
  homeUrl: "https://observe.example.com",
  mark: CustomerMark,
  pageTitle: (pageTitle?: string) =>
    pageTitle ? `${pageTitle} - Acme Observe` : "Acme Observe",
  theme: {
    radius: { base: "0.5rem" },
    typography: {
      sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    },
    color: {
      light: {
        // Must include every semantic token listed above.
      },
      dark: {
        // Must include every semantic token listed above.
      },
    },
  },
} satisfies ProductBrand;
```

## Review Checklist

Reject or revise the implementation if any answer is "no":

- Can a customer replace the brand without editing route components?
- Does typecheck fail if a required token is missing?
- Does the default CloudGrid brand still render without configuration?
- Is there no in-product brand settings UI?
- Are telemetry colors still semantic/data-meaning colors?
- Are functional CSS and theme values still separate?
- Are all touched visible identity placements using the active brand?
- Did the change avoid GraphQL, NATS, database, auth, and telemetry behavior?
