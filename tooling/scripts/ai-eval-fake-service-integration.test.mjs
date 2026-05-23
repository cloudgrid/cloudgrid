import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { createTelemetryGraphQLClient } from "../../apps/packages/public-api-client/src/client.ts";

const timestamp = "2026-05-23T10:00:00.000Z";

let server;
let endpoint;
const calls = [];

beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/graphql") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    calls.push({ operationName: body.operationName, variables: body.variables });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: fakeGraphQLData(body.operationName, body.variables) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  endpoint = `http://127.0.0.1:${address.port}/graphql`;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("AI Eval fake-service integration", () => {
  test("covers offline run, pause/resume/cancel, candidates, and production quality", async () => {
    const client = createTelemetryGraphQLClient(endpoint);

    const run = await client.startExperimentRun({
      experimentId: "experiment-1",
      runPolicy: { maxParallelRequests: 2 },
    });
    expect(run).toMatchObject({ id: "run-1", status: "running" });

    await expect(client.pauseExperimentRun(run.id)).resolves.toMatchObject({
      id: "run-1",
      status: "paused",
    });
    await expect(client.resumeExperimentRun(run.id)).resolves.toMatchObject({
      id: "run-1",
      status: "running",
    });
    await expect(client.cancelExperimentRun(run.id)).resolves.toMatchObject({
      id: "run-1",
      status: "cancelled",
    });

    await expect(
      client.prepareDatasetCandidates({
        datasetId: "dataset-1",
        sources: [{ sourceKind: "production_measurement", policyId: "policy-1" }],
        contentTreatment: "realistic_anonymized",
      }),
    ).resolves.toMatchObject({
      items: [{ id: "candidate-1", contentTreatment: "realistic_anonymized" }],
    });
    await expect(
      client.searchDatasetCandidates({ datasetId: "dataset-1", status: "suggested" }),
    ).resolves.toMatchObject({ items: [{ id: "candidate-1" }] });
    await expect(
      client.commitDatasetCandidates({
        datasetId: "dataset-1",
        expectedDatasetVersion: 1,
        candidateIds: ["candidate-1"],
      }),
    ).resolves.toMatchObject({ id: "dataset-1", itemCount: 1 });

    const quality = await client.getAiQualityOverview({ projectId: "project-1", limit: 10 });
    expect(quality.segments).toContainEqual(
      expect.objectContaining({ key: "policy:policy-1", runCount: 4, regressionCount: 1 }),
    );

    expect(calls.map((call) => call.operationName)).toEqual([
      "StartExperimentRun",
      "PauseExperimentRun",
      "ResumeExperimentRun",
      "CancelExperimentRun",
      "PrepareDatasetCandidates",
      "DatasetCandidates",
      "CommitDatasetCandidates",
      "AiQualityOverview",
    ]);
  });
});

function fakeGraphQLData(operationName, variables) {
  if (operationName === "StartExperimentRun") {
    return { startExperimentRun: experimentRun("running", variables.input.experimentId) };
  }
  if (operationName === "PauseExperimentRun") {
    return { pauseExperimentRun: experimentRun("paused") };
  }
  if (operationName === "ResumeExperimentRun") {
    return { resumeExperimentRun: experimentRun("running") };
  }
  if (operationName === "CancelExperimentRun") {
    return { cancelExperimentRun: experimentRun("cancelled") };
  }
  if (operationName === "PrepareDatasetCandidates") {
    return { prepareDatasetCandidates: { items: [datasetCandidate()], nextCursor: null } };
  }
  if (operationName === "DatasetCandidates") {
    return { datasetCandidates: { items: [datasetCandidate()], nextCursor: null } };
  }
  if (operationName === "CommitDatasetCandidates") {
    return { commitDatasetCandidates: dataset() };
  }
  if (operationName === "AiQualityOverview") {
    return {
      aiQualityOverview: {
        projectId: variables.input.projectId,
        from: null,
        to: null,
        summary: { skippedReasons: ["sample_rate"] },
        warnings: ["production policy budget is near its daily limit"],
        segments: [
          {
            key: "policy:policy-1",
            label: "Checkout policy",
            dimensions: { policyId: "policy-1", service: "checkout" },
            runCount: 4,
            scoredRunCount: 3,
            passRate: 0.75,
            meanScore: 0.82,
            p50LatencyMs: 80,
            p95LatencyMs: 240,
            costUsd: 0.04,
            regressionCount: 1,
          },
        ],
      },
    };
  }
  throw new Error(`Unhandled fake GraphQL operation ${operationName}`);
}

function experimentRun(status, experimentId = "experiment-1") {
  return {
    id: "run-1",
    experimentId,
    solverRef: { kind: "agent", name: "fake-agent" },
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

function datasetCandidate() {
  return {
    id: "candidate-1",
    datasetId: "dataset-1",
    status: "suggested",
    sourceKind: "production_measurement",
    source: { policyId: "policy-1", traceId: "trace-1" },
    targetShape: "single_turn",
    input: { prompt: "Checkout failed for customer <email>" },
    expected: { answer: "Return a retryable payment error." },
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
}

function dataset() {
  return {
    id: "dataset-1",
    name: "Regression",
    description: null,
    version: 2,
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
    tags: [],
    items: { items: [], nextCursor: null },
  };
}
