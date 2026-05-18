---
title: "Google SSO"
description: "Google SSO uses OIDC authorization code flow with PKCE. The BFF validates ID-token issuer, audience, signature, expiry, nonce, and state."
order: 10
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

Google SSO uses OIDC authorization code flow with PKCE. The BFF validates ID-token issuer, audience, signature, expiry, nonce, and state.

## Environment Variables

```sh
CLOUDGRID_DEPLOYMENT_MODE=deployed
CLOUDGRID_AUTH_MODE=sso
CLOUDGRID_AUTH_PROVIDERS=google
CLOUDGRID_AUTH_COMPANY_ID=acme
CLOUDGRID_AUTH_GOOGLE_ISSUER=https://accounts.google.com
CLOUDGRID_AUTH_GOOGLE_AUDIENCE='<expected-audience>'
CLOUDGRID_AUTH_GOOGLE_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs
CLOUDGRID_AUTH_GOOGLE_CLIENT_ID='<google-client-id>'
CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET='<google-client-secret>'
CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI=https://cloudgrid.example.com/auth/callback
CLOUDGRID_SESSION_SECRET='<random-session-secret>'
```

`CLOUDGRID_AUTH_GOOGLE_AUDIENCE` defaults to the provider client ID when omitted by runtime configuration. Keep it explicit in deployed environments.

## Callback URL

Configure the Google OAuth client redirect URI to:

```text
https://<your-cloudgrid-host>/auth/callback
```

For local SSO testing only:

```text
http://localhost:3000/auth/callback
```

## Validation Rules

Google OIDC login must validate:

- issuer equals `CLOUDGRID_AUTH_GOOGLE_ISSUER`;
- audience matches `CLOUDGRID_AUTH_GOOGLE_AUDIENCE` or the configured client ID;
- signature validates against the JWKS endpoint;
- `exp`, `nbf`, and `iat` are valid with at most 60 seconds clock skew;
- `sub` is present;
- email is verified before accepting an invitation.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login button is missing | `google` is not listed in `CLOUDGRID_AUTH_PROVIDERS`. |
| Token validation fails | Issuer, audience, JWKS URL, or redirect URI does not match provider configuration. |
| Invitation does not accept | The Google profile email is missing, unverified, or does not match the pending invitation. |

## Next Step

Read [Invitations](/handbook/configuration/deployed/invitations) before adding users to a deployed company.
