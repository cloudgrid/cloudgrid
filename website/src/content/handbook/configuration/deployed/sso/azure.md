---
title: "Azure Entra ID SSO"
description: "Azure Entra ID SSO uses OIDC authorization code flow with PKCE. The BFF validates the ID token and stores only a CloudGrid session cookie for the."
order: 11
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

Azure Entra ID SSO uses OIDC authorization code flow with PKCE. The BFF validates the ID token and stores only a CloudGrid session cookie for the browser.

## Environment Variables

```sh
CLOUDGRID_DEPLOYMENT_MODE=deployed
CLOUDGRID_AUTH_MODE=sso
CLOUDGRID_AUTH_PROVIDERS=azure
CLOUDGRID_AUTH_COMPANY_ID=acme
CLOUDGRID_AUTH_AZURE_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
CLOUDGRID_AUTH_AZURE_AUDIENCE='<expected-audience>'
CLOUDGRID_AUTH_AZURE_CLIENT_ID='<azure-app-client-id>'
CLOUDGRID_AUTH_AZURE_CLIENT_SECRET='<azure-app-client-secret>'
CLOUDGRID_AUTH_AZURE_REDIRECT_URI=https://cloudgrid.example.com/auth/callback
CLOUDGRID_SESSION_SECRET='<random-session-secret>'
```

`CLOUDGRID_AUTH_AZURE_AUDIENCE` defaults to the provider client ID when omitted by runtime configuration. Azure JWKS can be derived from the issuer; `CLOUDGRID_AUTH_AZURE_JWKS_URL` is an optional override when the runtime needs one.

## Callback URL

Configure the app registration redirect URI to:

```text
https://<your-cloudgrid-host>/auth/callback
```

For local SSO testing only:

```text
http://localhost:3000/auth/callback
```

## Validation Rules

Azure login must validate:

- issuer equals `CLOUDGRID_AUTH_AZURE_ISSUER`;
- audience matches `CLOUDGRID_AUTH_AZURE_AUDIENCE` or the configured client ID;
- signature validates against the Azure tenant JWKS;
- `exp`, `nbf`, and `iat` are valid with at most 60 seconds clock skew;
- `sub` is present;
- email is present and verified according to the configured provider behavior before accepting an invitation.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login button is missing | `azure` is not listed in `CLOUDGRID_AUTH_PROVIDERS`. |
| Login fails after callback | Issuer tenant ID, audience, client ID, or redirect URI is wrong. |
| User has no company access | The first-admin bootstrap already happened and this email has no pending invitation. |

## Next Step

Read [Invitations](/handbook/configuration/deployed/invitations) for membership behavior after SSO succeeds.
