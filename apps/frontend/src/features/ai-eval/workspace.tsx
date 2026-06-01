import type {
  AppendDatasetItemsInput,
  CreateDatasetInput,
  CreateEvaluationComparisonInput,
  CreateEvaluationDefinitionInput,
  Dataset,
  DatasetCandidate,
  DatasetCurationStatus,
  DatasetItem,
  DatasetSplit,
  DatasetValueType,
  EvaluationDefinition,
  EvaluationFamily,
  EvaluationRun,
  EvaluationTargetKind,
  JSONValue,
  MetricSettingInput,
  OptimizationOptimizerKind,
  OptimizationRun,
  RetentionProfile,
  SkillOptimizationDetail,
  SkillOptimizationEdit,
  SkillOptimizationStep,
  StartDatasetExportInput,
  StartEvaluationRunInput,
  StartOptimizationRunInput,
  UpdateDatasetItemsInput,
  UpdateDatasetSettingsInput,
  UpdateEvaluationDefinitionInput,
} from "@cloudgrid/ui-contracts";
import {
  buildDatasetSearchInput,
  type EvaluationDefinitionSearchInput,
  type EvaluationRunSearchInput,
} from "@cloudgrid/ui-contracts";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  GitCompareArrows,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Upload,
  XCircle,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CodeBlock } from "../../components/code-block";
import { JsonEditor } from "../../components/json-editor";
import { JsonViewer } from "../../components/json-viewer";
import { EmptyState, ErrorPanel, LoadingRows } from "../../components/query-state";
import { SearchInput } from "../../components/search-input";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import { t } from "../../lib/i18n";
import { useAppSession } from "../../providers/app-session-provider";
import { useTelemetryClient } from "../../providers/telemetry-client-provider";
import {
  curationStatusLabel,
  DATASET_CURATION_STATUSES,
  DATASET_SPLITS,
  datasetCurrentVersionId,
  datasetDefaultSplit,
  datasetExpectedValueOptions,
  datasetReadyItemCount,
  datasetReadySplitCount,
  datasetSplitLabel,
  datasetValueTypeLabel,
  evaluationDisplayName,
  jsonPreview,
  metricAggregateLabel,
  metricResultLabel,
  optimizationPhaseLabel,
  parseRawValue,
  runProgressLabel,
  splitCoverageLabel,
  validateAgainstJsonSchema,
} from "./view-model-v2";

type AiEvalSection = "datasets" | "evaluations";
type QueryResult<T> = UseQueryResult<T, Error>;
type SelectOption<T extends string> = { description?: string; label: string; value: T };
type DatasetSettingsDraft = CreateDatasetInput["settings"];
type FieldValidationTarget = { fieldId?: string; message: string; tab?: string };
type AiEvalRouteState =
  | { kind: "workspace"; section: AiEvalSection | null }
  | { kind: "dataset-create"; section: "datasets" }
  | { datasetId: string; kind: "dataset-settings"; section: "datasets" }
  | { kind: "evaluation-create"; section: "evaluations" }
  | { evaluationId: string; kind: "evaluation-settings"; section: "evaluations" }
  | { kind: "optimization-create"; section: "evaluations" }
  | { kind: "optimization-settings"; optimizationRunId: string; section: "evaluations" };

const EVALUATION_FAMILY_OPTIONS: SelectOption<EvaluationFamily>[] = [
  { label: "Classification", value: "classification" },
  { label: "Extraction", value: "extraction" },
  { label: "Free-form answer", value: "freeform_answer" },
  { label: "Tool use", value: "tool_use" },
  { label: "Agent loop", value: "agent_loop" },
  { label: "Workflow", value: "workflow" },
  { label: "Skill", value: "skill" },
];
const METRIC_OPTIONS: SelectOption<string>[] = [
  { label: "Exact JSON match", value: "extraction.exact_json_match" },
  { label: "Exact text match", value: "text.exact_match" },
  { label: "Contains expected text", value: "text.contains_expected" },
  { label: "Custom metric id", value: "__custom__" },
];
const TRACE_PATH_OPTIONS: SelectOption<string>[] = [
  { label: "Not configured", value: "__empty__" },
  { label: "$.input", value: "$.input" },
  { label: "$.messages", value: "$.messages" },
  { label: "$.expected", value: "$.expected" },
  { label: "$.actualOutput", value: "$.actualOutput" },
  { label: "$.output", value: "$.output" },
  { label: "Custom path", value: "__custom__" },
];
const TARGET_REF_OPTIONS = {
  external_adapter: [
    { label: "Project-approved adapter profile", value: "adapter://project-approved" },
  ],
  prompt: [{ label: "Current project prompt", value: "prompt://current" }],
} as const;
const MODEL_ALIAS_OPTIONS: SelectOption<string>[] = [
  { label: "Default project model alias", value: "default" },
];
const OPTIMIZER_KIND_OPTIONS: SelectOption<OptimizationOptimizerKind>[] = [
  { label: "Critic, mutate, judge, pick", value: "critic_mutate_judge_pick" },
  { label: "Bootstrap few-shot examples", value: "bootstrap_fewshot" },
  { label: "Skill text edit", value: "skill_text_edit" },
];
const DEFAULT_JSON_SCHEMA = '{\n  "type": "object"\n}';
const DEFAULT_FIRST_RUN_SPLIT: DatasetSplit = "validation";
const HTTP_CONTROL_READINESS_CHECKS = [
  "adapter authentication",
  "async polling",
  "terminal output or output-ref support",
  "cancellation handling",
  "usage, cost, and timing metadata",
];
const OTLP_EVIDENCE_READINESS_CHECKS = [
  "W3C Trace Context propagation",
  "OTLP trace ingest",
  "OTel GenAI semantic conventions",
  "OTel MCP semantic conventions",
  "OpenInference spans",
  "recognized production HTTP, RPC, database, messaging, filesystem, and exception spans",
];

export function AiEvalWorkspace({ enabled }: { enabled: boolean }) {
  const location = useLocation();
  const routeState = readAiEvalRouteState(location.pathname);
  const [searchParams, setSearchParams] = useSearchParams();
  const section = routeState.section ?? readSection(searchParams.get("tab"));
  const query = searchParams.get("query") ?? "";
  const selectedDatasetId = searchParams.get("dataset");
  const selectedEvaluationId = searchParams.get("evaluation");
  const selectedRunId = searchParams.get("run");
  const telemetryClient = useTelemetryClient();
  const { viewer } = useAppSession();
  const selectedProject = viewer?.selectedProject ?? null;
  const projectId = selectedProject?.id ?? "";
  const shouldQuery = enabled && Boolean(projectId);

  const datasetInput = useMemo(
    () => ({ ...buildDatasetSearchInput({ query: query || null, limit: 50 }), projectId }),
    [projectId, query],
  );
  const evaluationInput = useMemo<EvaluationDefinitionSearchInput>(
    () => ({ projectId, query: query || null, limit: 50 }),
    [projectId, query],
  );
  const runInput = useMemo<EvaluationRunSearchInput>(
    () => ({
      projectId,
      evaluationDefinitionId: selectedEvaluationId || null,
      limit: 50,
    }),
    [projectId, selectedEvaluationId],
  );

  const datasetsQuery = useQuery({
    enabled: shouldQuery,
    queryKey: ["Datasets", datasetInput],
    queryFn: () => telemetryClient.searchDatasets(datasetInput),
  });
  const evaluationsQuery = useQuery({
    enabled: shouldQuery && section === "evaluations",
    queryKey: ["EvaluationDefinitions", evaluationInput],
    queryFn: () => telemetryClient.searchEvaluationDefinitions(evaluationInput),
  });
  const runsQuery = useQuery({
    enabled: shouldQuery && section === "evaluations",
    queryKey: ["EvaluationRuns", runInput],
    queryFn: () => telemetryClient.searchEvaluationRuns(runInput),
  });
  const comparisonsQuery = useQuery({
    enabled: shouldQuery && section === "evaluations",
    queryKey: ["EvaluationComparisons", projectId],
    queryFn: () => telemetryClient.searchEvaluationComparisons({ projectId, limit: 25 }),
  });
  const optimizationsQuery = useQuery({
    enabled: shouldQuery && section === "evaluations",
    queryKey: ["OptimizationRuns", projectId],
    queryFn: () => telemetryClient.searchOptimizationRuns({ projectId, limit: 25 }),
  });
  const selectedSettingsOptimizationId =
    routeState.kind === "optimization-settings" ? routeState.optimizationRunId : "";
  const optimizationDetailQuery = useQuery({
    enabled: shouldQuery && routeState.kind === "optimization-settings",
    queryKey: ["OptimizationRun", selectedSettingsOptimizationId],
    queryFn: () => telemetryClient.getOptimizationRun(selectedSettingsOptimizationId),
  });

  const selectedDataset = datasetsQuery.data?.items.find((item) => item.id === selectedDatasetId);
  const selectedEvaluation = evaluationsQuery.data?.items.find(
    (item) => item.id === selectedEvaluationId,
  );
  const selectedRun = runsQuery.data?.items.find((item) => item.id === selectedRunId);
  const selectedSettingsDataset =
    routeState.kind === "dataset-settings"
      ? datasetsQuery.data?.items.find((item) => item.id === routeState.datasetId)
      : null;
  const selectedSettingsEvaluation =
    routeState.kind === "evaluation-settings"
      ? evaluationsQuery.data?.items.find((item) => item.id === routeState.evaluationId)
      : null;
  const selectedSettingsOptimization =
    routeState.kind === "optimization-settings"
      ? (optimizationDetailQuery.data ??
        optimizationsQuery.data?.items.find((item) => item.id === routeState.optimizationRunId))
      : null;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === "tab") {
      next.delete("dataset");
      next.delete("evaluation");
      next.delete("run");
    }
    setSearchParams(next);
  };

  if (!enabled) {
    return (
      <EmptyState
        description={t("aiEval.disabled.description")}
        filtered
        primaryAction={
          <Button asChild variant="outline">
            <Link to={projectId ? `/projects/${projectId}/settings/ai-eval` : "/projects"}>
              <Settings data-icon="inline-start" />
              {t("aiEval.action.settings")}
            </Link>
          </Button>
        }
        title={t("aiEval.disabled.title")}
      />
    );
  }

  if (routeState.kind === "dataset-create") {
    return <CreateDatasetView projectId={projectId} />;
  }
  if (routeState.kind === "evaluation-create") {
    return (
      <CreateEvaluationView
        datasets={datasetsQuery.data?.items ?? []}
        initialDatasetId={searchParams.get("dataset") ?? ""}
        projectId={projectId}
      />
    );
  }
  if (routeState.kind === "optimization-create") {
    return (
      <StartOptimizationView
        datasets={datasetsQuery.data?.items ?? []}
        evaluations={evaluationsQuery.data?.items ?? []}
        projectId={projectId}
      />
    );
  }
  if (routeState.kind === "dataset-settings") {
    if (datasetsQuery.isLoading) {
      return <LoadingRows />;
    }
    if (datasetsQuery.isError) {
      return (
        <ErrorPanel error={datasetsQuery.error} onRetry={() => void datasetsQuery.refetch()} />
      );
    }
    if (!selectedSettingsDataset) {
      return (
        <EmptyState
          description={t("aiEval.notFound.dataset.description")}
          filtered
          primaryAction={
            <Button asChild variant="outline">
              <Link to="/ai-eval?tab=datasets">
                <Database data-icon="inline-start" />
                {t("aiEval.datasets")}
              </Link>
            </Button>
          }
          title={t("aiEval.notFound.dataset.title")}
        />
      );
    }
    return <DatasetSettingsView dataset={selectedSettingsDataset} />;
  }
  if (routeState.kind === "evaluation-settings") {
    if (evaluationsQuery.isLoading) {
      return <LoadingRows />;
    }
    if (evaluationsQuery.isError) {
      return (
        <ErrorPanel
          error={evaluationsQuery.error}
          onRetry={() => void evaluationsQuery.refetch()}
        />
      );
    }
    if (!selectedSettingsEvaluation) {
      return (
        <EmptyState
          description={t("aiEval.notFound.evaluation.description")}
          filtered
          primaryAction={
            <Button asChild variant="outline">
              <Link to="/ai-eval?tab=evaluations">
                <ClipboardCheck data-icon="inline-start" />
                {t("nav.aiEvalEvaluations")}
              </Link>
            </Button>
          }
          title={t("aiEval.notFound.evaluation.title")}
        />
      );
    }
    return (
      <EvaluationSettingsView
        datasets={datasetsQuery.data?.items ?? []}
        definition={selectedSettingsEvaluation}
      />
    );
  }
  if (routeState.kind === "optimization-settings") {
    if (optimizationsQuery.isLoading || optimizationDetailQuery.isLoading) {
      return <LoadingRows />;
    }
    if (optimizationsQuery.isError || optimizationDetailQuery.isError) {
      return (
        <ErrorPanel
          error={(optimizationsQuery.error ?? optimizationDetailQuery.error) as Error}
          onRetry={() => {
            void optimizationsQuery.refetch();
            void optimizationDetailQuery.refetch();
          }}
        />
      );
    }
    if (!selectedSettingsOptimization) {
      return (
        <EmptyState
          description={t("aiEval.notFound.optimization.description")}
          filtered
          primaryAction={
            <Button asChild variant="outline">
              <Link to="/ai-eval?tab=evaluations">
                <ClipboardCheck data-icon="inline-start" />
                {t("nav.aiEvalEvaluations")}
              </Link>
            </Button>
          }
          title={t("aiEval.notFound.optimization.title")}
        />
      );
    }
    return <OptimizationSettingsView run={selectedSettingsOptimization} />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <AiEvalHeader
        onQueryChange={(value) => setParam("query", value)}
        query={query}
        section={section}
      />
      <main className="min-h-0 flex-1 overflow-auto" data-ai-eval-main-workspace="true">
        {section === "datasets" ? (
          <DatasetsListView
            onSelect={(id) => setParam("dataset", id)}
            projectId={projectId}
            query={datasetsQuery}
            selectedDataset={selectedDataset ?? null}
          />
        ) : (
          <EvaluationsWorkspace
            comparisonsQuery={comparisonsQuery}
            datasets={datasetsQuery.data?.items ?? []}
            evaluationsQuery={evaluationsQuery}
            onRunSelect={(id) => setParam("run", id)}
            onSelect={(id) => setParam("evaluation", id)}
            optimizationsQuery={optimizationsQuery}
            runsQuery={runsQuery}
            selectedEvaluation={selectedEvaluation ?? null}
            selectedRun={selectedRun ?? null}
          />
        )}
      </main>
    </section>
  );
}

function AiEvalHeader({
  onQueryChange,
  query,
  section,
}: {
  onQueryChange: (value: string) => void;
  query: string;
  section: AiEvalSection;
}) {
  const title = section === "datasets" ? t("aiEval.datasets") : t("nav.aiEvalEvaluations");
  const description =
    section === "datasets"
      ? t("aiEval.workspace.datasets.description")
      : t("aiEval.workspace.evaluations.description");

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SearchInput
          aria-label={t("filters.query")}
          className="max-w-72"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={
            section === "datasets" ? t("aiEval.search.datasets") : t("aiEval.search.evaluations")
          }
          value={query}
        />
        {section === "datasets" ? (
          <Button asChild size="sm" type="button" variant="outline">
            <Link to="/ai-eval/datasets/new">
              <Plus data-icon="inline-start" />
              {t("aiEval.action.newDataset")}
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild size="sm" type="button" variant="outline">
              <Link to="/ai-eval/evaluations/new">
                <Plus data-icon="inline-start" />
                {t("aiEval.action.newEvaluation")}
              </Link>
            </Button>
            <Button asChild size="sm" type="button" variant="outline">
              <Link to="/ai-eval/optimizations/new">
                <RefreshCw data-icon="inline-start" />
                {t("aiEval.action.startOptimization")}
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function DatasetsListView({
  onSelect,
  projectId,
  query,
  selectedDataset,
}: {
  onSelect: (id: string) => void;
  projectId: string;
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchDatasets"]>>>;
  selectedDataset: Dataset | null;
}) {
  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }
  const datasets = query.data?.items ?? [];
  if (datasets.length === 0) {
    return (
      <EmptyState
        description={t("aiEval.empty.datasets.description")}
        filtered={false}
        primaryAction={
          <Button asChild>
            <Link to="/ai-eval/datasets/new">
              <Plus data-icon="inline-start" />
              {t("aiEval.action.newDataset")}
            </Link>
          </Button>
        }
        title={t("aiEval.empty.datasets.title")}
      />
    );
  }
  if (selectedDataset) {
    return <DatasetDetailView dataset={selectedDataset} projectId={projectId} />;
  }
  return (
    <div className="min-h-0 overflow-auto border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("aiEval.column.name")}</TableHead>
            <TableHead>{t("aiEval.column.evaluationType")}</TableHead>
            <TableHead>{t("aiEval.column.inputExpected")}</TableHead>
            <TableHead>{t("aiEval.column.currentVersion")}</TableHead>
            <TableHead>{t("aiEval.column.readyRows")}</TableHead>
            <TableHead>{t("aiEval.column.splitCoverage")}</TableHead>
            <TableHead>{t("aiEval.column.lastUpdated")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((dataset) => (
            <TableRow key={dataset.id} onClick={() => onSelect(dataset.id)}>
              <TableCell>
                <div className="font-medium">{dataset.name}</div>
                <div className="text-xs text-muted-foreground">{dataset.description}</div>
              </TableCell>
              <TableCell>
                {evaluationFamilyLabel(
                  (datasetSetting(dataset, "evaluationFamily") ?? "classification") as
                    | EvaluationFamily
                    | string,
                )}
              </TableCell>
              <TableCell>
                {datasetValueTypeLabel(datasetSetting(dataset, "inputType"))} /{" "}
                {datasetValueTypeLabel(datasetSetting(dataset, "expectedType"))}
              </TableCell>
              <TableCell>{dataset.currentVersion.version}</TableCell>
              <TableCell>{datasetReadyItemCount(dataset)}</TableCell>
              <TableCell className="max-w-80 truncate">
                {splitCoverageLabel(dataset.splitCounts)}
              </TableCell>
              <TableCell>{formatDate(dataset.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DatasetDetailView({ dataset, projectId }: { dataset: Dataset; projectId: string }) {
  const items = dataset.items?.items ?? [];
  const isEvaluationEligible = datasetReadyItemCount(dataset) > 0;
  return (
    <section className="min-h-0 overflow-auto border" data-ai-eval-dataset-workbench="true">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div>
          <h2 className="text-sm font-medium">{dataset.name}</h2>
          <p className="text-xs text-muted-foreground">{t("aiEval.detail.dataset.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <Link to={`/ai-eval/datasets/${encodeURIComponent(dataset.id)}/settings`}>
              <Settings data-icon="inline-start" />
              {t("aiEval.action.datasetSettings")}
            </Link>
          </Button>
          {isEvaluationEligible ? (
            <Button asChild size="sm" type="button" variant="outline">
              <Link to={`/ai-eval/evaluations/new?dataset=${encodeURIComponent(dataset.id)}`}>
                <Plus data-icon="inline-start" />
                {t("aiEval.action.createEvaluationFromDataset")}
              </Link>
            </Button>
          ) : (
            <Button disabled size="sm" type="button" variant="outline">
              <Plus data-icon="inline-start" />
              {t("aiEval.action.createEvaluation")}
            </Button>
          )}
          <DatasetImportDialog dataset={dataset} projectId={projectId} />
          <DatasetExportDialog dataset={dataset} />
          <DatasetRowDialog dataset={dataset} mode="add" />
        </div>
      </div>
      <DatasetReadinessPanel dataset={dataset} projectId={projectId} />
      <DatasetCandidatesPanel dataset={dataset} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("aiEval.column.split")}</TableHead>
            <TableHead>{t("aiEval.column.curation")}</TableHead>
            <TableHead>{t("aiEval.column.inputPreview")}</TableHead>
            <TableHead>{t("aiEval.column.expectedPreview")}</TableHead>
            <TableHead>{t("aiEval.column.reasonPreview")}</TableHead>
            <TableHead>{t("aiEval.column.observedOutput")}</TableHead>
            <TableHead>{t("aiEval.source")}</TableHead>
            <TableHead>{t("aiEval.column.validation")}</TableHead>
            <TableHead className="text-right">{t("aiEval.action.edit")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{datasetSplitLabel(item.latestRevision.split)}</TableCell>
              <TableCell>{curationStatusLabel(item.latestRevision.curationStatus)}</TableCell>
              <TableCell className="max-w-64 truncate">
                {jsonPreview(item.latestRevision.input)}
              </TableCell>
              <TableCell className="max-w-64 truncate">
                {jsonPreview(item.latestRevision.expected)}
              </TableCell>
              <TableCell className="max-w-56 truncate">
                {String(itemValue(item, "reason") ?? "")}
              </TableCell>
              <TableCell>
                {itemValue(item, "observedOutput")
                  ? t("aiEval.value.captured")
                  : t("aiEval.value.empty")}
              </TableCell>
              <TableCell>
                {sourceTraceId(item) ? (
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    to={`/traces/${sourceTraceId(item)}`}
                  >
                    {t("aiEval.column.trace")}
                  </Link>
                ) : (
                  t("aiEval.value.manual")
                )}
              </TableCell>
              <TableCell>
                {item.latestRevision.curationStatus === "ready" ? (
                  <Badge variant="secondary">{t("aiEval.value.ready")}</Badge>
                ) : (
                  <Badge variant="outline">{t("aiEval.value.needsWork")}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DatasetRowDialog dataset={dataset} item={item} mode="edit" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length === 0 ? (
        <div className="border-t border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("aiEval.detail.dataset.emptyRows")}
        </div>
      ) : null}
    </section>
  );
}

function DatasetReadinessPanel({ dataset, projectId }: { dataset: Dataset; projectId: string }) {
  const issues = datasetReadinessIssues(dataset);
  const total = dataset.health.totalItemCount || dataset.itemCount;
  const ready = datasetReadyItemCount(dataset);
  const needsRows = ready === 0 || total === 0 || dataset.health.missingExpectedCount > 0;
  return (
    <section className="border-b px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{t("aiEval.readiness.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("aiEval.readiness.summary", { ready: String(ready), total: String(total) })}
          </p>
        </div>
        <Badge variant={issues.length === 0 ? "secondary" : "outline"}>
          {issues.length === 0 ? t("aiEval.readiness.ready") : t("aiEval.readiness.actionNeeded")}
        </Badge>
      </div>
      {issues.length ? (
        <div className="mt-3 grid gap-2">
          {issues.map((issue) => (
            <div
              className="flex flex-wrap items-start justify-between gap-3 border px-3 py-2 text-sm"
              key={issue.title}
            >
              <div>
                <div className="font-medium">{issue.title}</div>
                <div className="text-xs text-muted-foreground">{issue.description}</div>
              </div>
              {issue.action ? (
                <Button asChild size="sm" type="button" variant="outline">
                  <Link to={issue.action.to}>
                    <Settings data-icon="inline-start" />
                    {issue.action.label}
                  </Link>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {needsRows ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <DatasetRowDialog dataset={dataset} mode="add" />
          <DatasetImportDialog dataset={dataset} projectId={projectId} />
          <Button asChild size="sm" type="button" variant="outline">
            <Link to={`/ai-eval/datasets/${encodeURIComponent(dataset.id)}/settings`}>
              <Settings data-icon="inline-start" />
              {t("aiEval.action.datasetSettings")}
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function DatasetCandidatesPanel({ dataset }: { dataset: Dataset }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(() => new Set());
  const query = useQuery({
    enabled: Boolean(dataset.id),
    queryKey: ["DatasetCandidates", dataset.id],
    queryFn: () => telemetryClient.searchDatasetCandidates({ datasetId: dataset.id, limit: 25 }),
  });
  const candidates =
    query.data?.items.filter(
      (candidate) =>
        candidate.status !== "committed" &&
        candidate.status !== "dismissed" &&
        candidate.status !== "superseded",
    ) ?? [];
  const selectedIds = candidates
    .filter(
      (candidate) =>
        selectedCandidateIds.has(candidate.id) && !candidateHasBlockingIssue(candidate),
    )
    .map((candidate) => candidate.id);
  const mutation = useMutation({
    mutationFn: () =>
      telemetryClient.commitDatasetCandidates({
        datasetId: dataset.id,
        expectedDatasetVersionId: datasetCurrentVersionId(dataset),
        candidateIds: selectedIds,
        split: datasetDefaultSplit(dataset),
        curationStatus: "needs_review",
        idempotencyKey: `dataset-candidates-${dataset.id}-${Date.now()}`,
      }),
    async onSuccess() {
      setSelectedCandidateIds(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["DatasetCandidates", dataset.id] }),
        queryClient.invalidateQueries({ queryKey: ["Datasets"] }),
      ]);
    },
  });

  if (!query.isLoading && !query.isError && candidates.length === 0) {
    return null;
  }

  const toggleCandidate = (candidateId: string, checked: boolean) => {
    setSelectedCandidateIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(candidateId);
      } else {
        next.delete(candidateId);
      }
      return next;
    });
  };

  return (
    <section className="border-b px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{t("aiEval.candidates.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("aiEval.candidates.description")}</p>
        </div>
        <Button
          disabled={selectedIds.length === 0 || mutation.isPending}
          onClick={() => void mutation.mutateAsync()}
          size="sm"
          type="button"
        >
          <ClipboardCheck data-icon="inline-start" />
          {t("aiEval.candidates.addSelected")}
        </Button>
      </div>
      {query.isLoading ? <LoadingRows /> : null}
      {query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {candidates.length > 0 ? (
        <div className="mt-3 overflow-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("aiEval.column.select")}</TableHead>
                <TableHead>{t("aiEval.source")}</TableHead>
                <TableHead>{t("aiEval.column.inputPreview")}</TableHead>
                <TableHead>{t("aiEval.column.expectedResult")}</TableHead>
                <TableHead>{t("aiEval.column.traceIntakeRule")}</TableHead>
                <TableHead>{t("aiEval.column.validation")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => {
                const hasBlockingIssue = candidateHasBlockingIssue(candidate);
                const traceId = candidateSourceTraceId(candidate);
                return (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={t("aiEval.candidates.selectAria", { id: candidate.id })}
                        checked={selectedCandidateIds.has(candidate.id)}
                        disabled={hasBlockingIssue}
                        onCheckedChange={(checked) =>
                          toggleCandidate(candidate.id, checked === true)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {traceId ? (
                        <Link
                          className="text-primary underline-offset-4 hover:underline"
                          to={`/traces/${traceId}`}
                        >
                          {t("aiEval.column.trace")}
                        </Link>
                      ) : (
                        candidate.sourceKind
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {jsonPreview(candidate.input)}
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {candidate.expected === undefined || candidate.expected === null
                        ? t("aiEval.candidates.needsExpected")
                        : jsonPreview(candidate.expected)}
                    </TableCell>
                    <TableCell>
                      {candidate.traceIntakeRuleName ?? t("aiEval.candidates.matchedRule")}
                    </TableCell>
                    <TableCell>
                      {hasBlockingIssue ? (
                        <Badge variant="outline">{t("aiEval.candidates.fixRequired")}</Badge>
                      ) : candidate.duplicateHint ? (
                        <Badge variant="outline">{t("aiEval.candidates.possibleDuplicate")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("aiEval.candidates.readyToReview")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {mutation.error ? (
        <div className="mt-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mutation.error.message}
        </div>
      ) : null}
    </section>
  );
}

function EvaluationsWorkspace({
  comparisonsQuery,
  datasets,
  evaluationsQuery,
  onRunSelect,
  onSelect,
  optimizationsQuery,
  runsQuery,
  selectedEvaluation,
  selectedRun,
}: {
  comparisonsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationComparisons"]>>
  >;
  datasets: Dataset[];
  evaluationsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationDefinitions"]>>
  >;
  onRunSelect: (id: string) => void;
  onSelect: (id: string) => void;
  optimizationsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchOptimizationRuns"]>>
  >;
  runsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationRuns"]>>
  >;
  selectedEvaluation: EvaluationDefinition | null;
  selectedRun: EvaluationRun | null;
}) {
  if (evaluationsQuery.isLoading) {
    return <LoadingRows />;
  }
  if (evaluationsQuery.isError) {
    return (
      <ErrorPanel error={evaluationsQuery.error} onRetry={() => void evaluationsQuery.refetch()} />
    );
  }
  const evaluations = evaluationsQuery.data?.items ?? [];
  const eligibleDatasets = datasets.filter((dataset) => datasetReadyItemCount(dataset) > 0);
  if (evaluations.length === 0) {
    if (datasets.length === 0) {
      return (
        <EmptyState
          description={t("aiEval.empty.noEvaluationDataset.description")}
          filtered={false}
          primaryAction={
            <Button asChild>
              <Link to="/ai-eval/datasets/new">
                <Plus data-icon="inline-start" />
                {t("aiEval.action.newDataset")}
              </Link>
            </Button>
          }
          title={t("aiEval.empty.noEvaluationDataset.title")}
        />
      );
    }
    if (eligibleDatasets.length === 0) {
      return (
        <EmptyState
          description={t("aiEval.empty.datasetsNeedReadyRows.description")}
          filtered={false}
          primaryAction={
            <Button asChild>
              <Link to="/ai-eval?tab=datasets">
                <Database data-icon="inline-start" />
                {t("aiEval.action.openDatasets")}
              </Link>
            </Button>
          }
          title={t("aiEval.empty.datasetsNeedReadyRows.title")}
        />
      );
    }
    return (
      <EmptyState
        description={t("aiEval.empty.evaluations.description")}
        filtered={false}
        primaryAction={
          <Button asChild>
            <Link
              to={`/ai-eval/evaluations/new?dataset=${encodeURIComponent(eligibleDatasets[0]?.id ?? "")}`}
            >
              <Plus data-icon="inline-start" />
              {t("aiEval.action.newEvaluation")}
            </Link>
          </Button>
        }
        title={t("aiEval.empty.evaluations.title")}
      />
    );
  }
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.4fr)]">
      <section className="min-h-0 overflow-auto border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiEval.column.name")}</TableHead>
              <TableHead>{t("aiEval.field.dataset")}</TableHead>
              <TableHead>{t("aiEval.column.splitSelector")}</TableHead>
              <TableHead>{t("aiEval.column.target")}</TableHead>
              <TableHead>{t("aiEval.column.lastUpdated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluations.map((definition) => (
              <TableRow key={definition.id} onClick={() => onSelect(definition.id)}>
                <TableCell className="font-medium">{definition.name}</TableCell>
                <TableCell>
                  {datasets.find((dataset) => dataset.id === definition.datasetId)?.name ??
                    definition.datasetId}
                </TableCell>
                <TableCell>{definition.splitSelector.splits.join(", ")}</TableCell>
                <TableCell>{definition.targetRef.displayName}</TableCell>
                <TableCell>{formatDate(definition.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="min-h-0 overflow-auto border">
        {selectedEvaluation ? (
          <EvaluationDetailView
            comparisonsQuery={comparisonsQuery}
            datasets={datasets}
            definition={selectedEvaluation}
            onRunSelect={onRunSelect}
            optimizationsQuery={optimizationsQuery}
            runsQuery={runsQuery}
            selectedRun={selectedRun}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <ClipboardCheck aria-hidden className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t("aiEval.empty.evaluationSelected.title")}</p>
            <p className="max-w-64 text-xs text-muted-foreground">
              {t("aiEval.empty.evaluationSelected.description")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function EvaluationDetailView({
  comparisonsQuery,
  datasets,
  definition,
  onRunSelect,
  optimizationsQuery,
  runsQuery,
  selectedRun,
}: {
  comparisonsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationComparisons"]>>
  >;
  datasets: Dataset[];
  definition: EvaluationDefinition;
  onRunSelect: (id: string) => void;
  optimizationsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchOptimizationRuns"]>>
  >;
  runsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationRuns"]>>
  >;
  selectedRun: EvaluationRun | null;
}) {
  const runs = runsQuery.data?.items ?? [];
  return (
    <div className="grid min-h-0 gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{evaluationDisplayName(definition, datasets)}</h2>
          <p className="text-xs text-muted-foreground">
            {evaluationDatasetRowsLabel(definition)} · {definition.targetRef.kind} ·{" "}
            {definition.metricSettings.map((item) => item.metricId).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <Link to={`/ai-eval/evaluations/${encodeURIComponent(definition.id)}/settings`}>
              <Settings data-icon="inline-start" />
              {t("aiEval.action.settings")}
            </Link>
          </Button>
          <StartEvaluationRunButton datasets={datasets} definition={definition} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvaluationRunsTable onRunSelect={onRunSelect} query={runsQuery} runs={runs} />
        {selectedRun || runs[0] ? (
          <EvaluationRunDetail run={(selectedRun || runs[0]) as EvaluationRun} />
        ) : null}
      </div>
      <ComparisonView comparisonsQuery={comparisonsQuery} runs={runs} />
      <OptimizationRunDetailView
        optimizationsQuery={optimizationsQuery}
        projectId={definition.projectId}
      />
    </div>
  );
}

function EvaluationRunsTable({
  onRunSelect,
  query,
  runs,
}: {
  onRunSelect: (id: string) => void;
  query: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationRuns"]>>
  >;
  runs: EvaluationRun[];
}) {
  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="overflow-auto border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("aiEval.column.status")}</TableHead>
            <TableHead>{t("aiEval.column.progress")}</TableHead>
            <TableHead>{t("aiEval.column.primaryMetric")}</TableHead>
            <TableHead>{t("aiEval.column.control")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} onClick={() => onRunSelect(run.id)}>
              <TableCell>{run.status}</TableCell>
              <TableCell>{runProgressLabel(run)}</TableCell>
              <TableCell>
                {run.metricAggregates[0]
                  ? metricAggregateLabel(run.metricAggregates[0])
                  : t("aiEval.value.pending")}
              </TableCell>
              <TableCell>
                <EvaluationRunControls run={run} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {runs.length === 0 ? (
        <div className="border-t border-dashed p-4 text-sm text-muted-foreground">
          {t("aiEval.runs.empty")}
        </div>
      ) : null}
    </div>
  );
}

function EvaluationRunDetail({ run }: { run: EvaluationRun }) {
  const itemRuns = run.itemRuns?.items ?? [];
  return (
    <div className="overflow-auto border">
      <div className="border-b px-3 py-2">
        <h3 className="text-sm font-medium">{t("aiEval.detail.run.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("aiEval.detail.run.description")}</p>
      </div>
      <div className="grid gap-3 p-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="border px-3 py-2">
            <div className="text-muted-foreground">{t("aiEval.column.status")}</div>
            <div>{run.status}</div>
          </div>
          <div className="border px-3 py-2">
            <div className="text-muted-foreground">{t("aiEval.field.statusRetention")}</div>
            <div>{run.retentionProfile}</div>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("aiEval.detail.aggregateMetrics")}</h4>
          {run.metricAggregates.length ? (
            <ul className="grid gap-2">
              {run.metricAggregates.map((aggregate) => (
                <li
                  className="border px-3 py-2"
                  key={`${aggregate.metricId}:${aggregate.subjectId}`}
                >
                  {metricAggregateLabel(aggregate)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="border border-dashed p-3 text-muted-foreground">
              {t("aiEval.detail.noAggregates")}
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("aiEval.detail.itemRuns")}</h4>
          <div className="overflow-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("aiEval.column.status")}</TableHead>
                  <TableHead>{t("aiEval.column.actualExpected")}</TableHead>
                  <TableHead>{t("aiEval.column.trajectorySummary")}</TableHead>
                  <TableHead>{t("aiEval.column.importantSteps")}</TableHead>
                  <TableHead>{t("aiEval.column.trace")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemRuns.map((itemRun) => (
                  <TableRow key={itemRun.id}>
                    <TableCell>{itemRun.status}</TableCell>
                    <TableCell className="max-w-64">
                      {jsonPreview(itemRun.actualOutput, 80)}
                      <div className="text-xs text-muted-foreground">
                        {itemRun.metricResults.map(metricResultLabel).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 truncate">{itemRun.trajectorySummary}</TableCell>
                    <TableCell>{itemRun.importantSteps.length}</TableCell>
                    <TableCell>
                      {itemRun.traceId ? (
                        <Link
                          className="text-primary hover:underline"
                          to={`/traces/${itemRun.traceId}`}
                        >
                          {t("aiEval.column.trace")}
                        </Link>
                      ) : (
                        t("aiEval.value.none")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {itemRuns.length === 0 ? (
            <div className="border-x border-b border-dashed p-3 text-sm text-muted-foreground">
              {t("aiEval.detail.noItemRuns")}
            </div>
          ) : null}
        </div>
        <details className="border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            {t("aiEval.detail.advanced")}
          </summary>
          <JsonViewer
            value={{
              targetSnapshotId: run.targetSnapshotId,
              datasetDigest: run.datasetDigest,
              retentionRole: run.retentionRole,
            }}
          />
        </details>
      </div>
    </div>
  );
}

function ComparisonView({
  comparisonsQuery,
  runs,
}: {
  comparisonsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchEvaluationComparisons"]>>
  >;
  runs: EvaluationRun[];
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [baselineRunId, setBaselineRunId] = useState("");
  const [candidateRunId, setCandidateRunId] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateEvaluationComparisonInput = {
        projectId: runs[0]?.projectId ?? "",
        baselineRunId,
        candidateRunId,
        idempotencyKey: `comparison-${Date.now()}`,
      };
      return telemetryClient.createEvaluationComparison(input);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationComparisons"] });
    },
  });
  const comparisons = comparisonsQuery.data?.items ?? [];
  return (
    <section className="border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h3 className="text-sm font-medium">{t("aiEval.comparison.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("aiEval.comparison.description")}</p>
        </div>
        <Select onValueChange={setBaselineRunId} value={baselineRunId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t("aiEval.comparison.baselineRun")} />
          </SelectTrigger>
          <SelectContent>
            {runs.map((run, index) => (
              <SelectItem key={run.id} value={run.id}>
                Run {index + 1} · {run.status}
                {run.metricAggregates[0]
                  ? ` · ${metricAggregateLabel(run.metricAggregates[0])}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setCandidateRunId} value={candidateRunId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t("aiEval.comparison.candidateRun")} />
          </SelectTrigger>
          <SelectContent>
            {runs.map((run, index) => (
              <SelectItem key={run.id} value={run.id}>
                Run {index + 1} · {run.status}
                {run.metricAggregates[0]
                  ? ` · ${metricAggregateLabel(run.metricAggregates[0])}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={!baselineRunId || !candidateRunId || mutation.isPending}
          onClick={() => void mutation.mutateAsync()}
          size="sm"
          type="button"
          variant="outline"
        >
          <GitCompareArrows data-icon="inline-start" />
          {t("aiEval.action.createComparison")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2">
        {comparisons.map((comparison) => (
          <div className="border px-3 py-2 text-sm" key={comparison.id}>
            <div className="font-medium">
              {comparison.baselineRunId} → {comparison.candidateRunId}
            </div>
            <div className="text-muted-foreground">{comparison.summary}</div>
          </div>
        ))}
        {comparisons.length === 0 ? (
          <div className="border border-dashed p-3 text-sm text-muted-foreground">
            {t("aiEval.comparison.empty")}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OptimizationRunDetailView({
  optimizationsQuery,
  projectId,
}: {
  optimizationsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchOptimizationRuns"]>>
  >;
  projectId: string;
}) {
  const runs = optimizationsQuery.data?.items ?? [];
  return (
    <section className="border p-3">
      <h3 className="text-sm font-medium">{t("aiEval.optimization.progress.title")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("aiEval.optimization.progress.description")}
      </p>
      <div className="mt-3 grid gap-2">
        {runs.map((run) => (
          <div className="flex flex-wrap items-center gap-2 border px-3 py-2 text-sm" key={run.id}>
            <Badge variant="outline">{run.status}</Badge>
            <span className="font-medium">{optimizationPhaseLabel(run)}</span>
            <span className="text-muted-foreground">
              {run.candidateTargetSnapshotIds.length} candidates ·{" "}
              {run.causedEvaluationRunIds.length} runs
            </span>
            <Button asChild size="sm" type="button" variant="outline">
              <Link to={`/ai-eval/optimizations/${encodeURIComponent(run.id)}/settings`}>
                <Settings data-icon="inline-start" />
                {isConfigurableRunStatus(run.status)
                  ? t("aiEval.action.settings")
                  : t("dashboards.details")}
              </Link>
            </Button>
            <TargetPromotionDialog projectId={projectId} run={run} />
          </div>
        ))}
        {runs.length === 0 ? (
          <div className="border border-dashed p-3 text-sm text-muted-foreground">
            {t("aiEval.optimization.empty")}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CreateDatasetView({ projectId }: { projectId: string }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Purpose");
  const [name, setName] = useState("");
  const [evaluationFamily, setEvaluationFamily] = useState<EvaluationFamily>("classification");
  const [inputType, setInputType] = useState<DatasetValueType>("text");
  const [expectedType, setExpectedType] = useState<DatasetValueType>("text");
  const [inputSchema, setInputSchema] = useState("");
  const [expectedSchema, setExpectedSchema] = useState("");
  const [metricId, setMetricId] = useState("text.exact_match");
  const [metricTouched, setMetricTouched] = useState(false);
  const [traceServiceName, setTraceServiceName] = useState("");
  const [traceOperationName, setTraceOperationName] = useState("");
  const [inputPath, setInputPath] = useState("");
  const [expectedPath, setExpectedPath] = useState("");
  const [anonymizationMode, setAnonymizationMode] = useState<"off" | "realistic" | "redact">(
    "redact",
  );
  const [error, setError] = useState<string | null>(null);
  const [dependencyNote, setDependencyNote] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const parsedInputSchema =
        inputType === "json"
          ? parseRawValue(inputSchema, "json")
          : { value: null as JSONValue, error: null as string | null };
      const parsedExpectedSchema =
        expectedType === "json"
          ? parseRawValue(expectedSchema, "json")
          : { value: null as JSONValue, error: null as string | null };
      if (parsedInputSchema.error) {
        throw new Error(`Input JSON schema is invalid: ${parsedInputSchema.error}`);
      }
      if (parsedExpectedSchema.error) {
        throw new Error(`Expected JSON schema is invalid: ${parsedExpectedSchema.error}`);
      }
      const settings: CreateDatasetInput["settings"] = {
        evaluationFamily,
        inputType,
        expectedType,
        inputJsonSchema: inputType === "json" ? parsedInputSchema.value : null,
        expectedJsonSchema: expectedType === "json" ? parsedExpectedSchema.value : null,
        expectedValueOptions: [],
        defaultSplit: DEFAULT_FIRST_RUN_SPLIT,
        intakePolicy: {
          manualDefaultStatus: "draft",
          importDefaultStatus: "needs_review",
          traceDefaultStatus: "needs_expected",
        },
        traceIntakeRules: buildTraceIntakeRules({
          curationStatus: "needs_expected",
          expectedPath,
          inputPath,
          observedOutputPath: "$.actualOutput",
          serviceName: traceServiceName,
          split: DEFAULT_FIRST_RUN_SPLIT,
          operationName: traceOperationName,
        }),
        anonymizationPolicy: { mode: anonymizationMode },
        defaultMetricSettings: [{ metricId: metricId.trim() || "extraction.exact_json_match" }],
        retentionProfile: "balanced",
      };
      return telemetryClient.createDataset({
        projectId,
        name: name.trim(),
        description: null,
        tags: [],
        settings,
        idempotencyKey: `dataset-${Date.now()}`,
      });
    },
    onSuccess(dataset) {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
      navigate(`/ai-eval?tab=datasets&dataset=${encodeURIComponent(dataset.id)}`);
    },
  });
  const validationErrors = datasetCreateValidationErrors({
    evaluationFamily,
    expectedSchema,
    expectedType,
    inputSchema,
    inputType,
    name,
  });
  const updateSuggestedMetric = (
    nextFamily: EvaluationFamily,
    nextInputType: DatasetValueType,
    nextExpectedType: DatasetValueType,
  ) => {
    if (!metricTouched) {
      setMetricId(recommendedMetricId(nextFamily, nextInputType, nextExpectedType));
    }
  };
  const handleEvaluationFamilyChange = (next: EvaluationFamily) => {
    setEvaluationFamily(next);
    updateSuggestedMetric(next, inputType, expectedType);
    setDependencyNote(
      "Evaluation type updated the suggested metric when the metric was still using a default.",
    );
  };
  const handleInputTypeChange = (next: DatasetValueType) => {
    const previousSchema = inputSchema.trim();
    setInputType(next);
    if (next === "json" && !inputSchema.trim()) {
      setInputSchema(DEFAULT_JSON_SCHEMA);
      setDependencyNote("AI input JSON shape was added because JSON input needs a schema.");
    }
    if (next === "text" && previousSchema) {
      setInputSchema("");
      setDependencyNote(
        "AI input JSON shape was removed because text input does not use a JSON schema.",
      );
    }
    updateSuggestedMetric(evaluationFamily, next, expectedType);
  };
  const handleExpectedTypeChange = (next: DatasetValueType) => {
    const previousSchema = expectedSchema.trim();
    setExpectedType(next);
    if (next === "json" && !expectedSchema.trim()) {
      setExpectedSchema(DEFAULT_JSON_SCHEMA);
      setDependencyNote(
        "Expected AI result JSON shape was added because JSON results need a schema.",
      );
    }
    if (next === "text" && previousSchema) {
      setExpectedSchema("");
      setDependencyNote(
        "Expected AI result JSON shape was removed because text results do not use a JSON schema.",
      );
    }
    updateSuggestedMetric(evaluationFamily, inputType, next);
  };
  const handleMetricChange = (next: string) => {
    setMetricTouched(true);
    setMetricId(next);
  };
  return (
    <WizardPage
      activeTab={activeTab}
      backTo="/ai-eval?tab=datasets"
      description={t("aiEval.description.datasetCreate")}
      error={error ?? mutation.error?.message ?? null}
      errorTargetId={validationTargetForMessage(error ?? mutation.error?.message).fieldId}
      onBack={() => setActiveTab(previousWizardTab(datasetCreateTabs, activeTab))}
      onNext={() => {
        setError(null);
        const tabError = datasetCreateTabError(activeTab, {
          evaluationFamily,
          expectedSchema,
          expectedType,
          inputSchema,
          inputType,
          name,
        });
        if (tabError) {
          setError(tabError);
          return;
        }
        setActiveTab(nextWizardTab(datasetCreateTabs, activeTab));
      }}
      onSave={() => {
        setError(null);
        if (validationErrors.length) {
          setError(validationErrors[0]?.message ?? t("aiEval.error.datasetValidationFailed"));
          return;
        }
        void mutation.mutateAsync().catch((caught) => {
          setError(
            caught instanceof Error ? caught.message : t("aiEval.error.datasetCreationFailed"),
          );
        });
      }}
      onTabChange={setActiveTab}
      saveIcon={<Plus data-icon="inline-start" />}
      saveLabel={t("aiEval.action.newDataset")}
      saving={mutation.isPending}
      tabErrors={tabErrorsFromValidation(validationErrors)}
      tabs={datasetCreateTabs}
      title={t("aiEval.action.newDataset")}
    >
      {dependencyNote ? <DependencyResetNote>{dependencyNote}</DependencyResetNote> : null}
      {activeTab === "Purpose" ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="dataset-name">{t("aiEval.column.name")}</FieldLabel>
            <Input
              aria-invalid={Boolean(error?.includes("Dataset name"))}
              id="dataset-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <FieldDescription>
              Use a name that describes the job this dataset measures, such as checkout routing or
              support triage.
            </FieldDescription>
          </Field>
          <EvaluationFamilyField onChange={handleEvaluationFamilyChange} value={evaluationFamily} />
        </FieldGroup>
      ) : null}
      {activeTab === "Schema" ? (
        <FieldGroup>
          <div className="grid gap-4">
            <DatasetValueContractField
              description={t("aiEval.description.inputShapeCreate")}
              label="AI input shape"
              onSchemaChange={setInputSchema}
              onTypeChange={handleInputTypeChange}
              schema={inputSchema}
              schemaDescription="For structured AI inputs, describe the JSON object the target should receive."
              schemaLabel="AI input JSON shape"
              type={inputType}
              typeLabel="Input format sent to AI"
            />
            <DatasetValueContractField
              description={t("aiEval.description.expectedShapeCreate")}
              label="Expected AI result shape"
              onSchemaChange={setExpectedSchema}
              onTypeChange={handleExpectedTypeChange}
              schema={expectedSchema}
              schemaDescription="For structured AI results, describe the JSON object that counts as the expected result."
              schemaLabel="Expected AI result JSON shape"
              type={expectedType}
              typeLabel="Expected result format"
            />
          </div>
        </FieldGroup>
      ) : null}
      {activeTab === "Curation" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.anonymization")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                setAnonymizationMode(value as "off" | "realistic" | "redact")
              }
              value={anonymizationMode}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="redact">{t("aiEval.option.redact")}</SelectItem>
                <SelectItem value="realistic">{t("aiEval.option.realisticReplacement")}</SelectItem>
                <SelectItem value="off">{t("aiEval.option.off")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>{t("aiEval.description.anonymization")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("aiEval.field.defaultMetric")}</FieldLabel>
            <MetricField onChange={handleMetricChange} value={metricId} />
            <FieldDescription>
              Use the metric this dataset is normally judged by. Evaluations can still choose a
              different metric later.
            </FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
      {activeTab === "Trace intake" ? (
        <FieldGroup>
          <TraceIntakeFields
            expectedPath={expectedPath}
            inputPath={inputPath}
            observedOutputPath="$.actualOutput"
            onExpectedPathChange={setExpectedPath}
            onInputPathChange={(next) => {
              setInputPath(next);
              if (!next.trim() && expectedPath.trim()) {
                setExpectedPath("");
                setDependencyNote(
                  "Expected AI result source was cleared because trace intake is not configured.",
                );
              }
            }}
            onObservedOutputPathChange={() => undefined}
            onOperationNameChange={setTraceOperationName}
            onServiceNameChange={setTraceServiceName}
            operationName={traceOperationName}
            serviceName={traceServiceName}
            showObservedOutput={false}
          />
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function DatasetRowDialog({
  dataset,
  item,
  mode,
}: {
  dataset: Dataset;
  item?: DatasetItem;
  mode: "add" | "edit";
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const inputType = (datasetSetting(dataset, "inputType") ?? "text") as DatasetValueType;
  const expectedType = (datasetSetting(dataset, "expectedType") ?? "text") as DatasetValueType;
  const expectedOptions = datasetExpectedValueOptions(dataset).filter(
    (option) => typeof option.value === "string" && option.value.trim().length > 0,
  );
  const [inputText, setInputText] = useState(() =>
    initialRawValue(item?.latestRevision.input, inputType),
  );
  const [expectedText, setExpectedText] = useState(() =>
    initialRawValue(item?.latestRevision.expected, expectedType),
  );
  const [observedOutputText, setObservedOutputText] = useState(() =>
    initialRawValue(itemValue(item, "observedOutput"), expectedType),
  );
  const [reason, setReason] = useState(() => String(itemValue(item, "reason") ?? ""));
  const [split, setSplit] = useState<DatasetSplit>(
    item?.latestRevision.split ?? datasetDefaultSplit(dataset),
  );
  const [curationStatus, setCurationStatus] = useState<DatasetCurationStatus>(
    item?.latestRevision.curationStatus ?? "draft",
  );
  const [metadata, setMetadata] = useState(() => metadataText(item?.latestRevision.metadata));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const inputValue = parseAndValidateValue(
        inputText,
        inputType,
        datasetSetting(dataset, "inputJsonSchema"),
      );
      const expectedValue = parseAndValidateValue(
        expectedText,
        expectedType,
        datasetSetting(dataset, "expectedJsonSchema"),
      );
      const observedOutput =
        observedOutputText.trim() === ""
          ? { value: null as JSONValue, error: null as string | null }
          : parseRawValue(observedOutputText, expectedType);
      if (observedOutput.error) {
        throw new Error(`Observed output is invalid: ${observedOutput.error}`);
      }
      const metadataValue = parseMetadata(metadata);
      if (metadataValue.error) {
        throw new Error(metadataValue.error);
      }
      if (mode === "edit" && item) {
        const update: UpdateDatasetItemsInput = {
          datasetId: dataset.id,
          expectedDatasetVersionId: datasetCurrentVersionId(dataset),
          updates: [
            {
              id: item.id,
              operation: "edit",
              input: inputValue,
              expected: expectedValue,
              observedOutput: observedOutput.value,
              reason: reason.trim(),
              metadata: metadataValue.value,
              split,
              curationStatus,
            },
          ],
          idempotencyKey: `dataset-row-edit-${item.id}-${Date.now()}`,
        };
        return telemetryClient.updateDatasetItems(update);
      }
      const append: AppendDatasetItemsInput = {
        datasetId: dataset.id,
        expectedDatasetVersionId: datasetCurrentVersionId(dataset),
        items: [
          {
            input: inputValue,
            expected: expectedValue,
            observedOutput: observedOutput.value,
            reason: reason.trim(),
            metadata: metadataValue.value,
            split,
            curationStatus,
          },
        ],
        idempotencyKey: `dataset-row-${Date.now()}`,
      };
      return telemetryClient.appendDatasetItems(append);
    },
    onSuccess() {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {mode === "add" ? (
            <Plus data-icon="inline-start" />
          ) : (
            <SlidersHorizontal data-icon="inline-start" />
          )}
          {mode === "add" ? t("aiEval.action.addRow") : t("aiEval.action.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? t("aiEval.dialog.row.addTitle") : t("aiEval.dialog.row.editTitle")}
          </DialogTitle>
          <DialogDescription>{t("aiEval.dialog.row.description")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.aiInput")}</FieldLabel>
            {inputType === "json" ? (
              <JsonEditor minHeight="120px" onChange={setInputText} value={inputText} />
            ) : (
              <Textarea
                onChange={(event) => setInputText(event.target.value)}
                rows={5}
                value={inputText}
              />
            )}
          </Field>
          <Field>
            <FieldLabel>{t("aiEval.field.expectedAiResult")}</FieldLabel>
            {expectedType === "text" && expectedOptions.length > 0 ? (
              <Select onValueChange={setExpectedText} value={expectedText}>
                <SelectTrigger>
                  <SelectValue placeholder={t("aiEval.placeholder.chooseExpectedResult")} />
                </SelectTrigger>
                <SelectContent>
                  {expectedOptions.map((option) => (
                    <SelectItem key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : expectedType === "json" ? (
              <JsonEditor minHeight="120px" onChange={setExpectedText} value={expectedText} />
            ) : (
              <Textarea
                onChange={(event) => setExpectedText(event.target.value)}
                rows={5}
                value={expectedText}
              />
            )}
            {expectedOptions.length > 0 ? (
              <FieldDescription>
                This dataset defines allowed expected results, so choose one of the configured
                categories.
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel>{t("aiEval.field.observedAiResultOptional")}</FieldLabel>
            {expectedType === "json" ? (
              <JsonEditor
                minHeight="80px"
                onChange={setObservedOutputText}
                placeholder={t("aiEval.field.optional")}
                value={observedOutputText}
              />
            ) : (
              <Textarea
                onChange={(event) => setObservedOutputText(event.target.value)}
                placeholder={t("aiEval.field.optional")}
                rows={3}
                value={observedOutputText}
              />
            )}
          </Field>
          <Field>
            <FieldLabel>{t("aiEval.field.reasonQuestion")}</FieldLabel>
            <Textarea onChange={(event) => setReason(event.target.value)} value={reason} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <SplitField onChange={setSplit} value={split} />
            <CurationStatusField onChange={setCurationStatus} value={curationStatus} />
          </div>
          <Field>
            <FieldLabel>{t("aiEval.field.metadataOptional")}</FieldLabel>
            <Textarea
              onChange={(event) => setMetadata(event.target.value)}
              placeholder="key=value"
              value={metadata}
            />
          </Field>
          {error || mutation.error ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error ?? mutation.error?.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <XCircle data-icon="inline-start" />
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              void mutation.mutateAsync().catch((caught) => {
                setError(
                  caught instanceof Error ? caught.message : t("aiEval.error.rowValidationFailed"),
                );
              });
            }}
            type="button"
          >
            <CheckCircle2 data-icon="inline-start" />
            {t("aiEval.action.saveRow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEvaluationView({
  datasets,
  initialDatasetId = "",
  projectId,
}: {
  datasets: Dataset[];
  initialDatasetId?: string;
  projectId: string;
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const firstDataset = datasets[0];
  const initialDataset =
    datasets.find((dataset) => dataset.id === initialDatasetId) ?? firstDataset;
  const [activeTab, setActiveTab] = useState("Dataset");
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(initialDataset?.id || "");
  const [targetKind, setTargetKind] =
    useState<Extract<EvaluationTargetKind, "prompt" | "external_adapter">>("prompt");
  const [targetName, setTargetName] = useState("Prompt candidate");
  const [targetRef, setTargetRef] = useState("prompt://current");
  const [modelAlias, setModelAlias] = useState("default");
  const [metricId, setMetricId] = useState(() =>
    initialDataset
      ? datasetDefaultMetricId(initialDataset)
      : recommendedMetricId("classification", "text", "text"),
  );
  const [metricTouched, setMetricTouched] = useState(false);
  const [split, setSplit] = useState<DatasetSplit>(
    initialDataset ? datasetDefaultSplit(initialDataset) : DEFAULT_FIRST_RUN_SPLIT,
  );
  const [retentionProfile, setRetentionProfile] = useState<RetentionProfile>("balanced");
  const [error, setError] = useState<string | null>(null);
  const [dependencyNote, setDependencyNote] = useState<string | null>(null);
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId) ?? null;
  const selectedSplitReadyCount = selectedDataset
    ? datasetReadySplitCount(selectedDataset, split)
    : 0;
  useEffect(() => {
    if (!datasetId && firstDataset?.id) {
      setDatasetId(firstDataset.id);
    }
  }, [datasetId, firstDataset?.id]);
  const handleDatasetChange = (nextDatasetId: string) => {
    const nextDataset = datasets.find((dataset) => dataset.id === nextDatasetId) ?? null;
    setDatasetId(nextDatasetId);
    if (nextDataset) {
      setSplit(datasetDefaultSplit(nextDataset));
      if (!metricTouched) {
        setMetricId(datasetDefaultMetricId(nextDataset));
      }
      setDependencyNote(
        "Dataset change reset the split and compatible metric defaults for this evaluation.",
      );
    }
  };
  const handleTargetKindChange = (
    next: Extract<EvaluationTargetKind, "prompt" | "external_adapter">,
  ) => {
    setTargetKind(next);
    setTargetRef(defaultTargetRefForKind(next));
    setDependencyNote(
      next === "external_adapter"
        ? "Target kind changed to external adapter, so adapter readiness is now required."
        : "Target kind changed to CloudGrid prompt, so external adapter fields were removed.",
    );
  };
  const mutation = useMutation({
    mutationFn: () => {
      const trimmedTargetRef = targetRef.trim();
      const input: CreateEvaluationDefinitionInput = {
        projectId,
        name: name.trim(),
        datasetId,
        datasetVersionPolicy: "latest_ready",
        splitSelector: { splits: [split], curationStatuses: ["ready"] },
        targetRef: {
          kind: targetKind,
          targetRef: trimmedTargetRef,
          displayName: targetName.trim(),
          metadata: modelAlias.trim() ? { modelAlias: modelAlias.trim() } : {},
        },
        metricSettings: [{ metricId: metricId.trim() || datasetDefaultMetricId(selectedDataset) }],
        runPolicy: { maxParallelRequests: 4 },
        retentionProfile,
        idempotencyKey: `evaluation-${Date.now()}`,
      };
      return telemetryClient.createEvaluationDefinition(input);
    },
    onSuccess(definition) {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationDefinitions"] });
      navigate(`/ai-eval?tab=evaluations&evaluation=${encodeURIComponent(definition.id)}`);
    },
  });
  const validationErrors = evaluationValidationErrors({
    datasetId,
    metricId,
    name,
    selectedDatasetReady: selectedDataset ? datasetReadyItemCount(selectedDataset) : 0,
    selectedSplitReadyCount,
    targetName,
    targetRef,
  });
  if (datasets.length === 0) {
    return (
      <EmptyState
        description={t("aiEval.empty.noEvaluationDataset.description")}
        filtered={false}
        primaryAction={
          <Button asChild>
            <Link to="/ai-eval/datasets/new">
              <Plus data-icon="inline-start" />
              {t("aiEval.action.newDataset")}
            </Link>
          </Button>
        }
        title={t("aiEval.empty.noEvaluationDataset.title")}
      />
    );
  }
  return (
    <WizardPage
      activeTab={activeTab}
      backTo="/ai-eval?tab=evaluations"
      description={t("aiEval.description.evaluationCreate")}
      error={error ?? mutation.error?.message ?? null}
      errorTargetId={validationTargetForMessage(error ?? mutation.error?.message).fieldId}
      onBack={() => setActiveTab(previousWizardTab(evaluationCreateTabs, activeTab))}
      onNext={() => {
        setError(null);
        const tabError = evaluationCreateTabError(activeTab, {
          datasetId,
          metricId,
          name,
          targetName,
          targetRef,
          selectedDatasetReady: selectedDataset ? datasetReadyItemCount(selectedDataset) : 0,
          selectedSplitReadyCount,
        });
        if (tabError) {
          setError(tabError);
          return;
        }
        setActiveTab(nextWizardTab(evaluationCreateTabs, activeTab));
      }}
      onSave={() => {
        setError(null);
        if (validationErrors.length) {
          setError(validationErrors[0]?.message ?? t("aiEval.error.evaluationValidationFailed"));
          return;
        }
        void mutation.mutateAsync();
      }}
      onTabChange={setActiveTab}
      saveIcon={<Plus data-icon="inline-start" />}
      saveLabel={t("aiEval.action.newEvaluation")}
      saving={mutation.isPending}
      tabErrors={tabErrorsFromValidation(validationErrors)}
      tabs={evaluationCreateTabs}
      title={t("aiEval.action.newEvaluation")}
    >
      {dependencyNote ? <DependencyResetNote>{dependencyNote}</DependencyResetNote> : null}
      {activeTab === "Dataset" ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="evaluation-name">{t("aiEval.column.name")}</FieldLabel>
            <Input
              aria-invalid={Boolean(error?.includes("Evaluation name"))}
              id="evaluation-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <FieldDescription>
              Name the evaluation by the behavior or release candidate it will track.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="evaluation-dataset">{t("aiEval.field.dataset")}</FieldLabel>
            <Select onValueChange={handleDatasetChange} value={datasetId}>
              <SelectTrigger id="evaluation-dataset">
                <SelectValue placeholder={t("aiEval.placeholder.selectDataset")} />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Pick the dataset whose rows define the AI inputs and expected AI results for this
              evaluation.
            </FieldDescription>
          </Field>
          {selectedDataset ? (
            <ReadOnlyValue
              label={t("aiEval.column.readyRows")}
              value={`${selectedSplitReadyCount} ${selectedSplitReadyCount === 1 ? "row" : "rows"}`}
            />
          ) : null}
          <Field>
            <FieldLabel>{t("aiEval.field.rowsUsedForRuns")}</FieldLabel>
            <ReadOnlyValue label={t("aiEval.field.default")} value="Latest ready rows" />
            <FieldDescription>
              Each run records the exact dataset version it used, so results remain reproducible
              even while the dataset keeps improving.
            </FieldDescription>
          </Field>
          <SplitField
            description={t("aiEval.description.splitForEvaluation")}
            onChange={setSplit}
            value={split}
          />
        </FieldGroup>
      ) : null}
      {activeTab === "Target" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.targetKind")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                handleTargetKindChange(
                  value as Extract<EvaluationTargetKind, "prompt" | "external_adapter">,
                )
              }
              value={targetKind}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("aiEval.placeholder.selectTargetKind")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">{t("aiEval.option.promptTarget")}</SelectItem>
                <SelectItem value="external_adapter">
                  {t("aiEval.option.externalAdapter")}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              {targetKind === "external_adapter"
                ? t("aiEval.description.externalAdapterTarget")
                : t("aiEval.description.promptTarget")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="evaluation-target-name">{t("aiEval.field.targetName")}</FieldLabel>
            <Input
              aria-invalid={Boolean(error?.includes("Target display name"))}
              id="evaluation-target-name"
              onChange={(event) => setTargetName(event.target.value)}
              value={targetName}
            />
            <FieldDescription>{t("aiEval.description.targetName")}</FieldDescription>
          </Field>
          <TargetReferenceField kind={targetKind} onChange={setTargetRef} value={targetRef} />
          {targetKind === "external_adapter" ? <ExternalAdapterReadinessPanel /> : null}
          <ModelAliasField onChange={setModelAlias} value={modelAlias} />
          <Button asChild size="sm" type="button" variant="outline">
            <Link to={`/projects/${projectId}/settings/ai-eval`}>
              <Settings data-icon="inline-start" />
              {t("projects.settings.aiEval")}
            </Link>
          </Button>
        </FieldGroup>
      ) : null}
      {activeTab === "Metrics" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.metric")}</FieldLabel>
            <MetricField
              onChange={(next) => {
                setMetricTouched(true);
                setMetricId(next);
              }}
              value={metricId}
            />
            <FieldDescription>{t("aiEval.description.primaryMetric")}</FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
      {activeTab === "Run policy" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.retentionProfile")}</FieldLabel>
            <Select
              onValueChange={(value) => setRetentionProfile(value as RetentionProfile)}
              value={retentionProfile}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("aiEval.placeholder.selectRetentionProfile")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">{t("aiEval.option.balanced")}</SelectItem>
                <SelectItem value="fast_iteration">{t("aiEval.option.fastIteration")}</SelectItem>
                <SelectItem value="audit_friendly">{t("aiEval.option.auditFriendly")}</SelectItem>
                <SelectItem value="minimal_storage">{t("aiEval.option.minimalStorage")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Controls how much run detail is retained after execution. Choose audit-friendly when
              results need longer traceability.
            </FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function StartEvaluationRunButton({
  datasets,
  definition,
}: {
  datasets: Dataset[];
  definition: EvaluationDefinition;
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dataset = datasets.find((item) => item.id === definition.datasetId);
  const mutation = useMutation({
    mutationFn: () => {
      if (!dataset) {
        throw new Error(t("aiEval.error.datasetRequiredForRun"));
      }
      const input: StartEvaluationRunInput = {
        evaluationDefinitionId: definition.id,
        projectId: definition.projectId,
        kind: "dataset_evaluation",
        datasetId: definition.datasetId,
        datasetVersionId: evaluationRunDatasetVersionId(definition, dataset),
        splitSelector: definition.splitSelector,
        targetRef: definition.targetRef,
        metricSettings: definition.metricSettings,
        runPolicy: definition.runPolicy,
        retentionProfile: definition.retentionProfile,
        retentionRole: "baseline",
        idempotencyKey: `evaluation-run-${definition.id}-${Date.now()}`,
      };
      return telemetryClient.startEvaluationRun(input);
    },
    onSuccess(run) {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationRuns"] });
      navigate(
        `/ai-eval?tab=evaluations&evaluation=${encodeURIComponent(definition.id)}&run=${encodeURIComponent(run.id)}`,
      );
    },
  });
  if (!dataset) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button disabled size="sm" type="button">
          <Play data-icon="inline-start" />
          {t("aiEval.action.runEvaluation")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("aiEval.error.datasetMissingRun")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={mutation.isPending}
        onClick={() => void mutation.mutateAsync()}
        size="sm"
        type="button"
      >
        <Play data-icon="inline-start" />
        {t("aiEval.action.runEvaluation")}
      </Button>
      {mutation.error ? (
        <p className="max-w-72 text-right text-xs text-destructive">{mutation.error.message}</p>
      ) : null}
    </div>
  );
}

function EvaluationRunControls({ run }: { run: EvaluationRun }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const controlMutation = useMutation({
    mutationFn: (action: "pause" | "resume" | "cancel") => {
      const input = {
        evaluationRunId: run.id,
        idempotencyKey: `${run.id}-${action}-${Date.now()}`,
      };
      if (action === "pause") {
        return telemetryClient.pauseEvaluationRun(input);
      }
      if (action === "resume") {
        return telemetryClient.resumeEvaluationRun(input);
      }
      return telemetryClient.cancelEvaluationRun(input);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationRuns"] });
    },
  });
  if (["completed", "cancelled", "failed"].includes(run.status)) {
    return <Badge variant="outline">{run.status}</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {run.status === "paused" ? (
        <Button
          aria-label={t("aiEval.run.resume")}
          onClick={() => void controlMutation.mutateAsync("resume")}
          size="sm"
          title={t("aiEval.run.resume")}
          type="button"
          variant="outline"
        >
          <Play />
        </Button>
      ) : (
        <Button
          aria-label={t("aiEval.run.pause")}
          onClick={() => void controlMutation.mutateAsync("pause")}
          size="sm"
          title={t("aiEval.run.pause")}
          type="button"
          variant="outline"
        >
          <Pause />
        </Button>
      )}
      <Button
        aria-label={t("aiEval.run.cancel")}
        onClick={() => void controlMutation.mutateAsync("cancel")}
        size="sm"
        title={t("aiEval.run.cancel")}
        type="button"
        variant="outline"
      >
        <XCircle />
      </Button>
    </div>
  );
}

function StartOptimizationView({
  datasets,
  evaluations,
  projectId,
}: {
  datasets: Dataset[];
  evaluations: EvaluationDefinition[];
  projectId: string;
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Source");
  const [evaluationId, setEvaluationId] = useState(evaluations[0]?.id ?? "");
  const [baselineSnapshotId, setBaselineSnapshotId] = useState(
    evaluations[0]?.targetRef.targetRef ?? "",
  );
  const [primaryMetricId, setPrimaryMetricId] = useState(
    evaluations[0]?.metricSettings[0]?.metricId ?? "extraction.exact_json_match",
  );
  const [optimizerKind, setOptimizerKind] = useState<OptimizationOptimizerKind>(
    "critic_mutate_judge_pick",
  );
  const [quickShot, setQuickShot] = useState<"enabled" | "disabled">("enabled");
  const [runtimeMode, setRuntimeMode] = useState<"managed_harness" | "external_adapter">(
    "managed_harness",
  );
  const [error, setError] = useState<string | null>(null);
  const [dependencyNote, setDependencyNote] = useState<string | null>(null);
  const evaluation = evaluations.find((item) => item.id === evaluationId);
  const dataset = datasets.find((item) => item.id === evaluation?.datasetId);
  useEffect(() => {
    if (!evaluationId && evaluations[0]?.id) {
      setEvaluationId(evaluations[0].id);
      setBaselineSnapshotId(evaluations[0].targetRef.targetRef ?? "");
      setPrimaryMetricId(
        evaluations[0].metricSettings[0]?.metricId ?? "extraction.exact_json_match",
      );
    }
  }, [evaluationId, evaluations]);
  const handleEvaluationChange = (nextEvaluationId: string) => {
    const nextEvaluation = evaluations.find((item) => item.id === nextEvaluationId);
    setEvaluationId(nextEvaluationId);
    setBaselineSnapshotId(nextEvaluation?.targetRef.targetRef ?? "");
    setPrimaryMetricId(
      nextEvaluation?.metricSettings[0]?.metricId ?? "extraction.exact_json_match",
    );
    setDependencyNote(
      "Source evaluation changed, so the baseline target and objective metric were reset from the selected evaluation.",
    );
  };
  const handleOptimizerKindChange = (next: OptimizationOptimizerKind) => {
    setOptimizerKind(next);
    if (next !== "skill_text_edit") {
      setRuntimeMode("managed_harness");
      setDependencyNote(
        "Optimizer kind changed away from skill text edit, so skill runtime and adapter fields were removed.",
      );
    } else {
      setDependencyNote(
        "Skill text edit shows skill package and runtime readiness fields for the selected baseline.",
      );
    }
  };
  const mutation = useMutation({
    mutationFn: () => {
      if (!evaluation || !dataset) {
        throw new Error("Evaluation and dataset are required.");
      }
      const metricSettings: MetricSettingInput[] = [{ metricId: primaryMetricId }];
      const input: StartOptimizationRunInput = {
        projectId,
        baselineTargetSnapshotId: baselineSnapshotId,
        objective: {
          primaryMetricId,
          constraints: {},
          rankingPolicy: {},
          minimumEvidence: {},
        },
        searchPolicy: {
          optimizerKind,
          editablePartKinds:
            optimizerKind === "skill_text_edit" ? ["skill"] : ["prompt", "examples"],
          maxEpochs: 1,
          maxSteps: 1,
          rolloutBatchSize: 20,
          reflectionMinibatchSize: 8,
          editBudget: 4,
          minEditBudget: 2,
          editSchedule: "cosine",
          gateMetricId: primaryMetricId,
          gateMode: "strict_improvement",
          selectionSplit: "validation",
          allowSlowUpdate: false,
          allowMetaMemory: false,
          skillPolicy:
            optimizerKind === "skill_text_edit"
              ? {
                  allowedEditOps: ["append", "insert_after", "replace"],
                  editableFileGlobs: ["SKILL.md", "references/**/*.md", "examples/**/*"],
                  exportBestSkill: true,
                  protectedFileGlobs: ["**/.env", "**/*secret*", "**/node_modules/**"],
                }
              : null,
        },
        trainingEvaluationDefinitionId: evaluation.id,
        trainingSplitSelector: { splits: ["training"], curationStatuses: ["ready"] },
        validationEvaluationDefinitionId: evaluation.id,
        validationSplitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
        quickShotPolicy:
          quickShot === "enabled"
            ? {
                sourceDatasetVersionId: datasetCurrentVersionId(dataset),
                split: "validation",
                selectionStrategy: "representative_clusters",
                minimumSampleSize: 10,
                metricSettingsSnapshot: metricSettings,
                runPolicySnapshot: { maxParallelRequests: 2 },
              }
            : null,
        runPolicy: { maxParallelRequests: 2 },
        idempotencyKey: `optimization-${Date.now()}`,
      };
      return telemetryClient.startOptimizationRun(input);
    },
    onSuccess(run) {
      void queryClient.invalidateQueries({ queryKey: ["OptimizationRuns"] });
      navigate(`/ai-eval?tab=evaluations&run=${encodeURIComponent(run.id)}`);
    },
  });
  const validationErrors = optimizationValidationErrors({
    baselineSnapshotId,
    evaluationId,
    primaryMetricId,
  });
  return (
    <WizardPage
      activeTab={activeTab}
      backTo="/ai-eval?tab=evaluations"
      description={t("aiEval.description.optimizationCreate")}
      error={error ?? mutation.error?.message ?? null}
      errorTargetId={validationTargetForMessage(error ?? mutation.error?.message).fieldId}
      onBack={() => setActiveTab(previousWizardTab(optimizationCreateTabs, activeTab))}
      onNext={() => {
        setError(null);
        const tabError = optimizationCreateTabError(activeTab, {
          baselineSnapshotId,
          evaluationId,
          primaryMetricId,
        });
        if (tabError) {
          setError(tabError);
          return;
        }
        setActiveTab(nextWizardTab(optimizationCreateTabs, activeTab));
      }}
      onSave={() => {
        setError(null);
        if (validationErrors.length) {
          setError(validationErrors[0]?.message ?? t("aiEval.error.optimizationValidationFailed"));
          return;
        }
        void mutation.mutateAsync();
      }}
      onTabChange={setActiveTab}
      saveIcon={<RefreshCw data-icon="inline-start" />}
      saveLabel={t("aiEval.action.startOptimization")}
      saving={mutation.isPending}
      tabErrors={tabErrorsFromValidation(validationErrors)}
      tabs={optimizationCreateTabs}
      title={t("aiEval.action.startOptimization")}
    >
      {dependencyNote ? <DependencyResetNote>{dependencyNote}</DependencyResetNote> : null}
      {activeTab === "Source" ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="optimization-evaluation">
              {t("aiEval.field.sourceEvaluation")}
            </FieldLabel>
            <Select onValueChange={handleEvaluationChange} value={evaluationId}>
              <SelectTrigger id="optimization-evaluation">
                <SelectValue placeholder={t("aiEval.placeholder.selectEvaluation")} />
              </SelectTrigger>
              <SelectContent>
                {evaluations.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Select the evaluation whose results and dataset should guide the optimization.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="optimization-baseline">
              {t("aiEval.field.baselineTarget")}
            </FieldLabel>
            <Select onValueChange={setBaselineSnapshotId} value={baselineSnapshotId}>
              <SelectTrigger id="optimization-baseline">
                <SelectValue placeholder={t("aiEval.placeholder.selectBaselineTarget")} />
              </SelectTrigger>
              <SelectContent>
                {evaluation?.targetRef.targetRef ? (
                  <SelectItem value={evaluation.targetRef.targetRef}>
                    {evaluation.targetRef.displayName}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <FieldDescription>
              The selected evaluation supplies the baseline target, so gains are measured from a
              stable source without typing target IDs.
            </FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
      {activeTab === "Objective" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.column.primaryMetric")}</FieldLabel>
            <MetricField onChange={setPrimaryMetricId} value={primaryMetricId} />
            <FieldDescription>
              This score is optimized first and determines how candidates are ranked.
            </FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
      {activeTab === "Search" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.optimizerKind")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                handleOptimizerKindChange(value as OptimizationOptimizerKind)
              }
              value={optimizerKind}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTIMIZER_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Choose which editable target part CloudGrid should optimize. Skill text edit exposes
              skill package and runtime controls; prompt and example optimizers hide those fields.
            </FieldDescription>
          </Field>
          {optimizerKind === "skill_text_edit" ? (
            <>
              <RuntimeModeField onChange={setRuntimeMode} value={runtimeMode} />
              {runtimeMode === "managed_harness" ? (
                <ManagedHarnessReadinessPanel />
              ) : (
                <ExternalAdapterReadinessPanel />
              )}
              <div className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Skill optimization uses a package artifact with `SKILL.md` plus optional references,
                examples, scripts, assets, dependency manifests, and runtime fixtures. Package
                upload and manifest controls appear when the selected baseline target exposes an
                editable skill part.
              </div>
            </>
          ) : (
            <div className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Prompt and example optimizers use managed evaluation evidence and do not need skill
              package, runtime mode, or external adapter fields.
            </div>
          )}
        </FieldGroup>
      ) : null}
      {activeTab === "Validation" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.quickShotPhase")}</FieldLabel>
            <Select
              onValueChange={(value) => setQuickShot(value as "enabled" | "disabled")}
              value={quickShot}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">{t("aiEval.option.enabled")}</SelectItem>
                <SelectItem value="disabled">{t("aiEval.option.disabled")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>{t("aiEval.description.quickShot")}</FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function DatasetImportDialog({ dataset, projectId }: { dataset: Dataset; projectId: string }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState("");
  const [format, setFormat] = useState<"jsonl" | "json_array" | "csv" | "zip">("jsonl");
  const [commitMode, setCommitMode] = useState<"valid_rows_only" | "reject_if_any_error">(
    "valid_rows_only",
  );
  const [importId, setImportId] = useState("");
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error(t("aiEval.error.fileRequired"));
      }
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("file", selectedFile);
      const response = await fetch("/api/ai-eval/dataset-imports/uploads", {
        body: form,
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        uploadId?: string;
        detectedFormat?: "jsonl" | "json_array" | "csv" | "zip";
        message?: string;
      } | null;
      if (!response.ok || !body?.uploadId) {
        throw new Error(body?.message ?? t("aiEval.error.uploadFailed"));
      }
      return body;
    },
    onSuccess(body) {
      setUploadId(body.uploadId ?? "");
      if (body.detectedFormat) {
        setFormat(body.detectedFormat);
      }
      setImportId("");
      prepareMutation.reset();
      commitMutation.reset();
    },
  });
  const prepareMutation = useMutation({
    mutationFn: () =>
      telemetryClient.prepareDatasetImport({
        datasetId: dataset.id,
        uploadId,
        format,
        mapping: {
          input: [{ targetPath: "$", source: { jsonPath: "$.input" } }],
          expected: [{ targetPath: "$", source: { jsonPath: "$.expected" } }],
          observedOutput: [{ targetPath: "$", source: { jsonPath: "$.observedOutput" } }],
          reason: { jsonPath: "$.reason" },
          metadata: [{ targetPath: "$", source: { jsonPath: "$.metadata" } }],
          sourceTraceId: { jsonPath: "$.sourceTraceId" },
          sourceSpanId: { jsonPath: "$.sourceSpanId" },
          split: { defaultValue: datasetDefaultSplit(dataset) },
          curationStatus: { defaultValue: "needs_review" },
        },
        defaults: {
          split: datasetDefaultSplit(dataset),
          curationStatus: "needs_review",
          allowPartialCommit: commitMode === "valid_rows_only",
        },
        previewLimit: 25,
        idempotencyKey: `dataset-import-${Date.now()}`,
      }),
    onSuccess(job) {
      setImportId(job.id);
    },
  });
  const commitMutation = useMutation({
    mutationFn: () =>
      telemetryClient.commitDatasetImport({
        importId,
        expectedDatasetVersionId: datasetCurrentVersionId(dataset),
        mode: commitMode,
        idempotencyKey: `dataset-import-commit-${Date.now()}`,
      }),
    onSuccess() {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Upload data-icon="inline-start" />
          {t("aiEval.action.import")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiEval.dialog.import.title")}</DialogTitle>
          <DialogDescription>{t("aiEval.dialog.import.description")}</DialogDescription>
        </DialogHeader>
        <FieldGroup data-ai-eval-dataset-import-workflow="true">
          <Field>
            <FieldLabel>{t("aiEval.field.datasetFile")}</FieldLabel>
            <Input
              accept=".jsonl,.json,.csv,.zip,application/json,application/zip,text/csv"
              onChange={(event) => {
                setSelectedFile(event.target.files?.[0] ?? null);
                setUploadId("");
                setImportId("");
                prepareMutation.reset();
                commitMutation.reset();
              }}
              type="file"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!selectedFile || uploadMutation.isPending}
              onClick={() => void uploadMutation.mutateAsync()}
              type="button"
              variant="outline"
            >
              <Upload data-icon="inline-start" />
              {t("aiEval.action.uploadFile")}
            </Button>
            {uploadId ? (
              <span className="text-xs text-muted-foreground">{t("aiEval.upload.ready")}</span>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("aiEval.field.format")}</FieldLabel>
              <Select onValueChange={(value) => setFormat(value as typeof format)} value={format}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jsonl">JSONL</SelectItem>
                  <SelectItem value="json_array">{t("aiEval.option.jsonArray")}</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="zip">ZIP</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("aiEval.field.commitMode")}</FieldLabel>
              <Select
                onValueChange={(value) => setCommitMode(value as typeof commitMode)}
                value={commitMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid_rows_only">
                    {t("aiEval.option.validRowsOnly")}
                  </SelectItem>
                  <SelectItem value="reject_if_any_error">
                    {t("aiEval.option.rejectIfAnyError")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {prepareMutation.data ? (
            <div className="grid gap-3 border p-3 text-sm">
              <div>
                {t("aiEval.import.validRowsSummary", {
                  errors: String(prepareMutation.data.errorRows),
                  total: String(prepareMutation.data.totalRows),
                  valid: String(prepareMutation.data.validRows),
                })}
              </div>
              {prepareMutation.data.previewRows.length ? (
                <div className="max-h-72 overflow-auto border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("aiEval.column.row")}</TableHead>
                        <TableHead>{t("aiEval.column.status")}</TableHead>
                        <TableHead>{t("aiEval.field.aiInput")}</TableHead>
                        <TableHead>{t("aiEval.field.expectedAiResult")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prepareMutation.data.previewRows.slice(0, 8).map((row) => (
                        <TableRow key={`${row.filePath}:${row.rowNumber}`}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>
                            {row.errors.length ? (
                              <Badge variant="outline">
                                {row.errors[0]?.message ?? t("aiEval.status.error")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{t("aiEval.value.ready")}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-48 truncate">
                            {jsonPreview(row.item?.input, 80)}
                          </TableCell>
                          <TableCell className="max-w-48 truncate">
                            {jsonPreview(row.item?.expected, 80)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          ) : null}
          {uploadMutation.error || prepareMutation.error || commitMutation.error ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {uploadMutation.error?.message ??
                prepareMutation.error?.message ??
                commitMutation.error?.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!uploadId || prepareMutation.isPending}
            onClick={() => void prepareMutation.mutateAsync()}
            type="button"
            variant="outline"
          >
            <Eye data-icon="inline-start" />
            {t("aiEval.action.preview")}
          </Button>
          <Button
            disabled={
              !importId ||
              commitMutation.isPending ||
              (commitMode === "reject_if_any_error" && Number(prepareMutation.data?.errorRows) > 0)
            }
            onClick={() => void commitMutation.mutateAsync()}
            type="button"
          >
            <CheckCircle2 data-icon="inline-start" />
            {t("aiEval.action.commit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatasetExportDialog({ dataset }: { dataset: Dataset }) {
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"jsonl" | "json_array" | "csv">("jsonl");
  const mutation = useMutation({
    mutationFn: () => {
      const input: StartDatasetExportInput = {
        datasetId: dataset.id,
        datasetVersionId: datasetCurrentVersionId(dataset),
        format,
        includeMetadata: true,
        includeSourcePointers: true,
        idempotencyKey: `dataset-export-${Date.now()}`,
      };
      return telemetryClient.startDatasetExport(input);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Download data-icon="inline-start" />
          {t("aiEval.action.export")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("aiEval.dialog.export.title")}</DialogTitle>
          <DialogDescription>{t("aiEval.dialog.export.description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t("aiEval.field.format")}</FieldLabel>
          <Select onValueChange={(value) => setFormat(value as typeof format)} value={format}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jsonl">JSONL</SelectItem>
              <SelectItem value="json_array">{t("aiEval.option.jsonArray")}</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {mutation.data ? (
          <div className="border p-3 text-sm">
            Export {mutation.data.status}
            {mutation.data.downloadUrl ? (
              <a className="ml-2 text-primary hover:underline" href={mutation.data.downloadUrl}>
                {t("aiEval.action.download")}
              </a>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
            type="button"
          >
            <Download data-icon="inline-start" />
            {t("aiEval.action.startExport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatasetSettingsView({ dataset }: { dataset: Dataset }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("Purpose");
  const importInputRef = useRef<HTMLInputElement>(null);
  const settings = dataset.settings;
  const initialTraceIntake = traceIntakeDraftFromSettings(settings);
  const [evaluationFamily, setEvaluationFamily] = useState<EvaluationFamily>(
    settings.evaluationFamily,
  );
  const [inputType, setInputType] = useState<DatasetValueType>(settings.inputType);
  const [expectedType, setExpectedType] = useState<DatasetValueType>(settings.expectedType);
  const [inputSchema, setInputSchema] = useState(
    settings.inputJsonSchema ? JSON.stringify(settings.inputJsonSchema, null, 2) : "",
  );
  const [expectedSchema, setExpectedSchema] = useState(
    settings.expectedJsonSchema ? JSON.stringify(settings.expectedJsonSchema, null, 2) : "",
  );
  const [defaultSplit, setDefaultSplit] = useState<DatasetSplit>(settings.defaultSplit);
  const [manualDefaultStatus, setManualDefaultStatus] = useState<DatasetCurationStatus>(
    settings.intakePolicy.manualDefaultStatus,
  );
  const [importDefaultStatus, setImportDefaultStatus] = useState<DatasetCurationStatus>(
    settings.intakePolicy.importDefaultStatus,
  );
  const [traceDefaultStatus, setTraceDefaultStatus] = useState<DatasetCurationStatus>(
    settings.intakePolicy.traceDefaultStatus,
  );
  const [traceServiceName, setTraceServiceName] = useState(initialTraceIntake.serviceName);
  const [traceOperationName, setTraceOperationName] = useState(initialTraceIntake.operationName);
  const [inputPath, setInputPath] = useState(initialTraceIntake.inputPath);
  const [expectedPath, setExpectedPath] = useState(initialTraceIntake.expectedPath);
  const [observedOutputPath, setObservedOutputPath] = useState(
    initialTraceIntake.observedOutputPath,
  );
  const [anonymizationMode, setAnonymizationMode] = useState(
    settings.anonymizationPolicy?.mode ?? "off",
  );
  const [retentionProfile, setRetentionProfile] = useState<RetentionProfile>(
    settings.retentionProfile,
  );
  const [metricId, setMetricId] = useState(
    settings.defaultMetricSettings[0]?.metricId ?? "extraction.exact_json_match",
  );
  const [metricTouched, setMetricTouched] = useState(
    Boolean(
      settings.defaultMetricSettings[0]?.metricId &&
        !isRecommendedMetricId(settings.defaultMetricSettings[0]?.metricId),
    ),
  );
  const [settingsImportError, setSettingsImportError] = useState<string | null>(null);
  const [settingsImportStatus, setSettingsImportStatus] = useState<string | null>(null);
  const [dependencyNote, setDependencyNote] = useState<string | null>(null);
  const updateSuggestedMetric = (
    nextFamily: EvaluationFamily,
    nextInputType: DatasetValueType,
    nextExpectedType: DatasetValueType,
  ) => {
    if (!metricTouched) {
      setMetricId(recommendedMetricId(nextFamily, nextInputType, nextExpectedType));
    }
  };
  const handleEvaluationFamilyChange = (next: EvaluationFamily) => {
    setEvaluationFamily(next);
    updateSuggestedMetric(next, inputType, expectedType);
    setDependencyNote(
      "Evaluation type updated the suggested metric when the metric was still using a default.",
    );
  };
  const handleInputTypeChange = (next: DatasetValueType) => {
    const previousSchema = inputSchema.trim();
    setInputType(next);
    if (next === "json" && !inputSchema.trim()) {
      setInputSchema(DEFAULT_JSON_SCHEMA);
      setDependencyNote("AI input JSON shape was added because JSON input needs a schema.");
    }
    if (next === "text" && previousSchema) {
      setInputSchema("");
      setDependencyNote(
        "AI input JSON shape was removed because text input does not use a JSON schema.",
      );
    }
    updateSuggestedMetric(evaluationFamily, next, expectedType);
  };
  const handleExpectedTypeChange = (next: DatasetValueType) => {
    const previousSchema = expectedSchema.trim();
    setExpectedType(next);
    if (next === "json" && !expectedSchema.trim()) {
      setExpectedSchema(DEFAULT_JSON_SCHEMA);
      setDependencyNote(
        "Expected AI result JSON shape was added because JSON results need a schema.",
      );
    }
    if (next === "text" && previousSchema) {
      setExpectedSchema("");
      setDependencyNote(
        "Expected AI result JSON shape was removed because text results do not use a JSON schema.",
      );
    }
    updateSuggestedMetric(evaluationFamily, inputType, next);
  };
  const handleMetricChange = (next: string) => {
    setMetricTouched(true);
    setMetricId(next);
  };
  const currentSettingsDraft = (): DatasetSettingsDraft => {
    const parsedInputSchema =
      inputType === "json" && inputSchema.trim()
        ? parseRawValue(inputSchema, "json")
        : { value: null as JSONValue, error: null as string | null };
    const parsedExpectedSchema =
      expectedType === "json" && expectedSchema.trim()
        ? parseRawValue(expectedSchema, "json")
        : { value: null as JSONValue, error: null as string | null };
    if (parsedInputSchema.error) {
      throw new Error(`Input JSON schema is invalid: ${parsedInputSchema.error}`);
    }
    if (parsedExpectedSchema.error) {
      throw new Error(`Expected JSON schema is invalid: ${parsedExpectedSchema.error}`);
    }
    return {
      evaluationFamily,
      inputType,
      expectedType,
      inputJsonSchema: inputType === "json" ? parsedInputSchema.value : null,
      expectedJsonSchema: expectedType === "json" ? parsedExpectedSchema.value : null,
      expectedValueOptions: settings.expectedValueOptions ?? [],
      defaultSplit,
      intakePolicy: {
        manualDefaultStatus,
        importDefaultStatus,
        traceDefaultStatus,
      },
      traceIntakeRules: buildTraceIntakeRules({
        curationStatus: traceDefaultStatus,
        expectedPath,
        inputPath,
        observedOutputPath,
        serviceName: traceServiceName,
        split: defaultSplit,
        operationName: traceOperationName,
      }),
      anonymizationPolicy: {
        mode: anonymizationMode,
        policyId: settings.anonymizationPolicy?.policyId ?? null,
        policyVersion: settings.anonymizationPolicy?.policyVersion ?? null,
        consistencyScope: settings.anonymizationPolicy?.consistencyScope ?? "dataset",
        blockedEntityTypes: settings.anonymizationPolicy?.blockedEntityTypes ?? [],
      },
      defaultMetricSettings: [{ metricId: metricId.trim() || "extraction.exact_json_match" }],
      retentionProfile,
    };
  };
  const exportSettingsDraft = () => {
    try {
      const blob = new Blob([JSON.stringify(currentSettingsDraft(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${dataset.name || "dataset"}-settings.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setSettingsImportError(null);
    } catch (caught) {
      setSettingsImportError(
        caught instanceof Error ? caught.message : t("aiEval.error.settingsExportFailed"),
      );
    }
  };
  const importSettingsDraft = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      applyDatasetSettingsDraft(JSON.parse(await file.text()));
      setSettingsImportError(null);
      setSettingsImportStatus("Imported settings are staged. Review them, then Save settings.");
    } catch (caught) {
      setSettingsImportError(
        caught instanceof Error ? caught.message : t("aiEval.error.settingsImportFailed"),
      );
      setSettingsImportStatus(null);
    } finally {
      event.target.value = "";
    }
  };
  const applyDatasetSettingsDraft = (raw: unknown) => {
    if (!isRecord(raw)) {
      throw new Error(t("aiEval.error.settingsImportShape"));
    }
    if (isEvaluationFamily(raw.evaluationFamily)) {
      setEvaluationFamily(raw.evaluationFamily);
    }
    if (isDatasetValueType(raw.inputType)) {
      setInputType(raw.inputType);
    }
    if (isDatasetValueType(raw.expectedType)) {
      setExpectedType(raw.expectedType);
    }
    if ("inputJsonSchema" in raw) {
      setInputSchema(raw.inputJsonSchema ? JSON.stringify(raw.inputJsonSchema, null, 2) : "");
    }
    if ("expectedJsonSchema" in raw) {
      setExpectedSchema(
        raw.expectedJsonSchema ? JSON.stringify(raw.expectedJsonSchema, null, 2) : "",
      );
    }
    if (isDatasetSplit(raw.defaultSplit)) {
      setDefaultSplit(raw.defaultSplit);
    }
    if (isRecord(raw.intakePolicy)) {
      if (isDatasetCurationStatus(raw.intakePolicy.manualDefaultStatus)) {
        setManualDefaultStatus(raw.intakePolicy.manualDefaultStatus);
      }
      if (isDatasetCurationStatus(raw.intakePolicy.importDefaultStatus)) {
        setImportDefaultStatus(raw.intakePolicy.importDefaultStatus);
      }
      if (isDatasetCurationStatus(raw.intakePolicy.traceDefaultStatus)) {
        setTraceDefaultStatus(raw.intakePolicy.traceDefaultStatus);
      }
    }
    const importedTraceIntake = traceIntakeDraftFromSettings(raw);
    if (importedTraceIntake.hasRule) {
      setTraceServiceName(importedTraceIntake.serviceName);
      setTraceOperationName(importedTraceIntake.operationName);
      setInputPath(importedTraceIntake.inputPath);
      setExpectedPath(importedTraceIntake.expectedPath);
      setObservedOutputPath(importedTraceIntake.observedOutputPath);
    } else if (raw.traceIntakeRules === null) {
      setTraceServiceName("");
      setTraceOperationName("");
      setInputPath("");
      setExpectedPath("");
      setObservedOutputPath("");
    }
    if (isRecord(raw.anonymizationPolicy) && isAnonymizationMode(raw.anonymizationPolicy.mode)) {
      setAnonymizationMode(raw.anonymizationPolicy.mode);
    }
    if (Array.isArray(raw.defaultMetricSettings)) {
      const metric = raw.defaultMetricSettings.find(
        (item): item is { metricId: string } => isRecord(item) && typeof item.metricId === "string",
      );
      if (metric) {
        setMetricId(metric.metricId);
        setMetricTouched(!isRecommendedMetricId(metric.metricId));
      }
    }
    if (isRetentionProfile(raw.retentionProfile)) {
      setRetentionProfile(raw.retentionProfile);
    }
  };
  const mutation = useMutation({
    mutationFn: () => {
      const parsedInputSchema =
        inputType === "json" && inputSchema.trim()
          ? parseRawValue(inputSchema, "json")
          : { value: null as JSONValue, error: null as string | null };
      const parsedExpectedSchema =
        expectedType === "json" && expectedSchema.trim()
          ? parseRawValue(expectedSchema, "json")
          : { value: null as JSONValue, error: null as string | null };
      if (parsedInputSchema.error) {
        throw new Error(`Input JSON schema is invalid: ${parsedInputSchema.error}`);
      }
      if (parsedExpectedSchema.error) {
        throw new Error(`Expected JSON schema is invalid: ${parsedExpectedSchema.error}`);
      }
      const input: UpdateDatasetSettingsInput = {
        datasetId: dataset.id,
        expectedDatasetVersionId: datasetCurrentVersionId(dataset),
        settings: {
          evaluationFamily,
          inputType,
          expectedType,
          inputJsonSchema: inputType === "json" ? parsedInputSchema.value : null,
          expectedJsonSchema: expectedType === "json" ? parsedExpectedSchema.value : null,
          expectedValueOptions: settings.expectedValueOptions ?? [],
          defaultSplit,
          intakePolicy: {
            manualDefaultStatus,
            importDefaultStatus,
            traceDefaultStatus,
          },
          traceIntakeRules: buildTraceIntakeRules({
            curationStatus: traceDefaultStatus,
            expectedPath,
            inputPath,
            observedOutputPath,
            serviceName: traceServiceName,
            split: defaultSplit,
            operationName: traceOperationName,
          }),
          anonymizationPolicy: {
            mode: anonymizationMode,
            policyId: settings.anonymizationPolicy?.policyId ?? null,
            policyVersion: settings.anonymizationPolicy?.policyVersion ?? null,
            consistencyScope: settings.anonymizationPolicy?.consistencyScope ?? "dataset",
            blockedEntityTypes: settings.anonymizationPolicy?.blockedEntityTypes ?? [],
          },
          defaultMetricSettings: metricId.trim()
            ? [{ metricId: metricId.trim(), options: {} }]
            : settings.defaultMetricSettings,
          retentionProfile,
        },
        idempotencyKey: `dataset-settings-${dataset.id}-${Date.now()}`,
      };
      return telemetryClient.updateDatasetSettings(input);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
    },
  });
  return (
    <WizardPage
      activeTab={activeTab}
      backTo={`/ai-eval?tab=datasets&dataset=${encodeURIComponent(dataset.id)}`}
      description={t("aiEval.description.datasetSettings")}
      error={settingsImportError ?? mutation.error?.message ?? null}
      errorTargetId={
        validationTargetForMessage(settingsImportError ?? mutation.error?.message).fieldId
      }
      extraActions={
        <>
          <Input
            accept="application/json"
            className="hidden"
            onChange={(event) => void importSettingsDraft(event)}
            ref={importInputRef}
            type="file"
          />
          <Button
            onClick={() => importInputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Upload data-icon="inline-start" />
            {t("aiEval.action.importSettings")}
          </Button>
          <Button onClick={exportSettingsDraft} size="sm" type="button" variant="outline">
            <Download data-icon="inline-start" />
            {t("aiEval.action.exportSettings")}
          </Button>
        </>
      }
      onBack={() => setActiveTab(previousWizardTab(datasetSettingsTabs, activeTab))}
      onNext={() => setActiveTab(nextWizardTab(datasetSettingsTabs, activeTab))}
      onSave={() => void mutation.mutateAsync()}
      onTabChange={setActiveTab}
      saveIcon={<Settings data-icon="inline-start" />}
      saveLabel={t("aiEval.action.saveSettings")}
      saving={mutation.isPending}
      settingsMode
      tabErrors={tabErrorsFromValidation(
        datasetCreateValidationErrors({
          evaluationFamily,
          expectedSchema,
          expectedType,
          inputSchema,
          inputType,
          name: dataset.name,
        }),
      )}
      tabs={datasetSettingsTabs}
      title={t("aiEval.action.datasetSettings")}
    >
      {dependencyNote ? <DependencyResetNote>{dependencyNote}</DependencyResetNote> : null}
      {settingsImportStatus ? (
        <div className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {settingsImportStatus}
        </div>
      ) : null}
      {activeTab === "Purpose" ? (
        <FieldGroup>
          <ReadOnlyValue label={t("aiEval.field.dataset")} value={dataset.name} />
          <EvaluationFamilyField onChange={handleEvaluationFamilyChange} value={evaluationFamily} />
        </FieldGroup>
      ) : null}
      {activeTab === "Schema" ? (
        <FieldGroup>
          <div className="grid gap-4">
            <DatasetValueContractField
              description={t("aiEval.description.inputShapeSettings")}
              label="AI input shape"
              onSchemaChange={setInputSchema}
              onTypeChange={handleInputTypeChange}
              schema={inputSchema}
              schemaDescription="Edit this when structured AI inputs need stricter shape checks."
              schemaLabel="AI input JSON shape"
              type={inputType}
              typeLabel="Input format sent to AI"
            />
            <DatasetValueContractField
              description={t("aiEval.description.expectedShapeSettings")}
              label="Expected AI result shape"
              onSchemaChange={setExpectedSchema}
              onTypeChange={handleExpectedTypeChange}
              schema={expectedSchema}
              schemaDescription="Edit this when structured AI results should be validated before a row becomes ready."
              schemaLabel="Expected AI result JSON shape"
              type={expectedType}
              typeLabel="Expected result format"
            />
          </div>
        </FieldGroup>
      ) : null}
      {activeTab === "Curation" ? (
        <FieldGroup>
          <SplitField
            description={t("aiEval.description.defaultSplit")}
            label="Default split"
            onChange={setDefaultSplit}
            value={defaultSplit}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <CurationStatusField
              description={t("aiEval.description.manualRows")}
              label="Manual rows"
              onChange={setManualDefaultStatus}
              value={manualDefaultStatus}
            />
            <CurationStatusField
              description={t("aiEval.description.importedRows")}
              label="Imported rows"
              onChange={setImportDefaultStatus}
              value={importDefaultStatus}
            />
            <CurationStatusField
              description={t("aiEval.description.traceRows")}
              label="Trace rows"
              onChange={setTraceDefaultStatus}
              value={traceDefaultStatus}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>{t("aiEval.field.anonymization")}</FieldLabel>
              <Select
                onValueChange={(value) =>
                  setAnonymizationMode(value as "off" | "realistic" | "redact")
                }
                value={anonymizationMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{t("aiEval.option.off")}</SelectItem>
                  <SelectItem value="realistic">{t("aiEval.option.realistic")}</SelectItem>
                  <SelectItem value="redact">{t("aiEval.option.redact")}</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Decide whether sensitive values are preserved, replaced, or redacted in dataset
                rows.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="dataset-settings-default-metric">
                {t("aiEval.field.defaultMetric")}
              </FieldLabel>
              <MetricField
                id="dataset-settings-default-metric"
                onChange={handleMetricChange}
                value={metricId}
              />
              <FieldDescription>
                Used as the suggested metric when a new evaluation is created from this dataset.
              </FieldDescription>
            </Field>
          </div>
        </FieldGroup>
      ) : null}
      {activeTab === "Trace intake" ? (
        <FieldGroup>
          <TraceIntakeFields
            expectedPath={expectedPath}
            inputPath={inputPath}
            observedOutputPath={observedOutputPath}
            onExpectedPathChange={setExpectedPath}
            onInputPathChange={(next) => {
              setInputPath(next);
              if (!next.trim()) {
                if (expectedPath.trim() || observedOutputPath.trim()) {
                  setDependencyNote(
                    "Trace result mappings were cleared because trace intake is not configured.",
                  );
                }
                setExpectedPath("");
                setObservedOutputPath("");
              }
            }}
            onObservedOutputPathChange={setObservedOutputPath}
            onOperationNameChange={setTraceOperationName}
            onServiceNameChange={setTraceServiceName}
            operationName={traceOperationName}
            serviceName={traceServiceName}
            showObservedOutput
          />
        </FieldGroup>
      ) : null}
      {activeTab === "Versions" ? (
        <FieldGroup>
          <ReadOnlyValue
            label={t("aiEval.column.currentVersion")}
            value={String(dataset.currentVersion.version)}
          />
          <ReadOnlyValue label="Save conflict guard" value={datasetCurrentVersionId(dataset)} />
          <Field>
            <FieldLabel>{t("aiEval.field.retention")}</FieldLabel>
            <Select
              onValueChange={(value) => setRetentionProfile(value as RetentionProfile)}
              value={retentionProfile}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">{t("aiEval.option.balanced")}</SelectItem>
                <SelectItem value="fast_iteration">{t("aiEval.option.fastIteration")}</SelectItem>
                <SelectItem value="audit_friendly">{t("aiEval.option.auditFriendly")}</SelectItem>
                <SelectItem value="minimal_storage">{t("aiEval.option.minimalStorage")}</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Choose how much version and row evidence CloudGrid should keep for this dataset.
            </FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function EvaluationSettingsView({
  datasets,
  definition,
}: {
  datasets: Dataset[];
  definition: EvaluationDefinition;
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("Dataset");
  const dataset = datasets.find((item) => item.id === definition.datasetId);
  const [name, setName] = useState(definition.name);
  const [split, setSplit] = useState<DatasetSplit>(
    definition.splitSelector.splits[0] ??
      (dataset ? datasetDefaultSplit(dataset) : DEFAULT_FIRST_RUN_SPLIT),
  );
  const [targetKind, setTargetKind] = useState<
    Extract<EvaluationTargetKind, "prompt" | "external_adapter">
  >(definition.targetRef.kind === "external_adapter" ? "external_adapter" : "prompt");
  const [targetName, setTargetName] = useState(definition.targetRef.displayName);
  const [targetRef, setTargetRef] = useState(definition.targetRef.targetRef ?? "");
  const [modelAlias, setModelAlias] = useState(
    optionalMetadataField(definition.targetRef.metadata, "modelAlias") || "default",
  );
  const [metricId, setMetricId] = useState(definition.metricSettings[0]?.metricId ?? "");
  const [retentionProfile, setRetentionProfile] = useState<RetentionProfile>(
    definition.retentionProfile,
  );
  const [error, setError] = useState<string | null>(null);
  const [dependencyNote, setDependencyNote] = useState<string | null>(null);
  const selectedSplitReadyCount = dataset ? datasetReadySplitCount(dataset, split) : 0;
  const handleTargetKindChange = (
    next: Extract<EvaluationTargetKind, "prompt" | "external_adapter">,
  ) => {
    setTargetKind(next);
    setTargetRef(defaultTargetRefForKind(next));
    setDependencyNote(
      next === "external_adapter"
        ? "Target kind changed to external adapter, so adapter readiness is now required."
        : "Target kind changed to CloudGrid prompt, so external adapter fields were removed.",
    );
  };
  const mutation = useMutation({
    mutationFn: () => {
      const update: UpdateEvaluationDefinitionInput = {
        id: definition.id,
        name: name.trim(),
        splitSelector: { splits: [split], curationStatuses: ["ready"] },
        targetRef: {
          kind: targetKind,
          targetRef: targetRef.trim(),
          displayName: targetName.trim(),
          metadata:
            modelAlias.trim() && modelAlias !== "not set" ? { modelAlias: modelAlias.trim() } : {},
        },
        metricSettings: [{ metricId: metricId.trim() || datasetDefaultMetricId(dataset) }],
        runPolicy: definition.runPolicy,
        retentionProfile,
        expectedVersion: definition.version,
        idempotencyKey: `evaluation-settings-${definition.id}-${Date.now()}`,
      };
      return telemetryClient.updateEvaluationDefinition(update);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationDefinitions"] });
    },
  });
  const validationErrors = evaluationValidationErrors({
    datasetId: definition.datasetId,
    metricId,
    name,
    selectedDatasetReady: dataset ? datasetReadyItemCount(dataset) : 0,
    selectedSplitReadyCount,
    targetName,
    targetRef,
  });
  return (
    <WizardPage
      activeTab={activeTab}
      backTo={`/ai-eval?tab=evaluations&evaluation=${encodeURIComponent(definition.id)}`}
      description={t("aiEval.description.evaluationSettings")}
      error={error ?? mutation.error?.message ?? null}
      errorTargetId={validationTargetForMessage(error ?? mutation.error?.message).fieldId}
      onBack={() => setActiveTab(previousWizardTab(evaluationSettingsTabs, activeTab))}
      onNext={() => setActiveTab(nextWizardTab(evaluationSettingsTabs, activeTab))}
      onSave={() => {
        setError(null);
        if (validationErrors.length) {
          setError(
            validationErrors[0]?.message ?? t("aiEval.error.evaluationSettingsValidationFailed"),
          );
          return;
        }
        void mutation.mutateAsync();
      }}
      onTabChange={setActiveTab}
      saveIcon={<Settings data-icon="inline-start" />}
      saveLabel={t("aiEval.action.saveSettings")}
      saving={mutation.isPending}
      settingsMode
      tabErrors={tabErrorsFromValidation(validationErrors)}
      tabs={evaluationSettingsTabs}
      title={t("aiEval.action.evaluationSettings")}
    >
      {dependencyNote ? <DependencyResetNote>{dependencyNote}</DependencyResetNote> : null}
      {activeTab === "Dataset" ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="evaluation-name">{t("aiEval.field.evaluationName")}</FieldLabel>
            <Input
              aria-invalid={Boolean(error?.includes("Evaluation name"))}
              id="evaluation-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <ReadOnlyValue
            label={t("aiEval.field.dataset")}
            value={dataset?.name ?? definition.datasetId}
          />
          <ReadOnlyValue
            label={t("aiEval.field.rowsUsedForFutureRuns")}
            value={evaluationDatasetRowsLabel(definition)}
          />
          <SplitField
            description={t("aiEval.description.futureRunsSplit")}
            onChange={setSplit}
            value={split}
          />
          <ReadOnlyValue
            label={t("aiEval.column.readyRows")}
            value={`${selectedSplitReadyCount} ${selectedSplitReadyCount === 1 ? "row" : "rows"}`}
          />
        </FieldGroup>
      ) : null}
      {activeTab === "Target" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.targetKind")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                handleTargetKindChange(
                  value as Extract<EvaluationTargetKind, "prompt" | "external_adapter">,
                )
              }
              value={targetKind}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">{t("aiEval.option.promptTarget")}</SelectItem>
                <SelectItem value="external_adapter">
                  {t("aiEval.option.externalAdapter")}
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              {targetKind === "external_adapter"
                ? t("aiEval.description.externalAdapterTarget")
                : t("aiEval.description.promptTarget")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="evaluation-target-name">{t("aiEval.field.targetName")}</FieldLabel>
            <Input
              aria-invalid={Boolean(error?.includes("Target"))}
              id="evaluation-target-name"
              onChange={(event) => setTargetName(event.target.value)}
              value={targetName}
            />
          </Field>
          <TargetReferenceField kind={targetKind} onChange={setTargetRef} value={targetRef} />
          {targetKind === "external_adapter" ? <ExternalAdapterReadinessPanel /> : null}
          <ModelAliasField onChange={setModelAlias} value={modelAlias} />
        </FieldGroup>
      ) : null}
      {activeTab === "Metrics" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.metric")}</FieldLabel>
            <MetricField onChange={setMetricId} value={metricId} />
            <FieldDescription>{t("aiEval.description.futurePrimaryMetric")}</FieldDescription>
          </Field>
        </FieldGroup>
      ) : null}
      {activeTab === "Run policy" ? (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("aiEval.field.retentionProfile")}</FieldLabel>
            <Select
              onValueChange={(value) => setRetentionProfile(value as RetentionProfile)}
              value={retentionProfile}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">{t("aiEval.option.balanced")}</SelectItem>
                <SelectItem value="fast_iteration">{t("aiEval.option.fastIteration")}</SelectItem>
                <SelectItem value="audit_friendly">{t("aiEval.option.auditFriendly")}</SelectItem>
                <SelectItem value="minimal_storage">{t("aiEval.option.minimalStorage")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ReadOnlyValue label="Run concurrency" value={JSON.stringify(definition.runPolicy)} />
        </FieldGroup>
      ) : null}
      {activeTab === "History" ? (
        <FieldGroup>
          <ReadOnlyValue
            label="Future-run impact"
            value="Settings changes apply only to runs started after the change."
          />
          <ReadOnlyValue
            label="Existing runs"
            value="Already resolved run records remain immutable evidence."
          />
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function OptimizationSettingsView({ run }: { run: OptimizationRun }) {
  const [activeTab, setActiveTab] = useState("Source");
  const terminal = !isConfigurableRunStatus(run.status);
  const skillOptimization = run.skillOptimization ?? null;
  return (
    <WizardPage
      activeTab={activeTab}
      backTo="/ai-eval?tab=evaluations"
      description={
        terminal
          ? "Terminal optimization settings are read-only."
          : "Inspect configurable optimization settings for this run."
      }
      onBack={() => setActiveTab(previousWizardTab(optimizationSettingsTabs, activeTab))}
      onNext={() => setActiveTab(nextWizardTab(optimizationSettingsTabs, activeTab))}
      onTabChange={setActiveTab}
      readOnly
      extraActions={<TargetPromotionDialog projectId={run.projectId} run={run} />}
      saveIcon={<Settings data-icon="inline-start" />}
      saveLabel={t("aiEval.action.saveSettings")}
      tabs={optimizationSettingsTabs}
      title={t("aiEval.action.optimizationSettings")}
    >
      {activeTab === "Source" ? (
        <SummaryList
          rows={[
            ["Run", run.id],
            ["Status", run.status],
            ["Baseline target", run.baselineTargetSnapshotId],
            ["Training evaluation", run.trainingEvaluationDefinitionId ?? "not set"],
            ["Validation evaluation", run.validationEvaluationDefinitionId ?? "not set"],
          ]}
        />
      ) : null}
      {activeTab === "Objective" ? (
        <SummaryList
          rows={[
            ["Primary metric", run.objective.primaryMetricId],
            ["Secondary metrics", run.objective.secondaryMetricIds?.join(", ") || "none"],
            ["Tradeoff metrics", run.objective.tradeoffMetricIds?.join(", ") || "none"],
            ["Tie-breakers", run.objective.tieBreakers?.join(", ") || "none"],
            ["Minimum evidence", jsonPreview(run.objective.minimumEvidence, 160)],
          ]}
        />
      ) : null}
      {activeTab === "Search" ? (
        <div className="grid gap-4">
          <SummaryList
            rows={[
              ["Optimizer", run.searchPolicy.optimizerKind],
              ["Editable parts", run.searchPolicy.editablePartKinds.join(", ") || "none"],
              ["Max epochs", run.searchPolicy.maxEpochs.toString()],
              ["Max steps", run.searchPolicy.maxSteps.toString()],
              ["Gate metric", run.searchPolicy.gateMetricId],
              ["Gate mode", run.searchPolicy.gateMode],
              ["Selection split", run.searchPolicy.selectionSplit],
              ["Slow update", run.searchPolicy.allowSlowUpdate ? "enabled" : "disabled"],
              ["Meta memory", run.searchPolicy.allowMetaMemory ? "enabled" : "disabled"],
            ]}
          />
          {run.searchPolicy.skillPolicy ? (
            <SummaryList
              rows={[
                ["Allowed skill edit ops", run.searchPolicy.skillPolicy.allowedEditOps.join(", ")],
                ["Editable file globs", run.searchPolicy.skillPolicy.editableFileGlobs.join(", ")],
                [
                  "Protected file globs",
                  run.searchPolicy.skillPolicy.protectedFileGlobs.join(", "),
                ],
                [
                  "Export best skill",
                  run.searchPolicy.skillPolicy.exportBestSkill ? "enabled" : "disabled",
                ],
              ]}
            />
          ) : null}
          {skillOptimization ? <SkillOptimizationDigestPanel detail={skillOptimization} /> : null}
          <ReadOnlyValue
            label="Candidate target snapshots"
            value={run.candidateTargetSnapshotIds.length.toString()}
          />
        </div>
      ) : null}
      {activeTab === "Validation" ? (
        <div className="grid gap-4">
          <SummaryList
            rows={[
              ["Quick-shot phase", run.quickShotPolicy ? "configured" : "not configured"],
              ["Caused evaluation runs", run.causedEvaluationRunIds.length.toString()],
              ["Comparisons", run.comparisonIds.length.toString()],
              ["Promotion evidence", promotionReadinessLabel(run)],
            ]}
          />
          {skillOptimization ? <SkillOptimizationStepTimeline detail={skillOptimization} /> : null}
        </div>
      ) : null}
      {activeTab === "Controls" ? (
        <FieldGroup>
          <PromotionActionState run={run} />
          <ReadOnlyValue
            label="Lifecycle controls"
            value={
              terminal
                ? "Terminal run controls are locked."
                : "Mutable optimization controls are read-only until a backend update mutation exists."
            }
          />
          <ReadOnlyValue label="Budget snapshot" value={jsonPreview(run.budgetSnapshot, 160)} />
        </FieldGroup>
      ) : null}
    </WizardPage>
  );
}

function SkillOptimizationDigestPanel({ detail }: { detail: SkillOptimizationDetail }) {
  return (
    <section className="grid gap-3 border p-3" data-ai-eval-skill-optimization-detail="true">
      <div>
        <h3 className="text-sm font-medium">{t("aiEval.skill.detail.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("aiEval.skill.detail.description")}</p>
      </div>
      <SummaryList
        rows={[
          [t("aiEval.skill.baselineSkillDigest"), detail.baselineSkillDigest],
          [t("aiEval.skill.currentSkillDigest"), detail.currentSkillDigest ?? t("value.unknown")],
          [t("aiEval.skill.bestSkillDigest"), detail.bestSkillDigest ?? t("value.none")],
          [t("aiEval.skill.bestTargetSnapshot"), detail.bestTargetSnapshotId ?? t("value.none")],
          [
            t("aiEval.skill.exportedArtifactRef"),
            detail.exportedSkillContentRef ?? t("value.none"),
          ],
          [t("aiEval.skill.acceptedSteps"), detail.acceptedStepCount.toString()],
          [t("aiEval.skill.rejectedSteps"), detail.rejectedStepCount.toString()],
          [t("aiEval.skill.skippedSteps"), detail.skippedStepCount.toString()],
          [t("aiEval.skill.failedSteps"), detail.failedStepCount.toString()],
        ]}
      />
      <SkillOptimizationFileDiffSummary detail={detail} />
    </section>
  );
}

function SkillOptimizationFileDiffSummary({ detail }: { detail: SkillOptimizationDetail }) {
  const fileRows = skillOptimizationFileRows(detail);
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-medium">{t("aiEval.skill.fileDiffSummary")}</h4>
      {fileRows.map((row) => (
        <div className="border px-3 py-2 text-sm" key={row.filePath}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{row.filePath}</span>
            <Badge variant="outline">
              {row.acceptedCount} accepted · {row.rejectedCount} rejected
            </Badge>
          </div>
          <div className="mt-1 text-muted-foreground">{row.summary}</div>
        </div>
      ))}
      {fileRows.length === 0 ? (
        <div className="border border-dashed p-3 text-sm text-muted-foreground">
          {t("aiEval.skill.noFileEdits")}
        </div>
      ) : null}
    </div>
  );
}

function SkillOptimizationStepTimeline({ detail }: { detail: SkillOptimizationDetail }) {
  const steps = [...detail.steps].sort(
    (left, right) => left.epoch - right.epoch || left.step - right.step,
  );
  return (
    <section className="grid gap-3" data-ai-eval-skill-step-timeline="true">
      <div>
        <h3 className="text-sm font-medium">{t("aiEval.skill.timeline.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("aiEval.skill.timeline.description")}</p>
      </div>
      {steps.map((step) => (
        <SkillOptimizationStepCard key={step.id} step={step} />
      ))}
      {steps.length === 0 ? (
        <div className="border border-dashed p-3 text-sm text-muted-foreground">
          {t("aiEval.skill.noSteps")}
        </div>
      ) : null}
    </section>
  );
}

function SkillOptimizationStepCard({ step }: { step: SkillOptimizationStep }) {
  return (
    <article className="grid gap-3 border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">
            {t("aiEval.skill.stepTitle", {
              epoch: String(step.epoch + 1),
              step: String(step.step + 1),
            })}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("aiEval.skill.stepDescription", {
              candidateId: step.candidateTargetSnapshotId ?? t("value.none"),
              runId: step.rolloutEvaluationRunId,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={step.status === "accepted" ? "default" : "outline"}>{step.status}</Badge>
          <Badge variant="outline">{step.gateDecision}</Badge>
        </div>
      </div>
      <SummaryList
        rows={[
          [t("aiEval.skill.trainingScore"), formatScore(step.trainingScore)],
          [t("aiEval.skill.validationScore"), formatNullableScore(step.validationScore)],
          [t("aiEval.skill.baselineDigest"), step.baselineSkillDigest],
          [t("aiEval.skill.candidateDigest"), step.candidateSkillDigest ?? t("value.unknown")],
          [t("aiEval.skill.problem"), step.problem?.message ?? t("value.none")],
        ]}
      />
      <SkillOptimizationEditList
        title={t("aiEval.skill.selectedEdits")}
        edits={step.selectedEdits}
      />
      <SkillOptimizationEditList
        emptyLabel={t("aiEval.skill.noRejectedEdits")}
        title={t("aiEval.skill.rejectedEditReasons")}
        edits={step.rejectedEditSummaries}
      />
    </article>
  );
}

function SkillOptimizationEditList({
  edits,
  emptyLabel = t("aiEval.skill.noEdits"),
  title,
}: {
  edits: SkillOptimizationEdit[];
  emptyLabel?: string;
  title: string;
}) {
  return (
    <div className="grid gap-2">
      <h5 className="text-sm font-medium">{title}</h5>
      {edits.map((edit) => (
        <div className="border px-3 py-2" key={skillOptimizationEditKey(edit)}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{edit.op}</Badge>
            <span className="font-medium">{edit.filePath ?? t("aiEval.skill.unknownFile")}</span>
            <span className="text-xs text-muted-foreground">{edit.sourceType}</span>
          </div>
          {edit.target ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("aiEval.skill.target", { target: edit.target })}
            </div>
          ) : null}
          {edit.rationale ? <div className="mt-1 text-sm">{edit.rationale}</div> : null}
          {edit.contentPreview ? (
            <CodeBlock
              className="mt-2"
              code={edit.contentPreview}
              language="log"
              maxHeightClassName="max-h-40"
            />
          ) : null}
          <div className="mt-1 text-xs text-muted-foreground">
            {t("aiEval.skill.evidenceSummary", {
              items: String(edit.supportCount ?? 0),
              refs: String(edit.evidenceRefs.length),
            })}
          </div>
        </div>
      ))}
      {edits.length === 0 ? (
        <div className="border border-dashed p-3 text-sm text-muted-foreground">{emptyLabel}</div>
      ) : null}
    </div>
  );
}

function skillOptimizationEditKey(edit: SkillOptimizationEdit) {
  const evidenceKey = edit.evidenceRefs
    .map(
      (ref) =>
        `${ref.kind}:${ref.traceId ?? ""}:${ref.spanId ?? ""}:${ref.evaluationRunId ?? ""}:${
          ref.evaluationItemRunId ?? ""
        }:${ref.importJobId ?? ""}:${ref.candidateId ?? ""}`,
    )
    .join("|");
  return [
    edit.filePath ?? "unknown",
    edit.op,
    edit.target ?? "",
    edit.sourceType,
    edit.contentPreview ?? "",
    edit.rationale ?? "",
    evidenceKey,
  ].join("::");
}

function PromotionActionState({ run }: { run: OptimizationRun }) {
  return (
    <div className="border px-3 py-2 text-sm" data-ai-eval-promotion-action-state="true">
      <div className="font-medium">{t("aiEval.promotion.actionTitle")}</div>
      <div className="mt-1 text-muted-foreground">{promotionReadinessLabel(run)}</div>
      <div className="mt-3">
        <TargetPromotionDialog projectId={run.projectId} run={run} />
      </div>
    </div>
  );
}

function TargetPromotionDialog({ projectId, run }: { projectId: string; run: OptimizationRun }) {
  const telemetryClient = useTelemetryClient();
  const promotionState = promotionReadiness(run);
  const mutation = useMutation({
    mutationFn: () =>
      telemetryClient.promoteTargetSnapshot({
        projectId,
        targetRef: run.baselineTargetSnapshotId,
        baselineTargetSnapshotId: run.baselineTargetSnapshotId,
        candidateTargetSnapshotId: run.selectedCandidateSnapshotId ?? "",
        evidenceEvaluationRunIds: run.causedEvaluationRunIds,
        comparisonId: run.comparisonIds[0] ?? "",
        notes: null,
        idempotencyKey: `target-promotion-${Date.now()}`,
      }),
  });
  return (
    <Button
      aria-label={t("aiEval.promotion.aria", { reason: promotionState.reason })}
      disabled={!promotionState.ready || mutation.isPending}
      onClick={() => void mutation.mutateAsync()}
      size="sm"
      title={promotionState.reason}
      type="button"
      variant="outline"
    >
      <CheckCircle2 data-icon="inline-start" />
      {t("aiEval.action.promote")}
    </Button>
  );
}

function ManagedHarnessReadinessPanel() {
  return (
    <section className="grid gap-3 border p-3" data-ai-eval-runtime-readiness="managed-harness">
      <div>
        <h3 className="text-sm font-medium">{t("aiEval.readiness.managedHarness.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("aiEval.readiness.managedHarness.description")}
        </p>
      </div>
      <ReadinessCheckList
        checks={[
          "skill package manifest",
          "model and tool profile",
          "fixture availability",
          "terminal output capture",
          "managed OTLP trace evidence",
        ]}
        heading={t("aiEval.readiness.dryRunChecks")}
        status={t("aiEval.readiness.checkedDuringDryRun")}
      />
    </section>
  );
}

function ExternalAdapterReadinessPanel() {
  return (
    <section className="grid gap-3 border p-3" data-ai-eval-runtime-readiness="external-adapter">
      <div>
        <h3 className="text-sm font-medium">{t("aiEval.readiness.externalAdapter.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("aiEval.readiness.externalAdapter.description")}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ReadinessCheckList
          checks={HTTP_CONTROL_READINESS_CHECKS}
          heading={t("aiEval.readiness.httpControl")}
          status="required"
        />
        <ReadinessCheckList
          checks={OTLP_EVIDENCE_READINESS_CHECKS}
          heading={t("aiEval.readiness.otlpEvidence")}
          status="required"
        />
      </div>
      <div className="grid gap-2 border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <p>
          Actionable failures include missing trace propagation, missing terminal output or output
          ref, failed async polling, and missing semantic coverage for the item trace.
        </p>
        <p>
          A successful dry run shows the last dry-run trace link so users can inspect the telemetry
          evidence CloudGrid used.
        </p>
      </div>
    </section>
  );
}

function ReadinessCheckList({
  checks,
  heading,
  status,
}: {
  checks: string[];
  heading: string;
  status: string;
}) {
  return (
    <div className="grid gap-2 border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">{heading}</h4>
        <Badge variant="outline">{status}</Badge>
      </div>
      <ul className="grid gap-1 text-muted-foreground">
        {checks.map((check) => (
          <li className="flex gap-2" key={check}>
            <CheckCircle2 aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>{check}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TAB_PURPOSE = t("aiEval.tab.purpose");
const TAB_SCHEMA = t("aiEval.tab.schema");
const TAB_CURATION = t("aiEval.tab.curation");
const TAB_TRACE_INTAKE = t("aiEval.tab.traceIntake");
const TAB_VERSIONS = t("aiEval.tab.versions");
const TAB_DATASET = t("aiEval.tab.dataset");
const TAB_TARGET = t("aiEval.tab.target");
const TAB_METRICS = t("aiEval.tab.metrics");
const TAB_RUN_POLICY = t("aiEval.tab.runPolicy");
const TAB_HISTORY = t("aiEval.tab.history");
const TAB_SOURCE = t("aiEval.tab.source");
const TAB_OBJECTIVE = t("aiEval.tab.objective");
const TAB_SEARCH = t("aiEval.tab.search");
const TAB_VALIDATION = t("aiEval.tab.validation");
const TAB_CONTROLS = t("aiEval.tab.controls");

const datasetCreateTabs = [TAB_PURPOSE, TAB_SCHEMA, TAB_CURATION, TAB_TRACE_INTAKE];
const datasetSettingsTabs = [TAB_PURPOSE, TAB_SCHEMA, TAB_CURATION, TAB_TRACE_INTAKE, TAB_VERSIONS];
const evaluationCreateTabs = [TAB_DATASET, TAB_TARGET, TAB_METRICS, TAB_RUN_POLICY];
const evaluationSettingsTabs = [TAB_DATASET, TAB_TARGET, TAB_METRICS, TAB_RUN_POLICY, TAB_HISTORY];
const optimizationCreateTabs = [TAB_SOURCE, TAB_OBJECTIVE, TAB_SEARCH, TAB_VALIDATION];
const optimizationSettingsTabs = [
  TAB_SOURCE,
  TAB_OBJECTIVE,
  TAB_SEARCH,
  TAB_VALIDATION,
  TAB_CONTROLS,
];

function WizardPage({
  activeTab,
  backTo,
  children,
  description,
  error = null,
  errorTargetId = null,
  extraActions = null,
  onBack,
  onNext,
  onSave,
  onTabChange,
  readOnly = false,
  saveDisabled = false,
  saveIcon,
  saveLabel,
  saving = false,
  settingsMode = false,
  tabErrors = {},
  tabs,
  title,
}: {
  activeTab: string;
  backTo: string;
  children: ReactNode;
  description: string;
  error?: string | null;
  errorTargetId?: string | null | undefined;
  extraActions?: ReactNode;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  onTabChange: (tab: string) => void;
  readOnly?: boolean;
  saveDisabled?: boolean;
  saveIcon: ReactNode;
  saveLabel: string;
  saving?: boolean;
  /** Settings mode replaces the Back/Continue/Save wizard buttons with Cancel + Save, always visible on all tabs. */
  settingsMode?: boolean;
  tabErrors?: Record<string, boolean>;
  tabs: string[];
  title: string;
}) {
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === tabs.length - 1;
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorSummaryRef.current?.focus();
    }
  }, [error]);
  const focusFirstInvalidField = () => {
    if (!errorTargetId) {
      return;
    }
    document.getElementById(errorTargetId)?.focus();
  };
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 border-b pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              to={backTo}
            >
              <ArrowLeft aria-hidden className="size-3" />
              {t("aiEval.action.backToAiEval")}
            </Link>
            <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {extraActions}
            {settingsMode ? (
              <>
                <Button asChild size="sm" type="button" variant="outline">
                  <Link to={backTo}>
                    <XCircle data-icon="inline-start" />
                    {t("actions.cancel")}
                  </Link>
                </Button>
                <Button disabled={saving || saveDisabled} onClick={onSave} size="sm" type="button">
                  <span data-icon="inline-start">{saveIcon}</span>
                  {saveLabel}
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="sm" type="button" variant="outline">
                  <Link to={backTo}>
                    <XCircle data-icon="inline-start" />
                    {t("actions.cancel")}
                  </Link>
                </Button>
                <Button
                  disabled={isFirst}
                  onClick={onBack}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowLeft data-icon="inline-start" />
                  {t("actions.back")}
                </Button>
                {isLast ? (
                  <Button
                    disabled={readOnly || saveDisabled || saving}
                    onClick={onSave}
                    size="sm"
                    type="button"
                    variant={readOnly ? "outline" : "default"}
                  >
                    <span data-icon="inline-start">{saveIcon}</span>
                    {saveLabel}
                  </Button>
                ) : (
                  <Button onClick={onNext} size="sm" type="button">
                    <CheckCircle2 data-icon="inline-start" />
                    {t("aiEval.action.continue")}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <nav className="w-56 shrink-0 overflow-auto border-r pr-3" aria-label={`${title} steps`}>
          <div className="grid gap-1">
            {tabs.map((tab, index) => {
              const isCompleted = index < activeIndex;
              const isCurrent = tab === activeTab;
              const hasTabError = Boolean(tabErrors[tab]);
              return (
                <Button
                  className="justify-start gap-2"
                  aria-invalid={hasTabError || undefined}
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  size="sm"
                  type="button"
                  variant={isCurrent ? "secondary" : "ghost"}
                >
                  <span
                    aria-hidden
                    className={[
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      isCompleted
                        ? "bg-primary text-primary-foreground"
                        : isCurrent
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {isCompleted ? "✓" : index + 1}
                  </span>
                  <span>{tab}</span>
                  {hasTabError ? (
                    <Badge className="ml-auto" variant="outline">
                      {t("aiEval.error.needsFix")}
                    </Badge>
                  ) : null}
                </Button>
              );
            })}
          </div>
        </nav>
        <div className="min-h-0 flex-1 overflow-auto border p-4">
          <h2 className="mb-3 text-sm font-medium">{activeTab}</h2>
          {error ? (
            <div
              className="mb-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              ref={errorSummaryRef}
              role="alert"
              tabIndex={-1}
            >
              <div className="font-medium">{t("aiEval.error.reviewField")}</div>
              <div>{error}</div>
              {errorTargetId ? (
                <Button
                  className="mt-2 h-auto px-0 py-0 text-destructive underline-offset-4 hover:underline"
                  onClick={focusFirstInvalidField}
                  type="button"
                  variant="link"
                >
                  <Eye data-icon="inline-start" />
                  {t("aiEval.action.focusField")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {readOnly ? (
            <div className="mb-3 border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {t("aiEval.state.viewOnlySettings")}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}

function SummaryList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([label, value]) => (
        <div className="border px-3 py-2" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border px-3 py-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="break-words">{value}</div>
    </div>
  );
}

function DependencyResetNote({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed px-3 py-2 text-sm text-muted-foreground">{children}</div>
  );
}

function EvaluationFamilyField({
  onChange,
  value,
}: {
  onChange: (value: EvaluationFamily) => void;
  value: EvaluationFamily;
}) {
  return (
    <Field>
      <FieldLabel>{t("aiEval.field.evaluationType")}</FieldLabel>
      <Select onValueChange={(next) => onChange(next as EvaluationFamily)} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVALUATION_FAMILY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t("aiEval.description.evaluationFamily")}</FieldDescription>
    </Field>
  );
}

function TargetReferenceField({
  kind,
  onChange,
  value,
}: {
  kind: Extract<EvaluationTargetKind, "prompt" | "external_adapter">;
  onChange: (value: string) => void;
  value: string;
}) {
  const options = TARGET_REF_OPTIONS[kind];
  return (
    <Field>
      <FieldLabel htmlFor="evaluation-target-ref">
        {kind === "external_adapter"
          ? t("aiEval.field.adapterProfile")
          : t("aiEval.field.promptReference")}
      </FieldLabel>
      <Select onValueChange={onChange} value={value || defaultTargetRefForKind(kind)}>
        <SelectTrigger id="evaluation-target-ref">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        {kind === "external_adapter"
          ? t("aiEval.description.adapterProfile")
          : t("aiEval.description.promptReference")}
      </FieldDescription>
    </Field>
  );
}

function ModelAliasField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="evaluation-model-alias">{t("aiEval.field.modelAlias")}</FieldLabel>
      <Select onValueChange={onChange} value={value || "default"}>
        <SelectTrigger id="evaluation-model-alias">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_ALIAS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t("aiEval.description.modelAlias")}</FieldDescription>
    </Field>
  );
}

function RuntimeModeField({
  onChange,
  value,
}: {
  onChange: (value: "managed_harness" | "external_adapter") => void;
  value: "managed_harness" | "external_adapter";
}) {
  return (
    <Field>
      <FieldLabel>{t("aiEval.field.skillRuntimeMode")}</FieldLabel>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        <Button
          aria-checked={value === "managed_harness"}
          onClick={() => onChange("managed_harness")}
          role="radio"
          size="sm"
          type="button"
          variant={value === "managed_harness" ? "secondary" : "outline"}
        >
          <Play data-icon="inline-start" />
          {t("aiEval.option.managedHarness")}
        </Button>
        <Button
          aria-checked={value === "external_adapter"}
          onClick={() => onChange("external_adapter")}
          role="radio"
          size="sm"
          type="button"
          variant={value === "external_adapter" ? "secondary" : "outline"}
        >
          <Settings data-icon="inline-start" />
          {t("aiEval.option.externalAdapter")}
        </Button>
      </div>
      <FieldDescription>{t("aiEval.description.skillRuntimeMode")}</FieldDescription>
    </Field>
  );
}

function DatasetValueContractField({
  description,
  label,
  onSchemaChange,
  onTypeChange,
  schema,
  schemaDescription,
  schemaLabel,
  type,
  typeLabel,
}: {
  description: string;
  label: string;
  onSchemaChange: (value: string) => void;
  onTypeChange: (value: DatasetValueType) => void;
  schema: string;
  schemaDescription: string;
  schemaLabel: string;
  type: DatasetValueType;
  typeLabel: string;
}) {
  return (
    <section className="grid gap-3 border p-3">
      <div>
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ValueTypeField label={typeLabel} onChange={onTypeChange} value={type} />
      {type === "json" ? (
        <Field>
          <FieldLabel>{schemaLabel}</FieldLabel>
          <JsonEditor
            minHeight="200px"
            onChange={onSchemaChange}
            placeholder='{"type": "object", "properties": {}}'
            value={schema}
          />
          <FieldDescription>{schemaDescription}</FieldDescription>
        </Field>
      ) : (
        <div className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Text values use the prompt, message, answer, or result text directly; no JSON shape is
          saved for this side.
        </div>
      )}
    </section>
  );
}

function MetricField({
  id,
  onChange,
  value,
}: {
  id?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const hasPreset = METRIC_OPTIONS.some((option) => option.value === value);
  const selectedValue = hasPreset ? value : "__custom__";
  return (
    <div className="grid gap-2">
      <Select
        onValueChange={(next) => {
          if (next === "__custom__") {
            onChange(hasPreset ? "" : value);
            return;
          }
          onChange(next);
        }}
        value={selectedValue}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METRIC_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedValue === "__custom__" ? (
        <Input
          aria-label={t("aiEval.field.defaultMetric")}
          onChange={(event) => onChange(event.target.value)}
          placeholder="namespace.metric_id"
          value={value}
        />
      ) : null}
    </div>
  );
}

function recommendedMetricId(
  family: EvaluationFamily,
  _inputType: DatasetValueType,
  expectedType: DatasetValueType,
) {
  if (expectedType === "json") {
    return "extraction.exact_json_match";
  }
  if (family === "extraction") {
    return "text.contains_expected";
  }
  return "text.exact_match";
}

function datasetDefaultMetricId(dataset: Dataset | null | undefined) {
  const settings = dataset?.settings;
  if (settings?.defaultMetricSettings[0]?.metricId) {
    return settings.defaultMetricSettings[0].metricId;
  }
  return recommendedMetricId(
    settings?.evaluationFamily ?? "classification",
    settings?.inputType ?? "text",
    settings?.expectedType ?? "text",
  );
}

function evaluationFamilyLabel(value: EvaluationFamily | string) {
  return EVALUATION_FAMILY_OPTIONS.find((option) => option.value === value)?.label ?? String(value);
}

function isRecommendedMetricId(metricId: string) {
  return METRIC_OPTIONS.some(
    (option) => option.value === metricId && option.value !== "__custom__",
  );
}

function TraceIntakeFields({
  expectedPath,
  inputPath,
  observedOutputPath,
  onExpectedPathChange,
  onInputPathChange,
  onObservedOutputPathChange,
  onOperationNameChange,
  onServiceNameChange,
  operationName,
  serviceName,
  showObservedOutput,
}: {
  expectedPath: string;
  inputPath: string;
  observedOutputPath: string;
  onExpectedPathChange: (value: string) => void;
  onInputPathChange: (value: string) => void;
  onObservedOutputPathChange: (value: string) => void;
  onOperationNameChange: (value: string) => void;
  onServiceNameChange: (value: string) => void;
  operationName: string;
  serviceName: string;
  showObservedOutput: boolean;
}) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 border p-3">
        <div>
          <h3 className="text-sm font-medium">{t("aiEval.trace.aiCallMatching")}</h3>
          <p className="text-xs text-muted-foreground">{t("aiEval.description.aiCallMatching")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>{t("aiEval.field.service")}</FieldLabel>
            <Input
              onChange={(event) => onServiceNameChange(event.target.value)}
              placeholder="checkout-api"
              value={serviceName}
            />
            <FieldDescription>{t("aiEval.description.traceServiceOptional")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("aiEval.field.functionOrOperation")}</FieldLabel>
            <Input
              onChange={(event) => onOperationNameChange(event.target.value)}
              placeholder="POST /checkout or answer_question"
              value={operationName}
            />
            <FieldDescription>{t("aiEval.description.traceOperationOptional")}</FieldDescription>
          </Field>
        </div>
        <TracePathField
          description={t("aiEval.description.traceInputSource")}
          label={t("aiEval.trace.aiInputSource")}
          onChange={onInputPathChange}
          value={inputPath}
        />
      </section>
      {inputPath.trim() ? (
        <section className="grid gap-3 border p-3">
          <div>
            <h3 className="text-sm font-medium">{t("aiEval.trace.aiResultMapping")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("aiEval.description.aiResultMapping")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TracePathField
              description={t("aiEval.description.traceExpectedSource")}
              label={t("aiEval.trace.expectedAiResultSource")}
              onChange={onExpectedPathChange}
              value={expectedPath}
            />
            {showObservedOutput ? (
              <TracePathField
                description={t("aiEval.description.traceObservedSource")}
                label={t("aiEval.trace.observedAiResultSource")}
                onChange={onObservedOutputPathChange}
                value={observedOutputPath}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TracePathField({
  description,
  label,
  onChange,
  value,
}: {
  description: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const hasPreset = TRACE_PATH_OPTIONS.some((option) => option.value === value);
  const selectedValue = value ? (hasPreset ? value : "__custom__") : "__empty__";
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        onValueChange={(next) => {
          if (next === "__empty__") {
            onChange("");
            return;
          }
          if (next === "__custom__") {
            onChange(hasPreset ? "$." : value);
            return;
          }
          onChange(next);
        }}
        value={selectedValue}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRACE_PATH_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedValue === "__custom__" ? (
        <Input
          aria-label={t("aiEval.trace.customValue", { label })}
          onChange={(event) => onChange(event.target.value)}
          placeholder="$.path.to.value"
          value={value}
        />
      ) : null}
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

function ValueTypeField({
  description,
  label,
  onChange,
  value,
}: {
  description?: string;
  label: string;
  onChange: (value: DatasetValueType) => void;
  value: DatasetValueType;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select onValueChange={(next) => onChange(next as DatasetValueType)} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="json">JSON</SelectItem>
          <SelectItem value="text">{t("aiEval.option.text")}</SelectItem>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function SplitField({
  description,
  label = "Split",
  onChange,
  value,
}: {
  description?: string;
  label?: string;
  onChange: (value: DatasetSplit) => void;
  value: DatasetSplit;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select onValueChange={(next) => onChange(next as DatasetSplit)} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATASET_SPLITS.map((split) => (
            <SelectItem key={split} value={split}>
              {datasetSplitLabel(split)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function CurationStatusField({
  description,
  label = "Curation status",
  onChange,
  value,
}: {
  description?: string;
  label?: string;
  onChange: (value: DatasetCurationStatus) => void;
  value: DatasetCurationStatus;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select onValueChange={(next) => onChange(next as DatasetCurationStatus)} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATASET_CURATION_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {curationStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

type TraceIntakeDraft = {
  expectedPath: string;
  hasRule: boolean;
  inputPath: string;
  observedOutputPath: string;
  operationName: string;
  serviceName: string;
};

function traceIntakeDraftFromSettings(raw: unknown): TraceIntakeDraft {
  const empty = {
    expectedPath: "",
    hasRule: false,
    inputPath: "",
    observedOutputPath: "",
    operationName: "",
    serviceName: "",
  };
  if (!isRecord(raw)) {
    return empty;
  }
  const rules = raw.traceIntakeRules;
  const firstRule = Array.isArray(rules) ? rules.find(isRecord) : null;
  if (firstRule) {
    const match = isRecord(firstRule.match) ? firstRule.match : {};
    const mappings = isRecord(firstRule.mappings) ? firstRule.mappings : {};
    return {
      expectedPath: mappingPath(mappings.expected),
      hasRule: true,
      inputPath: mappingPath(mappings.input),
      observedOutputPath: mappingPath(mappings.observedOutput),
      operationName: firstStringFrom(match.operationNames) || firstStringFrom(match.spanNames),
      serviceName: firstStringFrom(match.serviceNames),
    };
  }
  return empty;
}

function buildTraceIntakeRules({
  curationStatus,
  expectedPath,
  inputPath,
  observedOutputPath,
  operationName,
  serviceName,
  split,
}: {
  curationStatus: DatasetCurationStatus;
  expectedPath: string;
  inputPath: string;
  observedOutputPath: string;
  operationName: string;
  serviceName: string;
  split: DatasetSplit;
}): NonNullable<CreateDatasetInput["settings"]["traceIntakeRules"]> {
  const trimmedInputPath = inputPath.trim();
  if (!trimmedInputPath) {
    return [];
  }
  const trimmedExpectedPath = expectedPath.trim();
  const trimmedObservedOutputPath = observedOutputPath.trim();
  return [
    {
      id: "default-trace-intake",
      name: "Observed AI call",
      enabled: true,
      match: {
        serviceNames: serviceName.trim() ? [serviceName.trim()] : [],
        operationNames: operationName.trim() ? [operationName.trim()] : [],
        spanNames: [],
        spanKinds: [],
        statuses: [],
        attributePredicates: [],
      },
      mappings: {
        input: {
          source: "span_attribute",
          path: trimmedInputPath,
          transform: "identity",
        },
        expected: trimmedExpectedPath
          ? {
              source: "span_attribute",
              path: trimmedExpectedPath,
              transform: "identity",
            }
          : null,
        observedOutput: trimmedObservedOutputPath
          ? {
              source: "span_attribute",
              path: trimmedObservedOutputPath,
              transform: "identity",
            }
          : null,
        metadata: [],
      },
      defaults: {
        split,
        curationStatus,
        contentTreatment: "realistic_anonymized",
        expectedTrust: trimmedExpectedPath ? "trusted_label" : "untrusted",
      },
    },
  ];
}

function firstStringFrom(value: unknown) {
  return Array.isArray(value)
    ? (value.find((item): item is string => typeof item === "string") ?? "")
    : "";
}

function mappingPath(value: unknown) {
  return isRecord(value) ? readOptionalString(value.path) : "";
}

function isEvaluationFamily(value: unknown): value is EvaluationFamily {
  return EVALUATION_FAMILY_OPTIONS.some((option) => option.value === value);
}

function isDatasetValueType(value: unknown): value is DatasetValueType {
  return value === "json" || value === "text";
}

function isDatasetSplit(value: unknown): value is DatasetSplit {
  return DATASET_SPLITS.includes(value as DatasetSplit);
}

function isDatasetCurationStatus(value: unknown): value is DatasetCurationStatus {
  return DATASET_CURATION_STATUSES.includes(value as DatasetCurationStatus);
}

function isRetentionProfile(value: unknown): value is RetentionProfile {
  return (
    value === "balanced" ||
    value === "fast_iteration" ||
    value === "audit_friendly" ||
    value === "minimal_storage"
  );
}

function isAnonymizationMode(value: unknown): value is "off" | "realistic" | "redact" {
  return value === "off" || value === "realistic" || value === "redact";
}

function evaluationDatasetRowsLabel(definition: EvaluationDefinition) {
  if (definition.datasetVersionPolicy === "pinned") {
    return `Pinned dataset version ${definition.pinnedDatasetVersionId ?? ""}`.trim();
  }
  return "Latest ready rows";
}

function datasetReadinessIssues(dataset: Dataset) {
  const health = dataset.health;
  const issues: Array<{
    action?: { label: string; to: string };
    description: string;
    title: string;
  }> = [];
  const total = Number(health.totalItemCount || dataset.itemCount || 0);
  const ready = datasetReadyItemCount(dataset);
  if (total === 0) {
    issues.push({
      description: "Add a dataset row or import examples before creating an evaluation.",
      title: "No rows yet",
    });
  } else if (ready === 0) {
    issues.push({
      description:
        "Review rows below, add the expected AI result, and mark reviewed rows as ready.",
      title: "No ready rows",
    });
  }
  if (health.missingExpectedCount > 0) {
    issues.push({
      description: `${health.missingExpectedCount} rows need the expected AI result before they can be used.`,
      title: "Expected AI results missing",
    });
  }
  if (health.schemaIssueCount > 0) {
    issues.push({
      action: {
        label: "Dataset settings",
        to: `/ai-eval/datasets/${encodeURIComponent(dataset.id)}/settings`,
      },
      description:
        "Some rows do not match the configured AI input or expected result shape. Update the shape or edit the rows.",
      title: "AI shape mismatch",
    });
  }
  if (health.leakageWarningCount > 0) {
    issues.push({
      description:
        "Review split assignments before running evaluations so training examples do not leak into validation or test evidence.",
      title: "Split leakage warning",
    });
  }
  if (health.duplicateCandidateCount > 0) {
    issues.push({
      description:
        "Review similar rows below and reject or merge duplicates before using the dataset as evidence.",
      title: "Possible duplicate rows",
    });
  }
  if (health.smallDataset && ready > 0) {
    issues.push({
      description:
        "Add more ready rows when possible so evaluation results are less sensitive to one example.",
      title: "Small ready set",
    });
  }
  return issues;
}

function readSection(value: string | null): AiEvalSection {
  return value === "evaluations" ? "evaluations" : "datasets";
}

function readAiEvalRouteState(pathname: string): AiEvalRouteState {
  const datasetSettings = pathname.match(/^\/ai-eval\/datasets\/([^/]+)\/settings\/?$/);
  if (datasetSettings?.[1]) {
    return {
      datasetId: decodeURIComponent(datasetSettings[1]),
      kind: "dataset-settings",
      section: "datasets",
    };
  }
  const evaluationSettings = pathname.match(/^\/ai-eval\/evaluations\/([^/]+)\/settings\/?$/);
  if (evaluationSettings?.[1]) {
    return {
      evaluationId: decodeURIComponent(evaluationSettings[1]),
      kind: "evaluation-settings",
      section: "evaluations",
    };
  }
  const optimizationSettings = pathname.match(/^\/ai-eval\/optimizations\/([^/]+)\/settings\/?$/);
  if (optimizationSettings?.[1]) {
    return {
      kind: "optimization-settings",
      optimizationRunId: decodeURIComponent(optimizationSettings[1]),
      section: "evaluations",
    };
  }
  if (pathname === "/ai-eval/datasets/new") {
    return { kind: "dataset-create", section: "datasets" };
  }
  if (pathname === "/ai-eval/evaluations/new") {
    return { kind: "evaluation-create", section: "evaluations" };
  }
  if (pathname === "/ai-eval/optimizations/new") {
    return { kind: "optimization-create", section: "evaluations" };
  }
  return { kind: "workspace", section: null };
}

function nextWizardTab(tabs: string[], activeTab: string) {
  const index = Math.max(0, tabs.indexOf(activeTab));
  return tabs[Math.min(tabs.length - 1, index + 1)] ?? activeTab;
}

function previousWizardTab(tabs: string[], activeTab: string) {
  const index = Math.max(0, tabs.indexOf(activeTab));
  return tabs[Math.max(0, index - 1)] ?? activeTab;
}

function datasetCreateValidationErrors(state: {
  evaluationFamily: string;
  expectedSchema: string;
  expectedType: DatasetValueType;
  inputSchema: string;
  inputType: DatasetValueType;
  name: string;
}): FieldValidationTarget[] {
  return [
    !state.name.trim()
      ? {
          fieldId: "dataset-name",
          message: t("aiEval.validation.datasetNameRequired"),
          tab: TAB_PURPOSE,
        }
      : null,
    !state.evaluationFamily.trim()
      ? {
          message: t("aiEval.validation.evaluationTypeRequired"),
          tab: TAB_PURPOSE,
        }
      : null,
    state.inputType === "json" && !state.inputSchema.trim()
      ? {
          message: t("aiEval.validation.inputJsonSchemaRequired"),
          tab: TAB_SCHEMA,
        }
      : null,
    state.expectedType === "json" && !state.expectedSchema.trim()
      ? {
          message: t("aiEval.validation.expectedJsonSchemaRequired"),
          tab: TAB_SCHEMA,
        }
      : null,
  ].filter(Boolean) as FieldValidationTarget[];
}

function evaluationValidationErrors(state: {
  datasetId: string;
  metricId: string;
  name: string;
  selectedDatasetReady: number;
  selectedSplitReadyCount: number;
  targetName: string;
  targetRef: string;
}): FieldValidationTarget[] {
  return [
    !state.name.trim()
      ? {
          fieldId: "evaluation-name",
          message: t("aiEval.validation.evaluationNameRequired"),
          tab: TAB_DATASET,
        }
      : null,
    !state.datasetId
      ? {
          fieldId: "evaluation-dataset",
          message: t("aiEval.validation.datasetRequired"),
          tab: TAB_DATASET,
        }
      : null,
    state.selectedDatasetReady === 0
      ? {
          fieldId: "evaluation-dataset",
          message: t("aiEval.validation.datasetNeedsReadyRows"),
          tab: TAB_DATASET,
        }
      : null,
    state.selectedSplitReadyCount === 0
      ? {
          message: t("aiEval.validation.splitNeedsReadyRows"),
          tab: TAB_DATASET,
        }
      : null,
    !state.targetName.trim()
      ? {
          fieldId: "evaluation-target-name",
          message: t("aiEval.validation.targetNameRequired"),
          tab: TAB_TARGET,
        }
      : null,
    !state.targetRef.trim()
      ? {
          fieldId: "evaluation-target-ref",
          message: t("aiEval.validation.targetRefRequired"),
          tab: TAB_TARGET,
        }
      : null,
    !state.metricId.trim()
      ? {
          message: t("aiEval.validation.metricRequired"),
          tab: TAB_METRICS,
        }
      : null,
  ].filter(Boolean) as FieldValidationTarget[];
}

function optimizationValidationErrors(state: {
  baselineSnapshotId: string;
  evaluationId: string;
  primaryMetricId: string;
}): FieldValidationTarget[] {
  return [
    !state.evaluationId
      ? {
          fieldId: "optimization-evaluation",
          message: t("aiEval.validation.sourceEvaluationRequired"),
          tab: TAB_SOURCE,
        }
      : null,
    !state.baselineSnapshotId.trim()
      ? {
          fieldId: "optimization-baseline",
          message: t("aiEval.validation.baselineTargetRequired"),
          tab: TAB_SOURCE,
        }
      : null,
    !state.primaryMetricId.trim()
      ? {
          message: t("aiEval.validation.metricRequired"),
          tab: TAB_OBJECTIVE,
        }
      : null,
  ].filter(Boolean) as FieldValidationTarget[];
}

function tabErrorsFromValidation(errors: FieldValidationTarget[]) {
  return errors.reduce<Record<string, boolean>>((accumulator, item) => {
    if (item.tab) {
      accumulator[item.tab] = true;
    }
    return accumulator;
  }, {});
}

function validationTargetForMessage(
  message: string | null | undefined,
): Partial<FieldValidationTarget> {
  if (!message) {
    return {};
  }
  for (const candidate of [
    ...datasetCreateValidationErrors({
      evaluationFamily: "",
      expectedSchema: "",
      expectedType: "json",
      inputSchema: "",
      inputType: "json",
      name: "",
    }),
    ...evaluationValidationErrors({
      datasetId: "",
      metricId: "",
      name: "",
      selectedDatasetReady: 0,
      selectedSplitReadyCount: 0,
      targetName: "",
      targetRef: "",
    }),
    ...optimizationValidationErrors({
      baselineSnapshotId: "",
      evaluationId: "",
      primaryMetricId: "",
    }),
  ]) {
    if (message.includes(candidate.message.split(".")[0] ?? candidate.message)) {
      return candidate;
    }
  }
  return {};
}

function defaultTargetRefForKind(
  kind: Extract<EvaluationTargetKind, "prompt" | "external_adapter">,
) {
  return kind === "external_adapter" ? "adapter://project-approved" : "prompt://current";
}

function datasetCreateTabError(
  activeTab: string,
  state: {
    evaluationFamily: string;
    expectedSchema: string;
    expectedType: DatasetValueType;
    inputSchema: string;
    inputType: DatasetValueType;
    name: string;
  },
) {
  if (activeTab === TAB_PURPOSE) {
    if (!state.name.trim()) {
      return t("aiEval.validation.datasetNameRequiredShort");
    }
    if (!state.evaluationFamily.trim()) {
      return t("aiEval.validation.evaluationTypeRequiredShort");
    }
  }
  if (activeTab === TAB_SCHEMA) {
    if (state.inputType === "json" && !state.inputSchema.trim()) {
      return t("aiEval.validation.inputJsonSchemaRequiredShort");
    }
    if (state.expectedType === "json" && !state.expectedSchema.trim()) {
      return t("aiEval.validation.expectedJsonSchemaRequiredShort");
    }
  }
  return null;
}

function evaluationCreateTabError(
  activeTab: string,
  state: {
    datasetId: string;
    metricId: string;
    name: string;
    selectedDatasetReady: number;
    selectedSplitReadyCount: number;
    targetName: string;
    targetRef: string;
  },
) {
  if (activeTab === TAB_DATASET) {
    if (!state.name.trim()) {
      return t("aiEval.validation.evaluationNameRequiredShort");
    }
    if (!state.datasetId) {
      return t("aiEval.validation.datasetRequiredShort");
    }
    if (state.selectedDatasetReady === 0) {
      return t("aiEval.validation.datasetNeedsReadyRowsShort");
    }
    if (state.selectedSplitReadyCount === 0) {
      return t("aiEval.validation.splitNeedsReadyRowsShort");
    }
  }
  if (activeTab === TAB_TARGET) {
    if (!state.targetName.trim()) {
      return t("aiEval.validation.targetNameRequiredShort");
    }
    if (!state.targetRef.trim()) {
      return t("aiEval.validation.targetRefRequiredShort");
    }
  }
  if (activeTab === TAB_METRICS && !state.metricId.trim()) {
    return t("aiEval.validation.metricRequiredShort");
  }
  return null;
}

function optimizationCreateTabError(
  activeTab: string,
  state: { baselineSnapshotId: string; evaluationId: string; primaryMetricId: string },
) {
  if (activeTab === TAB_SOURCE) {
    if (!state.evaluationId) {
      return t("aiEval.validation.sourceEvaluationRequiredShort");
    }
    if (!state.baselineSnapshotId.trim()) {
      return t("aiEval.validation.baselineTargetRequiredShort");
    }
  }
  if (activeTab === TAB_OBJECTIVE && !state.primaryMetricId.trim()) {
    return t("aiEval.validation.primaryMetricRequiredShort");
  }
  return null;
}

function isConfigurableRunStatus(status: string) {
  return !["completed", "cancelled", "failed"].includes(status);
}

function promotionReadiness(run: OptimizationRun): { ready: boolean; reason: string } {
  if (!run.selectedCandidateSnapshotId) {
    return { ready: false, reason: t("aiEval.promotion.noCandidate") };
  }
  if (run.comparisonIds.length === 0) {
    return { ready: false, reason: t("aiEval.promotion.noComparison") };
  }
  if (run.causedEvaluationRunIds.length === 0) {
    return { ready: false, reason: t("aiEval.promotion.noValidation") };
  }
  if (run.skillOptimization && !hasAcceptedSkillValidationEvidence(run)) {
    return {
      ready: false,
      reason: t("aiEval.promotion.noAcceptedSkill"),
    };
  }
  return { ready: true, reason: t("aiEval.promotion.ready") };
}

function promotionReadinessLabel(run: OptimizationRun) {
  const state = promotionReadiness(run);
  return state.ready ? `Ready. ${state.reason}` : state.reason;
}

function hasAcceptedSkillValidationEvidence(run: OptimizationRun) {
  const selectedCandidateSnapshotId = run.selectedCandidateSnapshotId;
  if (!selectedCandidateSnapshotId) {
    return false;
  }
  return Boolean(
    run.skillOptimization?.steps.some(
      (step) =>
        step.status === "accepted" &&
        (step.gateDecision === "accepted" || step.gateDecision === "accepted_new_best") &&
        step.candidateTargetSnapshotId === selectedCandidateSnapshotId &&
        typeof step.validationScore === "number",
    ),
  );
}

function skillOptimizationFileRows(detail: SkillOptimizationDetail) {
  const files = new Map<
    string,
    { acceptedCount: number; operations: string[]; rejectedCount: number; summaries: string[] }
  >();
  for (const step of detail.steps) {
    for (const edit of step.selectedEdits) {
      const filePath = edit.filePath ?? "unknown file";
      const row = files.get(filePath) ?? {
        acceptedCount: 0,
        operations: [],
        rejectedCount: 0,
        summaries: [],
      };
      row.acceptedCount += 1;
      row.operations.push(edit.op);
      if (edit.rationale) {
        row.summaries.push(edit.rationale);
      }
      files.set(filePath, row);
    }
    for (const edit of step.rejectedEditSummaries) {
      const filePath = edit.filePath ?? "unknown file";
      const row = files.get(filePath) ?? {
        acceptedCount: 0,
        operations: [],
        rejectedCount: 0,
        summaries: [],
      };
      row.rejectedCount += 1;
      row.operations.push(`rejected ${edit.op}`);
      if (edit.rationale) {
        row.summaries.push(edit.rationale);
      }
      files.set(filePath, row);
    }
  }
  return Array.from(files.entries()).map(([filePath, row]) => ({
    filePath,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    summary:
      row.summaries[0] ??
      `${Array.from(new Set(row.operations)).join(", ")} changes retained for review.`,
  }));
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "not available";
}

function formatNullableScore(value: number | null | undefined) {
  return typeof value === "number" ? formatScore(value) : "not available";
}

function datasetSetting(dataset: Dataset, key: string): JSONValue | undefined {
  const settings = (dataset as Dataset & { settings?: Record<string, JSONValue> | null }).settings;
  return settings?.[key];
}

function optionalMetadataField(value: JSONValue | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const item = value[key];
  return item === undefined || item === null ? "" : String(item);
}

function itemValue(item: DatasetItem | undefined, key: string): JSONValue | undefined {
  if (!item) {
    return undefined;
  }
  return (
    (item.latestRevision as typeof item.latestRevision & Record<string, JSONValue | undefined>)[
      key
    ] ?? (item as DatasetItem & Record<string, JSONValue | undefined>)[key]
  );
}

function sourceTraceId(item: DatasetItem) {
  return item.latestRevision.sourceRefs.find((source) => source.traceId)?.traceId ?? null;
}

function candidateSourceTraceId(candidate: DatasetCandidate) {
  return (
    candidate.sourceRefs?.find((source) => source.traceId)?.traceId ??
    (candidate.source && typeof candidate.source === "object" && !Array.isArray(candidate.source)
      ? String((candidate.source as Record<string, JSONValue>).traceId ?? "")
      : "") ??
    null
  );
}

function candidateHasBlockingIssue(candidate: DatasetCandidate) {
  return candidate.validationIssues?.some((issue) => issue.blocking) ?? false;
}

function evaluationRunDatasetVersionId(definition: EvaluationDefinition, dataset: Dataset) {
  if (definition.datasetVersionPolicy === "pinned" && definition.pinnedDatasetVersionId) {
    return definition.pinnedDatasetVersionId;
  }
  return datasetCurrentVersionId(dataset);
}

function parseAndValidateValue(
  text: string,
  type: DatasetValueType,
  schema: JSONValue | undefined,
) {
  const parsed = parseRawValue(text, type);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  const schemaError = validateAgainstJsonSchema(parsed.value, schema ?? null);
  if (schemaError) {
    throw new Error(schemaError);
  }
  return parsed.value;
}

function parseMetadata(text: string) {
  const metadata: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      return { value: {}, error: t("aiEval.error.metadataFormat") };
    }
    metadata[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return { value: metadata, error: null as string | null };
}

function metadataText(value: JSONValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return Object.entries(value)
    .map(([key, item]) => `${key}=${String(item)}`)
    .join("\n");
}

function initialRawValue(value: JSONValue | undefined, type: DatasetValueType) {
  if (value === undefined || value === null) {
    return type === "json" ? "{}" : "";
  }
  return type === "json" ? JSON.stringify(value, null, 2) : String(value);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleDateString();
}
