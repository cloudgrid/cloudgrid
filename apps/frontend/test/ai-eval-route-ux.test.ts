import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dir, "../src/routes/ai-eval-route.tsx"), "utf8");

describe("AI Eval route UX migration", () => {
  test("uses URL selected state and avoids route-primary Card surfaces", () => {
    expect(routeSource).not.toContain("../components/ui/card");
    expect(routeSource).toContain('searchParams.get("workflow")');
    expect(routeSource).toContain('searchParams.get("dataset")');
    expect(routeSource).toContain('searchParams.get("scorer")');
    expect(routeSource).toContain('searchParams.get("experiment")');
    expect(routeSource).not.toContain('searchParams.get("run")');
    expect(routeSource).not.toContain('searchParams.get("annotation")');
  });

  test("keeps route frame, left rail tabs, and main workspace without a permanent inspector", () => {
    expect(routeSource).toContain("ai-eval-left-rail");
    expect(routeSource).toContain("ai-eval-main-workspace");
    expect(routeSource).not.toContain("ai-eval-right-inspector");
    expect(routeSource).not.toContain("Select a row to inspect details");
  });

  test("covers only the approved AI Eval sections and links settings without route-local GraphQL", () => {
    for (const section of ["datasets", "scorers", "experiments", "production"]) {
      expect(routeSource).toContain(`value="${section}"`);
    }
    expect(routeSource).not.toContain('value="runs"');
    expect(routeSource).not.toContain('value="annotations"');
    expect(routeSource).not.toContain('value="overview"');
    expect(routeSource).not.toContain('value="optimizations"');
    expect(routeSource).toContain("/settings/ai-eval");
    expect(routeSource).toContain("controlClient.getProjectAiSettings");
    expect(routeSource).toContain("telemetryClient.getAiQualityOverview");
    expect(routeSource).not.toContain("requestAiEvalGraphQL");
    expect(routeSource).not.toContain("Project AI Eval settings");
    expect(routeSource).not.toContain("localStorage");
  });

  test("uses shared AI Eval query builders for route data inputs", () => {
    expect(routeSource).toContain("buildDatasetSearchInput");
    expect(routeSource).toContain("buildScorerSearchInput");
    expect(routeSource).toContain("buildExperimentSearchInput");
    expect(routeSource).toContain("buildAiQualityOverviewInput");
    expect(routeSource).toContain("@cloudgrid/ui-contracts");
  });

  test("wires dataset import through a dedicated workflow with staged upload, preview, and commit only", () => {
    expect(routeSource).toContain("DatasetImportWorkflow");
    expect(routeSource).toContain("data-ai-eval-dataset-import-workflow");
    expect(routeSource).not.toContain("DatasetImportSheet");
    expect(routeSource).toContain('"/api/ai-eval/dataset-imports/uploads"');
    expect(routeSource).toContain('formData.append("projectId"');
    expect(routeSource).toContain('formData.append("file"');
    expect(routeSource).toContain("telemetryClient.prepareDatasetImport");
    expect(routeSource).toContain("telemetryClient.commitDatasetImport");
    expect(routeSource).toContain("allowPartialCommit");
    expect(routeSource).toContain("valid_rows_only");
    expect(routeSource).toContain("reject_if_any_error");
  });

  test("keeps dataset import mapping explicit and export same-origin", () => {
    for (const mappingTarget of [
      "input",
      "expected",
      "metadata",
      "sourceTraceId",
      "sourceSpanId",
      "split",
      "reviewStatus",
    ]) {
      expect(routeSource).toContain(mappingTarget);
    }
    for (const sourceKind of ["column", "jsonPath", "constant", "defaultValue"]) {
      expect(routeSource).toContain(sourceKind);
    }
    expect(routeSource).toContain("DatasetExportDialog");
    expect(routeSource).toContain("telemetryClient.startDatasetExport");
    expect(routeSource).toContain("telemetryClient.getDatasetExport");
    expect(routeSource).toContain("downloadSameOriginExport");
    expect(routeSource).toContain("new URL(job.downloadUrl, window.location.origin)");
  });

  test("exposes real dataset, scorer, and experiment administration actions", () => {
    expect(routeSource).toContain("CreateDatasetDialog");
    expect(routeSource).toContain("data-ai-eval-dataset-workbench");
    expect(routeSource).toContain("telemetryClient.createDataset");
    expect(routeSource).toContain("AddDatasetRowDialog");
    expect(routeSource).toContain("telemetryClient.appendDatasetItems");
    expect(routeSource).toContain("Input prompt");
    expect(routeSource).toContain("Expected answer");
    expect(routeSource).toContain("Expected JSON shape");
    expect(routeSource).toContain("All datasets");
    expect(routeSource).not.toContain("needs the dataset item mutation contract");
    expect(routeSource).toContain("CreateScorerDialog");
    expect(routeSource).toContain("telemetryClient.createScorer");
    expect(routeSource).toContain("Scorer template");
    expect(routeSource).toContain("Match field");
    expect(routeSource).toContain("scorerMatchFields");
    expect(routeSource).toContain("Value type");
    expect(routeSource).toContain("Expected value");
    expect(routeSource).not.toContain("Definition JSON");
    expect(routeSource).toContain("CreateExperimentDialog");
    expect(routeSource).toContain("telemetryClient.createExperiment");
    expect(routeSource).toContain("Solver kind");
    expect(routeSource).toContain("Solver name");
    expect(routeSource).not.toContain("Solver reference JSON");
    expect(routeSource).toContain("StartExperimentRunButton");
    expect(routeSource).toContain("telemetryClient.startExperimentRun");
    expect(routeSource).toContain("Run evaluation");
  });
});
