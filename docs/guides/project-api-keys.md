# Project API Keys

Project API keys are ingest credentials for services that send telemetry into one project.

The public setup copy may call them API keys, but at the runtime boundary they are bearer credentials with ingest scopes.

## Where They Live

Project API keys are managed from project settings:

```text
/projects/:projectId/settings/ingest
```

The control-plane service stores metadata and a one-way hash. The full secret is returned only once when the key is created.

## GraphQL Operations

| Operation | Purpose |
| --- | --- |
| `Query.ingestCredentials(projectId)` | List key metadata for the selected project. |
| `Mutation.createIngestCredential(input: { projectId, title })` | Create a key and return the full secret once. |
| `Mutation.revokeIngestCredential(id)` | Revoke one key. |

There is no rotate mutation in v1. Rotation is create a new key, deploy it to emitters, then revoke the old key.

## Create A Key

Example GraphQL shape:

```graphql
mutation CreateKey($input: CreateIngestCredentialInput!) {
  createIngestCredential(input: $input) {
    credential {
      id
      title
      secretPreview
      createdAt
    }
    secret
  }
}
```

Example variables:

```json
{
  "input": {
    "projectId": "default",
    "title": "checkout-api local exporter"
  }
}
```

Store `secret` in your service secret store immediately. CloudGrid will not show it again.

## Use A Key

HTTP exporters:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.cloudgrid.example.com
export CLOUDGRID_PROJECT_API_KEY='cgk_...'
```

For raw requests:

```sh
curl -sS -H 'content-type: application/json' \
  -H "authorization: Bearer ${CLOUDGRID_PROJECT_API_KEY}" \
  --data @fixtures/otlp/traces.json \
  https://otlp.cloudgrid.example.com/v1/traces
```

## Revoke A Key

Revocation is idempotent. Revoked keys remain listed with `revokedAt` for audit.

```graphql
mutation RevokeKey($id: ID!) {
  revokeIngestCredential(id: $id) {
    id
    title
    revokedAt
  }
}
```

## Security Rules

- Secret values are never stored in plaintext.
- Secret values are never returned by list, revoke, viewer, project, dashboard, telemetry, or error responses.
- Dashboard definitions must not store keys or bearer tokens.
- Secret-like widget fields such as `authorization`, `token`, `secret`, or `password` are rejected.

## Next Step

Configure services with [Ingest OTLP](./ingest-otlp.md).
