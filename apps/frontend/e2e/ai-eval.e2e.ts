import { expect, type Page, test } from "@playwright/test";

const timestamp = "2026-05-23T10:00:00.000Z";
const projectId = "project-ai-eval-e2e";

const project = {
  id: projectId,
  organizationId: "local",
  name: "AI Eval E2E project",
  slug: "ai-eval-e2e",
  status: "active",
  telemetry: {
    traceCount: 1,
    logCount: 0,
    metricCount: 0,
    serviceCount: 1,
    lastIngestAt: timestamp,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const datasetSettings = {
  evaluationFamily: "classification",
  inputType: "json",
  expectedType: "json",
  inputJsonSchema: { type: "object" },
  expectedJsonSchema: { type: "object" },
  defaultSplit: "validation",
  intakePolicy: {
    manualDefaultStatus: "draft",
    importDefaultStatus: "needs_review",
    traceDefaultStatus: "needs_expected",
  },
  traceExtractionSettings: null,
  anonymizationPolicy: null,
  defaultMetricSettings: [{ metricId: "exact_match", options: {} }],
  retentionProfile: "balanced",
};

const dataset = {
  id: "dataset-1",
  projectId,
  name: "Checkout regression",
  description: null,
  currentVersionId: "dataset-version-1",
  currentVersion: {
    id: "dataset-version-1",
    datasetId: "dataset-1",
    version: 1,
    digest: "digest-1",
    createdAt: timestamp,
    createdBy: "local-user",
    settingsSnapshot: datasetSettings,
    itemRevisionIds: ["item-revision-1"],
    parentVersionId: null,
    changeSummary: "Initial dataset",
    source: "manual",
  },
  settings: datasetSettings,
  createdAt: timestamp,
  createdBy: "local-user",
  updatedAt: timestamp,
  updatedBy: "local-user",
  itemCount: 1,
  readyItemCount: 1,
  splitCounts: { validation: 1 },
  health: {
    status: "ready",
    readyItemCount: 1,
    totalItemCount: 1,
    splitCounts: { validation: 1 },
    duplicateCandidateCount: 0,
    leakageWarningCount: 0,
    missingExpectedCount: 0,
    schemaIssueCount: 0,
    smallDataset: true,
    warnings: [],
  },
  tags: ["checkout"],
  items: {
    items: [
      {
        id: "item-1",
        datasetId: "dataset-1",
        latestRevisionId: "item-revision-1",
        latestRevision: {
          id: "item-revision-1",
          datasetItemId: "item-1",
          datasetId: "dataset-1",
          input: { prompt: "Checkout failed" },
          expected: { answer: "Return retryable payment error" },
          observedOutput: { answer: "Card declined" },
          reason: "Regression example from checkout trace",
          metadata: {},
          sourceRefs: [{ kind: "trace", traceId: "trace-1", spanId: "span-1", metadata: {} }],
          split: "validation",
          curationStatus: "ready",
          curationNote: null,
          contentTreatment: "original",
          anonymizationProvenance: null,
          createdAt: timestamp,
          createdBy: "local-user",
          updatedAt: timestamp,
          updatedBy: "local-user",
        },
        createdAt: timestamp,
        createdBy: "local-user",
        updatedAt: timestamp,
        updatedBy: "local-user",
      },
    ],
    nextCursor: null,
  },
};

const evaluationDefinition = {
  id: "evaluation-1",
  projectId,
  name: "Checkout baseline",
  datasetId: "dataset-1",
  datasetVersionPolicy: "pinned",
  pinnedDatasetVersionId: "dataset-version-1",
  splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
  targetRef: {
    kind: "prompt",
    targetId: "prompt-1",
    targetSnapshotId: "snapshot-1",
    targetRef: "checkout-agent",
    displayName: "Checkout agent prompt",
    metadata: {},
  },
  metricSettings: [{ metricId: "exact_match", metricVersion: "1", options: {} }],
  runPolicy: { maxParallelRequests: 2 },
  retentionProfile: "balanced",
  createdAt: timestamp,
  createdBy: "local-user",
  updatedAt: timestamp,
  updatedBy: "local-user",
  version: 1,
};

const metricAggregate = {
  metricId: "exact_match",
  metricVersion: "1",
  scope: "evaluation_run",
  subjectId: "run-1",
  payload: { kind: "scalar", value: 0.82 },
  unit: "score",
  direction: "higher_is_better",
  support: 1,
  problemCount: 0,
};

test.describe("/ai-eval", () => {
  test("renders v2 dataset rows and controls evaluation runs", async ({ page }) => {
    const calls: string[] = [];
    const payloads: Array<{ operationName?: string; variables?: Record<string, unknown> }> = [];
    let runStatus = "running";
    await mockAiEval(
      page,
      calls,
      payloads,
      () => runStatus,
      (next) => {
        runStatus = next;
      },
    );

    await page.goto("/ai-eval?tab=datasets&dataset=dataset-1");
    await expect(page.getByRole("heading", { name: "Checkout regression" })).toBeVisible();
    await expect(page.getByText("Regression example from checkout trace")).toBeVisible();
    await expect(page.locator('a[href="/traces/trace-1"]')).toBeVisible();
    await page.getByRole("link", { name: /dataset settings/i }).click();
    await page.getByLabel("Default metric").fill("classification.accuracy");
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect.poll(() => calls).toContain("UpdateDatasetSettings");
    const settingsPayload = payloads.find(
      (payload) => payload.operationName === "UpdateDatasetSettings",
    );
    expect(settingsPayload?.variables?.input).toMatchObject({
      datasetId: "dataset-1",
      expectedDatasetVersionId: "dataset-version-1",
      settings: {
        defaultMetricSettings: [{ metricId: "classification.accuracy", options: {} }],
      },
    });

    await page.goto("/ai-eval?tab=evaluations&evaluation=evaluation-1");
    await expect(page.getByText("Checkout baseline · Checkout regression")).toBeVisible();
    await expect(page.getByRole("cell", { name: "exact_match · 0.82" })).toBeVisible();
    await expect(page.getByText("Model answered directly without tool calls.")).toBeVisible();

    await page.getByRole("button", { name: /pause/i }).click();
    await expect.poll(() => calls).toContain("PauseEvaluationRun");
    await expect(page.getByRole("button", { name: /resume/i })).toBeVisible();
    await page.getByRole("button", { name: /resume/i }).click();
    await expect.poll(() => calls).toContain("ResumeEvaluationRun");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect.poll(() => calls).toContain("CancelEvaluationRun");
  });
});

async function mockAiEval(
  page: Page,
  calls: string[],
  payloads: Array<{ operationName?: string; variables?: Record<string, unknown> }>,
  getRunStatus: () => string,
  setRunStatus: (status: string) => void,
) {
  await page.route("**/graphql", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      operationName?: string;
      variables?: Record<string, unknown>;
    };
    const op = requestBody.operationName;
    if (op) {
      calls.push(op);
      payloads.push(requestBody);
    }

    if (op === "Viewer" || op === "SelectProject") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            viewer: {
              user: { id: "local-user", displayName: "Local User", email: null, avatarUrl: null },
              organizations: [
                {
                  id: "local",
                  name: "Local company",
                  slug: "local",
                  role: "admin",
                  projects: [project],
                  members: [],
                },
              ],
              selectedProject: project,
            },
          },
        },
      });
      return;
    }

    if (op === "CompanyAiProviderSettings") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            companyAiProviderSettings: {
              companyId: "local",
              providerProfile: null,
              chatModelAlias: null,
              effective: {
                warnings: [],
                missingProviderProfiles: [],
                disabledProviderProfiles: [],
                missingChatProvider: true,
              },
              version: 1,
              updatedAt: timestamp,
              updatedByUserId: null,
            },
          },
        },
      });
      return;
    }

    if (op === "PauseEvaluationRun") {
      setRunStatus("paused");
    }
    if (op === "ResumeEvaluationRun") {
      setRunStatus("running");
    }
    if (op === "CancelEvaluationRun") {
      setRunStatus("cancelled");
    }

    const run = evaluationRun(getRunStatus());
    const responseByOperation: Record<string, unknown> = {
      Dashboards: { dashboards: { items: [], nextCursor: null } },
      Datasets: { datasets: { items: [dataset], nextCursor: null } },
      EvaluationDefinitions: {
        evaluationDefinitions: { items: [evaluationDefinition], nextCursor: null },
      },
      EvaluationRuns: { evaluationRuns: { items: [run], nextCursor: null } },
      EvaluationComparisons: { evaluationComparisons: { items: [], nextCursor: null } },
      OptimizationRuns: { optimizationRuns: { items: [], nextCursor: null } },
      PauseEvaluationRun: { pauseEvaluationRun: evaluationRun("paused") },
      ResumeEvaluationRun: { resumeEvaluationRun: evaluationRun("running") },
      CancelEvaluationRun: { cancelEvaluationRun: evaluationRun("cancelled") },
      UpdateDatasetSettings: {
        updateDatasetSettings: {
          ...dataset,
          currentVersionId: "dataset-version-2",
          settings: {
            ...datasetSettings,
            defaultMetricSettings: [{ metricId: "classification.accuracy", options: {} }],
          },
        },
      },
    };

    await route.fulfill({
      contentType: "application/json",
      json: { data: responseByOperation[op ?? ""] ?? {} },
    });
  });
}

function evaluationRun(status: string) {
  return {
    id: "run-1",
    projectId,
    evaluationDefinitionId: "evaluation-1",
    kind: "dataset_evaluation",
    status,
    datasetId: "dataset-1",
    datasetVersionId: "dataset-version-1",
    datasetDigest: "digest-1",
    selectedItemRevisionIds: ["item-revision-1"],
    splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
    targetSnapshotId: "snapshot-1",
    metricSettingsSnapshot: [{ metricId: "exact_match", metricVersion: "1", options: {} }],
    runPolicySnapshot: { maxParallelRequests: 2 },
    retentionProfile: "balanced",
    retentionRole: "candidate",
    startedAt: timestamp,
    endedAt: status === "cancelled" ? timestamp : null,
    summary: {
      itemCounts: { total: 1, completed: status === "running" ? 0 : 1, failed: 0 },
      metricAggregates: [metricAggregate],
      problemCounts: {},
      budgetUsage: { inputTokens: 120, outputTokens: 60, totalTokens: 180, estimatedUsd: 0.02 },
      latency: { p50Ms: 120, p95Ms: 240, maxMs: 260 },
    },
    problem: null,
    itemRuns: {
      items: [
        {
          id: "item-run-1",
          evaluationRunId: "run-1",
          datasetItemId: "item-1",
          datasetItemRevisionId: "item-revision-1",
          targetSnapshotId: "snapshot-1",
          status: "completed",
          actualOutput: { answer: "Return retryable payment error" },
          actualOutputType: "json",
          traceId: "trace-1",
          rootSpanId: "span-1",
          metricResultIds: ["metric-result-1"],
          metricResults: [
            {
              id: "metric-result-1",
              evaluationRunId: "run-1",
              evaluationItemRunId: "item-run-1",
              metricId: "exact_match",
              metricVersion: "1",
              scope: "item_run",
              subjectId: "item-run-1",
              payload: { kind: "boolean", value: true },
              unit: "score",
              direction: "higher_is_better",
              problem: null,
              producedAt: timestamp,
            },
          ],
          problems: [],
          trajectorySummary: "Model answered directly without tool calls.",
          summaryEvidenceRefs: [],
          importantSteps: [],
          conversationRef: null,
          summaryDigest: "summary-1",
          summaryGeneratedAt: timestamp,
          retentionRole: "candidate",
          startedAt: timestamp,
          endedAt: timestamp,
        },
      ],
      nextCursor: null,
    },
    metricResults: [],
    metricAggregates: [metricAggregate],
  };
}
