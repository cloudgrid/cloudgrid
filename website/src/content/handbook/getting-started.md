---
title: Getting started
description: Run CloudGrid in one command and send your first OTLP trace.
sidebar: Getting started
order: 1
accent: emerald
eyebrow: Handbook · Getting started
updated: 2026-05-17
---

The all-in-one image runs the OTLP collector, NATS, SurrealDB, storage
services, BFF, and UI. Point an OpenTelemetry SDK at port `4318` and refresh
the UI on port `3000`.

## Run it

Save this as `docker-compose.yaml`:

```yaml
services:
  cloudgrid:
    image: cloudgrid/all-in-one:latest
    ports:
      - "4318:4318"   # OTLP HTTP ingest
      - "4317:4317"   # OTLP gRPC ingest
      - "3000:3000"   # UI + GraphQL
    environment:
      CLOUDGRID_DEPLOYMENT_MODE: local
      CLOUDGRID_AUTH_MODE: local
```

Then start the stack:

```sh
docker compose up
```

You should see:

```text
✓ NATS JetStream ready on :4222
✓ SurrealDB ready on :8000
✓ storage-write subscribed
✓ storage-read subscribed
✓ otlp-collector listening on :4318 and :4317
✓ BFF + UI listening on :3000
```

Open <http://localhost:3000>.

## Send your first trace

Any OpenTelemetry SDK works. Point its OTLP HTTP exporter at
`http://localhost:4318`. Within three seconds, the trace appears in
`/traces`.

### Example: TypeScript

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  }),
});

sdk.start();
```

### Example: Go

```go
import (
    "context"

    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func newTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
    exp, err := otlptracehttp.New(ctx,
        otlptracehttp.WithEndpoint("localhost:4318"),
        otlptracehttp.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }
    return sdktrace.NewTracerProvider(sdktrace.WithBatcher(exp)), nil
}
```

## What now

1. Walk the UI at <http://localhost:3000> — local mode auto-creates the
   Personal project.
2. Read the [Architecture page](/handbook/architecture) to understand the
   message bridge.
3. Read the [Deployment page](/handbook/deployment) when you're ready to
   move beyond a laptop.
4. Read the [Configuration page](/handbook/configuration) for SSO and
   project setup.

## What CloudGrid accepts

OTLP HTTP on `4318` and OTLP/gRPC on `4317` for traces, logs, and metrics.
JSON and protobuf encodings. No CloudGrid-specific SDK exists, and that is
intentional — your existing OpenTelemetry pipeline is the SDK.
