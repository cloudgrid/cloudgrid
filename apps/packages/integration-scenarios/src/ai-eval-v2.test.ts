import { describe, expect, test } from "bun:test";
import {
  aiEvalV2ScenarioFixtures,
  integrationScenarios,
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
});
