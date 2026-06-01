export type StandardTraceFixtureKind =
  | "otel-genai"
  | "otel-mcp"
  | "openinference"
  | "standard-business-failure"
  | "explicit-cloudgrid-flavor";

export interface StandardSpanFixture {
  id: string;
  traceId: string;
  parentSpanId?: string | undefined;
  name: string;
  startedAt: string;
  status?: "ok" | "error" | undefined;
  attributes: Record<string, unknown>;
  events?: readonly StandardSpanEventFixture[] | undefined;
}

export interface StandardSpanEventFixture {
  name: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

export interface StandardTraceFixture {
  id: string;
  kind: StandardTraceFixtureKind;
  description: string;
  traceparent: string;
  rootSpanId: string;
  spans: readonly StandardSpanFixture[];
  expectedEvidence: {
    stepKinds: readonly AiEvalEvidenceStepKind[];
    excludedFromOptimizerReflection?: boolean | undefined;
  };
}

export type AiEvalEvidenceStepKind = "model_call" | "tool_call" | "retrieval" | "workflow_step";

export interface AiEvalEvidenceStepFixture {
  kind: AiEvalEvidenceStepKind;
  name: string;
  status: "ok" | "error";
  spanRef: {
    kind: "span";
    traceId: string;
    spanId: string;
  };
  inputPreview?: string | undefined;
  outputPreview?: string | undefined;
}

export interface AiEvalTraceEvidenceFixture {
  importantSteps: readonly AiEvalEvidenceStepFixture[];
  trajectorySummary: string;
  summaryEvidenceRefs: readonly AiEvalEvidenceStepFixture["spanRef"][];
}

export interface ExternalAdapterAsyncTraceLinkFixture {
  id: string;
  description: string;
  startResponse: {
    status: "accepted";
    pollingUrl: string;
    traceId: string;
    rootSpanId: string;
  };
  terminalResponse: {
    status: "completed";
    actualOutputRef: string;
    actualOutputType: "json";
    traceRefs: readonly { kind: "trace"; traceId: string; spanId: string }[];
  };
  emittedTraceFixtureId: string;
  expectedRunPolicy: {
    requiresTrajectoryEvidence: true;
    missingTraceEvidenceProblemCode: "trace_evidence_missing";
  };
}

const baseStartedAt = "2026-05-31T10:00:00.000Z";

export const aiEvalStandardTraceFixtures = [
  {
    id: "external-adapter.otel-genai.chat",
    kind: "otel-genai",
    description: "External adapter emits an OTel GenAI chat span linked by W3C trace context.",
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1111111111111111-01",
    rootSpanId: "root-genai",
    spans: [
      rootSpan("root-genai", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "adapter.run", baseStartedAt),
      childSpan("llm-genai", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "root-genai", "gen_ai.chat", {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "gpt-4.1-mini",
        "gen_ai.prompt": { text: "Classify a refund request", api_key: "secret-test-key" },
        "gen_ai.completion": { category: "billing" },
      }),
    ],
    expectedEvidence: { stepKinds: ["model_call"] },
  },
  {
    id: "external-adapter.otel-mcp.tool",
    kind: "otel-mcp",
    description: "External adapter emits an OTel MCP tool call using standard MCP attributes.",
    traceparent: "00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2222222222222222-01",
    rootSpanId: "root-mcp",
    spans: [
      rootSpan("root-mcp", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "adapter.run", baseStartedAt),
      childSpan("tool-mcp", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "root-mcp", "mcp.tools.call", {
        "mcp.method.name": "tools/call",
        "gen_ai.tool.name": "crm.lookup",
        "tool.input": { customerId: "cust_123" },
        "tool.result": "customer found",
      }),
    ],
    expectedEvidence: { stepKinds: ["tool_call"] },
  },
  {
    id: "external-adapter.openinference.tool-retriever",
    kind: "openinference",
    description: "External adapter emits OpenInference tool and retriever spans.",
    traceparent: "00-cccccccccccccccccccccccccccccccc-3333333333333333-01",
    rootSpanId: "root-oi",
    spans: [
      rootSpan("root-oi", "cccccccccccccccccccccccccccccccc", "adapter.run", baseStartedAt),
      childSpan("oi-tool", "cccccccccccccccccccccccccccccccc", "root-oi", "ticket.create", {
        "openinference.span.kind": "TOOL",
        "tool.name": "ticket.create",
        "tool.parameters": { category: "billing" },
      }),
      childSpan("oi-retriever", "cccccccccccccccccccccccccccccccc", "root-oi", "kb.search", {
        "openinference.span.kind": "RETRIEVER",
        "retrieval.source": "refund-policy-kb",
      }),
    ],
    expectedEvidence: { stepKinds: ["tool_call", "retrieval"] },
  },
  {
    id: "external-adapter.standard-failures.http-db-exception",
    kind: "standard-business-failure",
    description:
      "External adapter emits ordinary production HTTP, DB, and exception failure spans as optimizer evidence.",
    traceparent: "00-dddddddddddddddddddddddddddddddd-4444444444444444-01",
    rootSpanId: "root-standard",
    spans: [
      rootSpan("root-standard", "dddddddddddddddddddddddddddddddd", "adapter.run", baseStartedAt),
      errorChildSpan("http-failure", "dddddddddddddddddddddddddddddddd", "root-standard", "POST /checkout", {
        "http.request.method": "POST",
        "http.route": "/checkout",
        "error.type": "500",
      }),
      errorChildSpan("db-failure", "dddddddddddddddddddddddddddddddd", "root-standard", "SELECT invoices", {
        "db.system": "postgresql",
        "db.operation.name": "SELECT",
        "db.statement": "SELECT * FROM invoices WHERE token=super-secret-token",
      }),
      {
        ...errorChildSpan(
          "exception-failure",
          "dddddddddddddddddddddddddddddddd",
          "root-standard",
          "handler",
          {},
        ),
        events: [
          {
            name: "exception",
            timestamp: "2026-05-31T10:00:00.300Z",
            attributes: {
              "exception.type": "ValueError",
              "exception.message": "bad input",
            },
          },
        ],
      },
    ],
    expectedEvidence: { stepKinds: ["workflow_step", "workflow_step", "workflow_step"] },
  },
  {
    id: "external-adapter.explicit-cloudgrid-flavor",
    kind: "explicit-cloudgrid-flavor",
    description:
      "Fixture intentionally emits the legacy CloudGrid source flavor attribute to prove assertions allow only explicit cases.",
    traceparent: "00-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-5555555555555555-01",
    rootSpanId: "root-explicit",
    spans: [
      childSpan("explicit-flavor", "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "root-explicit", "explicit", {
        "openinference.span.kind": "LLM",
        "llm.model_name": "fixture-model",
        "cloudgrid.ai.semconv.flavor": "openinference",
      }),
    ],
    expectedEvidence: { stepKinds: ["model_call"] },
  },
  {
    id: "external-adapter.missing-trace-evidence",
    kind: "standard-business-failure",
    description:
      "Terminal adapter output exists, but no linked standard evidence spans arrive before the trace wait window closes.",
    traceparent: "00-ffffffffffffffffffffffffffffffff-6666666666666666-01",
    rootSpanId: "root-missing",
    spans: [],
    expectedEvidence: {
      stepKinds: [],
      excludedFromOptimizerReflection: true,
    },
  },
] as const satisfies readonly StandardTraceFixture[];

export const aiEvalExternalAdapterAsyncTraceLinkFixture = {
  id: "external-adapter.async-completion.trace-link",
  description:
    "Async external adapter returns an accepted response, completes with an output ref, and emits OTLP spans linked by W3C trace context.",
  startResponse: {
    status: "accepted",
    pollingUrl: "https://adapter.example/runs/run-async-1",
    traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rootSpanId: "root-genai",
  },
  terminalResponse: {
    status: "completed",
    actualOutputRef: "artifact://adapter-output/run-async-1.json",
    actualOutputType: "json",
    traceRefs: [{ kind: "trace", traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", spanId: "root-genai" }],
  },
  emittedTraceFixtureId: "external-adapter.otel-genai.chat",
  expectedRunPolicy: {
    requiresTrajectoryEvidence: true,
    missingTraceEvidenceProblemCode: "trace_evidence_missing",
  },
} as const satisfies ExternalAdapterAsyncTraceLinkFixture;

export function buildAiEvalTraceEvidenceFixture(
  trace: StandardTraceFixture,
): AiEvalTraceEvidenceFixture {
  const importantSteps = trace.spans
    .map((span) => evidenceStepFromSpan(span, trace.rootSpanId))
    .filter((step): step is AiEvalEvidenceStepFixture => step !== null);

  return {
    importantSteps,
    trajectorySummary:
      importantSteps.length === 0
        ? ""
        : `${importantSteps.length} important steps: ${importantSteps
            .map((step) => `${step.kind} ${step.name} ${step.status}`)
            .join("; ")}.`,
    summaryEvidenceRefs: importantSteps.map((step) => step.spanRef),
  };
}

export function traceFixtureIdsWithUnexpectedCloudGridFlavor(): readonly string[] {
  return aiEvalStandardTraceFixtures
    .filter((trace) => trace.kind !== "explicit-cloudgrid-flavor")
    .filter((trace) =>
      trace.spans.some((span) => Object.hasOwn(span.attributes, "cloudgrid.ai.semconv.flavor")),
    )
    .map((trace) => trace.id);
}

export function missingTraceEvidenceExclusionFixture() {
  const trace = aiEvalStandardTraceFixtures.find(
    (fixture) => fixture.id === "external-adapter.missing-trace-evidence",
  );
  if (!trace) {
    throw new Error("missing trace evidence fixture is absent");
  }
  return {
    problemCode:
      aiEvalExternalAdapterAsyncTraceLinkFixture.expectedRunPolicy.missingTraceEvidenceProblemCode,
    excludedFromOptimizerReflection:
      trace.expectedEvidence.excludedFromOptimizerReflection === true &&
      buildAiEvalTraceEvidenceFixture(trace).importantSteps.length === 0,
  };
}

function evidenceStepFromSpan(
  span: StandardSpanFixture,
  rootSpanId: string,
): AiEvalEvidenceStepFixture | null {
  const attrs = span.attributes;
  const operation = stringAttr(attrs, "gen_ai.operation.name").toLowerCase();
  const openInferenceKind = stringAttr(attrs, "openinference.span.kind").toUpperCase();
  let kind: AiEvalEvidenceStepKind | null = null;
  let name = "";

  if (
    ["chat", "text_completion", "generate_content", "embeddings"].includes(operation) ||
    openInferenceKind === "LLM" ||
    openInferenceKind === "EMBEDDING"
  ) {
    kind = "model_call";
    name = firstNonEmpty(
      stringAttr(attrs, "gen_ai.request.model"),
      stringAttr(attrs, "gen_ai.response.model"),
      stringAttr(attrs, "gen_ai.model.name"),
      stringAttr(attrs, "llm.model_name"),
      span.name,
    );
  } else if (operation === "execute_tool" || isMcpSpan(attrs) || openInferenceKind === "TOOL") {
    kind = "tool_call";
    name = firstNonEmpty(
      stringAttr(attrs, "gen_ai.tool.name"),
      stringAttr(attrs, "tool.name"),
      stringAttr(attrs, "mcp.method.name"),
      span.name,
    );
  } else if (openInferenceKind === "RETRIEVER") {
    kind = "retrieval";
    name = firstNonEmpty(
      stringAttr(attrs, "retrieval.source"),
      stringAttr(attrs, "retrieval.name"),
      span.name,
    );
  } else if (span.parentSpanId === rootSpanId && isStandardFailureSpan(span)) {
    kind = "workflow_step";
    name = standardFailureName(span);
  }

  if (!kind) {
    return null;
  }

  return {
    kind,
    name: boundedPreview(name),
    status: span.status === "error" ? "error" : "ok",
    spanRef: { kind: "span", traceId: span.traceId, spanId: span.id },
    inputPreview: previewFromAttributes(span, [
      "gen_ai.prompt",
      "gen_ai.input.messages",
      "input.value",
      "tool.parameters",
      "tool.input",
      "db.statement",
      "http.request.body",
    ]),
    outputPreview: previewFromAttributes(span, [
      "gen_ai.completion",
      "gen_ai.output.messages",
      "output.value",
      "tool.result",
      "tool.output",
      "http.response.body",
      "exception.message",
      "exception.type",
      "error.type",
    ]),
  };
}

function rootSpan(
  id: string,
  traceId: string,
  name: string,
  startedAt: string,
): StandardSpanFixture {
  return { id, traceId, name, startedAt, attributes: {} };
}

function childSpan(
  id: string,
  traceId: string,
  parentSpanId: string,
  name: string,
  attributes: Record<string, unknown>,
): StandardSpanFixture {
  return { id, traceId, parentSpanId, name, startedAt: baseStartedAt, attributes };
}

function errorChildSpan(
  id: string,
  traceId: string,
  parentSpanId: string,
  name: string,
  attributes: Record<string, unknown>,
): StandardSpanFixture {
  return { ...childSpan(id, traceId, parentSpanId, name, attributes), status: "error" };
}

function isMcpSpan(attrs: Record<string, unknown>) {
  return firstNonEmpty(
    stringAttr(attrs, "mcp.method.name"),
    stringAttr(attrs, "gen_ai.tool.name"),
    stringAttr(attrs, "gen_ai.prompt.name"),
  );
}

function isStandardFailureSpan(span: StandardSpanFixture) {
  if (span.status !== "error") {
    return false;
  }
  return (
    Boolean(
      firstNonEmpty(
        stringAttr(span.attributes, "http.request.method"),
        stringAttr(span.attributes, "http.method"),
        stringAttr(span.attributes, "rpc.system"),
        stringAttr(span.attributes, "rpc.method"),
        stringAttr(span.attributes, "db.system"),
        stringAttr(span.attributes, "db.operation.name"),
        stringAttr(span.attributes, "db.operation"),
        stringAttr(span.attributes, "db.statement"),
        stringAttr(span.attributes, "messaging.system"),
        stringAttr(span.attributes, "messaging.operation.name"),
        stringAttr(span.attributes, "messaging.operation"),
        stringAttr(span.attributes, "file.path"),
        stringAttr(span.attributes, "file.name"),
        stringAttr(span.attributes, "file.operation"),
        stringAttr(span.attributes, "exception.type"),
        stringAttr(span.attributes, "error.type"),
      ),
    ) || exceptionEvents(span).length > 0
  );
}

function standardFailureName(span: StandardSpanFixture) {
  const attrs = span.attributes;
  if (stringAttr(attrs, "http.request.method") || stringAttr(attrs, "http.method")) {
    return `HTTP ${firstNonEmpty(
      stringAttr(attrs, "http.request.method"),
      stringAttr(attrs, "http.method"),
    )} ${firstNonEmpty(
      stringAttr(attrs, "http.route"),
      stringAttr(attrs, "url.path"),
      stringAttr(attrs, "http.target"),
      stringAttr(attrs, "url.full"),
    )}`.trim();
  }
  if (
    stringAttr(attrs, "db.system") ||
    stringAttr(attrs, "db.operation.name") ||
    stringAttr(attrs, "db.operation") ||
    stringAttr(attrs, "db.statement")
  ) {
    return `DB ${firstNonEmpty(
      stringAttr(attrs, "db.operation.name"),
      stringAttr(attrs, "db.operation"),
      stringAttr(attrs, "db.collection.name"),
      stringAttr(attrs, "db.sql.table"),
      stringAttr(attrs, "db.system"),
      span.name,
    )}`.trim();
  }
  const exceptionType = firstNonEmpty(
    ...exceptionEvents(span).map((event) => stringAttr(event.attributes, "exception.type")),
    stringAttr(attrs, "exception.type"),
    stringAttr(attrs, "error.type"),
  );
  return firstNonEmpty(exceptionType, span.name);
}

function exceptionEvents(span: StandardSpanFixture) {
  return (span.events ?? []).filter(
    (event) =>
      event.name === "exception" ||
      Object.hasOwn(event.attributes, "exception.type") ||
      Object.hasOwn(event.attributes, "exception.message"),
  );
}

function previewFromAttributes(span: StandardSpanFixture, keys: readonly string[]) {
  for (const key of keys) {
    if (Object.hasOwn(span.attributes, key)) {
      return boundedPreview(span.attributes[key]);
    }
  }
  for (const event of span.events ?? []) {
    for (const key of keys) {
      if (Object.hasOwn(event.attributes, key)) {
        return boundedPreview(event.attributes[key]);
      }
    }
  }
  return undefined;
}

function boundedPreview(value: unknown) {
  const text = redactSecrets(typeof value === "string" ? value : JSON.stringify(value));
  return text.length > 2000 ? text.slice(0, 2000) : text;
}

function redactSecrets(value: string | undefined) {
  return (value ?? "")
    .replace(/secret[-_\w]*["']?\s*[:=]\s*["']?[^"',}\s]+/gi, "secret=[redacted]")
    .replace(/token[-_\w]*["']?\s*[:=]\s*["']?[^"',}\s]+/gi, "token=[redacted]")
    .replace(/api_key["']?\s*:\s*["'][^"']+["']/gi, 'api_key":"[redacted]"');
}

function stringAttr(attrs: Record<string, unknown>, key: string) {
  const value = attrs[key];
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values: readonly string[]) {
  return values.find((value) => value.trim() !== "") ?? "";
}
