#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const encoder = new TextEncoder();
const richFixtureBaseUnixNano = BigInt(Date.now() - 5 * 60 * 1000) * 1_000_000n;
const richFixtureRunId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

const fixtureDefinitions = [
  {
    fixtureSet: "contracts",
    signal: "traces",
    format: "json",
    contentType: "application/json",
    path: "fixtures/otlp/traces.json",
  },
  {
    fixtureSet: "contracts",
    signal: "logs",
    format: "json",
    contentType: "application/json",
    path: "fixtures/otlp/logs.json",
  },
  {
    fixtureSet: "contracts",
    signal: "metrics",
    format: "json",
    contentType: "application/json",
    path: "fixtures/otlp/metrics.json",
  },
  {
    fixtureSet: "generated",
    signal: "traces",
    format: "json",
    contentType: "application/json",
    generated: "rich-traces",
  },
  {
    fixtureSet: "generated",
    signal: "logs",
    format: "json",
    contentType: "application/json",
    generated: "rich-logs",
  },
  {
    fixtureSet: "generated",
    signal: "metrics",
    format: "json",
    contentType: "application/json",
    generated: "rich-metrics",
  },
  {
    fixtureSet: "contracts",
    signal: "traces",
    format: "protobuf",
    contentType: "application/x-protobuf",
    path: "fixtures/otlp/traces.pb",
  },
  {
    fixtureSet: "contracts",
    signal: "logs",
    format: "protobuf",
    contentType: "application/x-protobuf",
    path: "fixtures/otlp/logs.pb",
  },
];

const allowedSignals = new Set(["all", "traces", "logs", "metrics"]);
const allowedFormats = new Set(["all", "json", "protobuf"]);
const allowedFixtureSets = new Set(["generated", "contracts", "all"]);

export function parseSeedArgs(argv, env = process.env) {
  const options = {
    endpoint:
      env.CLOUDGRID_OTLP_ENDPOINT || `http://127.0.0.1:${env.CLOUDGRID_OTLP_PORT || "4318"}`,
    fixtureSet: "generated",
    format: "all",
    signal: "all",
    token: env.CLOUDGRID_OTLP_BEARER_TOKEN || env.CLOUDGRID_OTLP_TOKEN || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--endpoint") {
      options.endpoint = requiredValue(arg, next);
      index += 1;
    } else if (arg === "--token") {
      options.token = requiredValue(arg, next);
      index += 1;
    } else if (arg === "--signal") {
      options.signal = requiredValue(arg, next);
      index += 1;
    } else if (arg === "--format") {
      options.format = requiredValue(arg, next);
      index += 1;
    } else if (arg === "--fixture-set") {
      options.fixtureSet = requiredValue(arg, next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!allowedSignals.has(options.signal)) {
    throw new Error("--signal must be one of all, traces, logs, metrics");
  }
  if (!allowedFormats.has(options.format)) {
    throw new Error("--format must be one of all, json, protobuf");
  }
  if (!allowedFixtureSets.has(options.fixtureSet)) {
    throw new Error("--fixture-set must be one of generated, contracts, all");
  }
  return options;
}

export function buildFixtureRequests({
  endpoint,
  fixtureSet = "generated",
  format,
  signal,
  token,
}) {
  const base = endpoint.replace(/\/+$/, "");
  return fixtureDefinitions
    .filter((fixture) => fixtureSet === "all" || fixture.fixtureSet === fixtureSet)
    .filter((fixture) => signal === "all" || fixture.signal === signal)
    .filter((fixture) => format === "all" || fixture.format === format)
    .map((fixture) => ({
      ...fixture,
      authorization: token ? `Bearer ${token}` : null,
      filePath: fixture.path ? resolve(repoRoot, fixture.path) : null,
      url: `${base}/v1/${fixture.signal}`,
    }));
}

export async function responseErrorMessage({ method, response, url }) {
  const body = await response.text();
  const suffix = body.trim() ? `: ${body.trim()}` : "";
  return `${method} ${url} failed with ${response.status} ${response.statusText}${suffix}`;
}

export async function postFixture(request, fetchImpl = fetch) {
  const body = await fixtureBody(request);
  const headers = { "content-type": request.contentType };
  if (request.authorization) {
    headers.authorization = request.authorization;
  }
  const response = await fetchImpl(request.url, { method: "POST", headers, body });
  if (!response.ok) {
    throw new Error(await responseErrorMessage({ method: "POST", response, url: request.url }));
  }
  return {
    bytes: body.byteLength,
    contentType: request.contentType,
    signal: request.signal,
    url: request.url,
  };
}

async function fixtureBody(request) {
  if (request.generated) {
    return encoder.encode(JSON.stringify(generatedFixture(request.generated)));
  }
  return readFile(request.filePath);
}

export function generatedFixture(name) {
  if (name === "rich-traces") {
    return buildRichTraceFixture();
  }
  if (name === "rich-logs") {
    return buildRichLogFixture();
  }
  if (name === "rich-metrics") {
    return buildRichMetricFixture();
  }
  throw new Error(`Unknown generated fixture: ${name}`);
}

function buildRichTraceFixture() {
  const spansByService = groupBy(generatedTraceSpans(), (span) => span.serviceName);
  return {
    resourceSpans: Array.from(spansByService.entries()).map(([serviceName, serviceSpans]) => ({
      resource: {
        attributes: [
          stringAttribute("service.name", serviceName),
          stringAttribute("deployment.environment", "local"),
          stringAttribute("deployment.release", "2026.05-dev"),
          stringAttribute("cloud.provider", "local"),
        ],
      },
      scopeSpans: [
        {
          scope: { name: "cloudgrid-dev-seed", version: "1.0.0" },
          spans: serviceSpans.map(
            ({
              serviceName: _serviceName,
              scenarioSlug: _scenarioSlug,
              operation: _operation,
              logMessage: _logMessage,
              logSeverity: _logSeverity,
              ...span
            }) => span,
          ),
        },
      ],
    })),
  };
}

function buildRichLogFixture() {
  const logRecords = generatedTraceSpans()
    .filter((span, index) => span.logMessage || span.status?.code === 2 || index % 5 === 0)
    .map((span, logIndex) => {
      const error = span.status?.code === 2;
      return {
        timeUnixNano: String(BigInt(span.startTimeUnixNano) + 4_000_000n),
        observedTimeUnixNano: String(BigInt(span.startTimeUnixNano) + 5_000_000n),
        severityNumber: error ? 17 : span.logSeverity === "WARN" ? 13 : 9,
        severityText: error ? "ERROR" : (span.logSeverity ?? "INFO"),
        traceId: span.traceId,
        spanId: span.spanId,
        body: { stringValue: span.logMessage ?? `${span.serviceName} completed ${span.operation}` },
        attributes: [
          stringAttribute("service.name", span.serviceName),
          stringAttribute("cloudgrid.seed.scenario", span.scenarioSlug),
          stringAttribute("cloudgrid.seed.operation", span.operation),
          intAttribute("cloudgrid.seed.log_index", logIndex),
        ],
      };
    });
  const logsByService = groupBy(
    logRecords,
    (log) =>
      log.attributes.find((attribute) => attribute.key === "service.name")?.value.stringValue ??
      "app",
  );
  return {
    resourceLogs: Array.from(logsByService.entries()).map(([serviceName, records]) => ({
      resource: {
        attributes: [
          stringAttribute("service.name", serviceName),
          stringAttribute("deployment.environment", "local"),
        ],
      },
      scopeLogs: [{ scope: { name: "cloudgrid-dev-seed", version: "1.0.0" }, logRecords: records }],
    })),
  };
}

function buildRichMetricFixture() {
  const base = richFixtureBaseUnixNano;
  const serviceNames = services();
  const metrics = [
    {
      name: "http.server.request.duration",
      description: "HTTP server request duration across seeded services",
      unit: "ms",
      histogram: {
        aggregationTemporality: 2,
        dataPoints: serviceNames.map((serviceName, index) => ({
          attributes: [
            stringAttribute("service.name", serviceName),
            stringAttribute("http.route", routeForService(serviceName, index)),
          ],
          startTimeUnixNano: String(base),
          timeUnixNano: String(base + 3_000_000_000n + BigInt(index) * 20_000_000n),
          count: "12",
          sum: 180 + index * 42,
          bucketCounts: ["2", "7", "3"],
          explicitBounds: [50, 250],
        })),
      },
    },
    {
      name: "cloudgrid.ingest.batch.size",
      description: "Telemetry batch size observed by local development services",
      unit: "{item}",
      gauge: {
        dataPoints: serviceNames.map((serviceName, index) => ({
          attributes: [stringAttribute("service.name", serviceName)],
          timeUnixNano: String(base + 4_000_000_000n + BigInt(index) * 10_000_000n),
          asInt: String(12 + index * 3),
        })),
      },
    },
    {
      name: "gen_ai.client.token.usage",
      description: "Model token usage emitted by assistant workflows",
      unit: "{token}",
      sum: {
        aggregationTemporality: 2,
        isMonotonic: false,
        dataPoints: ["assistant-api", "llm-proxy", "retrieval"].flatMap((serviceName, index) =>
          ["input", "output"].map((tokenType, tokenIndex) => ({
            attributes: [
              stringAttribute("service.name", serviceName),
              stringAttribute(
                "gen_ai.request.model",
                index === 1 ? "gpt-5.2" : "text-embedding-3-large",
              ),
              stringAttribute("gen_ai.token.type", tokenType),
            ],
            startTimeUnixNano: String(base),
            timeUnixNano: String(
              base + 5_000_000_000n + BigInt(index * 2 + tokenIndex) * 10_000_000n,
            ),
            asInt: String(tokenType === "input" ? 820 + index * 130 : 240 + index * 90),
          })),
        ),
      },
    },
  ];
  return {
    resourceMetrics: [
      {
        resource: { attributes: [stringAttribute("service.name", "cloudgrid-dev-seed")] },
        scopeMetrics: [{ scope: { name: "cloudgrid-dev-seed", version: "1.0.0" }, metrics }],
      },
    ],
  };
}

function generatedTraceSpans() {
  return scenarios().flatMap((scenario, traceIndex) => {
    const traceId = idBytes(traceIdHex(traceIndex));
    return scenario.spans.map((definition, spanIndex) => {
      const start =
        richFixtureBaseUnixNano +
        BigInt(traceIndex) * 7_000_000_000n +
        BigInt(definition.offsetMs) * 1_000_000n;
      const duration = BigInt(definition.durationMs) * 1_000_000n;
      const error = definition.status === "error";
      return {
        traceId,
        spanId: spanId(traceIndex, spanIndex),
        ...(definition.parent == null
          ? {}
          : { parentSpanId: spanId(traceIndex, definition.parent) }),
        serviceName: definition.service,
        name: definition.name,
        operation: definition.operation ?? definition.name,
        scenarioSlug: scenario.slug,
        kind: definition.kind ?? (definition.parent == null ? 2 : 3),
        startTimeUnixNano: String(start),
        endTimeUnixNano: String(start + duration),
        status: { code: error ? 2 : 1 },
        attributes: spanAttributes(scenario, definition),
        events: spanEvents(start, scenario, definition),
        links:
          definition.linkPrevious && traceIndex > 0
            ? [
                {
                  traceId: idBytes(traceIdHex(traceIndex - 1)),
                  spanId: spanId(traceIndex - 1, 0),
                  attributes: [stringAttribute("link.reason", "user-session-continuation")],
                },
              ]
            : [],
        logMessage: definition.logMessage,
        logSeverity: definition.logSeverity,
      };
    });
  });
}

function scenarios() {
  return [
    {
      slug: "checkout-payment-declined",
      route: "POST /api/checkout",
      customerTier: "business",
      spans: [
        step("gateway", "POST /api/checkout", null, 0, 930, {
          kind: 2,
          logMessage: "Checkout request accepted for cart cart_8f21",
        }),
        step("identity", "validate session", 0, 8, 42, { operation: "auth.session.validate" }),
        step("checkout-api", "load cart", 0, 58, 90, { operation: "cart.load" }),
        step("checkout-api", "calculate totals", 2, 154, 64, { operation: "cart.price" }),
        step("tax-service", "estimate taxes", 3, 214, 48, { operation: "tax.estimate" }),
        step("inventory", "reserve items", 2, 278, 135, {
          operation: "inventory.reserve",
          logMessage: "Reserved 3 SKUs for cart cart_8f21",
        }),
        step("fraud", "score payment risk", 3, 432, 78, { operation: "fraud.score" }),
        step("payments", "authorize card", 6, 528, 310, {
          operation: "payment.authorize",
          status: "error",
          logMessage: "Card authorization declined by issuer",
        }),
        step("checkout-api", "release reservation", 7, 852, 76, {
          operation: "inventory.release",
          logSeverity: "WARN",
          logMessage: "Inventory reservation released after payment decline",
        }),
        step("audit-log", "record failed checkout", 7, 910, 32, {
          operation: "audit.checkout_failed",
        }),
        step("notifications", "send payment declined email", 7, 950, 86, {
          operation: "email.payment_declined",
        }),
        step("gateway", "write response", 0, 1075, 24, { operation: "http.response" }),
      ],
    },
    {
      slug: "assistant-answer-with-retrieval",
      route: "POST /api/assistant/runs",
      customerTier: "enterprise",
      spans: [
        step("gateway", "POST /api/assistant/runs", null, 0, 1480, {
          kind: 2,
          logMessage: "Assistant run started for workspace ws_alpha",
        }),
        step("identity", "authorize workspace", 0, 9, 44, { operation: "authz.workspace" }),
        step("assistant-api", "load conversation", 0, 68, 72, { operation: "conversation.load" }),
        step("retrieval", "embed query", 2, 162, 118, { operation: "gen_ai.embed" }),
        step("vector-db", "search knowledge base", 3, 305, 156, { operation: "vector.search" }),
        step("retrieval", "rerank documents", 4, 474, 86, { operation: "retrieval.rerank" }),
        step("assistant-api", "build prompt", 5, 585, 61, { operation: "prompt.render" }),
        step("policy", "check safety policy", 6, 668, 74, { operation: "policy.evaluate" }),
        step("llm-proxy", "chat completion", 7, 770, 640, {
          operation: "gen_ai.chat",
          logMessage: "Model completed answer with 3 retrieved citations",
        }),
        step("tools", "lookup account status", 8, 1128, 146, { operation: "tool.account_lookup" }),
        step("assistant-api", "store assistant message", 8, 1430, 84, {
          operation: "message.persist",
        }),
        step("usage-meter", "record token usage", 8, 1518, 53, { operation: "usage.record" }),
        step("gateway", "stream final chunk", 0, 1605, 42, { operation: "http.stream.finish" }),
      ],
    },
    {
      slug: "order-confirmation",
      route: "POST /api/orders/{id}/confirm",
      customerTier: "business",
      spans: [
        step("gateway", "POST /api/orders/{id}/confirm", null, 0, 820, { kind: 2 }),
        step("orders-api", "load order", 0, 15, 58, { operation: "order.load" }),
        step("orders-api", "validate state transition", 1, 88, 35, {
          operation: "order.validate_state",
        }),
        step("pricing", "recalculate discount", 2, 132, 42, { operation: "discount.recalculate" }),
        step("payments", "capture authorization", 3, 190, 190, { operation: "payment.capture" }),
        step("warehouse", "create fulfillment request", 3, 405, 145, {
          operation: "fulfillment.create",
          logMessage: "Fulfillment request wh_901 queued",
        }),
        step("invoice", "create invoice", 4, 575, 75, { operation: "invoice.create" }),
        step("events", "publish order confirmed", 5, 670, 64, { operation: "event.publish" }),
        step("notifications", "send confirmation", 7, 742, 102, {
          operation: "email.order_confirmed",
        }),
        step("audit-log", "record order confirmation", 7, 808, 38, {
          operation: "audit.order_confirmed",
        }),
        step("orders-api", "persist order status", 3, 858, 55, { operation: "order.persist" }),
      ],
    },
    {
      slug: "dashboard-summary-refresh",
      route: "GET /api/dashboards/summary",
      customerTier: "internal",
      spans: [
        step("bff", "GET /api/dashboards/summary", null, 0, 640, {
          kind: 2,
          logMessage: "Dashboard summary requested for project default",
        }),
        step("control-plane", "resolve selected project", 0, 8, 70, {
          operation: "project.resolve",
        }),
        step("control-plane", "load pinned dashboards", 1, 38, 40, {
          operation: "dashboard_pins.list",
        }),
        step("storage-read", "load dashboard telemetry", 0, 92, 448, {
          operation: "telemetry.dashboard.load",
        }),
        step("storage-read", "query trace overview", 3, 108, 118, { operation: "trace.overview" }),
        step("storage-read", "query log volume", 3, 232, 92, { operation: "log.volume" }),
        step("storage-read", "query metric names", 3, 342, 105, { operation: "metric.names" }),
        step("cache", "read dashboard cache", 3, 462, 34, { operation: "cache.get" }),
        step("bff", "compose dashboard model", 3, 505, 54, { operation: "graphql.compose" }),
        step("gateway", "return dashboard payload", 0, 578, 26, { operation: "http.response" }),
      ],
    },
    {
      slug: "webhook-retry",
      route: "POST /api/webhooks/stripe",
      customerTier: "startup",
      spans: [
        step("gateway", "POST /api/webhooks/stripe", null, 0, 680, { kind: 2, linkPrevious: true }),
        step("webhooks", "verify signature", 0, 7, 52, { operation: "webhook.verify" }),
        step("webhooks", "deduplicate event", 1, 58, 47, { operation: "webhook.deduplicate" }),
        step("billing", "load subscription", 2, 116, 70, { operation: "subscription.load" }),
        step("billing", "sync invoice state", 3, 212, 160, {
          operation: "invoice.sync",
          logMessage: "Stripe invoice in_582 marked paid",
        }),
        step("events", "publish billing updated", 4, 398, 52, { operation: "event.publish" }),
        step("crm-sync", "update account health", 5, 472, 210, {
          operation: "crm.account_update",
          logSeverity: "WARN",
          logMessage: "CRM sync retried after transient timeout",
        }),
        step("audit-log", "record webhook delivery", 5, 610, 42, { operation: "audit.webhook" }),
        step("webhooks", "acknowledge webhook", 2, 650, 31, { operation: "http.ack" }),
      ],
    },
  ];
}

function services() {
  return [
    "gateway",
    "identity",
    "checkout-api",
    "inventory",
    "payments",
    "assistant-api",
    "retrieval",
    "llm-proxy",
    "storage-read",
    "bff",
  ];
}

function step(service, name, parent, offsetMs, durationMs, options = {}) {
  return { service, name, parent, offsetMs, durationMs, ...options };
}

function spanAttributes(scenario, definition) {
  const attrs = [
    stringAttribute("service.name", definition.service),
    stringAttribute("http.route", scenario.route),
    stringAttribute("cloudgrid.seed.scenario", scenario.slug),
    stringAttribute("cloudgrid.customer.tier", scenario.customerTier),
    stringAttribute("cloudgrid.operation", definition.operation ?? definition.name),
  ];
  if (definition.operation?.startsWith("gen_ai.")) {
    attrs.push(stringAttribute("gen_ai.request.model", "gpt-5.2"));
  }
  if (definition.status === "error") {
    attrs.push(stringAttribute("error.type", "payment_declined"));
  }
  return attrs;
}

function spanEvents(start, scenario, definition) {
  const events = [
    {
      timeUnixNano: String(start + 3_000_000n),
      name: "checkpoint",
      attributes: [
        stringAttribute("cloudgrid.seed.scenario", scenario.slug),
        stringAttribute("cloudgrid.operation", definition.operation ?? definition.name),
      ],
    },
  ];
  if (definition.status === "error") {
    events.push({
      timeUnixNano: String(start + 7_000_000n),
      name: "exception",
      attributes: [
        stringAttribute("exception.type", "PaymentAuthorizationDeclined"),
        stringAttribute("exception.message", "Issuer declined authorization request"),
      ],
    });
  }
  return events;
}

function routeForService(serviceName, index) {
  const routes = {
    gateway: "/api/checkout",
    "checkout-api": "/api/checkout",
    payments: "/api/payments/authorize",
    inventory: "/api/inventory/reservations",
    "assistant-api": "/api/assistant/runs",
    "llm-proxy": "/v1/chat/completions",
    "storage-read": "/graphql",
    bff: "/graphql",
  };
  return (
    routes[serviceName] ?? (index % 2 === 0 ? "/api/orders/{id}/confirm" : "/api/webhooks/stripe")
  );
}

function traceIdHex(traceIndex) {
  return createHash("sha256")
    .update(`cloudgrid-dev-seed:${richFixtureRunId}:trace:${traceIndex}`)
    .digest("hex")
    .slice(0, 32);
}

function stringAttribute(key, value) {
  return { key, value: { stringValue: value } };
}

function intAttribute(key, value) {
  return { key, value: { intValue: String(value) } };
}

function spanId(traceIndex, spanIndex) {
  return idBytes(
    createHash("sha256")
      .update(`cloudgrid-dev-seed:${richFixtureRunId}:span:${traceIndex}:${spanIndex}`)
      .digest("hex")
      .slice(0, 16),
  );
}

function idBytes(hex) {
  return Buffer.from(hex, "hex").toString("base64");
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

async function main() {
  const options = parseSeedArgs(Bun.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  const requests = buildFixtureRequests(options);
  if (requests.length === 0) {
    throw new Error("No fixtures matched the requested signal and format.");
  }

  console.log(`Sending ${requests.length} OTLP fixture request(s) to ${options.endpoint}`);
  for (const request of requests) {
    const result = await postFixture(request);
    console.log(
      `  ${result.signal.padEnd(7)} ${result.contentType.padEnd(28)} ${result.bytes} bytes`,
    );
  }
  console.log("Done. Refresh CloudGrid traces, logs, and metrics for the selected project.");
}

function requiredValue(arg, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function helpText() {
  return `Usage: bun run dev:seed [--endpoint URL] [--token TOKEN] [--signal all|traces|logs|metrics] [--format all|json|protobuf] [--fixture-set generated|contracts|all]

Posts generated realistic development telemetry to the CloudGrid OTLP HTTP collector.

Options:
  --fixture-set generated   Default. Rich, current-time demo traces, logs, and metrics for UI development.
  --fixture-set contracts   Checked-in JSON/protobuf fixtures for collector contract coverage.
  --fixture-set all         Generated demo data plus checked-in contract fixtures.

Environment:
  CLOUDGRID_OTLP_ENDPOINT       Collector base URL. Defaults to http://127.0.0.1:4318.
  CLOUDGRID_OTLP_PORT           Used for the default endpoint when set.
  CLOUDGRID_OTLP_BEARER_TOKEN   Optional bearer token for local project-token mode.
  CLOUDGRID_OTLP_TOKEN          Fallback optional bearer token.
`;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
