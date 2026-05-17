import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dir, "../src/routes/ai-eval-route.tsx"), "utf8");

describe("AI Eval route UX migration", () => {
  test("uses URL selected state and avoids route-primary Card surfaces", () => {
    expect(routeSource).not.toContain("../components/ui/card");
    expect(routeSource).toContain('searchParams.get("run")');
    expect(routeSource).toContain('searchParams.get("dataset")');
    expect(routeSource).toContain('searchParams.get("scorer")');
    expect(routeSource).toContain('searchParams.get("experiment")');
    expect(routeSource).toContain('searchParams.get("annotation")');
  });

  test("keeps route frame, left rail tabs, main workspace, and right inspector shape", () => {
    expect(routeSource).toContain("ai-eval-left-rail");
    expect(routeSource).toContain("ai-eval-main-workspace");
    expect(routeSource).toContain("ai-eval-right-inspector");
  });

  test("covers all approved AI Eval sections and links settings without route-local GraphQL", () => {
    for (const section of [
      "overview",
      "runs",
      "datasets",
      "scorers",
      "experiments",
      "optimizations",
      "production",
      "annotations",
    ]) {
      expect(routeSource).toContain(`value="${section}"`);
    }
    expect(routeSource).toContain("/settings/ai-eval");
    expect(routeSource).toContain("controlClient.getProjectAiSettings");
    expect(routeSource).toContain("telemetryClient.getAiQualityOverview");
    expect(routeSource).not.toContain("requestAiEvalGraphQL");
    expect(routeSource).not.toContain("Project AI Eval settings");
    expect(routeSource).not.toContain("localStorage");
  });

  test("wires dataset import through staged upload, preview, and commit only", () => {
    expect(routeSource).toContain("DatasetImportSheet");
    expect(routeSource).toContain('"/api/ai-eval/dataset-imports/uploads"');
    expect(routeSource).toContain('formData.append("projectId"');
    expect(routeSource).toContain('formData.append("file"');
    expect(routeSource).toContain("telemetryClient.prepareDatasetImport");
    expect(routeSource).toContain("telemetryClient.commitDatasetImport");
    expect(routeSource).toContain("allowPartialCommit");
    expect(routeSource).toContain("valid_rows_only");
    expect(routeSource).toContain("reject_if_any_error");
    expect(routeSource).not.toContain("appendDatasetItems(");
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
});
