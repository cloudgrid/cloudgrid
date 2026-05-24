import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dir, "../src/routes/ai-eval-route.tsx"), "utf8");
const workspaceSource = readFileSync(
  join(import.meta.dir, "../src/features/ai-eval/workspace.tsx"),
  "utf8",
);
const viewModelSource = readFileSync(
  join(import.meta.dir, "../src/features/ai-eval/view-model-v2.ts"),
  "utf8",
);
const appShellSource = readFileSync(join(import.meta.dir, "../src/routes/app-shell.tsx"), "utf8");
const tracesRouteSource = readFileSync(
  join(import.meta.dir, "../src/routes/traces-route.tsx"),
  "utf8",
);

describe("AI Eval v2 route UX", () => {
  test("keeps route composition thin and avoids route-primary card surfaces", () => {
    expect(routeSource).toContain("AiEvalWorkspace");
    expect(workspaceSource).not.toContain("../components/ui/card");
    expect(workspaceSource).toContain("ai-eval-main-workspace");
    expect(workspaceSource).toContain('searchParams.get("dataset")');
    expect(workspaceSource).toContain('searchParams.get("evaluation")');
    expect(workspaceSource).toContain('searchParams.get("run")');
    expect(workspaceSource).not.toContain('searchParams.get("scorer")');
    expect(workspaceSource).not.toContain('searchParams.get("experiment")');
  });

  test("navigation exposes only Datasets and Evaluations", () => {
    expect(appShellSource).toContain("aiEvalSubItems");
    expect(appShellSource).toContain("/ai-eval?tab=");
    expect(appShellSource).toContain('t("nav.aiEvalDatasets")');
    expect(appShellSource).toContain('t("nav.aiEvalEvaluations")');
    expect(appShellSource).not.toContain('t("nav.aiEvalScorers")');
    expect(appShellSource).not.toContain('t("nav.aiEvalExperiments")');
    expect(appShellSource).not.toContain('t("nav.aiEvalProduction")');
    expect(workspaceSource).toContain('section === "datasets"');
    expect(workspaceSource).toContain('section === "evaluations"');
    expect(workspaceSource).not.toContain('section === "production"');
  });

  test("uses v2 GraphQL client methods directly", () => {
    for (const method of [
      "searchEvaluationDefinitions",
      "createEvaluationDefinition",
      "searchEvaluationRuns",
      "startEvaluationRun",
      "searchEvaluationComparisons",
      "createEvaluationComparison",
      "searchOptimizationRuns",
      "startOptimizationRun",
      "promoteTargetSnapshot",
      "updateDatasetItems",
    ]) {
      expect(workspaceSource).toContain(`telemetryClient.${method}`);
    }
    for (const legacyMethod of [
      "searchScorers",
      "createScorer",
      "searchExperiments",
      "createExperiment",
      "startExperimentRun",
      "getAiQualityOverview",
    ]) {
      expect(workspaceSource).not.toContain(`telemetryClient.${legacyMethod}`);
    }
  });

  test("supports raw JSON schema and row validation without a JSON builder", () => {
    expect(workspaceSource).toContain("Input JSON schema");
    expect(workspaceSource).toContain("Expected JSON schema");
    expect(workspaceSource).toContain("parseAndValidateValue");
    expect(viewModelSource).toContain("validateAgainstJsonSchema");
    expect(workspaceSource).not.toContain("Expected JSON shape");
    expect(workspaceSource).not.toContain("buildExpectedJsonValue");
  });

  test("keeps dataset import, export, split, and curation v2-shaped", () => {
    expect(workspaceSource).toContain("DatasetImportDialog");
    expect(workspaceSource).toContain("data-ai-eval-dataset-import-workflow");
    expect(workspaceSource).toContain("telemetryClient.prepareDatasetImport");
    expect(workspaceSource).toContain("telemetryClient.commitDatasetImport");
    expect(workspaceSource).toContain("telemetryClient.startDatasetExport");
    expect(workspaceSource).toContain("valid_rows_only");
    expect(workspaceSource).toContain("reject_if_any_error");
    expect(workspaceSource).toContain("sourceTraceId");
    expect(workspaceSource).toContain("sourceSpanId");
    expect(workspaceSource).toContain("DATASET_SPLITS");
    expect(workspaceSource).toContain("DATASET_CURATION_STATUSES");
  });

  test("places trace-to-dataset import only in Traces and keeps dataset settings explicit", () => {
    expect(workspaceSource).toContain("New dataset");
    expect(workspaceSource).toContain("Dataset settings");
    expect(workspaceSource).toContain("Add row");
    expect(workspaceSource).toContain("Create evaluation from dataset");
    expect(workspaceSource).not.toContain("Add trace to dataset");
    expect(workspaceSource).not.toContain("Add dataset");
    expect(tracesRouteSource).toContain("Add trace to dataset");
    expect(tracesRouteSource).toContain("TraceToDatasetImportPicker");
    expect(viewModelSource).toContain("compatibleTraceImportDatasets");
    expect(viewModelSource).toContain("datasetHasExtractionSettings");
  });

  test("exposes v2 evaluation creation controls without contract drift", () => {
    expect(workspaceSource).toContain('triggerLabel = "New evaluation"');
    expect(workspaceSource).toContain("Dataset version policy");
    expect(workspaceSource).toContain("latest_ready");
    expect(workspaceSource).toContain("pinnedDatasetVersionId");
    expect(workspaceSource).toContain("Target kind");
    expect(workspaceSource).toContain("external_adapter");
    expect(workspaceSource).toContain("Target display name");
    expect(workspaceSource).toContain("Target ref");
    expect(workspaceSource).toContain("Target snapshot ID");
    expect(workspaceSource).toContain("Retention profile");
    expect(workspaceSource).toContain("fast_iteration");
    expect(workspaceSource).toContain("audit_friendly");
    expect(workspaceSource).toContain("minimal_storage");
  });

  test("renders run detail, comparison, optimization, and promotion surfaces", () => {
    expect(workspaceSource).toContain("EvaluationRunDetail");
    expect(workspaceSource).toContain("trajectorySummary");
    expect(workspaceSource).toContain("importantSteps");
    expect(workspaceSource).toContain("ComparisonView");
    expect(workspaceSource).toContain("Create comparison");
    expect(workspaceSource).toContain("OptimizationRunDetailView");
    expect(workspaceSource).toContain("TargetPromotionDialog");
    expect(workspaceSource).toContain("Quick-shot phase");
    expect(workspaceSource).toContain("New evaluation");
    expect(workspaceSource).toContain("Run evaluation");
    expect(workspaceSource).toContain("Start optimization");
    expect(viewModelSource).toContain("quick-shot");
    expect(workspaceSource).toContain("Promote");
  });
});
