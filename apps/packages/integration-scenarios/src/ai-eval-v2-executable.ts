export interface AiEvalV2ScenarioGraphQL {
  request(operationName: string, variables: Record<string, unknown>): Promise<unknown>;
}

export interface CapturedHarnessRequest {
  method: string;
  path: string;
  traceparent?: string | undefined;
  tracestate?: string | undefined;
  body: unknown;
}

export interface AiEvalV2ScenarioContext {
  graphql: AiEvalV2ScenarioGraphQL;
  projectId: string;
  runId: string;
  readHarnessCapturedRequests?: () => Promise<readonly CapturedHarnessRequest[]>;
}

export interface AiEvalV2ScenarioResult {
  datasetId: string;
  datasetVersionId: string;
  evaluationDefinitionId: string;
  evaluationRunId: string;
  comparisonId: string;
  optimizationRunId: string;
  harnessTraceparent?: string | undefined;
}

export interface AiEvalV2SkillOptimizationScenarioOptions {
  fixtureMode?: "deterministic";
}

export interface AiEvalV2SkillOptimizationScenarioResult {
  datasetId: string;
  datasetVersionId: string;
  baselineEvaluationDefinitionId: string;
  baselineEvaluationRunId: string;
  baselineTargetSnapshotId: string;
  optimizationRunId: string;
  bestTargetSnapshotId: string;
  rejectedProtectedEditPath: string;
  acceptedSkillEditPath: string;
  exportedSkillContentRef?: string | undefined;
  promotionReady: boolean;
}

export async function runAiEvalV2FakeAdapterScenario(
  context: AiEvalV2ScenarioContext,
): Promise<AiEvalV2ScenarioResult> {
  const dataset = readField<Record<string, unknown>>(
    await context.graphql.request("CreateDataset", {
      input: createDatasetInput(context),
    }),
    "createDataset",
  );
  const datasetId = stringField(dataset, "id");
  const datasetVersionId = stringField(dataset, "currentVersionId");

  const appendedDataset = readField<Record<string, unknown>>(
    await context.graphql.request("AppendDatasetItems", {
      input: {
        datasetId,
        expectedDatasetVersionId: datasetVersionId,
        items: [
          {
            input: { text: "refund request" },
            expected: { category: "billing" },
            observedOutput: { category: "shipping" },
            reason: "Billing category is expected because the user asks for a refund.",
            metadata: { source: "integration-local", runId: context.runId },
            sourceRefs: [{ kind: "manual", metadata: { runId: context.runId } }],
            split: "validation",
            curationStatus: "ready",
          },
        ],
        idempotencyKey: `append-${context.runId}`,
      },
    }),
    "appendDatasetItems",
  );
  let currentVersionId = stringField(appendedDataset, "currentVersionId");

  const invalidAppendDataset = readField<Record<string, unknown>>(
    await context.graphql.request("AppendDatasetItems", {
      input: {
        datasetId,
        expectedDatasetVersionId: currentVersionId,
        items: [
          {
            input: { text: "invalid expected" },
            expected: "not-json-object",
            split: "validation",
            curationStatus: "ready",
          },
        ],
        idempotencyKey: `append-invalid-${context.runId}`,
      },
    }),
    "appendDatasetItems",
  );
  currentVersionId = stringField(invalidAppendDataset, "currentVersionId");

  const evaluationDefinition = readField<Record<string, unknown>>(
    await context.graphql.request("CreateEvaluationDefinition", {
      input: {
        projectId: context.projectId,
        name: `Integration evaluation ${context.runId}`,
        datasetId,
        datasetVersionPolicy: "pinned",
        pinnedDatasetVersionId: currentVersionId,
        splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        targetRef: {
          kind: "external_adapter",
          targetRef: "adapter://cloudgrid-local-harness",
          displayName: "Local deterministic harness",
          metadata: {},
        },
        metricSettings: [{ metricId: "classification.exact_label_match", options: {} }],
        runPolicy: { maxParallelRequests: 1 },
        retentionProfile: "balanced",
        idempotencyKey: `evaluation-${context.runId}`,
      },
    }),
    "createEvaluationDefinition",
  );
  const evaluationDefinitionId = stringField(evaluationDefinition, "id");

  const evaluationRun = readField<Record<string, unknown>>(
    await context.graphql.request("StartEvaluationRun", {
      input: {
        evaluationDefinitionId,
        projectId: context.projectId,
        kind: "dataset_evaluation",
        datasetId,
        datasetVersionId: currentVersionId,
        splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        targetRef: {
          kind: "external_adapter",
          targetRef: "adapter://cloudgrid-local-harness",
          displayName: "Local deterministic harness",
          metadata: {},
        },
        metricSettings: [{ metricId: "classification.exact_label_match", options: {} }],
        runPolicy: { maxParallelRequests: 1 },
        retentionProfile: "balanced",
        retentionRole: "validation",
        idempotencyKey: `run-${context.runId}`,
      },
    }),
    "startEvaluationRun",
  );
  const evaluationRunId = stringField(evaluationRun, "id");
  const targetSnapshotId = stringField(evaluationRun, "targetSnapshotId");

  await context.graphql.request("EvaluationRun", { id: evaluationRunId });
  await context.graphql.request("EvaluationResults", {
    input: { evaluationRunId, limit: 25 },
  });

  const comparison = readField<Record<string, unknown>>(
    await context.graphql.request("CreateEvaluationComparison", {
      input: {
        projectId: context.projectId,
        baselineRunId: evaluationRunId,
        candidateRunId: evaluationRunId,
        metricIds: ["classification.exact_label_match"],
        idempotencyKey: `comparison-${context.runId}`,
      },
    }),
    "createEvaluationComparison",
  );
  const comparisonId = stringField(comparison, "id");

  const optimizationRun = readField<Record<string, unknown>>(
    await context.graphql.request("StartOptimizationRun", {
      input: {
        projectId: context.projectId,
        baselineTargetSnapshotId: targetSnapshotId,
        objective: {
          primaryMetricId: "classification.exact_label_match",
          minimumEvidence: { rows: 1 },
        },
        validationEvaluationDefinitionId: evaluationDefinitionId,
        validationSplitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        quickShotPolicy: {
          sourceDatasetVersionId: currentVersionId,
          split: "validation",
          selectionStrategy: "failed_categories",
          selectedItemRevisionIds: [],
          minimumSampleSize: 1,
          metricSettingsSnapshot: [{ metricId: "classification.exact_label_match", options: {} }],
        },
        runPolicy: { maxParallelRequests: 1 },
        idempotencyKey: `optimization-${context.runId}`,
      },
    }),
    "startOptimizationRun",
  );
  const optimizationRunId = stringField(optimizationRun, "id");

  await context.graphql.request("OptimizationRuns", {
    input: { projectId: context.projectId, limit: 25 },
  });

  const capturedRequests = (await context.readHarnessCapturedRequests?.()) ?? [];
  const harnessTraceparent = capturedRequests.find(
    (request) => request.path === "/v1/run",
  )?.traceparent;

  return {
    datasetId,
    datasetVersionId: currentVersionId,
    evaluationDefinitionId,
    evaluationRunId,
    comparisonId,
    optimizationRunId,
    harnessTraceparent,
  };
}

export async function runAiEvalV2SkillOptimizationScenario(
  context: AiEvalV2ScenarioContext,
  options: AiEvalV2SkillOptimizationScenarioOptions = {},
): Promise<AiEvalV2SkillOptimizationScenarioResult> {
  const fixtureMode = options.fixtureMode ?? "deterministic";
  const dataset = readField<Record<string, unknown>>(
    await context.graphql.request("CreateDataset", {
      input: createSkillOptimizationDatasetInput(context, fixtureMode),
    }),
    "createDataset",
  );
  const datasetId = stringField(dataset, "id");
  const datasetVersionId = stringField(dataset, "currentVersionId");

  const appendedDataset = readField<Record<string, unknown>>(
    await context.graphql.request("AppendDatasetItems", {
      input: {
        datasetId,
        expectedDatasetVersionId: datasetVersionId,
        items: skillOptimizationRows(fixtureMode),
        idempotencyKey: `skill-append-${fixtureMode}-${context.runId}`,
      },
    }),
    "appendDatasetItems",
  );
  const currentVersionId = stringField(appendedDataset, "currentVersionId");

  const baselineDefinition = readField<Record<string, unknown>>(
    await context.graphql.request("CreateEvaluationDefinition", {
      input: {
        projectId: context.projectId,
        name: `Skill optimization baseline ${context.runId}`,
        datasetId,
        datasetVersionPolicy: "pinned",
        pinnedDatasetVersionId: currentVersionId,
        splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        targetRef: skillOptimizationTargetRef(fixtureMode, options),
        metricSettings: [{ metricId: "extraction.exact_json_match", options: {} }],
        runPolicy: { maxParallelRequests: 1 },
        retentionProfile: "balanced",
        idempotencyKey: `skill-evaluation-${fixtureMode}-${context.runId}`,
      },
    }),
    "createEvaluationDefinition",
  );
  const baselineEvaluationDefinitionId = stringField(baselineDefinition, "id");

  const baselineRun = readField<Record<string, unknown>>(
    await context.graphql.request("StartEvaluationRun", {
      input: {
        evaluationDefinitionId: baselineEvaluationDefinitionId,
        projectId: context.projectId,
        kind: "dataset_evaluation",
        datasetId,
        datasetVersionId: currentVersionId,
        splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        targetRef: skillOptimizationTargetRef(fixtureMode, options),
        metricSettings: [{ metricId: "extraction.exact_json_match", options: {} }],
        runPolicy: { maxParallelRequests: 1 },
        retentionProfile: "balanced",
        retentionRole: "validation",
        idempotencyKey: `skill-baseline-run-${fixtureMode}-${context.runId}`,
      },
    }),
    "startEvaluationRun",
  );
  const baselineEvaluationRunId = stringField(baselineRun, "id");
  const baselineTargetSnapshotId = stringField(baselineRun, "targetSnapshotId");

  const optimizationRun = readField<Record<string, unknown>>(
    await context.graphql.request("StartOptimizationRun", {
      input: {
        projectId: context.projectId,
        baselineTargetSnapshotId,
        objective: skillOptimizationObjective(),
        searchPolicy: skillOptimizationSearchPolicy(fixtureMode),
        trainingEvaluationDefinitionId: baselineEvaluationDefinitionId,
        trainingSplitSelector: { splits: ["training"], curationStatuses: ["ready"] },
        validationEvaluationDefinitionId: baselineEvaluationDefinitionId,
        validationSplitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        runPolicy: { maxParallelRequests: 1 },
        idempotencyKey: `skill-optimization-${fixtureMode}-${context.runId}`,
      },
    }),
    "startOptimizationRun",
  );
  const optimizationRunId = stringField(optimizationRun, "id");

  const detail = readField<Record<string, unknown>>(
    await context.graphql.request("OptimizationRun", { id: optimizationRunId }),
    "optimizationRun",
  );
  const assertions = assertSkillOptimizationDetail(detail);

  await context.graphql.request("OptimizationRuns", {
    input: { projectId: context.projectId, limit: 25 },
  });

  const capturedRequests = (await context.readHarnessCapturedRequests?.()) ?? [];
  if (JSON.stringify(capturedRequests).includes("cloudgrid.ai.semconv.flavor")) {
    throw new Error("Skill optimization scenario required CloudGrid-specific source span attributes");
  }

  return {
    datasetId,
    datasetVersionId: currentVersionId,
    baselineEvaluationDefinitionId,
    baselineEvaluationRunId,
    baselineTargetSnapshotId,
    optimizationRunId,
    ...assertions,
  };
}

function createDatasetInput(context: AiEvalV2ScenarioContext) {
  return {
    projectId: context.projectId,
    name: `Integration dataset ${context.runId}`,
    description: "Dataset created by the local integration runner",
    tags: ["integration", context.runId],
    settings: {
      evaluationFamily: "classification",
      inputType: "json",
      expectedType: "json",
      inputJsonSchema: { type: "object", required: ["text"] },
      expectedJsonSchema: { type: "object", required: ["category"] },
      defaultSplit: "validation",
      intakePolicy: {
        manualDefaultStatus: "draft",
        importDefaultStatus: "needs_review",
        traceDefaultStatus: "needs_expected",
      },
      expectedValueOptions: [],
      traceIntakeRules: [
        {
          id: "integration-default",
          name: "Integration AI call",
          enabled: true,
          match: {
            serviceNames: [],
            operationNames: [],
            spanNames: [],
            spanKinds: [],
            statuses: [],
          },
          mappings: {
            input: { source: "span_attribute", path: "$.input", transform: "identity" },
            expected: { source: "span_attribute", path: "$.expected", transform: "identity" },
            observedOutput: {
              source: "span_attribute",
              path: "$.actualOutput",
              transform: "identity",
            },
            metadata: [
              {
                key: "service.name",
                mapping: { source: "resource_attribute", path: "$.service.name" },
              },
            ],
          },
          defaults: {
            split: "validation",
            curationStatus: "needs_expected",
            contentTreatment: "realistic_anonymized",
            expectedTrust: "untrusted",
          },
        },
      ],
      anonymizationPolicy: { mode: "redact", consistencyScope: "dataset", blockedEntityTypes: [] },
      defaultMetricSettings: [{ metricId: "classification.exact_label_match", options: {} }],
      retentionProfile: "balanced",
    },
    idempotencyKey: `dataset-${context.runId}`,
  };
}

function createSkillOptimizationDatasetInput(
  context: AiEvalV2ScenarioContext,
  fixtureMode: "deterministic",
) {
  return {
    projectId: context.projectId,
    name: `Skill optimization dataset ${fixtureMode} ${context.runId}`,
    description: "Dataset created by the skill optimization integration scenario",
    tags: ["integration", "skill-optimization", fixtureMode, context.runId],
    settings: {
      evaluationFamily: "extraction",
      inputType: "json",
      expectedType: "json",
      inputJsonSchema: { type: "object", required: ["ticket"] },
      expectedJsonSchema: { type: "object" },
      defaultSplit: "training",
      intakePolicy: {
        manualDefaultStatus: "ready",
        importDefaultStatus: "needs_review",
        traceDefaultStatus: "needs_expected",
      },
      expectedValueOptions: [],
      traceIntakeRules: [],
      anonymizationPolicy: { mode: "redact", consistencyScope: "dataset", blockedEntityTypes: [] },
      defaultMetricSettings: [{ metricId: "extraction.exact_json_match", options: {} }],
      retentionProfile: "balanced",
    },
    idempotencyKey: `skill-dataset-${fixtureMode}-${context.runId}`,
  };
}

function skillOptimizationRows(fixtureMode: "deterministic") {
  const source = fixtureMode;
  return [
    {
      input: {
        ticket: "Customer says billing export failed and asks for a fix, but no account id is present.",
      },
      expected: { action: "ask_for_account_id", mustMention: "account id" },
      reason: "Training row intentionally fails with the echo harness so reflection has failure evidence.",
      metadata: { source, fixtureRowId: "train-001" },
      sourceRefs: [{ kind: "manual", metadata: { fixtureRowId: "train-001" } }],
      split: "training",
      curationStatus: "ready",
    },
    {
      input: {
        ticket: "Customer provides account A-1042 and says dashboard access is denied after role update.",
      },
      expected: { action: "check_permissions", mustMention: "role propagation" },
      reason: "Training row intentionally fails with the echo harness so protected edit rejection is visible.",
      metadata: { source, fixtureRowId: "train-002" },
      sourceRefs: [{ kind: "manual", metadata: { fixtureRowId: "train-002" } }],
      split: "training",
      curationStatus: "ready",
    },
    {
      input: {
        ticket: "Billing report fails for customer, account id is missing.",
      },
      expected: {
        ticket: "Billing report fails for customer, account id is missing.",
      },
      reason: "Validation row matches the deterministic echo harness for a validation-backed candidate.",
      metadata: { source, fixtureRowId: "val-001" },
      sourceRefs: [{ kind: "manual", metadata: { fixtureRowId: "val-001" } }],
      split: "validation",
      curationStatus: "ready",
    },
    {
      input: {
        ticket: "Customer asks to recover a deleted report and does not include an account id.",
      },
      expected: { action: "ask_for_account_id", mustMention: "account id" },
      reason: "Held-out row must not be selected for optimizer reflection.",
      metadata: { source, fixtureRowId: "test-001" },
      sourceRefs: [{ kind: "manual", metadata: { fixtureRowId: "test-001" } }],
      split: "test",
      curationStatus: "ready",
    },
  ];
}

function skillOptimizationTargetRef(
  fixtureMode: "deterministic",
  _options: AiEvalV2SkillOptimizationScenarioOptions,
) {
  return {
    kind: "external_adapter",
    targetRef: "adapter://cloudgrid-local-harness",
    displayName: "Deterministic skill package",
    metadata: {
      runtimeMode: "external_business_context",
      providerProfileRef: "local-harness",
      modelAlias: "deterministic-skill-reflector",
      skillPackage: skillPackageManifest(fixtureMode),
    },
  };
}

function skillOptimizationObjective() {
  return {
    primaryMetricId: "extraction.exact_json_match",
    secondaryMetricIds: [],
    constraints: {},
    tradeoffMetricIds: [],
    rankingPolicy: {},
    tieBreakers: [],
    minimumEvidence: { rows: 1 },
  };
}

function skillOptimizationSearchPolicy(fixtureMode: "deterministic") {
  const manifest = skillPackageManifest(fixtureMode);
  return {
    optimizerKind: "skill_text_edit",
    editablePartKinds: ["skill"],
    maxEpochs: 1,
    maxSteps: 2,
    rolloutBatchSize: 2,
    reflectionMinibatchSize: 2,
    editBudget: 2,
    minEditBudget: 1,
    editSchedule: "constant",
    gateMetricId: "extraction.exact_json_match",
    gateMode: "strict_improvement",
    selectionSplit: "validation",
    allowSlowUpdate: true,
    allowMetaMemory: true,
    skillPolicy: {
      maxPackageBytes: 262_144,
      maxSkillBytes: 65_536,
      maxSkillTokens: 8_000,
      allowedEditOps: ["append", "insert_after", "replace", "delete"],
      editableFileGlobs: manifest.editableFileGlobs,
      protectedFileGlobs: manifest.protectedFileGlobs,
      allowScriptEdits: false,
      preserveSections: [],
      exportBestSkill: true,
    },
  };
}

function skillPackageManifest(_fixtureMode: "deterministic") {
  return {
    packageRef: "skill-package-deterministic-support",
    entrypoint: "SKILL.md",
    manifestDigest: "sha256:deterministic-skill-manifest",
    editableFileGlobs: ["SKILL.md", "references/*.md"],
    protectedFileGlobs: ["scripts/**", "package-lock.json", "fixtures/**"],
    runtimeRequirements: {
      requiresMcp: false,
      requiresFilesystem: false,
      requiresScripts: false,
      traceExportRequired: true,
    },
    files: [
      {
        path: "SKILL.md",
        role: "entrypoint",
        digest: "sha256:skill-md",
        byteSize: 586,
        content:
          "# Support Triage Skill\n\nUse this skill when handling CloudGrid support tickets for billing exports, dashboard access, audit logs, and report recovery.\n\n## Workflow\n\n1. Identify whether the ticket includes an account id.\n2. If an account id is present, use it in the response and inspect the likely product area.\n3. If the ticket describes permissions, mention role propagation and access policy checks.\n4. If the ticket describes exports, mention export policy and recent migration or retention changes.\n\n## Output\n\nReturn a concise next action and the one missing detail, if any.\n",
        editable: true,
      },
      {
        path: "references/escalation.md",
        role: "reference",
        digest: "sha256:reference-escalation",
        byteSize: 213,
        content:
          "# Escalation Reference\n\n- Permission failures usually need account id, project id, and role name.\n- Export failures usually need account id, export type, and time range.\n- Recovery requests usually need account id and report id.\n",
        editable: true,
      },
      {
        path: "scripts/run.sh",
        role: "script",
        digest: "sha256:script-run",
        byteSize: 87,
        content:
          "#!/usr/bin/env bash\necho \"deterministic fixture script is protected and not executed by default\"\n",
        editable: false,
      },
    ],
  };
}

function assertSkillOptimizationDetail(detail: Record<string, unknown>) {
  const searchPolicy = objectField(detail, "searchPolicy");
  if (searchPolicy.optimizerKind !== "skill_text_edit") {
    throw new Error("Optimization detail did not preserve skill_text_edit search policy");
  }

  const skillOptimization = objectField(detail, "skillOptimization");
  const steps = arrayField<Record<string, unknown>>(skillOptimization, "steps");
  const rejectedStep = steps.find(
    (step) =>
      step.status === "rejected" &&
      JSON.stringify(step.rejectedEditSummaries).includes("scripts/run.sh"),
  );
  if (!rejectedStep) {
    throw new Error("Skill optimization detail did not include protected edit rejection");
  }

  const acceptedStep = steps.find(
    (step) =>
      step.status === "accepted" &&
      step.gateDecision === "accepted_new_best" &&
      JSON.stringify(step.selectedEdits).includes("SKILL.md"),
  );
  if (!acceptedStep) {
    throw new Error("Skill optimization detail did not include an accepted skill edit");
  }

  const bestTargetSnapshotId = stringField(skillOptimization, "bestTargetSnapshotId");
  if (detail.promotionRecordId !== null && detail.promotionRecordId !== undefined) {
    throw new Error("Skill optimization scenario must keep promotion explicit");
  }

  return {
    bestTargetSnapshotId,
    rejectedProtectedEditPath: "scripts/run.sh",
    acceptedSkillEditPath: "SKILL.md",
    exportedSkillContentRef:
      typeof skillOptimization.exportedSkillContentRef === "string"
        ? skillOptimization.exportedSkillContentRef
        : undefined,
    promotionReady: true,
  };
}

function readField<T>(payload: unknown, field: string): T {
  if (!payload || typeof payload !== "object" || !(field in payload)) {
    throw new Error(`GraphQL response did not contain ${field}`);
  }
  return (payload as Record<string, T>)[field] as T;
}

function objectField(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = payload[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GraphQL response field ${field} is missing`);
  }
  return value as Record<string, unknown>;
}

function arrayField<T>(payload: Record<string, unknown>, field: string): T[] {
  const value = payload[field];
  if (!Array.isArray(value)) {
    throw new Error(`GraphQL response field ${field} is missing`);
  }
  return value as T[];
}

function stringField(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`GraphQL response field ${field} is missing`);
  }
  return value;
}

export function aiEvalV2ScenarioOperationNames(): readonly string[] {
  return [
    "CreateDataset",
    "AppendDatasetItems",
    "AppendDatasetItems",
    "CreateEvaluationDefinition",
    "StartEvaluationRun",
    "EvaluationRun",
    "EvaluationResults",
    "CreateEvaluationComparison",
    "StartOptimizationRun",
    "OptimizationRuns",
  ];
}

export function aiEvalV2SkillOptimizationScenarioOperationNames(): readonly string[] {
  return [
    "CreateDataset",
    "AppendDatasetItems",
    "CreateEvaluationDefinition",
    "StartEvaluationRun",
    "StartOptimizationRun",
    "OptimizationRun",
    "OptimizationRuns",
  ];
}
