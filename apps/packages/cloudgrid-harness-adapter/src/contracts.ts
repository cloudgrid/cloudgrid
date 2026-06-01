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

export const optimizerKindSchema = z.enum([
  "bootstrap_fewshot",
  "critic_mutate_judge_pick",
  "skill_text_edit",
]);

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

export const skillFileRoleSchema = z.enum([
  "entrypoint",
  "reference",
  "example",
  "script",
  "dependency_manifest",
  "asset",
  "fixture",
]);

export const skillPackageFileSchema = z.object({
  path: z.string().min(1),
  role: skillFileRoleSchema,
  digest: z.string().min(1),
  byteSize: z.number().int().min(0),
  content: z.string().optional(),
  editable: z.boolean().default(false),
});

export const skillPackageManifestSchema = z.object({
  packageRef: z.string().min(1).optional(),
  entrypoint: z.literal("SKILL.md"),
  manifestDigest: z.string().min(1),
  files: z.array(skillPackageFileSchema).min(1),
  editableFileGlobs: z.array(z.string().min(1)).default(["SKILL.md"]),
  protectedFileGlobs: z.array(z.string().min(1)).default([]),
  runtimeRequirements: jsonObjectSchema.optional(),
});

export const skillCapabilitiesResponseSchema = z.object({
  adapterVersion: z.string().min(1),
  supportedOptimizerKinds: z.array(optimizerKindSchema),
  runtimeModes: z.array(z.enum(["managed_harness", "external_business_context"])),
  evidenceFields: z.array(z.string().min(1)),
  traceExport: z.object({
    supported: z.boolean(),
    requiredForSkillOptimization: z.boolean(),
  }),
  editablePartKinds: z.array(z.literal("skill")),
  packageFormats: z.array(z.literal("agent_skill_package")),
  scriptExecution: z.object({
    supported: z.boolean(),
    modes: z.array(z.string().min(1)),
  }),
  limits: z.object({
    maxPackageBytes: z.number().int().min(1),
    maxSkillBytes: z.number().int().min(1),
    maxEditProposals: z.number().int().min(1),
    maxConcurrentCalls: z.number().int().min(1),
  }),
  editOps: z.array(z.enum(["append", "insert_after", "replace", "delete"])),
  optimizerModelAliases: z.array(z.string().min(1)),
});

export const skillRuntimeDryRunRequestSchema = z.object({
  optimizationRunId: z.string().min(1),
  skillPackage: skillPackageManifestSchema,
  runtimeMode: z.enum(["managed_harness", "external_business_context"]),
  runtimeProfileRef: z.string().min(1).optional(),
  modelProfileRef: z.string().min(1).optional(),
  toolProfileRef: z.string().min(1).optional(),
  fixtureRef: z.string().min(1).optional(),
  traceContext: traceContextSchema.optional(),
});

export const skillRuntimeDryRunResponseSchema = z.object({
  optimizationRunId: z.string().min(1),
  ok: z.boolean(),
  capabilityDigest: z.string().min(1),
  checks: z.array(
    z.object({
      id: z.string().min(1),
      status: z.enum(["passed", "warning", "failed"]),
      message: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()).default([]),
});

export const skillOptimizationEvidenceSchema = z
  .object({
    itemRunId: z.string().min(1).optional(),
    split: z.enum(["training", "validation", "test"]).optional(),
    actualOutput: z.unknown().optional(),
    expected: z.unknown().optional(),
    metricResults: z.array(jsonObjectSchema).default([]),
    importantSteps: z.array(jsonObjectSchema).default([]),
    trajectorySummary: z.string().optional(),
    traceRefs: z.array(jsonObjectSchema).default([]),
  })
  .catchall(z.unknown());

export const skillEditOperationSchema = z.object({
  op: z.enum(["append", "insert_after", "replace", "delete"]),
  target: z.enum(["skill_file"]),
  filePath: z.string().min(1),
  anchor: z.string().optional(),
  content: z.string().optional(),
});

export const skillEditProposalSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["success_reflection", "failure_reflection", "merge_rank", "slow_update"]),
  rationale: z.string().min(1),
  supportCount: z.number().int().min(0),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  edits: z.array(skillEditOperationSchema).min(1),
  expectedValidity: z.enum(["valid", "invalid_protected_file"]),
  protectedFileViolation: z.boolean().default(false),
});

export const skillReflectRequestSchema = z.object({
  optimizationRunId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  reflectionKind: z.enum(["success", "failure"]),
  skillPackage: skillPackageManifestSchema,
  evidence: z.array(skillOptimizationEvidenceSchema).default([]),
  contentPolicy: jsonObjectSchema.optional(),
  rejectedEdits: z.array(skillEditProposalSchema).default([]),
  traceContext: traceContextSchema.optional(),
});

export const skillReflectResponseSchema = z.object({
  optimizationRunId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  proposals: z.array(skillEditProposalSchema),
  summary: jsonObjectSchema,
});

export const skillMergeRankRequestSchema = z.object({
  optimizationRunId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  proposals: z.array(skillEditProposalSchema),
  editBudget: z.number().int().min(1).optional(),
  traceContext: traceContextSchema.optional(),
});

export const skillMergeRankResponseSchema = z.object({
  optimizationRunId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  rankedProposals: z.array(skillEditProposalSchema),
  droppedProposalIds: z.array(z.string().min(1)).default([]),
  summary: jsonObjectSchema,
});

export const skillSlowUpdateRequestSchema = z.object({
  optimizationRunId: z.string().min(1),
  epoch: z.number().int().min(1),
  acceptedProposalIds: z.array(z.string().min(1)).default([]),
  rejectedProposalIds: z.array(z.string().min(1)).default([]),
  trainingSummary: jsonObjectSchema.optional(),
  traceContext: traceContextSchema.optional(),
});

export const skillSlowUpdateResponseSchema = z.object({
  optimizationRunId: z.string().min(1),
  guidance: z.array(z.string().min(1)),
  protectedGuidance: z.boolean(),
});

export const skillMetaMemoryRequestSchema = z.object({
  optimizationRunId: z.string().min(1),
  currentMemory: z.array(jsonObjectSchema).default([]),
  acceptedProposalIds: z.array(z.string().min(1)).default([]),
  rejectedProposalIds: z.array(z.string().min(1)).default([]),
  traceContext: traceContextSchema.optional(),
});

export const skillMetaMemoryResponseSchema = z.object({
  optimizationRunId: z.string().min(1),
  memory: z.array(jsonObjectSchema),
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
  skillCapabilitiesResponse: skillCapabilitiesResponseSchema,
  skillRuntimeDryRunRequest: skillRuntimeDryRunRequestSchema,
  skillRuntimeDryRunResponse: skillRuntimeDryRunResponseSchema,
  skillReflectRequest: skillReflectRequestSchema,
  skillReflectResponse: skillReflectResponseSchema,
  skillMergeRankRequest: skillMergeRankRequestSchema,
  skillMergeRankResponse: skillMergeRankResponseSchema,
  skillSlowUpdateRequest: skillSlowUpdateRequestSchema,
  skillSlowUpdateResponse: skillSlowUpdateResponseSchema,
  skillMetaMemoryRequest: skillMetaMemoryRequestSchema,
  skillMetaMemoryResponse: skillMetaMemoryResponseSchema,
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
export type SkillPackageManifest = z.infer<typeof skillPackageManifestSchema>;
export type SkillEditProposal = z.infer<typeof skillEditProposalSchema>;
