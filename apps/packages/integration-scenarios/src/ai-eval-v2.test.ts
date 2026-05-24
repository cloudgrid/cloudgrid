import { describe, expect, test } from "bun:test";
import {
  aiEvalV2ScenarioFixtures,
  aiEvalV2ScenarioOperationNames,
  integrationScenarios,
  runAiEvalV2FakeAdapterScenario,
  scenarioIdsForOperation,
  uncoveredPublicGraphQLOperationNames,
} from ".";

describe("AI Eval v2 integration scenario fixtures", () => {
  test("cover dataset evaluation and optimization without legacy product concepts", () => {
    const workspace = integrationScenarios.find((scenario) => scenario.id === "ai-eval.workspace");

    expect(workspace?.covers).toContain("CreateEvaluationDefinition");
    expect(workspace?.covers).toContain("StartEvaluationRun");
    expect(workspace?.covers).toContain("CreateEvaluationComparison");
    expect(workspace?.covers).toContain("StartOptimizationRun");
    expect(workspace?.covers).toContain("OptimizationRuns");
    expect(workspace?.covers).not.toContain("AiQualityOverview");
    expect(workspace?.covers).not.toContain("AnnotationQueue");

    const serializedFixtures = JSON.stringify(aiEvalV2ScenarioFixtures);
    expect(serializedFixtures).toContain("curationStatus");
    expect(serializedFixtures).toContain("quick-shot");
    expect(serializedFixtures).toContain("adapter timeout");
    expect(serializedFixtures).not.toContain("scorer");
    expect(serializedFixtures).not.toContain("experiment");
  });

  test("declare failure coverage for invalid expected JSON and adapter timeout", () => {
    const failurePurposes = aiEvalV2ScenarioFixtures.flatMap((fixture) =>
      fixture.failureCases.map((step) => step.purpose),
    );

    expect(failurePurposes.some((purpose) => purpose.includes("expected JSON"))).toBe(true);
    expect(failurePurposes.some((purpose) => purpose.includes("adapter"))).toBe(true);
  });

  test("map new optimization operation to the AI Eval workspace scenario", () => {
    expect(scenarioIdsForOperation("OptimizationRuns")).toEqual(["ai-eval.workspace"]);
    expect(uncoveredPublicGraphQLOperationNames()).not.toContain("OptimizationRuns");
  });

  test("executes the v2 fake adapter scenario without legacy operations", async () => {
    const calls: Array<{ operationName: string; variables: Record<string, unknown> }> = [];
    const result = await runAiEvalV2FakeAdapterScenario({
      projectId: "default",
      runId: "test-run",
      graphql: {
        async request(operationName, variables) {
          calls.push({ operationName, variables });
          return fakeGraphQLData(operationName);
        },
      },
      async readHarnessCapturedRequests() {
        return [
          {
            method: "POST",
            path: "/v1/run",
            traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            body: { evaluationRunId: "evaluation-run-1" },
          },
        ];
      },
    });

    expect(result).toMatchObject({
      datasetId: "dataset-1",
      evaluationDefinitionId: "evaluation-definition-1",
      evaluationRunId: "evaluation-run-1",
      comparisonId: "comparison-1",
      optimizationRunId: "optimization-1",
      harnessTraceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    expect(calls.map((call) => call.operationName)).toEqual(aiEvalV2ScenarioOperationNames());
    expect(JSON.stringify(calls)).not.toContain("Experiment");
    expect(JSON.stringify(calls)).not.toContain("Scorer");
    expect(JSON.stringify(calls)).not.toContain("AiQualityOverview");
    expect(JSON.stringify(calls)).not.toContain("AnnotationQueue");
  });
});

function fakeGraphQLData(operationName: string): Record<string, unknown> {
  if (operationName === "CreateDataset") {
    return { createDataset: dataset("dataset-version-1") };
  }
  if (operationName === "AppendDatasetItems") {
    return { appendDatasetItems: dataset("dataset-version-2") };
  }
  if (operationName === "CreateEvaluationDefinition") {
    return { createEvaluationDefinition: { id: "evaluation-definition-1" } };
  }
  if (operationName === "StartEvaluationRun") {
    return { startEvaluationRun: { id: "evaluation-run-1" } };
  }
  if (operationName === "EvaluationRun") {
    return { evaluationRun: { id: "evaluation-run-1", status: "completed" } };
  }
  if (operationName === "EvaluationResults") {
    return { evaluationResults: { items: [], nextCursor: null } };
  }
  if (operationName === "CreateEvaluationComparison") {
    return { createEvaluationComparison: { id: "comparison-1" } };
  }
  if (operationName === "StartOptimizationRun") {
    return { startOptimizationRun: { id: "optimization-1" } };
  }
  if (operationName === "OptimizationRuns") {
    return { optimizationRuns: { items: [{ id: "optimization-1" }], nextCursor: null } };
  }
  throw new Error(`Unhandled operation ${operationName}`);
}

function dataset(currentVersionId: string) {
  return {
    id: "dataset-1",
    currentVersionId,
  };
}
