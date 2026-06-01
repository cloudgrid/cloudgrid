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
  skillCapabilitiesResponseSchema,
  type SkillEditProposal,
  skillMergeRankRequestSchema,
  skillMergeRankResponseSchema,
  skillMetaMemoryRequestSchema,
  skillMetaMemoryResponseSchema,
  skillReflectRequestSchema,
  skillReflectResponseSchema,
  skillRuntimeDryRunRequestSchema,
  skillRuntimeDryRunResponseSchema,
  skillSlowUpdateRequestSchema,
  skillSlowUpdateResponseSchema,
} from "./contracts";

export interface HarnessAdapterServer {
  fetch(request: Request): Promise<Response>;
  capturedRequests(): CapturedHarnessRequest[];
}

export type HarnessAdapterFixtureMode =
  | "success"
  | "validation_failure"
  | "timeout"
  | "quick_shot"
  | "skill_text_edit";

export interface CapturedHarnessRequest {
  method: string;
  path: string;
  traceparent?: string | undefined;
  tracestate?: string | undefined;
  body: unknown;
}

export interface HarnessAdapterServerOptions {
  agents?: z.infer<typeof agentsResponseSchema>["agents"];
  captureRequests?: boolean;
  fixtureMode?: HarnessAdapterFixtureMode;
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
  const capturedRequests: CapturedHarnessRequest[] = [];
  const fixtureMode = options.fixtureMode ?? "success";
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
    capturedRequests(): CapturedHarnessRequest[] {
      return capturedRequests.map((captured) => ({
        ...captured,
        body: cloneJsonValue(captured.body),
      }));
    },
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

      if (request.method === "GET" && url.pathname === "/capabilities") {
        return json(capabilitiesResponse());
      }

      if (request.method === "POST" && url.pathname === "/v1/run") {
        return handleRun(request, otlp, {
          captureRequests: options.captureRequests === true,
          capturedRequests,
          fixtureMode,
        });
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
        return handleOptimize(request, otlp, fixtureMode);
      }

      if (request.method === "POST" && url.pathname === "/skill-runtime/dry-run") {
        return handleSkillRuntimeDryRun(request, fixtureMode);
      }

      if (request.method === "POST" && url.pathname === "/skill-optimization/reflect") {
        return handleSkillReflect(request, fixtureMode);
      }

      if (request.method === "POST" && url.pathname === "/skill-optimization/merge-rank") {
        return handleSkillMergeRank(request);
      }

      if (request.method === "POST" && url.pathname === "/skill-optimization/slow-update") {
        return handleSkillSlowUpdate(request);
      }

      if (request.method === "POST" && url.pathname === "/skill-optimization/meta-memory") {
        return handleSkillMetaMemory(request);
      }

      return json(problem("ERR-005", "METHOD_NOT_ALLOWED", 405, "Route is not supported"), 405);
    },
  };
}

function capabilitiesResponse(): z.infer<typeof skillCapabilitiesResponseSchema> {
  return skillCapabilitiesResponseSchema.parse({
    adapterVersion,
    supportedOptimizerKinds: ["bootstrap_fewshot", "critic_mutate_judge_pick", "skill_text_edit"],
    runtimeModes: ["managed_harness", "external_business_context"],
    evidenceFields: [
      "actualOutput",
      "metricResults",
      "importantSteps",
      "trajectorySummary",
      "traceRefs",
    ],
    traceExport: {
      supported: true,
      requiredForSkillOptimization: true,
    },
    editablePartKinds: ["skill"],
    packageFormats: ["agent_skill_package"],
    scriptExecution: {
      supported: false,
      modes: [],
    },
    limits: {
      maxPackageBytes: 262_144,
      maxSkillBytes: 65_536,
      maxEditProposals: 8,
      maxConcurrentCalls: 4,
    },
    editOps: ["append", "insert_after", "replace", "delete"],
    optimizerModelAliases: ["deterministic-skill-reflector"],
  });
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
      checkpointSupported: false,
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
          ? ["durable replay workspace is disabled for AI Eval v1"]
          : [],
    }),
  );
}

interface RunHandlerOptions {
  captureRequests: boolean;
  capturedRequests: CapturedHarnessRequest[];
  fixtureMode: HarnessAdapterFixtureMode;
}

async function handleRun(
  request: Request,
  otlp: OtlpConfig,
  options: RunHandlerOptions,
): Promise<Response> {
  const parsed = await parseJson(request, runRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const started = performance.now();
  const body = parsed.data;
  captureRequest(options, request, "/v1/run", body);

  if (options.fixtureMode === "validation_failure") {
    return json(
      problem(
        "ERR-AIE-010",
        "EVAL_OUTPUT_VALIDATION_FAILED",
        422,
        "Deterministic fixture produced output that violates the configured schema",
        false,
      ),
      422,
    );
  }

  if (options.fixtureMode === "timeout") {
    return json(
      problem(
        "ERR-AIE-011",
        "EVAL_ADAPTER_TIMEOUT",
        504,
        "Deterministic fixture simulated an adapter timeout",
        true,
      ),
      504,
    );
  }

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

async function handleOptimize(
  request: Request,
  otlp: OtlpConfig,
  fixtureMode: HarnessAdapterFixtureMode,
): Promise<Response> {
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
        ...(fixtureMode === "quick_shot"
          ? {
              retentionRole: "quick_shot",
              evaluatedSubset: true,
            }
          : {}),
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
        ...(fixtureMode === "quick_shot"
          ? {
              retentionRole: "quick_shot",
              evaluatedSubset: true,
            }
          : {}),
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

async function handleSkillRuntimeDryRun(
  request: Request,
  fixtureMode: HarnessAdapterFixtureMode,
): Promise<Response> {
  const parsed = await parseJson(request, skillRuntimeDryRunRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  const hasEntrypoint = body.skillPackage.files.some(
    (file) => file.path === body.skillPackage.entrypoint,
  );
  const failed = fixtureMode === "validation_failure" || !hasEntrypoint;
  const checks = [
    {
      id: "skill.entrypoint",
      status: hasEntrypoint ? "passed" : "failed",
      message: hasEntrypoint ? "SKILL.md is present in the package inventory" : "SKILL.md is missing",
    },
    {
      id: "skill.editable-globs",
      status: body.skillPackage.editableFileGlobs.length > 0 ? "passed" : "failed",
      message:
        body.skillPackage.editableFileGlobs.length > 0
          ? "Editable file globs are declared"
          : "At least one editable file glob is required",
    },
    {
      id: "runtime.trace-export",
      status: "passed",
      message: "Deterministic adapter preserves W3C trace context for skill runs",
    },
  ];

  return json(
    skillRuntimeDryRunResponseSchema.parse({
      optimizationRunId: body.optimizationRunId,
      ok: !failed,
      capabilityDigest: stableHash(
        "skill-capabilities",
        body.skillPackage.manifestDigest,
        body.runtimeMode,
      ),
      checks,
      warnings:
        body.runtimeMode === "external_business_context"
          ? ["deterministic fixture does not execute customer-owned tools"]
          : [],
    }),
    failed ? 422 : 200,
  );
}

async function handleSkillReflect(
  request: Request,
  fixtureMode: HarnessAdapterFixtureMode,
): Promise<Response> {
  const parsed = await parseJson(request, skillReflectRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  const proposals =
    fixtureMode === "timeout"
      ? []
      : deterministicSkillEditProposals(body.optimizationRunId, body.reflectionKind);

  if (fixtureMode === "timeout") {
    return json(
      problem(
        "ERR-AIE-011",
        "EVAL_ADAPTER_TIMEOUT",
        504,
        "Deterministic fixture simulated a skill optimizer timeout",
        true,
      ),
      504,
    );
  }

  return json(
    skillReflectResponseSchema.parse({
      optimizationRunId: body.optimizationRunId,
      stepId: body.stepId,
      proposals,
      summary: {
        fixtureMode,
        reflectionKind: body.reflectionKind,
        evidenceItems: body.evidence.length,
        proposalCount: proposals.length,
      },
    }),
  );
}

async function handleSkillMergeRank(request: Request): Promise<Response> {
  const parsed = await parseJson(request, skillMergeRankRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  const limit = body.editBudget ?? body.proposals.length;
  const rankedProposals = [...body.proposals]
    .sort((left, right) => {
      if (left.protectedFileViolation !== right.protectedFileViolation) {
        return left.protectedFileViolation ? 1 : -1;
      }
      return right.supportCount - left.supportCount;
    })
    .slice(0, limit);
  const rankedIds = new Set(rankedProposals.map((proposal) => proposal.id));

  return json(
    skillMergeRankResponseSchema.parse({
      optimizationRunId: body.optimizationRunId,
      stepId: body.stepId,
      rankedProposals,
      droppedProposalIds: body.proposals
        .filter((proposal) => !rankedIds.has(proposal.id))
        .map((proposal) => proposal.id),
      summary: {
        inputProposalCount: body.proposals.length,
        rankedProposalCount: rankedProposals.length,
      },
    }),
  );
}

async function handleSkillSlowUpdate(request: Request): Promise<Response> {
  const parsed = await parseJson(request, skillSlowUpdateRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  return json(
    skillSlowUpdateResponseSchema.parse({
      optimizationRunId: body.optimizationRunId,
      guidance: [
        `epoch ${body.epoch}: preserve successful behavior before adding new constraints`,
        "prefer edits that cite training evidence and leave protected files unchanged",
      ],
      protectedGuidance: true,
    }),
  );
}

async function handleSkillMetaMemory(request: Request): Promise<Response> {
  const parsed = await parseJson(request, skillMetaMemoryRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const body = parsed.data;
  return json(
    skillMetaMemoryResponseSchema.parse({
      optimizationRunId: body.optimizationRunId,
      memory: [
        ...body.currentMemory.slice(-4),
        {
          id: stableId("memory", body.optimizationRunId, String(body.currentMemory.length + 1)),
          kind: "rejected_edit_pattern",
          summary: "Do not edit protected runtime or dependency files.",
          acceptedProposalIds: body.acceptedProposalIds,
          rejectedProposalIds: body.rejectedProposalIds,
        },
      ],
    }),
  );
}

function deterministicSkillEditProposals(
  optimizationRunId: string,
  reflectionKind: "success" | "failure",
): SkillEditProposal[] {
  return [
    {
      id: stableId("skill-edit", optimizationRunId, "protected-runtime"),
      source: reflectionKind === "success" ? "success_reflection" : "failure_reflection",
      rationale: "Invalid fixture proposal that attempts to change a protected runtime script.",
      supportCount: 1,
      evidenceRefs: ["item-run:train-001"],
      edits: [
        {
          op: "replace",
          target: "skill_file",
          filePath: "scripts/run.sh",
          content: "#!/usr/bin/env bash\necho changed\n",
        },
      ],
      expectedValidity: "invalid_protected_file",
      protectedFileViolation: true,
    },
    {
      id: stableId("skill-edit", optimizationRunId, "skill-and-reference"),
      source: reflectionKind === "success" ? "success_reflection" : "failure_reflection",
      rationale:
        "Clarify escalation criteria in SKILL.md and add a reusable reference example for ambiguous requests.",
      supportCount: 3,
      evidenceRefs: ["item-run:train-001", "item-run:train-002", "trace:deterministic-skill-001"],
      edits: [
        {
          op: "append",
          target: "skill_file",
          filePath: "SKILL.md",
          content:
            "\n## Escalation Checks\nAsk for the missing account identifier when the request cannot be resolved from the provided context.\n",
        },
        {
          op: "append",
          target: "skill_file",
          filePath: "references/escalation.md",
          content:
            "\n- If the customer mentions billing impact without an account id, request the account id before proposing a fix.\n",
        },
      ],
      expectedValidity: "valid",
      protectedFileViolation: false,
    },
  ];
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

function captureRequest(
  options: RunHandlerOptions,
  request: Request,
  path: string,
  body: unknown,
): void {
  if (!options.captureRequests) {
    return;
  }
  options.capturedRequests.push({
    method: request.method,
    path,
    traceparent: request.headers.get("traceparent") ?? undefined,
    tracestate: request.headers.get("tracestate") ?? undefined,
    body: cloneJsonValue(body),
  });
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
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
