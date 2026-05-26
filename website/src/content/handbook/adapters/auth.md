---
title: Auth provider adapter
description: Add a new OIDC/OAuth provider for BFF-managed sessions.
order: 3
accent: rose
eyebrow: Handbook - Architecture - Extension boundaries
updated: 2026-05-21
---

Auth providers feed BFF-managed sessions. The provider port is
OIDC/OAuth-shaped: it accepts a code, returns identity claims, and signals
refresh semantics. v1 adapters cover GitHub, Google, and Microsoft Entra
ID.

## What a provider adapter must do

- Return the canonical identity claims the control plane expects.
- Stay **inside the BFF process** — provider tokens never leave the server.
- Avoid storing additional state in the browser.
- Keep browser SSO settings separate from collector service-token validation.
  The OTLP collector uses `CLOUDGRID_AUTH_ISSUER`,
  `CLOUDGRID_AUTH_AUDIENCE`, and `CLOUDGRID_AUTH_JWKS_URL` for ingest bearer
  tokens in deployed SSO mode; it must not infer project access from browser
  provider profile claims.

## Provider port

```ts
interface AuthProvider {
  readonly id: "github" | "google" | "azure" | (string & {});
  readonly displayName: string;

  authorizeUrl(state: string, nonce: string): URL;
  exchangeCode(code: string): Promise<{
    claims: IdentityClaims;
    refresh?: RefreshHint;
  }>;
}
```

## Identity claims

```ts
interface IdentityClaims {
  subject: string;        // stable per-provider user id
  email: string;          // verified email
  emailVerified: true;
  name?: string;
  picture?: string;
}
```

## Session model

The BFF exchanges the provider code, mints a session row in the control
plane, and issues an **HttpOnly cookie** to the browser. The cookie is
opaque — it does not contain provider tokens. Provider tokens stay
server-side.
