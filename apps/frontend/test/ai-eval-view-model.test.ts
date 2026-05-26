import { describe, expect, test } from "bun:test";
import type { DatasetItemRun, ExperimentRun } from "@cloudgrid/ui-contracts";
import {
  agentRunTimelineRows,
  aiEvalOverviewModel,
  experimentScoreboardRows,
  jsonPreview,
} from "../src/features/ai-eval/view-model";
import {
  compatibleTraceImportDatasets,
  parseRawValue,
  validateAgainstJsonSchema,
} from "../src/features/ai-eval/view-model-v2";

describe("AI-eval view helpers", () => {
  test("orders agent timeline rows by GraphQL-provided span event timing", () => {
    const rows = agentRunTimelineRows({
      id: "run-1",
      traceId: "trace-1",
      rootSpanId: "root",
      agent: { name: "SupportAgent" },
      status: "ok",
      startedAt: "2026-05-12T10:00:00.000Z",
      endedAt: null,
      durationMs: 50,
      transcript: [],
      evalResults: [],
      llmCalls: [
        {
          id: "llm-1",
          traceId: "trace-1",
          spanId: "span-2",
          requestModel: "gpt-test",
          responseModel: null,
          provider: "openai",
          latencyMs: 35,
          tokenTotals: { input: 12, output: 8, total: 20 },
          tokenDetails: {},
        },
      ],
      toolCalls: [
        {
          id: "tool-1",
          traceId: "trace-1",
          spanId: "span-1",
          toolName: "lookupOrder",
          toolCallId: null,
          parametersDigest: null,
          resultDigest: null,
          latencyMs: 10,
          status: "ok",
          synthetic: false,
        },
      ],
      retrievalEvents: [
        {
          id: "retrieval-1",
          traceId: "trace-1",
          spanId: "span-3",
          documentCount: 4,
          topK: 5,
          embeddingModel: "text-embedding-test",
          latencyMs: 9,
          documentDigests: ["digest-1"],
        },
      ],
    });

    expect(rows.map((row) => row.kind)).toEqual(["tool", "llm", "retrieval"]);
    expect(rows[1]).toMatchObject({
      spanId: "span-2",
      label: "gpt-test",
      latencyMs: 35,
      tokenTotal: 20,
    });
  });

  test("uses experiment run summary scoreboard values without recomputing scores", () => {
    const itemRun: DatasetItemRun = {
      id: "item-run-1",
      experimentRunId: "run-1",
      datasetItemId: "item-1",
      output: { answer: "A" },
      latencyMs: 15,
      evalResults: [
        {
          id: "eval-1",
          scorerId: "exact",
          scorerVersion: 1,
          targetKind: "datasetItemRun",
          targetId: "item-run-1",
          experimentRunId: "run-1",
          score: 0,
          passed: false,
          producedAt: "2026-05-12T10:01:00.000Z",
        },
      ],
    };
    const run: ExperimentRun = {
      id: "run-1",
      experimentId: "experiment-1",
      solverRef: { kind: "agent", name: "candidate" },
      status: "finished",
      runPolicy: { maxParallelRequests: 10 },
      startedAt: "2026-05-12T10:00:00.000Z",
      endedAt: "2026-05-12T10:01:00.000Z",
      summary: {
        itemCounts: {
          total: 1,
          passed: 0,
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
            passRate: 0.97,
            meanScore: 0.91,
            p50: 0.94,
            p95: 0.99,
            support: 1,
          },
        ],
        problemCounts: {
          modelQuality: 1,
          itemQuality: 0,
          scorerConfig: 0,
          infrastructure: 0,
        },
        budgetUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedUsd: 0,
        },
        latency: null,
        regressions: [{ kind: "quality", count: 1, blocker: true }],
      },
      itemRuns: { items: [itemRun], nextCursor: null },
    };

    expect(experimentScoreboardRows([run])).toEqual([
      {
        runId: "run-1",
        status: "finished",
        passRate: 0.97,
        meanScore: 0.91,
        p50Score: 0.94,
        p95Score: 0.99,
        regression: true,
        itemRunCount: 1,
      },
    ]);
  });

  test("keeps JSON previews bounded for dense cells", () => {
    expect(jsonPreview({ input: "x".repeat(200) }, 32)).toHaveLength(32);
  });

  test("builds overview from GraphQL view models without raw telemetry derivation", () => {
    const model = aiEvalOverviewModel({
      annotationsOpen: 3,
      datasets: [
        {
          id: "dataset-1",
          name: "Support",
          version: 2,
          createdAt: "2026-05-12T10:00:00.000Z",
          itemCount: 20,
          reviewedItemCount: 12,
          splitCounts: {},
          health: {
            status: "ready",
            reviewedItemCount: 12,
            totalItemCount: 20,
            splitCounts: {},
            duplicateCandidateCount: 0,
            leakageWarningCount: 0,
            missingExpectedCount: 0,
            schemaIssueCount: 0,
            smallDataset: true,
            warnings: [],
          },
          tags: [],
          items: { items: [], nextCursor: null },
        },
        {
          id: "dataset-2",
          name: "Regression",
          version: 1,
          createdAt: "2026-05-12T10:00:00.000Z",
          itemCount: 5,
          reviewedItemCount: 1,
          splitCounts: {},
          health: {
            status: "low_confidence",
            reviewedItemCount: 1,
            totalItemCount: 5,
            splitCounts: {},
            duplicateCandidateCount: 1,
            leakageWarningCount: 0,
            missingExpectedCount: 2,
            schemaIssueCount: 0,
            smallDataset: true,
            warnings: ["Small dataset"],
          },
          tags: [],
          items: { items: [], nextCursor: null },
        },
      ],
      quality: {
        projectId: "project-1",
        from: null,
        to: null,
        summary: { passRate: 0.82, meanScore: 0.74 },
        warnings: ["Missing holdout"],
        segments: [
          {
            key: "agent",
            label: "Agent",
            dimensions: {},
            runCount: 10,
            scoredRunCount: 9,
            regressionCount: 2,
          },
        ],
      },
      settings: {
        projectId: "project-1",
        enabled: true,
        providerProfiles: [],
        modelAliases: [],
        onlinePolicies: [
          {
            id: "policy-1",
            enabled: true,
            name: "Sample",
            target: {},
            scorerIds: ["exact"],
            sampleRate: 0.1,
            maxDailyRuns: null,
            annotationRules: [],
            updatedAt: "2026-05-12T10:00:00.000Z",
            updatedByUserId: "user-1",
          },
        ],
        budget: { dailyUsd: 10, perRunUsd: null, deterministicOnly: false, spentTodayUsd: 2 },
        sampling: {
          defaultOnlineSampleRate: 0.1,
          maxOnlineSampleRate: 1,
          maxConcurrentExperimentItems: 4,
          maxConcurrentOptimizationCandidates: 2,
        },
        datasetDefaults: {
          splitAllocation: {},
          smallDatasetReviewedThreshold: 30,
          requireReviewForRegression: true,
        },
        effective: {
          warnings: ["Provider profile missing"],
          deterministicOnly: false,
          missingProviderProfiles: [],
          disabledProviderProfiles: [],
          budgetExhausted: false,
        },
        version: 1,
        updatedAt: "2026-05-12T10:00:00.000Z",
        updatedByUserId: "user-1",
      },
    });

    expect(model).toMatchObject({
      qualityPassRate: 0.82,
      qualityMeanScore: 0.74,
      qualityRegressionCount: 2,
      datasetCount: 2,
      unhealthyDatasetCount: 1,
      annotationBacklog: 3,
      activePolicyCount: 1,
      budgetSpentTodayUsd: 2,
      budgetDailyUsd: 10,
    });
    expect(model.warnings).toEqual(["Missing holdout", "Provider profile missing"]);
  });

  test("validates raw JSON row values against simple dataset schemas", () => {
    const parsed = parseRawValue('{"label":"refund"}', "json");

    expect(parsed.error).toBeNull();
    expect(
      validateAgainstJsonSchema(parsed.value, {
        type: "object",
        required: ["label"],
      }),
    ).toBeNull();
    expect(
      validateAgainstJsonSchema(parsed.value, {
        type: "object",
        required: ["missing"],
      }),
    ).toBe('Missing required property "missing".');
  });

  test("trace import picker only includes datasets with extraction settings", () => {
    const datasets = [
      {
        id: "dataset-1",
        name: "Trace-ready",
        version: 1,
        createdAt: "2026-05-12T10:00:00.000Z",
        itemCount: 0,
        reviewedItemCount: 0,
        splitCounts: {},
        health: {
          status: "ready",
          reviewedItemCount: 0,
          totalItemCount: 0,
          splitCounts: {},
          duplicateCandidateCount: 0,
          leakageWarningCount: 0,
          missingExpectedCount: 0,
          schemaIssueCount: 0,
          smallDataset: true,
          warnings: [],
        },
        tags: [],
        settings: { traceExtractionSettings: { inputPath: "$.input" } },
      },
      {
        id: "dataset-2",
        name: "Manual only",
        version: 1,
        createdAt: "2026-05-12T10:00:00.000Z",
        itemCount: 0,
        reviewedItemCount: 0,
        splitCounts: {},
        health: {
          status: "ready",
          reviewedItemCount: 0,
          totalItemCount: 0,
          splitCounts: {},
          duplicateCandidateCount: 0,
          leakageWarningCount: 0,
          missingExpectedCount: 0,
          schemaIssueCount: 0,
          smallDataset: true,
          warnings: [],
        },
        tags: [],
      },
    ];

    expect(compatibleTraceImportDatasets(datasets).map((dataset) => dataset.id)).toEqual([
      "dataset-1",
    ]);
  });
});
