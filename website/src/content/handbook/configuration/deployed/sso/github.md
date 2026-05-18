---
title: "GitHub SSO"
description: "GitHub SSO uses a GitHub OAuth App web flow. The BFF exchanges the authorization code and calls GitHub user/email APIs server-side. Provider tokens."
order: 9
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

GitHub SSO uses a GitHub OAuth App web flow. The BFF exchanges the authorization code and calls GitHub user/email APIs server-side. Provider tokens never reach the frontend.

## Environment Variables

```sh
CLOUDGRID_DEPLOYMENT_MODE=deployed
CLOUDGRID_AUTH_MODE=sso
CLOUDGRID_AUTH_PROVIDERS=github
CLOUDGRID_AUTH_COMPANY_ID=acme
CLOUDGRID_AUTH_GITHUB_CLIENT_ID='<github-oauth-client-id>'
CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET='<github-oauth-client-secret>'
CLOUDGRID_AUTH_GITHUB_REDIRECT_URI=https://cloudgrid.example.com/auth/callback
CLOUDGRID_SESSION_SECRET='<random-session-secret>'
```

If you enable multiple providers, include `github` in the comma-separated provider list:

```sh
CLOUDGRID_AUTH_PROVIDERS=github,google,azure
```

## Callback URL

Configure the GitHub OAuth App callback to match:

```text
https://<your-cloudgrid-host>/auth/callback
```

For local SSO testing only, use the BFF callback URL:

```text
http://localhost:3000/auth/callback
```

Default verification commands must not depend on real GitHub credentials.

## Identity Mapping

The BFF normalizes the GitHub identity into CloudGrid user fields:

- provider subject becomes the CloudGrid principal ID source;
- display name comes from the provider profile where available;
- email must be available and verified for invitation acceptance.

Company and project access is resolved through control-plane membership, not trusted directly from GitHub profile claims.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login button is missing | `github` is not listed in `CLOUDGRID_AUTH_PROVIDERS`. |
| Callback fails at startup | Required GitHub env vars are missing or redirect URI is malformed. |
| Login succeeds but no company appears | The company already has an admin and this email has no pending invitation. |
| Invitation does not accept | The provider did not return a matching verified email. |

## Next Step

Read [Invitations](/handbook/configuration/deployed/invitations) to understand post-login access.
