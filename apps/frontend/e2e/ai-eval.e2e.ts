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

const dataset = {
  id: "dataset-1",
  name: "Checkout regression",
  description: null,
  version: 1,
  createdAt: timestamp,
  itemCount: 1,
  reviewedItemCount: 1,
  splitCounts: { validation: 1 },
  health: {
    status: "ready",
    reviewedItemCount: 1,
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
        version: 1,
        input: { prompt: "Checkout failed" },
        expected: { answer: "Return retryable payment error" },
        metadata: {},
        sourceTraceId: "trace-1",
        sourceSpanId: "span-1",
        split: "validation",
        reviewStatus: "reviewed",
        synthetic: false,
        duplicateOfItemId: null,
        leakageWarnings: [],
      },
    ],
    nextCursor: null,
  },
};

const candidate = {
  id: "candidate-1",
  datasetId: "dataset-1",
  status: "suggested",
  sourceKind: "production_measurement",
  source: { policyId: "policy-1", traceId: "trace-1" },
  targetShape: "single_turn",
  input: { prompt: "Customer email was transformed" },
  expected: { answer: "Return retryable payment error" },
  metadata: { service: "checkout" },
  split: "validation",
  reviewStatus: "unreviewed",
  contentTreatment: "realistic_anonymized",
  anonymization: {
    policyId: "default-realistic",
    policyVersion: 3,
    transformedAt: timestamp,
    consistencyScope: "dataset",
    transformedFields: [{ path: "$.customer.email", entityType: "email", strategy: "replace" }],
  },
  reason: "failed production measurement",
  clusterId: "cluster-1",
  warnings: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const scorer = {
  id: "scorer-1",
  name: "Intent scorer",
  kind: "deterministic",
  definition: { type: "contains" },
  judgeModelRef: null,
  version: 1,
};

const experiment = {
  id: "experiment-1",
  name: "Checkout baseline",
  datasetId: "dataset-1",
  datasetVersion: 1,
  scorerIds: ["scorer-1"],
  splitSelector: { splits: ["validation"], reviewedOnly: false, includeSynthetic: false },
  baselineRef: null,
  promptVersionRefs: [],
  skillSnapshotRefs: [],
  toolSnapshotRefs: [],
  providerProfileRefs: [],
  createdAt: timestamp,
  tags: [],
};

test.describe("/ai-eval", () => {
  test("reviews candidates and controls experiment runs with returned visualizations", async ({
    page,
  }) => {
    const calls: string[] = [];
    let runStatus = "running";
    await mockAiEval(
      page,
      calls,
      () => runStatus,
      (next) => {
        runStatus = next;
      },
    );

    await page.goto("/ai-eval?tab=datasets&dataset=dataset-1");
    await expect(page.getByText("Dataset candidates")).toBeVisible();
    await expect(page.getByText("realistic_anonymized")).toBeVisible();
    await expect(page.getByText("default-realistic v3 · email")).toBeVisible();
    await page.getByRole("button", { name: /commit/i }).click();
    await expect.poll(() => calls).toContain("CommitDatasetCandidates");

    await page.goto("/ai-eval?tab=experiments");
    await expect(page.getByText("Intent confusion")).toBeVisible();
    await page.getByRole("button", { name: /pause/i }).click();
    await expect.poll(() => calls).toContain("PauseExperimentRun");
    await expect(page.getByRole("button", { name: /resume/i })).toBeVisible();
    await page.getByRole("button", { name: /resume/i }).click();
    await expect.poll(() => calls).toContain("ResumeExperimentRun");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect.poll(() => calls).toContain("CancelExperimentRun");
  });
});

async function mockAiEval(
  page: Page,
  calls: string[],
  getRunStatus: () => string,
  setRunStatus: (status: string) => void,
) {
  await page.route("**/graphql", async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string };
    const op = requestBody.operationName;
    if (op) {
      calls.push(op);
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

    const run = experimentRun(getRunStatus());
    const responseByOperation: Record<string, unknown> = {
      Datasets: { datasets: { items: [dataset], nextCursor: null } },
      Scorers: { scorers: { items: [scorer], nextCursor: null } },
      Experiments: {
        experiments: {
          items: [{ ...experiment, runs: { items: [run], nextCursor: null } }],
          nextCursor: null,
        },
      },
      DatasetCandidates: { datasetCandidates: { items: [candidate], nextCursor: null } },
      CommitDatasetCandidates: {
        commitDatasetCandidates: { ...dataset, version: 2, itemCount: 2 },
      },
      PauseExperimentRun: { pauseExperimentRun: experimentRun("paused") },
      ResumeExperimentRun: { resumeExperimentRun: experimentRun("running") },
      CancelExperimentRun: { cancelExperimentRun: experimentRun("cancelled") },
    };

    if (op === "PauseExperimentRun") {
      setRunStatus("paused");
    }
    if (op === "ResumeExperimentRun") {
      setRunStatus("running");
    }
    if (op === "CancelExperimentRun") {
      setRunStatus("cancelled");
    }

    await route.fulfill({
      contentType: "application/json",
      json: { data: responseByOperation[op ?? ""] ?? {} },
    });
  });
}

function experimentRun(status: string) {
  return {
    id: "run-1",
    experimentId: "experiment-1",
    solverRef: { kind: "agent", name: "checkout-agent" },
    manifest: null,
    baselineRunId: null,
    status,
    runPolicy: { maxParallelRequests: 2 },
    startedAt: timestamp,
    endedAt: status === "cancelled" ? timestamp : null,
    summary: {
      itemCounts: {
        total: 2,
        passed: 1,
        failed: 1,
        errored: 0,
        skipped: 0,
        needsReview: 0,
        quarantined: 0,
      },
      scoreSummaries: [
        {
          scorerId: "scorer-1",
          scorerVersion: 1,
          resultKind: "classification",
          passRate: 0.5,
          meanScore: 0.7,
          p50: 0.7,
          p95: 0.9,
          support: 2,
          visualization: {
            kind: "classification_confusion_matrix",
            title: "Intent confusion",
            data: {
              labels: ["pass", "fail"],
              matrix: [
                [1, 0],
                [1, 0],
              ],
            },
          },
        },
      ],
      problemCounts: { modelQuality: 1, itemQuality: 0, scorerConfig: 0, infrastructure: 0 },
      budgetUsage: { inputTokens: 120, outputTokens: 60, totalTokens: 180, estimatedUsd: 0.02 },
      latency: { p50Ms: 120, p95Ms: 240, maxMs: 260 },
      regressions: [{ kind: "score_drop", count: 1, blocker: true }],
    },
    itemRuns: { items: [], nextCursor: null },
  };
}
