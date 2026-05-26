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
      traceExtractionSettings: {
        inputPath: "$.input",
        expectedPath: "$.expected",
        observedOutputPath: "$.actualOutput",
        metadataPaths: ["$.service.name"],
      },
      anonymizationPolicy: { mode: "redact", consistencyScope: "dataset", blockedEntityTypes: [] },
      defaultMetricSettings: [{ metricId: "classification.exact_label_match", options: {} }],
      retentionProfile: "balanced",
    },
    idempotencyKey: `dataset-${context.runId}`,
  };
}

function readField<T>(payload: unknown, field: string): T {
  if (!payload || typeof payload !== "object" || !(field in payload)) {
    throw new Error(`GraphQL response did not contain ${field}`);
  }
  return (payload as Record<string, T>)[field] as T;
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
