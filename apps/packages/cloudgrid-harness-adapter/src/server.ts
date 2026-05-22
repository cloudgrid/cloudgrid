import type { z } from "zod";
import {
  agentsResponseSchema,
  deterministicScorerDefinitionSchema,
  healthResponseSchema,
  optimizeEventSchema,
  optimizeRequestSchema,
  type ProblemDetails,
  problemDetailsSchema,
  runRequestSchema,
  runResponseSchema,
  sandboxLifecycleRequestSchema,
  sandboxLifecycleResponseSchema,
  scoreRequestSchema,
  scoreResponseSchema,
} from "./contracts";

export interface HarnessAdapterServer {
  fetch(request: Request): Promise<Response>;
}

export interface HarnessAdapterServerOptions {
  agents?: z.infer<typeof agentsResponseSchema>["agents"];
  otlp?: {
    endpoint?: string;
    fetch?: (request: Request) => Promise<Response>;
  };
}

interface OtlpConfig {
  endpoint?: string | undefined;
  fetch: (request: Request) => Promise<Response>;
}

const adapterVersion = "1.0.0";
const jsonHeaders = { "content-type": "application/json" };
const ndjsonHeaders = { "content-type": "application/x-ndjson" };
const serviceName = "cloudgrid-harness-adapter";

export function createHarnessAdapterServer(
  options: HarnessAdapterServerOptions = {},
): HarnessAdapterServer {
  const otlp = {
    endpoint: options.otlp?.endpoint ?? Bun.env.CLOUDGRID_HARNESS_ADAPTER_OTLP_ENDPOINT,
    fetch: options.otlp?.fetch ?? ((request: Request) => fetch(request)),
  };
  const agents =
    options.agents ??
    agentsResponseSchema.parse({
      agents: [
        {
          id: "agent-local",
          name: "Local deterministic echo agent",
          solverRef: { kind: "agent", id: "agent-local" },
        },
      ],
    }).agents;

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/healthz") {
        return json(
          healthResponseSchema.parse({
            ok: true,
            service: "cloudgrid-harness-adapter",
            version: adapterVersion,
          }),
        );
      }

      if (request.method === "GET" && url.pathname === "/v1/agents") {
        return json(
          agentsResponseSchema.parse({
            agents,
          }),
        );
      }

      if (request.method === "POST" && url.pathname === "/v1/run") {
        return handleRun(request, otlp);
      }

      if (
        request.method === "POST" &&
        [
          "/v1/sandboxes/start",
          "/v1/sandboxes/pause",
          "/v1/sandboxes/resume",
          "/v1/sandboxes/abort",
          "/v1/sandboxes/cleanup",
        ].includes(url.pathname)
      ) {
        return handleSandboxLifecycle(request, url.pathname);
      }

      if (request.method === "POST" && url.pathname === "/v1/score") {
        return handleScore(request, otlp);
      }

      if (request.method === "POST" && url.pathname === "/v1/optimize") {
        return handleOptimize(request, otlp);
      }

      return json(problem("ERR-005", "METHOD_NOT_ALLOWED", 405, "Route is not supported"), 405);
    },
  };
}

async function handleSandboxLifecycle(request: Request, path: string): Promise<Response> {
  const parsed = await parseJson(request, sandboxLifecycleRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  const action = path.split("/").at(-1) ?? "start";
  const sandboxRef =
    body.sandboxRef ??
    stableId(
      "sandbox",
      body.experimentRunId,
      body.datasetItemId ?? body.scorerId ?? body.candidateId ?? body.attemptId ?? action,
    );

  return json(
    sandboxLifecycleResponseSchema.parse({
      sandboxRef,
      sandboxProfile: body.sandboxProfile,
      checkpointSupported: body.sandboxProfile === "durable_replay_workspace",
      ...(body.sandboxProfile === "durable_replay_workspace"
        ? { checkpointRef: body.checkpointRef ?? stableId("checkpoint", sandboxRef) }
        : {}),
      cleanupRequired: action !== "cleanup",
      cleanupDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...(action === "cleanup"
        ? {
            cleanupSummary: {
              status: "acknowledged",
              retryable: false,
              deletedBytes: 0,
              deletedFiles: 0,
            },
          }
        : {}),
      warnings:
        body.sandboxProfile === "durable_replay_workspace"
          ? ["durable replay workspace is a future profile in the local scaffold"]
          : [],
    }),
  );
}

async function handleRun(request: Request, otlp: OtlpConfig): Promise<Response> {
  const parsed = await parseJson(request, runRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const started = performance.now();
  const body = parsed.data;
  const response = runResponseSchema.parse({
    experimentRunId: body.experimentRunId,
    datasetItemId: body.datasetItemId,
    harnessRunId: stableId("harness", body.experimentRunId, body.datasetItemId),
    output: body.input,
    latencyMs: Math.max(0, performance.now() - started),
    tokenTotals: {},
  });

  await emitOtlpSpan(
    otlp,
    "cloudgrid.harness_adapter.run",
    traceContextFromRequest(request, body.traceContext),
    {
      "cloudgrid.experiment_run_id": body.experimentRunId,
      "cloudgrid.dataset_item_id": body.datasetItemId,
    },
  );

  return json(response);
}

async function handleScore(request: Request, otlp: OtlpConfig): Promise<Response> {
  const parsed = await parseJson(request, scoreRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  if (body.scorer.kind !== "deterministic") {
    return json(
      problem(
        "ERR-AIE-003",
        "EVAL_HARNESS_UNREACHABLE",
        503,
        "No provider-backed scorer is configured in the offline adapter scaffold",
        true,
      ),
      503,
    );
  }

  const definition = deterministicScorerDefinitionSchema.safeParse(body.scorer.definition);
  if (!definition.success) {
    return json(validationProblem(definition.error), 400);
  }

  const outputText = stringifyScoringValue(body.target.output);
  const passed = evaluateDeterministicDefinition(definition.data, outputText);
  const response = scoreResponseSchema.parse({
    scorerId: body.scorer.id,
    scorerVersion: body.scorer.version,
    targetKind: body.target.kind,
    targetId: body.target.id,
    experimentRunId: body.target.experimentRunId,
    score: passed ? 1 : 0,
    passed,
    evidence: {
      type: definition.data.type,
      matched: passed,
    },
    producedAt: new Date(0).toISOString(),
  });

  await emitOtlpSpan(
    otlp,
    "cloudgrid.harness_adapter.score",
    traceContextFromRequest(request, body.traceContext),
    {
      "cloudgrid.scorer_id": body.scorer.id,
      "cloudgrid.target_kind": body.target.kind,
      "cloudgrid.target_id": body.target.id,
    },
  );

  return json(response);
}

async function handleOptimize(request: Request, otlp: OtlpConfig): Promise<Response> {
  const parsed = await parseJson(request, optimizeRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  const maxCandidatesValue = body.config?.maxCandidates;
  const maxCandidates =
    typeof maxCandidatesValue === "number" && Number.isInteger(maxCandidatesValue)
      ? Math.max(1, Math.min(maxCandidatesValue, 10))
      : 1;

  const events = Array.from({ length: maxCandidates }, (_, index) => {
    const candidateNumber = index + 1;
    return optimizeEventSchema.parse({
      type: "candidate",
      experimentRunId: body.experimentRunId,
      promptVersion: {
        id: stableId("prompt", body.experimentRunId, String(candidateNumber)),
        name: `${body.basePromptVersion.name} candidate ${candidateNumber}`,
        text: `${body.basePromptVersion.text}\n\nCandidate ${candidateNumber}.`,
        hash: stableHash(body.basePromptVersion.hash, body.optimizerKind, String(candidateNumber)),
        createdAt: new Date(0).toISOString(),
        metadata: {
          optimizerKind: body.optimizerKind,
          basePromptVersionId: body.basePromptVersion.id,
          candidateNumber,
        },
      },
      summary: {
        candidateNumber,
        optimizerKind: body.optimizerKind,
      },
    });
  });

  events.push(
    optimizeEventSchema.parse({
      type: "summary",
      experimentRunId: body.experimentRunId,
      summary: {
        candidateCount: maxCandidates,
        optimizerKind: body.optimizerKind,
      },
    }),
  );

  await emitOtlpSpan(
    otlp,
    "cloudgrid.harness_adapter.optimize",
    traceContextFromRequest(request, body.traceContext),
    {
      "cloudgrid.experiment_run_id": body.experimentRunId,
      "cloudgrid.experiment_id": body.experimentId,
      "cloudgrid.optimizer_kind": body.optimizerKind,
    },
  );

  return new Response(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    status: 200,
    headers: ndjsonHeaders,
  });
}

async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ success: true; data: z.infer<T> } | { success: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      success: false,
      response: json(
        problem("ERR-002", "UNSUPPORTED_MEDIA_TYPE", 415, "Expected application/json"),
        415,
      ),
    };
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return {
      success: false,
      response: json(problem("ERR-001", "VALIDATION_FAILED", 400, "Request JSON is invalid"), 400),
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      response: json(validationProblem(parsed.error), 400),
    };
  }

  return { success: true, data: parsed.data };
}

function evaluateDeterministicDefinition(
  definition: z.infer<typeof deterministicScorerDefinitionSchema>,
  outputText: string,
): boolean {
  if (definition.type === "contains") {
    if (definition.caseSensitive) {
      return outputText.includes(definition.value);
    }
    return outputText.toLocaleLowerCase().includes(definition.value.toLocaleLowerCase());
  }

  return new RegExp(definition.pattern, definition.flags).test(outputText);
}

function stringifyScoringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

async function emitOtlpSpan(
  otlp: OtlpConfig,
  name: string,
  traceContext: TraceContext,
  attributes: Record<string, string>,
): Promise<void> {
  if (!otlp.endpoint) {
    return;
  }

  const startedAt = Date.now() * 1_000_000;
  const endedAt = startedAt + 1_000_000;
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "service.version", value: { stringValue: adapterVersion } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "@cloudgrid/harness-adapter" },
            spans: [
              {
                traceId: traceContext.traceId,
                spanId: randomHex(8),
                parentSpanId: traceContext.parentSpanId,
                traceState: traceContext.tracestate,
                name,
                kind: 2,
                startTimeUnixNano: String(startedAt),
                endTimeUnixNano: String(endedAt),
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: { stringValue: value },
                })),
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    await otlp.fetch(
      new Request(otlp.endpoint, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      }),
    );
  } catch {
    // Harness execution must not fail only because telemetry export is temporarily unavailable.
  }
}

interface TraceContext {
  traceId: string;
  parentSpanId: string;
  tracestate?: string | undefined;
}

interface BodyTraceContext {
  traceparent?: string | undefined;
  tracestate?: string | undefined;
}

function traceContextFromRequest(
  request: Request,
  bodyTraceContext?: BodyTraceContext,
): TraceContext {
  const traceparent = bodyTraceContext?.traceparent ?? request.headers.get("traceparent") ?? "";
  const parsed = parseTraceparent(traceparent);
  return {
    traceId: parsed?.traceId ?? randomHex(16),
    parentSpanId: parsed?.parentSpanId ?? randomHex(8),
    tracestate: bodyTraceContext?.tracestate ?? request.headers.get("tracestate") ?? undefined,
  };
}

function parseTraceparent(traceparent: string): TraceContext | null {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(traceparent.trim());
  if (!match) {
    return null;
  }
  return {
    traceId: match[1]?.toLowerCase() ?? randomHex(16),
    parentSpanId: match[2]?.toLowerCase() ?? randomHex(8),
  };
}

function validationProblem(error: z.ZodError): ProblemDetails {
  return problemDetailsSchema.parse(
    problem("ERR-001", "VALIDATION_FAILED", 400, "Request validation failed", false, {
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }),
  );
}

function problem(
  id: string,
  code: string,
  status: number,
  detail: string,
  retryable = false,
  details?: Record<string, unknown>,
): ProblemDetails {
  const input: ProblemDetails = {
    type: `https://cloudgrid.dev/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title: code,
    status,
    detail,
    id,
    code,
    retryable,
  };
  if (details) {
    input.details = details;
  }
  return problemDetailsSchema.parse(input);
}

function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${parts.join("-")}`;
}

function stableHash(...parts: string[]): string {
  let hash = 0;
  for (const char of parts.join(":")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `sha256:${hash.toString(16).padStart(8, "0")}`;
}

function randomHex(byteLength: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
