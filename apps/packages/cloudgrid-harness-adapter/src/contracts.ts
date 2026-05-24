import { z } from "zod";

export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const evalRunPolicySchema = z
  .object({
    maxParallelRequests: z.number().int().min(1),
  })
  .catchall(z.unknown());

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  id: z.string(),
  code: z.string(),
  retryable: z.boolean(),
  details: jsonObjectSchema.optional(),
});

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("cloudgrid-harness-adapter"),
  version: z.string(),
});

export const solverRefSchema = z.object({ kind: z.string() }).catchall(z.unknown());

export const traceContextSchema = z
  .object({
    traceparent: z.string().optional(),
    tracestate: z.string().optional(),
  })
  .catchall(z.string());

export const sandboxProfileSchema = z.enum([
  "ephemeral_eval_item",
  "ephemeral_optimization_candidate",
  "durable_replay_workspace",
]);

export const sandboxLifecycleRequestSchema = z.object({
  experimentRunId: z.string().min(1),
  datasetItemId: z.string().min(1).optional(),
  scorerId: z.string().min(1).optional(),
  candidateId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  manifestDigest: z.string().min(1),
  providerProfileRefs: z.array(z.string().min(1)).default([]),
  sandboxProfile: sandboxProfileSchema,
  sandboxRef: z.string().min(1).optional(),
  checkpointRef: z.string().min(1).optional(),
  runPolicy: evalRunPolicySchema.optional(),
  cleanupRetry: jsonObjectSchema.optional(),
  traceContext: traceContextSchema.optional(),
});

export const sandboxLifecycleResponseSchema = z.object({
  sandboxRef: z.string().min(1),
  sandboxProfile: sandboxProfileSchema,
  checkpointSupported: z.boolean(),
  checkpointRef: z.string().min(1).optional(),
  cleanupRequired: z.boolean(),
  cleanupDeadline: z.string().datetime().optional(),
  cleanupSummary: jsonObjectSchema.optional(),
  warnings: z.array(z.string()).default([]),
});

export const runRequestSchema = z.object({
  experimentRunId: z.string().min(1),
  datasetItemId: z.string().min(1),
  manifestDigest: z.string().min(1).optional(),
  providerProfileRefs: z.array(z.string().min(1)).default([]),
  runPolicy: evalRunPolicySchema.optional(),
  sandboxRef: z.string().min(1).optional(),
  sandboxProfile: sandboxProfileSchema.optional(),
  solverRef: solverRefSchema,
  input: z.unknown(),
  expected: z.unknown().optional(),
  metadata: jsonObjectSchema.optional(),
  traceContext: traceContextSchema.optional(),
});

export const runResponseSchema = z.object({
  experimentRunId: z.string().min(1),
  datasetItemId: z.string().min(1),
  harnessRunId: z.string().min(1),
  output: z.unknown(),
  latencyMs: z.number().min(0),
  tokenTotals: z.record(z.string(), z.number().int().min(0)).optional(),
});

export const deterministicScorerDefinitionSchema = z.union([
  z.object({
    type: z.literal("contains"),
    value: z.string().min(1),
    caseSensitive: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string().min(1),
    flags: z.string().optional(),
  }),
]);

export const scorerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["deterministic", "rag", "llm_judge", "human"]),
  definition: jsonObjectSchema,
  judgeModelRef: z.string().optional(),
  version: z.number().int().min(1),
});

export const scoreTargetSchema = z.object({
  kind: z.enum(["agentRun", "span", "datasetItemRun"]),
  id: z.string().min(1),
  experimentRunId: z.string().optional(),
  output: z.unknown(),
  expected: z.unknown().optional(),
  metadata: jsonObjectSchema.optional(),
});

export const scoreRequestSchema = z.object({
  scorer: scorerSchema,
  target: scoreTargetSchema,
  manifestDigest: z.string().min(1).optional(),
  providerProfileRefs: z.array(z.string().min(1)).default([]),
  runPolicy: evalRunPolicySchema.optional(),
  sandboxRef: z.string().min(1).optional(),
  sandboxProfile: sandboxProfileSchema.optional(),
  traceContext: traceContextSchema.optional(),
});

export const scoreResponseSchema = z.object({
  scorerId: z.string().min(1),
  scorerVersion: z.number().int().min(1),
  targetKind: z.enum(["agentRun", "span", "datasetItemRun"]),
  targetId: z.string().min(1),
  experimentRunId: z.string().optional(),
  score: z.number(),
  passed: z.boolean(),
  evidence: jsonObjectSchema,
  judgeRunRef: z.string().optional(),
  producedAt: z.string().datetime(),
});

export const optimizerKindSchema = z.enum(["bootstrap_fewshot", "critic_mutate_judge_pick"]);

export const basePromptVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  hash: z.string().min(1),
  variableSchema: jsonObjectSchema.optional(),
  metadata: jsonObjectSchema.optional(),
  tag: z.string().optional(),
  notes: z.string().optional(),
});

export const optimizeRequestSchema = z.object({
  experimentRunId: z.string().min(1),
  experimentId: z.string().min(1),
  manifestDigest: z.string().min(1),
  providerProfileRefs: z.array(z.string().min(1)).default([]),
  runPolicy: evalRunPolicySchema.optional(),
  sandboxRef: z.string().min(1).optional(),
  sandboxProfile: sandboxProfileSchema.optional(),
  optimizerKind: optimizerKindSchema,
  basePromptVersion: basePromptVersionSchema,
  config: jsonObjectSchema.optional(),
  traceContext: traceContextSchema.optional(),
});

export const promptVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  variableSchema: jsonObjectSchema.optional(),
  metadata: jsonObjectSchema.optional(),
  hash: z.string().min(1),
  tag: z.string().optional(),
  createdAt: z.string().datetime(),
  notes: z.string().optional(),
});

export const optimizeCandidateEventSchema = z.object({
  type: z.literal("candidate"),
  experimentRunId: z.string().min(1),
  promptVersion: promptVersionSchema,
  summary: jsonObjectSchema,
});

export const optimizeSummaryEventSchema = z.object({
  type: z.literal("summary"),
  experimentRunId: z.string().min(1),
  summary: jsonObjectSchema,
});

export const optimizeEventSchema = z.union([
  optimizeCandidateEventSchema,
  optimizeSummaryEventSchema,
]);

export const agentDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  solverRef: solverRefSchema,
});

export const agentsResponseSchema = z.object({
  agents: z.array(agentDescriptorSchema),
});

export const harnessAdapterSchemas = {
  problemDetails: problemDetailsSchema,
  healthResponse: healthResponseSchema,
  sandboxLifecycleRequest: sandboxLifecycleRequestSchema,
  sandboxLifecycleResponse: sandboxLifecycleResponseSchema,
  runRequest: runRequestSchema,
  runResponse: runResponseSchema,
  scorer: scorerSchema,
  scoreRequest: scoreRequestSchema,
  scoreResponse: scoreResponseSchema,
  optimizeRequest: optimizeRequestSchema,
  optimizeEvent: optimizeEventSchema,
  agentsResponse: agentsResponseSchema,
} as const;

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type SandboxProfile = z.infer<typeof sandboxProfileSchema>;
export type SandboxLifecycleRequest = z.infer<typeof sandboxLifecycleRequestSchema>;
export type SandboxLifecycleResponse = z.infer<typeof sandboxLifecycleResponseSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;
export type RunResponse = z.infer<typeof runResponseSchema>;
export type Scorer = z.infer<typeof scorerSchema>;
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;
export type ScoreResponse = z.infer<typeof scoreResponseSchema>;
export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;
export type OptimizeEvent = z.infer<typeof optimizeEventSchema>;
export type AgentDescriptor = z.infer<typeof agentDescriptorSchema>;
