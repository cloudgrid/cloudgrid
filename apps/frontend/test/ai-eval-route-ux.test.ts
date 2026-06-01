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
const publicApiClientSource = readFileSync(
  join(import.meta.dir, "../../packages/public-api-client/src/client.ts"),
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
      "getOptimizationRun",
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
    expect(workspaceSource).toContain("AI input shape");
    expect(workspaceSource).toContain("Expected AI result shape");
    expect(workspaceSource).toContain("AI input JSON shape");
    expect(workspaceSource).toContain("Expected AI result JSON shape");
    expect(workspaceSource).toContain("DatasetValueContractField");
    expect(workspaceSource).toContain('type === "json"');
    expect(workspaceSource).toContain(
      "Text values use the prompt, message, answer, or result text directly",
    );
    expect(workspaceSource).toContain('useState<DatasetValueType>("text")');
    expect(workspaceSource).toContain("recommendedMetricId");
    expect(workspaceSource).toContain("DEFAULT_JSON_SCHEMA");
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
    expect(workspaceSource).toContain('t("aiEval.action.importSettings")');
    expect(workspaceSource).toContain('t("aiEval.action.exportSettings")');
    expect(workspaceSource).toContain("currentSettingsDraft");
    expect(workspaceSource).toContain("DatasetReadinessPanel");
    expect(workspaceSource).toContain('t("aiEval.readiness.title")');
    expect(workspaceSource).toContain("DatasetCandidatesPanel");
    expect(workspaceSource).toContain('t("aiEval.candidates.title")');
    expect(workspaceSource).toContain("searchDatasetCandidates");
    expect(workspaceSource).toContain("commitDatasetCandidates");
    expect(workspaceSource).toContain("Expected AI results missing");
    expect(workspaceSource).not.toContain("Schema health");
  });

  test("places trace intake only in Traces and keeps dataset settings explicit", () => {
    expect(workspaceSource).toContain('t("aiEval.action.newDataset")');
    expect(workspaceSource).toContain('t("aiEval.action.datasetSettings")');
    expect(workspaceSource).toContain("/ai-eval/datasets/new");
    expect(workspaceSource).toContain("/settings");
    expect(workspaceSource).toContain("DatasetSettingsView");
    expect(workspaceSource).not.toContain("DatasetSettingsDialog");
    expect(workspaceSource).toContain('t("aiEval.action.addRow")');
    expect(workspaceSource).toContain('t("aiEval.action.createEvaluationFromDataset")');
    expect(workspaceSource).not.toContain("Add trace to dataset");
    expect(workspaceSource).not.toContain("Add dataset");
    expect(tracesRouteSource).toContain("traces.prepareDatasetRows.action");
    expect(tracesRouteSource).toContain("TraceToDataset");
    expect(viewModelSource).toContain("compatibleTraceIntakeDatasets");
    expect(viewModelSource).toContain("datasetHasTraceIntakeRules");
  });

  test("exposes v2 evaluation creation controls without contract drift", () => {
    expect(workspaceSource).toContain("CreateEvaluationView");
    expect(workspaceSource).toContain("/ai-eval/evaluations/new");
    expect(workspaceSource).not.toContain("CreateEvaluationDialog");
    expect(workspaceSource).toContain('t("aiEval.field.rowsUsedForRuns")');
    expect(workspaceSource).toContain("Latest ready rows");
    expect(workspaceSource).toContain('t("aiEval.column.readyRows")');
    expect(workspaceSource).toContain("latest_ready");
    expect(workspaceSource).toContain("datasetDefaultMetricId");
    expect(workspaceSource).toContain("datasetDefaultSplit");
    expect(workspaceSource).not.toContain("Pinned current version");
    expect(workspaceSource).toContain('t("aiEval.field.targetKind")');
    expect(workspaceSource).toContain("external_adapter");
    expect(workspaceSource).toContain('t("aiEval.field.targetName")');
    expect(workspaceSource).toContain('t("aiEval.validation.targetRefRequired")');
    expect(workspaceSource).not.toContain("Target snapshot ID");
    expect(workspaceSource).toContain("projects.settings.aiEval");
    expect(workspaceSource).toContain('t("aiEval.field.retentionProfile")');
    expect(workspaceSource).toContain("fast_iteration");
    expect(workspaceSource).toContain("audit_friendly");
    expect(workspaceSource).toContain("minimal_storage");
  });

  test("uses route-like wizard states for durable creation and settings", () => {
    expect(workspaceSource).toContain("readAiEvalRouteState");
    expect(workspaceSource).toContain("/ai-eval/datasets/new");
    expect(workspaceSource).toContain("/ai-eval/evaluations/new");
    expect(workspaceSource).toContain("/ai-eval/optimizations/new");
    expect(workspaceSource).toContain("datasetSettingsTabs");
    expect(workspaceSource).toContain("evaluationSettingsTabs");
    expect(workspaceSource).toContain("telemetryClient.updateEvaluationDefinition");
    expect(publicApiClientSource).toContain("updateEvaluationDefinition");
    expect(workspaceSource).toContain("optimizationSettingsTabs");
    expect(workspaceSource).toContain('"Versions"');
    expect(workspaceSource).toContain('"History"');
    expect(workspaceSource).toContain('"Controls"');
    expect(workspaceSource).not.toContain("CreateDatasetDialog");
    expect(workspaceSource).not.toContain("StartOptimizationDialog");
  });

  test("renders run detail, comparison, optimization, and promotion surfaces", () => {
    expect(workspaceSource).toContain("EvaluationRunDetail");
    expect(workspaceSource).toContain("trajectorySummary");
    expect(workspaceSource).toContain("importantSteps");
    expect(workspaceSource).toContain("ComparisonView");
    expect(workspaceSource).toContain('t("aiEval.action.createComparison")');
    expect(workspaceSource).toContain("OptimizationRunDetailView");
    expect(workspaceSource).toContain("TargetPromotionDialog");
    expect(workspaceSource).toContain("SkillOptimizationStepTimeline");
    expect(workspaceSource).toContain('t("aiEval.skill.fileDiffSummary")');
    expect(workspaceSource).toContain('t("aiEval.skill.rejectedEditReasons")');
    expect(workspaceSource).toContain('t("aiEval.skill.bestSkillDigest")');
    expect(workspaceSource).toContain('t("aiEval.skill.exportedArtifactRef")');
    expect(workspaceSource).toContain('t("aiEval.field.quickShotPhase")');
    expect(workspaceSource).toContain('t("aiEval.action.newEvaluation")');
    expect(workspaceSource).toContain('t("aiEval.action.runEvaluation")');
    expect(workspaceSource).toContain('t("aiEval.action.startOptimization")');
    expect(viewModelSource).toContain("quick-shot");
    expect(workspaceSource).toContain('t("aiEval.action.promote")');
  });

  test("renders explicit skill optimization promotion state without auto-promotion", () => {
    expect(workspaceSource).toContain("PromotionActionState");
    expect(workspaceSource).toContain("promotionReadiness");
    expect(workspaceSource).toContain("hasAcceptedSkillValidationEvidence");
    expect(workspaceSource).toContain('t("aiEval.promotion.noAcceptedSkill")');
    expect(workspaceSource).toContain('t("aiEval.promotion.ready")');
    expect(workspaceSource).toContain('step.status === "accepted"');
    expect(workspaceSource).toContain('step.gateDecision === "accepted"');
    expect(workspaceSource).toContain('typeof step.validationScore === "number"');
    expect(workspaceSource).not.toContain("autoPromote");
  });

  test("shows standards-first external adapter readiness without custom span requirements", () => {
    expect(workspaceSource).toContain('t("aiEval.readiness.externalAdapter.title")');
    expect(workspaceSource).toContain('t("aiEval.readiness.httpControl")');
    expect(workspaceSource).toContain('t("aiEval.readiness.otlpEvidence")');
    expect(workspaceSource).toContain("W3C Trace Context propagation");
    expect(workspaceSource).toContain("OTel GenAI semantic conventions");
    expect(workspaceSource).toContain("OTel MCP semantic conventions");
    expect(workspaceSource).toContain("OpenInference spans");
    expect(workspaceSource).toContain("terminal output or output-ref support");
    expect(workspaceSource).toContain("missing trace propagation");
    expect(workspaceSource).toContain("missing terminal output or output");
    expect(workspaceSource).toContain("last dry-run trace link");
    expect(workspaceSource).not.toContain("cloudgrid.ai_eval");
    expect(workspaceSource).not.toContain("cloudgrid.ai.");
  });

  test("presents skill optimization runtime modes and package shape", () => {
    expect(workspaceSource).toContain('t("aiEval.field.skillRuntimeMode")');
    expect(workspaceSource).toContain('t("aiEval.option.managedHarness")');
    expect(workspaceSource).toContain('t("aiEval.readiness.managedHarness.title")');
    expect(workspaceSource).toContain('t("aiEval.option.externalAdapter")');
    expect(workspaceSource).toContain('t("aiEval.description.externalAdapterTarget")');
    expect(workspaceSource).toContain("SKILL.md");
    expect(workspaceSource).toContain("optional references");
    expect(workspaceSource).toContain("dependency manifests");
    expect(workspaceSource).toContain("runtime fixtures");
  });

  test("implements adaptive defaults, constrained controls, and self-service validation", () => {
    expect(workspaceSource).toContain("datasetCreateValidationErrors");
    expect(workspaceSource).toContain("evaluationValidationErrors");
    expect(workspaceSource).toContain("optimizationValidationErrors");
    expect(workspaceSource).toContain("tabErrorsFromValidation");
    expect(workspaceSource).toContain("validationTargetForMessage");
    expect(workspaceSource).toContain('role="alert"');
    expect(workspaceSource).toContain('t("aiEval.action.focusField")');
    expect(workspaceSource).toContain('t("aiEval.error.needsFix")');
    expect(workspaceSource).toContain("DependencyResetNote");
    expect(workspaceSource).toContain("AI input JSON shape was removed");
    expect(workspaceSource).toContain("Expected AI result JSON shape was removed");
    expect(workspaceSource).toContain("TargetReferenceField");
    expect(workspaceSource).toContain("ModelAliasField");
    expect(workspaceSource).toContain("OPTIMIZER_KIND_OPTIONS");
    expect(workspaceSource).toContain('optimizerKind === "skill_text_edit"');
    expect(workspaceSource).toContain(
      "Prompt and example optimizers use managed evaluation evidence",
    );
    expect(workspaceSource).toContain("Source evaluation changed, so the baseline target");
    expect(workspaceSource).toContain("without typing target IDs");
    expect(workspaceSource).not.toContain(
      "onChange={(event) => setPrimaryMetricId(event.target.value)}",
    );
  });
});
