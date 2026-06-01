import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aiEvalV2ScenarioFixtures,
  aiEvalV2ScenarioOperationNames,
  aiEvalV2SkillOptimizationScenarioOperationNames,
  aiEvalExternalAdapterAsyncTraceLinkFixture,
  aiEvalStandardTraceFixtures,
  buildAiEvalTraceEvidenceFixture,
  integrationScenarios,
  missingTraceEvidenceExclusionFixture,
  runAiEvalV2FakeAdapterScenario,
  runAiEvalV2SkillOptimizationScenario,
  scenarioIdsForOperation,
  traceFixtureIdsWithUnexpectedCloudGridFlavor,
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

    expect(aiEvalV2ScenarioFixtures.map((fixture) => fixture.id)).toContain(
      "ai-eval.prompt-optimization.classification",
    );
    expect(aiEvalV2ScenarioFixtures.map((fixture) => fixture.id)).toContain(
      "ai-eval.prompt-optimization.extraction",
    );

    const serializedFixtures = JSON.stringify(aiEvalV2ScenarioFixtures);
    expect(new Set(aiEvalV2ScenarioFixtures.map((fixture) => fixture.defaultExecution))).toEqual(
      new Set(["hermetic"]),
    );
    expect(serializedFixtures).toContain("curationStatus");
    expect(serializedFixtures).toContain("quick-shot");
    expect(serializedFixtures).toContain("PromptOptimizationStep");
    expect(serializedFixtures).toContain("classification.accuracy");
    expect(serializedFixtures).toContain("extraction.field_match_rate");
    expect(serializedFixtures).toContain("candidateTargetContentMode");
    expect(serializedFixtures).toContain("adapter timeout");
    expect(serializedFixtures).not.toContain("real-llm");
    expect(serializedFixtures).not.toContain("manual_real_llm");
    expect(serializedFixtures).not.toContain("scorer");
    expect(serializedFixtures).not.toContain("experiment");
  });

  test("ship classification and extraction prompt optimization fixture packs", () => {
    const classification = readPromptOptimizationFixture("classification");
    const extraction = readPromptOptimizationFixture("extraction");

    expect(classification.settings.evaluationFamily).toBe("classification");
    expect(classification.settings.defaultMetricSettings[0]?.metricId).toBe(
      "classification.accuracy",
    );
    expect(classification.behavior.primaryMetricId).toBe("classification.accuracy");
    expect(classification.rows.length).toBe(25);
    expect(splitCounts(classification.rows)).toEqual({
      training: 14,
      validation: 7,
      test: 4,
    });

    const allowedLabels = new Set(
      classification.settings.expectedJsonSchema.properties.intent.enum,
    );
    for (const row of classification.rows) {
      expect(row.curationStatus).toBe("ready");
      expect(allowedLabels.has(row.expected.intent)).toBe(true);
    }

    expect(extraction.settings.evaluationFamily).toBe("extraction");
    expect(extraction.settings.defaultMetricSettings[0]?.metricId).toBe(
      "extraction.field_match_rate",
    );
    expect(extraction.behavior.primaryMetricId).toBe("extraction.field_match_rate");
    expect(extraction.rows.length).toBe(18);
    expect(splitCounts(extraction.rows)).toEqual({
      training: 10,
      validation: 5,
      test: 3,
    });
    expect(extraction.settings.expectedJsonSchema.required).toContain("items");
    expect(extraction.behavior.expectedDiagnosis.weakFieldPaths).toContain("$.shippingCountry");

    for (const fixture of [classification, extraction]) {
      expect(fixture.target.kind).toBe("prompt");
      expect(fixture.target.parts.map((part) => part.partKind)).toContain("prompt");
      expect(fixture.target.parts.map((part) => part.partKind)).toContain("examples");
      expect(JSON.stringify(fixture.settings)).not.toContain("inputValueType");
      expect(JSON.stringify(fixture.rows)).not.toContain("reviewStatus");
    }
  });

  test("ship manual real-LLM data without making it an integration scenario", () => {
    const classification = readManualRealLlmFixture("classification");
    const extraction = readManualRealLlmFixture("extraction");
    const serializedScenarios = JSON.stringify(aiEvalV2ScenarioFixtures);

    expect(serializedScenarios).not.toContain("manual_real_llm");
    expect(classification.settings.evaluationFamily).toBe("classification");
    expect(classification.rows.length).toBeGreaterThanOrEqual(12);
    expect(splitCounts(classification.rows)).toEqual({
      training: 6,
      validation: 4,
      test: 2,
    });
    expect(classification.config.manualOnly).toBe(true);
    expect(classification.config.neverUsedByAutomatedIntegration).toBe(true);
    expect(classification.config.modelAlias).toContain("set-");
    expect(JSON.stringify(classification)).not.toMatch(/api[_-]?key|sk-[A-Za-z0-9]/i);

    expect(extraction.settings.evaluationFamily).toBe("extraction");
    expect(extraction.rows.length).toBeGreaterThanOrEqual(10);
    expect(splitCounts(extraction.rows)).toEqual({
      training: 5,
      validation: 3,
      test: 2,
    });
    expect(extraction.config.manualOnly).toBe(true);
    expect(extraction.config.neverUsedByAutomatedIntegration).toBe(true);
    expect(extraction.config.providerProfileRef).toContain("set-");
    expect(JSON.stringify(extraction)).not.toMatch(/api[_-]?key|sk-[A-Za-z0-9]/i);
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

  test("declare standards-first external adapter trace fixtures", () => {
    expect(aiEvalStandardTraceFixtures.map((fixture) => fixture.kind)).toEqual([
      "otel-genai",
      "otel-mcp",
      "openinference",
      "standard-business-failure",
      "explicit-cloudgrid-flavor",
      "standard-business-failure",
    ]);
    expect(traceFixtureIdsWithUnexpectedCloudGridFlavor()).toEqual([]);

    const externalAdapterFixture = aiEvalV2ScenarioFixtures.find(
      (fixture) => fixture.id === "ai-eval.skill-optimization.external-adapter-standard-traces",
    );
    expect(externalAdapterFixture?.defaultExecution).toBe("hermetic");
    expect(externalAdapterFixture?.failureCases[0]?.expected).toContain("trace_evidence_missing");
  });

  test("derive AI Eval evidence from standard GenAI, MCP, OpenInference, and business spans", () => {
    const evidenceByFixture = Object.fromEntries(
      aiEvalStandardTraceFixtures.map((fixture) => [
        fixture.id,
        buildAiEvalTraceEvidenceFixture(fixture),
      ]),
    );

    expect(
      evidenceByFixture["external-adapter.otel-genai.chat"]?.importantSteps.map(
        (step) => step.kind,
      ),
    ).toEqual(["model_call"]);
    expect(
      evidenceByFixture["external-adapter.otel-mcp.tool"]?.importantSteps.map((step) => step.kind),
    ).toEqual(["tool_call"]);
    expect(
      evidenceByFixture["external-adapter.openinference.tool-retriever"]?.importantSteps.map(
        (step) => step.kind,
      ),
    ).toEqual(["tool_call", "retrieval"]);
    expect(
      evidenceByFixture[
        "external-adapter.standard-failures.http-db-exception"
      ]?.importantSteps.map((step) => `${step.kind}:${step.name}`),
    ).toEqual([
      "workflow_step:HTTP POST /checkout",
      "workflow_step:DB SELECT",
      "workflow_step:ValueError",
    ]);
    expect(
      JSON.stringify(
        evidenceByFixture["external-adapter.standard-failures.http-db-exception"],
      ),
    ).not.toContain("super-secret-token");
  });

  test("cover external adapter async completion with OTLP trace linking", () => {
    const linkedTrace = aiEvalStandardTraceFixtures.find(
      (fixture) => fixture.id === aiEvalExternalAdapterAsyncTraceLinkFixture.emittedTraceFixtureId,
    );
    expect(linkedTrace).toBeDefined();
    expect(aiEvalExternalAdapterAsyncTraceLinkFixture.startResponse.status).toBe("accepted");
    expect(aiEvalExternalAdapterAsyncTraceLinkFixture.terminalResponse.status).toBe("completed");
    expect(aiEvalExternalAdapterAsyncTraceLinkFixture.terminalResponse.actualOutputRef).toMatch(
      /^artifact:\/\//,
    );
    expect(aiEvalExternalAdapterAsyncTraceLinkFixture.terminalResponse.traceRefs).toEqual([
      {
        kind: "trace",
        traceId: linkedTrace?.spans[0]?.traceId,
        spanId: linkedTrace?.rootSpanId,
      },
    ]);
    expect(linkedTrace?.traceparent).toContain(
      aiEvalExternalAdapterAsyncTraceLinkFixture.startResponse.traceId,
    );
    expect(buildAiEvalTraceEvidenceFixture(linkedTrace!).importantSteps.length).toBeGreaterThan(0);
  });

  test("document missing trace evidence optimizer exclusion without blocking terminal output", () => {
    expect(missingTraceEvidenceExclusionFixture()).toEqual({
      problemCode: "trace_evidence_missing",
      excludedFromOptimizerReflection: true,
    });
  });

  test("executes the deterministic skill optimization scenario through public operations", async () => {
    const calls: Array<{ operationName: string; variables: Record<string, unknown> }> = [];
    const result = await runAiEvalV2SkillOptimizationScenario({
      projectId: "default",
      runId: "skill-test-run",
      graphql: {
        async request(operationName, variables) {
          calls.push({ operationName, variables });
          return fakeSkillOptimizationGraphQLData(operationName);
        },
      },
      async readHarnessCapturedRequests() {
        return [
          {
            method: "POST",
            path: "/skill-optimization/reflect",
            traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
            body: { optimizerKind: "skill_text_edit" },
          },
        ];
      },
    });

    expect(result).toMatchObject({
      datasetId: "skill-dataset-1",
      baselineEvaluationRunId: "skill-baseline-run-1",
      baselineTargetSnapshotId: "skill-target-snapshot-1",
      optimizationRunId: "skill-optimization-1",
      bestTargetSnapshotId: "skill-candidate-snapshot-1",
      rejectedProtectedEditPath: "scripts/run.sh",
      acceptedSkillEditPath: "SKILL.md",
      promotionReady: true,
    });
    expect(result.exportedSkillContentRef).toMatch(/^skill-package:\/\//);
    expect(calls.map((call) => call.operationName)).toEqual(
      aiEvalV2SkillOptimizationScenarioOperationNames(),
    );
    expect(JSON.stringify(calls)).toContain('"optimizerKind":"skill_text_edit"');
    expect(JSON.stringify(calls)).toContain('"editablePartKinds":["skill"]');
    expect(JSON.stringify(calls)).toContain("adapter://cloudgrid-local-harness");
    expect(JSON.stringify(calls)).toContain('"providerProfileRef":"local-harness"');
    expect(JSON.stringify(calls)).not.toContain("real-llm");
    expect(JSON.stringify(calls)).not.toContain("OPENAI_API_KEY");
    expect(JSON.stringify(calls)).toContain('"split":"test"');
    expect(JSON.stringify(calls)).not.toContain("cloudgrid.ai.semconv.flavor");
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
    return {
      startEvaluationRun: { id: "evaluation-run-1", targetSnapshotId: "target-snapshot-1" },
    };
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

function fakeSkillOptimizationGraphQLData(operationName: string): Record<string, unknown> {
  if (operationName === "CreateDataset") {
    return { createDataset: skillDataset("skill-dataset-version-1") };
  }
  if (operationName === "AppendDatasetItems") {
    return { appendDatasetItems: skillDataset("skill-dataset-version-2") };
  }
  if (operationName === "CreateEvaluationDefinition") {
    return { createEvaluationDefinition: { id: "skill-evaluation-definition-1" } };
  }
  if (operationName === "StartEvaluationRun") {
    return {
      startEvaluationRun: {
        id: "skill-baseline-run-1",
        targetSnapshotId: "skill-target-snapshot-1",
      },
    };
  }
  if (operationName === "StartOptimizationRun") {
    return { startOptimizationRun: skillOptimizationRun() };
  }
  if (operationName === "OptimizationRun") {
    return { optimizationRun: skillOptimizationRun() };
  }
  if (operationName === "OptimizationRuns") {
    return { optimizationRuns: { items: [skillOptimizationRun()], nextCursor: null } };
  }
  throw new Error(`Unhandled skill optimization operation ${operationName}`);
}

function dataset(currentVersionId: string) {
  return {
    id: "dataset-1",
    currentVersionId,
  };
}

type PromptOptimizationFixtureFamily = "classification" | "extraction";

function readPromptOptimizationFixture(family: PromptOptimizationFixtureFamily) {
  const fixtureDirectory = join(fixtureRoot(), family);
  const requiredFiles = [
    "README.md",
    "dataset-settings.json",
    "rows.jsonl",
    "baseline-target.json",
    "baseline-prompt.md",
    "baseline-examples.jsonl",
    "expected-optimizer-behavior.json",
  ];

  for (const filename of requiredFiles) {
    expect(existsSync(join(fixtureDirectory, filename))).toBe(true);
  }

  return {
    settings: readJson(join(fixtureDirectory, "dataset-settings.json")),
    rows: readJsonl(join(fixtureDirectory, "rows.jsonl")),
    target: readJson(join(fixtureDirectory, "baseline-target.json")),
    behavior: readJson(join(fixtureDirectory, "expected-optimizer-behavior.json")),
  };
}

function readManualRealLlmFixture(family: PromptOptimizationFixtureFamily) {
  const fixtureDirectory = join(fixtureRoot(), "manual_real_llm", family);
  const requiredFiles = [
    "README.md",
    "config.template.json",
    "dataset-settings.json",
    "rows.jsonl",
    "baseline-prompt.md",
    "baseline-examples.jsonl",
    "expected-manual-checks.json",
  ];

  for (const filename of requiredFiles) {
    expect(existsSync(join(fixtureDirectory, filename))).toBe(true);
  }

  return {
    config: readJson(join(fixtureDirectory, "config.template.json")),
    settings: readJson(join(fixtureDirectory, "dataset-settings.json")),
    rows: readJsonl(join(fixtureDirectory, "rows.jsonl")),
    checks: readJson(join(fixtureDirectory, "expected-manual-checks.json")),
  };
}

function fixtureRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../../test_data/ai_eval");
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path: string) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function splitCounts(rows: Array<{ split: "training" | "validation" | "test" }>) {
  return rows.reduce(
    (counts, row) => {
      counts[row.split] += 1;
      return counts;
    },
    { training: 0, validation: 0, test: 0 },
  );
}

function skillDataset(currentVersionId: string) {
  return {
    id: "skill-dataset-1",
    currentVersionId,
  };
}

function skillOptimizationRun() {
  return {
    id: "skill-optimization-1",
    projectId: "default",
    status: "completed",
    baselineTargetSnapshotId: "skill-target-snapshot-1",
    objective: { primaryMetricId: "extraction.exact_json_match", minimumEvidence: { rows: 1 } },
    searchPolicy: {
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
    },
    candidateTargetSnapshotIds: ["skill-candidate-snapshot-1"],
    causedEvaluationRunIds: ["skill-baseline-run-1", "skill-validation-run-1"],
    comparisonIds: [],
    selectedCandidateSnapshotId: "skill-candidate-snapshot-1",
    promotionRecordId: null,
    budgetSnapshot: {},
    skillOptimization: {
      baselineSkillDigest: "sha256:deterministic-skill-manifest",
      currentSkillDigest: "sha256:candidate-skill-manifest",
      bestSkillDigest: "sha256:candidate-skill-manifest",
      bestTargetSnapshotId: "skill-candidate-snapshot-1",
      exportedSkillContentRef:
        "skill-package://skill-candidate-snapshot-1/sha256:candidate-skill-manifest",
      acceptedStepCount: 1,
      rejectedStepCount: 1,
      skippedStepCount: 0,
      failedStepCount: 0,
      steps: [
        {
          id: "step-rejected",
          optimizationRunId: "skill-optimization-1",
          epoch: 1,
          step: 1,
          status: "rejected",
          rolloutEvaluationRunId: "skill-baseline-run-1",
          candidateTargetSnapshotId: null,
          baselineSkillDigest: "sha256:deterministic-skill-manifest",
          candidateSkillDigest: null,
          proposedEdits: [],
          selectedEdits: [],
          rejectedEditSummaries: [
            {
              op: "replace",
              filePath: "scripts/run.sh",
              target: "skill_file",
              contentPreview: "echo changed",
              rationale: "Protected runtime script change must be rejected.",
              sourceType: "failure_reflection",
              supportCount: 1,
              evidenceRefs: [{ kind: "evaluation_item_run", evaluationItemRunId: "train-001" }],
            },
          ],
          trainingScore: 0,
          validationScore: 0,
          gateDecision: "failed_preflight",
        },
        {
          id: "step-accepted",
          optimizationRunId: "skill-optimization-1",
          epoch: 1,
          step: 2,
          status: "accepted",
          rolloutEvaluationRunId: "skill-validation-run-1",
          candidateTargetSnapshotId: "skill-candidate-snapshot-1",
          baselineSkillDigest: "sha256:deterministic-skill-manifest",
          candidateSkillDigest: "sha256:candidate-skill-manifest",
          proposedEdits: [],
          selectedEdits: [
            {
              op: "append",
              filePath: "SKILL.md",
              target: "skill_file",
              contentPreview: "## Escalation Checks",
              rationale: "Clarify when to ask for an account id.",
              sourceType: "failure_reflection",
              supportCount: 3,
              evidenceRefs: [{ kind: "trace", traceId: "trace-1", spanId: "span-1" }],
            },
          ],
          rejectedEditSummaries: [],
          trainingScore: 0,
          validationScore: 1,
          gateDecision: "accepted_new_best",
        },
      ],
    },
    createdAt: "2026-05-31T00:00:00.000Z",
  };
}
