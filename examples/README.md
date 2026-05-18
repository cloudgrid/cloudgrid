# CloudGrid Examples

These examples are starting points for local development and operator validation. They are not production deployment manifests.

## Contents

| Path | Purpose |
| --- | --- |
| `otel-collector/local-http.yaml` | OpenTelemetry Collector pipeline that exports traces, logs, and metrics to CloudGrid OTLP/HTTP. |
| `otel-collector/local-grpc.yaml` | OpenTelemetry Collector pipeline that exports traces, logs, and metrics to CloudGrid OTLP/gRPC. |
| `graphql/observability.graphql` | Trace, log, metric, live trace, retention, and alert GraphQL operations. |
| `graphql/ai-eval.graphql` | Dataset, scorer, experiment, import/export, and project AI settings operations. |
| `dashboard/project-overview.json` | Typed dashboard payload matching `SaveDashboardInput`. |
| `ai-eval/datasets/qa-smoke.jsonl` | Minimal dataset import file for AI eval smoke testing. |

Run CloudGrid locally first:

```sh
cp .env.example .env
docker compose --env-file .env up -d nats surrealdb
bun run dev:all
```

Then point instrumented services or an OpenTelemetry Collector at `http://localhost:4318` for OTLP/HTTP or `http://localhost:4317` for OTLP/gRPC. In deployed mode, send the project API key as a bearer token.
