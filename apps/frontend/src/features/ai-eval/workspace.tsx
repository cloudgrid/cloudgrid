import type {
  AppendDatasetItemsInput,
  CreateDatasetInput,
  CreateEvaluationComparisonInput,
  CreateEvaluationDefinitionInput,
  Dataset,
  DatasetCurationStatus,
  DatasetItem,
  DatasetSplit,
  DatasetValueType,
  EvaluationDatasetVersionPolicy,
  EvaluationDefinition,
  EvaluationRun,
  EvaluationTargetKind,
  JSONValue,
  MetricSettingInput,
  RetentionProfile,
  StartDatasetExportInput,
  StartEvaluationRunInput,
  StartOptimizationRunInput,
  UpdateDatasetItemsInput,
  UpdateDatasetSettingsInput,
} from "@cloudgrid/ui-contracts";
import {
  buildDatasetSearchInput,
  type EvaluationDefinitionSearchInput,
  type EvaluationRunSearchInput,
} from "@cloudgrid/ui-contracts";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { JsonViewer } from "../../components/json-viewer";
import { EmptyState, ErrorPanel, LoadingRows } from "../../components/query-state";
import { RouteBreadcrumb } from "../../components/route-breadcrumb";
import { SearchInput } from "../../components/search-input";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
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
  DATASET_CURATION_STATUSES,
  DATASET_SPLITS,
  datasetCurrentVersionId,
  datasetHasExtractionSettings,
  datasetReadyItemCount,
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

export function AiEvalWorkspace({ enabled }: { enabled: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = readSection(searchParams.get("tab"));
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

  const selectedDataset = datasetsQuery.data?.items.find((item) => item.id === selectedDatasetId);
  const selectedEvaluation = evaluationsQuery.data?.items.find(
    (item) => item.id === selectedEvaluationId,
  );
  const selectedRun = runsQuery.data?.items.find((item) => item.id === selectedRunId);

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
        description="Enable AI Eval in project settings to create datasets and evaluations."
        filtered
        primaryAction={
          <Button asChild variant="outline">
            <Link to={projectId ? `/projects/${projectId}/settings/ai-eval` : "/projects"}>
              <Settings data-icon="inline-start" />
              Settings
            </Link>
          </Button>
        }
        title="AI Eval is disabled"
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <AiEvalHeader
        datasets={datasetsQuery.data?.items ?? []}
        evaluations={evaluationsQuery.data?.items ?? []}
        onQueryChange={(value) => setParam("query", value)}
        onSectionChange={(value) => setParam("tab", value)}
        projectId={projectId}
        projectName={selectedProject?.name ?? t("projects.select")}
        query={query}
        section={section}
        selectedDataset={selectedDataset ?? null}
        selectedEvaluation={selectedEvaluation ?? null}
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
            projectId={projectId}
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
  datasets,
  evaluations,
  onQueryChange,
  onSectionChange,
  projectId,
  projectName,
  query,
  section,
  selectedDataset,
  selectedEvaluation,
}: {
  datasets: Dataset[];
  evaluations: EvaluationDefinition[];
  onQueryChange: (value: string) => void;
  onSectionChange: (value: AiEvalSection) => void;
  projectId: string;
  projectName: string;
  query: string;
  section: AiEvalSection;
  selectedDataset: Dataset | null;
  selectedEvaluation: EvaluationDefinition | null;
}) {
  const title =
    section === "datasets"
      ? (selectedDataset?.name ?? "Datasets")
      : (selectedEvaluation?.name ?? "Evaluations");
  const description =
    section === "datasets"
      ? "Create versioned examples with raw JSON/text values, curation status, split, and optional reason."
      : "Run dataset evaluations, inspect metric results, compare candidates, and start optimization.";

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b pb-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-2">
        <RouteBreadcrumb
          backLabel={t("actions.back")}
          backTo="/projects"
          items={[
            { label: t("nav.projects"), to: "/projects" },
            { label: projectName, to: "/projects" },
            { label: t("nav.aiEval"), to: "/ai-eval" },
            { label: title },
          ]}
        />
        <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="inline-flex h-9 overflow-hidden border">
          <Button
            className="rounded-none"
            onClick={() => onSectionChange("datasets")}
            size="sm"
            type="button"
            variant={section === "datasets" ? "secondary" : "ghost"}
          >
            <Database data-icon="inline-start" />
            Datasets
          </Button>
          <Button
            className="rounded-none border-l"
            onClick={() => onSectionChange("evaluations")}
            size="sm"
            type="button"
            variant={section === "evaluations" ? "secondary" : "ghost"}
          >
            <ClipboardCheck data-icon="inline-start" />
            Evaluations
          </Button>
        </div>
        <SearchInput
          aria-label={t("filters.query")}
          className="max-w-72"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={section === "datasets" ? "Search datasets" : "Search evaluations"}
          value={query}
        />
        {section === "datasets" ? (
          <CreateDatasetDialog projectId={projectId} />
        ) : (
          <>
            <CreateEvaluationDialog datasets={datasets} projectId={projectId} />
            <StartOptimizationDialog
              datasets={datasets}
              evaluations={evaluations}
              projectId={projectId}
            />
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
        description="Create a dataset, add one ready row, then use it to start a dataset evaluation."
        filtered={false}
        primaryAction={<CreateDatasetDialog projectId={projectId} triggerVariant="default" />}
        title="No datasets yet"
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
            <TableHead>Name</TableHead>
            <TableHead>Evaluation family</TableHead>
            <TableHead>Input / expected</TableHead>
            <TableHead>Current version</TableHead>
            <TableHead>Ready rows</TableHead>
            <TableHead>Split coverage</TableHead>
            <TableHead>Schema health</TableHead>
            <TableHead>Last updated</TableHead>
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
                {String(datasetSetting(dataset, "evaluationFamily") ?? "classification")}
              </TableCell>
              <TableCell>
                {String(datasetSetting(dataset, "inputType") ?? "json")} /{" "}
                {String(datasetSetting(dataset, "expectedType") ?? "json")}
              </TableCell>
              <TableCell>{dataset.currentVersion.version}</TableCell>
              <TableCell>{datasetReadyItemCount(dataset)}</TableCell>
              <TableCell className="max-w-80 truncate">
                {splitCoverageLabel(dataset.splitCounts)}
              </TableCell>
              <TableCell>
                <Badge variant={dataset.health.status === "ready" ? "secondary" : "outline"}>
                  {dataset.health.status}
                </Badge>
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
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-0 overflow-auto border" data-ai-eval-dataset-workbench="true">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <h2 className="text-sm font-medium">Rows</h2>
            <p className="text-xs text-muted-foreground">
              Add or edit raw JSON/text examples. Reason is optional.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateEvaluationDialog
              datasets={[dataset]}
              projectId={projectId}
              triggerLabel="Create evaluation from dataset"
            />
            <DatasetImportDialog dataset={dataset} projectId={projectId} />
            <DatasetExportDialog dataset={dataset} />
            <DatasetRowDialog dataset={dataset} mode="add" />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Split</TableHead>
              <TableHead>Curation</TableHead>
              <TableHead>Input preview</TableHead>
              <TableHead>Expected preview</TableHead>
              <TableHead>Reason preview</TableHead>
              <TableHead>Observed output</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Validation</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.latestRevision.split}</TableCell>
                <TableCell>{item.latestRevision.curationStatus}</TableCell>
                <TableCell className="max-w-64 truncate">
                  {jsonPreview(item.latestRevision.input)}
                </TableCell>
                <TableCell className="max-w-64 truncate">
                  {jsonPreview(item.latestRevision.expected)}
                </TableCell>
                <TableCell className="max-w-56 truncate">
                  {String(itemValue(item, "reason") ?? "")}
                </TableCell>
                <TableCell>{itemValue(item, "observedOutput") ? "stored" : "empty"}</TableCell>
                <TableCell>
                  {sourceTraceId(item) ? (
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      to={`/traces/${sourceTraceId(item)}`}
                    >
                      trace
                    </Link>
                  ) : (
                    "manual"
                  )}
                </TableCell>
                <TableCell>
                  {item.latestRevision.curationStatus === "ready" ? (
                    <Badge variant="secondary">valid</Badge>
                  ) : (
                    <Badge variant="outline">curation</Badge>
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
            Dataset has no rows. Add a ready row or import examples before creating evaluations.
          </div>
        ) : null}
      </section>
      <aside className="min-h-0 overflow-auto border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Dataset settings</h2>
          <DatasetSettingsDialog dataset={dataset} />
        </div>
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Value shape</dt>
            <dd>
              {String(datasetSetting(dataset, "inputType") ?? "json")} input /{" "}
              {String(datasetSetting(dataset, "expectedType") ?? "json")} expected
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Extraction settings</dt>
            <dd>{datasetHasExtractionSettings(dataset) ? "configured" : "not configured"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anonymization</dt>
            <dd>{jsonPreview(datasetSetting(dataset, "anonymizationPolicy"), 120) || "default"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Health</dt>
            <dd>{dataset.health.status}</dd>
          </div>
        </dl>
        <h3 className="mt-5 text-sm font-medium">Versions</h3>
        <div className="mt-2 border px-3 py-2 text-sm">
          Current version {dataset.currentVersion.version} · {datasetCurrentVersionId(dataset)}
        </div>
      </aside>
    </div>
  );
}

function EvaluationsWorkspace({
  comparisonsQuery,
  datasets,
  evaluationsQuery,
  onRunSelect,
  onSelect,
  optimizationsQuery,
  projectId,
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
  projectId: string;
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
  if (evaluations.length === 0) {
    return (
      <EmptyState
        description="Create an evaluation from an eligible dataset, then start a baseline run."
        filtered={false}
        primaryAction={
          <CreateEvaluationDialog
            datasets={datasets}
            projectId={projectId}
            triggerVariant="default"
          />
        }
        title="No evaluations yet"
      />
    );
  }
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.4fr)]">
      <section className="min-h-0 overflow-auto border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Dataset</TableHead>
              <TableHead>Split selector</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Last updated</TableHead>
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
          <div className="p-6 text-sm text-muted-foreground">
            Select an evaluation to start runs, inspect metrics, compare candidates, or optimize.
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
            {definition.datasetVersionPolicy} · {definition.targetRef.kind} ·{" "}
            {definition.metricSettings.map((item) => item.metricId).join(", ")}
          </p>
        </div>
        <StartEvaluationRunButton datasets={datasets} definition={definition} />
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
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Primary metric</TableHead>
            <TableHead>Control</TableHead>
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
                  : "pending"}
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
          No runs yet. Start a baseline evaluation.
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
        <h3 className="text-sm font-medium">Run detail</h3>
        <p className="text-xs text-muted-foreground">
          Retention details are available in advanced audit fields.
        </p>
      </div>
      <div className="grid gap-3 p-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="border px-3 py-2">
            <div className="text-muted-foreground">Status</div>
            <div>{run.status}</div>
          </div>
          <div className="border px-3 py-2">
            <div className="text-muted-foreground">Retention</div>
            <div>{run.retentionProfile}</div>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">Aggregate metrics</h4>
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
            <div className="border border-dashed p-3 text-muted-foreground">No aggregates yet.</div>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium">Item runs</h4>
          <div className="overflow-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Actual / expected</TableHead>
                  <TableHead>Trajectory summary</TableHead>
                  <TableHead>Important steps</TableHead>
                  <TableHead>Trace</TableHead>
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
                          trace
                        </Link>
                      ) : (
                        "none"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {itemRuns.length === 0 ? (
            <div className="border-x border-b border-dashed p-3 text-muted-foreground">
              Durable metrics are available; retained item details may expire by policy.
            </div>
          ) : null}
        </div>
        <details className="border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
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
          <h3 className="text-sm font-medium">Comparisons</h3>
          <p className="text-xs text-muted-foreground">Metric deltas and target diff evidence.</p>
        </div>
        <Select onValueChange={setBaselineRunId} value={baselineRunId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Baseline run" />
          </SelectTrigger>
          <SelectContent>
            {runs.map((run) => (
              <SelectItem key={run.id} value={run.id}>
                {run.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setCandidateRunId} value={candidateRunId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Candidate run" />
          </SelectTrigger>
          <SelectContent>
            {runs.map((run) => (
              <SelectItem key={run.id} value={run.id}>
                {run.id}
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
          Create comparison
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
            No comparisons created yet.
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
      <h3 className="text-sm font-medium">Optimization progress</h3>
      <p className="text-xs text-muted-foreground">
        Quick-shot results are exploratory until full validation evidence exists.
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
            <TargetPromotionDialog projectId={projectId} run={run} />
          </div>
        ))}
        {runs.length === 0 ? (
          <div className="border border-dashed p-3 text-sm text-muted-foreground">
            No optimization runs yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CreateDatasetDialog({
  projectId,
  triggerVariant = "outline",
}: {
  projectId: string;
  triggerVariant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [inputType, setInputType] = useState<DatasetValueType>("json");
  const [expectedType, setExpectedType] = useState<DatasetValueType>("json");
  const [inputSchema, setInputSchema] = useState('{"type":"object"}');
  const [expectedSchema, setExpectedSchema] = useState('{"type":"object"}');
  const [metricId, setMetricId] = useState("extraction.exact_json_match");
  const [inputPath, setInputPath] = useState("$.input");
  const [expectedPath, setExpectedPath] = useState("$.expected");
  const [anonymizationMode, setAnonymizationMode] = useState<"off" | "realistic" | "redact">(
    "redact",
  );
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const parsedInputSchema = parseRawValue(inputSchema, "json");
      const parsedExpectedSchema = parseRawValue(expectedSchema, "json");
      if (parsedInputSchema.error) {
        throw new Error(`Input JSON schema is invalid: ${parsedInputSchema.error}`);
      }
      if (parsedExpectedSchema.error) {
        throw new Error(`Expected JSON schema is invalid: ${parsedExpectedSchema.error}`);
      }
      const settings: CreateDatasetInput["settings"] = {
        evaluationFamily: "classification",
        inputType,
        expectedType,
        inputJsonSchema: inputType === "json" ? parsedInputSchema.value : null,
        expectedJsonSchema: expectedType === "json" ? parsedExpectedSchema.value : null,
        defaultSplit: "training",
        intakePolicy: {
          manualDefaultStatus: "draft",
          importDefaultStatus: "needs_review",
          traceDefaultStatus: "needs_expected",
        },
        traceExtractionSettings: inputPath.trim()
          ? {
              inputPath: inputPath.trim(),
              expectedPath: expectedPath.trim() || null,
              observedOutputPath: "$.actualOutput",
              metadataPaths: [],
            }
          : null,
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
    onSuccess() {
      setOpen(false);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant={triggerVariant}>
          <Plus data-icon="inline-start" />
          New dataset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New dataset</DialogTitle>
          <DialogDescription>
            Configure one input and expected-output shape for every row.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueTypeField label="Input type" onChange={setInputType} value={inputType} />
            <ValueTypeField label="Expected type" onChange={setExpectedType} value={expectedType} />
          </div>
          <Field>
            <FieldLabel>Input JSON schema</FieldLabel>
            <Textarea
              onChange={(event) => setInputSchema(event.target.value)}
              value={inputSchema}
            />
          </Field>
          <Field>
            <FieldLabel>Expected JSON schema</FieldLabel>
            <Textarea
              onChange={(event) => setExpectedSchema(event.target.value)}
              value={expectedSchema}
            />
          </Field>
          <Field>
            <FieldLabel>Default metric</FieldLabel>
            <Input onChange={(event) => setMetricId(event.target.value)} value={metricId} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Trace input path</FieldLabel>
              <Input onChange={(event) => setInputPath(event.target.value)} value={inputPath} />
            </Field>
            <Field>
              <FieldLabel>Trace expected path</FieldLabel>
              <Input
                onChange={(event) => setExpectedPath(event.target.value)}
                value={expectedPath}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Anonymization</FieldLabel>
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
                <SelectItem value="redact">Redact</SelectItem>
                <SelectItem value="realistic">Realistic replacement</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
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
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              if (!name.trim()) {
                setError("Name is required.");
                return;
              }
              void mutation.mutateAsync().catch((caught) => {
                setError(caught instanceof Error ? caught.message : "Dataset creation failed.");
              });
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />
            New dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const inputType = (datasetSetting(dataset, "inputType") ?? "json") as DatasetValueType;
  const expectedType = (datasetSetting(dataset, "expectedType") ?? "json") as DatasetValueType;
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
  const [split, setSplit] = useState<DatasetSplit>(item?.latestRevision.split ?? "training");
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
          {mode === "add" ? "Add row" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add row" : "Edit row"}</DialogTitle>
          <DialogDescription>
            Paste raw values and validate them against the dataset shape.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Input</FieldLabel>
            <Textarea onChange={(event) => setInputText(event.target.value)} value={inputText} />
          </Field>
          <Field>
            <FieldLabel>Expected output</FieldLabel>
            <Textarea
              onChange={(event) => setExpectedText(event.target.value)}
              value={expectedText}
            />
          </Field>
          <Field>
            <FieldLabel>Observed output</FieldLabel>
            <Textarea
              onChange={(event) => setObservedOutputText(event.target.value)}
              value={observedOutputText}
            />
          </Field>
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <Textarea onChange={(event) => setReason(event.target.value)} value={reason} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <SplitField onChange={setSplit} value={split} />
            <CurationStatusField onChange={setCurationStatus} value={curationStatus} />
          </div>
          <Field>
            <FieldLabel>Metadata</FieldLabel>
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
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              try {
                void mutation.mutateAsync();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Row validation failed.");
              }
            }}
            type="button"
          >
            <CheckCircle2 data-icon="inline-start" />
            Save row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEvaluationDialog({
  datasets,
  projectId,
  triggerLabel = "New evaluation",
  triggerVariant = "outline",
}: {
  datasets: Dataset[];
  projectId: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const firstDataset = datasets[0];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(firstDataset?.id ?? "");
  const [datasetVersionPolicy, setDatasetVersionPolicy] =
    useState<EvaluationDatasetVersionPolicy>("latest_ready");
  const [targetKind, setTargetKind] =
    useState<Extract<EvaluationTargetKind, "prompt" | "external_adapter">>("prompt");
  const [targetName, setTargetName] = useState("Prompt candidate");
  const [targetRef, setTargetRef] = useState("prompt://current");
  const [targetSnapshotId, setTargetSnapshotId] = useState("");
  const [metricId, setMetricId] = useState("extraction.exact_json_match");
  const [split, setSplit] = useState<DatasetSplit>("validation");
  const [retentionProfile, setRetentionProfile] = useState<RetentionProfile>("balanced");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!datasetId && firstDataset?.id) {
      setDatasetId(firstDataset.id);
    }
  }, [datasetId, firstDataset?.id]);
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const mutation = useMutation({
    mutationFn: () => {
      const trimmedTargetRef = targetRef.trim();
      const trimmedTargetSnapshotId = targetSnapshotId.trim();
      const input: CreateEvaluationDefinitionInput = {
        projectId,
        name: name.trim(),
        datasetId,
        datasetVersionPolicy,
        ...(datasetVersionPolicy === "pinned"
          ? { pinnedDatasetVersionId: selectedDataset?.currentVersionId ?? null }
          : {}),
        splitSelector: { splits: [split], curationStatuses: ["ready"] },
        targetRef: {
          kind: targetKind,
          ...(trimmedTargetRef ? { targetRef: trimmedTargetRef } : {}),
          ...(trimmedTargetSnapshotId ? { targetSnapshotId: trimmedTargetSnapshotId } : {}),
          displayName: targetName.trim(),
          metadata: {},
        },
        metricSettings: [{ metricId: metricId.trim() || "extraction.exact_json_match" }],
        runPolicy: { maxParallelRequests: 4 },
        retentionProfile,
        idempotencyKey: `evaluation-${Date.now()}`,
      };
      return telemetryClient.createEvaluationDefinition(input);
    },
    onSuccess() {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["EvaluationDefinitions"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant={triggerVariant}>
          <Plus data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{triggerLabel}</DialogTitle>
          <DialogDescription>
            Select a dataset, split, target, metric, and run policy.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field>
            <FieldLabel>Dataset</FieldLabel>
            <Select onValueChange={setDatasetId} value={datasetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Dataset version policy</FieldLabel>
            <Select
              onValueChange={(value) =>
                setDatasetVersionPolicy(value as EvaluationDatasetVersionPolicy)
              }
              value={datasetVersionPolicy}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select version policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest_ready">Latest ready</SelectItem>
                <SelectItem value="pinned">Pinned current version</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <SplitField onChange={setSplit} value={split} />
          <Field>
            <FieldLabel>Target kind</FieldLabel>
            <Select
              onValueChange={(value) =>
                setTargetKind(value as Extract<EvaluationTargetKind, "prompt" | "external_adapter">)
              }
              value={targetKind}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">Prompt</SelectItem>
                <SelectItem value="external_adapter">External adapter</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Target display name</FieldLabel>
            <Input onChange={(event) => setTargetName(event.target.value)} value={targetName} />
          </Field>
          <Field>
            <FieldLabel>Target ref</FieldLabel>
            <Input onChange={(event) => setTargetRef(event.target.value)} value={targetRef} />
          </Field>
          <Field>
            <FieldLabel>Target snapshot ID</FieldLabel>
            <Input
              onChange={(event) => setTargetSnapshotId(event.target.value)}
              placeholder="Optional"
              value={targetSnapshotId}
            />
          </Field>
          <Field>
            <FieldLabel>Metric</FieldLabel>
            <Input onChange={(event) => setMetricId(event.target.value)} value={metricId} />
          </Field>
          <Field>
            <FieldLabel>Retention profile</FieldLabel>
            <Select
              onValueChange={(value) => setRetentionProfile(value as RetentionProfile)}
              value={retentionProfile}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select retention profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="fast_iteration">Fast iteration</SelectItem>
                <SelectItem value="audit_friendly">Audit friendly</SelectItem>
                <SelectItem value="minimal_storage">Minimal storage</SelectItem>
              </SelectContent>
            </Select>
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
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              if (!name.trim() || !datasetId || !targetName.trim()) {
                setError("Name, dataset, and target are required.");
                return;
              }
              if (!targetRef.trim() && !targetSnapshotId.trim()) {
                setError("Target ref or target snapshot ID is required.");
                return;
              }
              if (datasetVersionPolicy === "pinned" && !selectedDataset?.currentVersionId) {
                setError("Selected dataset does not have a current version to pin.");
                return;
              }
              void mutation.mutateAsync();
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />
            {triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const dataset = datasets.find((item) => item.id === definition.datasetId);
  const mutation = useMutation({
    mutationFn: () => {
      if (!dataset) {
        throw new Error("Dataset is required to start the run.");
      }
      const input: StartEvaluationRunInput = {
        evaluationDefinitionId: definition.id,
        projectId: definition.projectId,
        kind: "dataset_evaluation",
        datasetId: definition.datasetId,
        datasetVersionId: datasetCurrentVersionId(dataset),
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
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["EvaluationRuns"] });
    },
  });
  return (
    <Button
      disabled={mutation.isPending || !dataset}
      onClick={() => void mutation.mutateAsync()}
      size="sm"
      type="button"
    >
      <Play data-icon="inline-start" />
      Run evaluation
    </Button>
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
    return <span className="text-muted-foreground">terminal</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {run.status === "paused" ? (
        <Button
          aria-label="Resume evaluation run"
          onClick={() => void controlMutation.mutateAsync("resume")}
          size="sm"
          title="Resume evaluation run"
          type="button"
          variant="outline"
        >
          <Play />
        </Button>
      ) : (
        <Button
          aria-label="Pause evaluation run"
          onClick={() => void controlMutation.mutateAsync("pause")}
          size="sm"
          title="Pause evaluation run"
          type="button"
          variant="outline"
        >
          <Pause />
        </Button>
      )}
      <Button
        aria-label="Cancel evaluation run"
        onClick={() => void controlMutation.mutateAsync("cancel")}
        size="sm"
        title="Cancel evaluation run"
        type="button"
        variant="outline"
      >
        <XCircle />
      </Button>
    </div>
  );
}

function StartOptimizationDialog({
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
  const [open, setOpen] = useState(false);
  const [evaluationId, setEvaluationId] = useState(evaluations[0]?.id ?? "");
  const [baselineSnapshotId, setBaselineSnapshotId] = useState("");
  const [primaryMetricId, setPrimaryMetricId] = useState("extraction.exact_json_match");
  const [quickShot, setQuickShot] = useState<"enabled" | "disabled">("enabled");
  const evaluation = evaluations.find((item) => item.id === evaluationId);
  const dataset = datasets.find((item) => item.id === evaluation?.datasetId);
  useEffect(() => {
    if (!evaluationId && evaluations[0]?.id) {
      setEvaluationId(evaluations[0].id);
    }
  }, [evaluationId, evaluations]);
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
    onSuccess() {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["OptimizationRuns"] });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <RefreshCw data-icon="inline-start" />
          Start optimization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start optimization</DialogTitle>
          <DialogDescription>Review the objective defaults before starting.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Evaluation</FieldLabel>
            <Select onValueChange={setEvaluationId} value={evaluationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluation" />
              </SelectTrigger>
              <SelectContent>
                {evaluations.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Baseline target snapshot</FieldLabel>
            <Input
              onChange={(event) => setBaselineSnapshotId(event.target.value)}
              value={baselineSnapshotId}
            />
          </Field>
          <Field>
            <FieldLabel>Primary metric</FieldLabel>
            <Input
              onChange={(event) => setPrimaryMetricId(event.target.value)}
              value={primaryMetricId}
            />
          </Field>
          <Field>
            <FieldLabel>Quick-shot phase</FieldLabel>
            <Select
              onValueChange={(value) => setQuickShot(value as "enabled" | "disabled")}
              value={quickShot}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {mutation.error ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mutation.error.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <XCircle data-icon="inline-start" />
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={!evaluationId || !baselineSnapshotId || mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
            type="button"
          >
            <RefreshCw data-icon="inline-start" />
            Start optimization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        throw new Error("Select a dataset file first.");
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
        throw new Error(body?.message ?? "Upload failed.");
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
          split: { defaultValue: "training" },
          curationStatus: { defaultValue: "needs_review" },
        },
        defaults: {
          split: "training",
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
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import rows</DialogTitle>
          <DialogDescription>
            Prepare, preview, then commit server-side import rows.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup data-ai-eval-dataset-import-workflow="true">
          <Field>
            <FieldLabel>Dataset file</FieldLabel>
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
              Upload file
            </Button>
            {uploadId ? (
              <span className="font-mono text-xs text-muted-foreground">{uploadId}</span>
            ) : null}
          </div>
          <Field>
            <FieldLabel>Upload id</FieldLabel>
            <Input
              onChange={(event) => setUploadId(event.target.value)}
              placeholder="Paste an existing upload id"
              value={uploadId}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Format</FieldLabel>
              <Select onValueChange={(value) => setFormat(value as typeof format)} value={format}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jsonl">JSONL</SelectItem>
                  <SelectItem value="json_array">JSON array</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="zip">ZIP</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Commit mode</FieldLabel>
              <Select
                onValueChange={(value) => setCommitMode(value as typeof commitMode)}
                value={commitMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid_rows_only">Valid rows only</SelectItem>
                  <SelectItem value="reject_if_any_error">Reject if any error</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {prepareMutation.data ? (
            <div className="border p-3 text-sm">
              {prepareMutation.data.validRows}/{prepareMutation.data.totalRows} valid rows ·{" "}
              {prepareMutation.data.errorRows} errors
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
            Preview
          </Button>
          <Button
            disabled={!importId || commitMutation.isPending}
            onClick={() => void commitMutation.mutateAsync()}
            type="button"
          >
            <CheckCircle2 data-icon="inline-start" />
            Commit
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
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export dataset</DialogTitle>
          <DialogDescription>
            Start a server-side export for the current dataset version.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Format</FieldLabel>
          <Select onValueChange={(value) => setFormat(value as typeof format)} value={format}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jsonl">JSONL</SelectItem>
              <SelectItem value="json_array">JSON array</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {mutation.data ? (
          <div className="border p-3 text-sm">
            Export {mutation.data.status}
            {mutation.data.downloadUrl ? (
              <a className="ml-2 text-primary hover:underline" href={mutation.data.downloadUrl}>
                Download
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
            Start export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatasetSettingsDialog({ dataset }: { dataset: Dataset }) {
  const telemetryClient = useTelemetryClient();
  const queryClient = useQueryClient();
  const settings = dataset.settings;
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
  const [inputPath, setInputPath] = useState(settings.traceExtractionSettings?.inputPath ?? "");
  const [expectedPath, setExpectedPath] = useState(
    settings.traceExtractionSettings?.expectedPath ?? "",
  );
  const [observedOutputPath, setObservedOutputPath] = useState(
    settings.traceExtractionSettings?.observedOutputPath ?? "",
  );
  const [anonymizationMode, setAnonymizationMode] = useState(
    settings.anonymizationPolicy?.mode ?? "off",
  );
  const [retentionProfile, setRetentionProfile] = useState<RetentionProfile>(
    settings.retentionProfile,
  );
  const [metricId, setMetricId] = useState(settings.defaultMetricSettings[0]?.metricId ?? "");
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
          evaluationFamily: settings.evaluationFamily,
          inputType,
          expectedType,
          inputJsonSchema: inputType === "json" ? parsedInputSchema.value : null,
          expectedJsonSchema: expectedType === "json" ? parsedExpectedSchema.value : null,
          defaultSplit,
          intakePolicy: {
            manualDefaultStatus,
            importDefaultStatus,
            traceDefaultStatus,
          },
          traceExtractionSettings: inputPath.trim()
            ? {
                inputPath: inputPath.trim(),
                expectedPath: expectedPath.trim() || null,
                observedOutputPath: observedOutputPath.trim() || null,
                metadataPaths: settings.traceExtractionSettings?.metadataPaths ?? [],
              }
            : null,
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
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Settings data-icon="inline-start" />
          Dataset settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dataset settings</DialogTitle>
          <DialogDescription>
            Dataset-level shape, curation, extraction, anonymization, and retention.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueTypeField label="Input type" onChange={setInputType} value={inputType} />
            <ValueTypeField label="Expected type" onChange={setExpectedType} value={expectedType} />
          </div>
          <Field>
            <FieldLabel>Input JSON schema</FieldLabel>
            <Textarea
              onChange={(event) => setInputSchema(event.target.value)}
              value={inputSchema}
            />
          </Field>
          <Field>
            <FieldLabel>Expected JSON schema</FieldLabel>
            <Textarea
              onChange={(event) => setExpectedSchema(event.target.value)}
              value={expectedSchema}
            />
          </Field>
          <SplitField label="Default split" onChange={setDefaultSplit} value={defaultSplit} />
          <div className="grid gap-3 sm:grid-cols-3">
            <CurationStatusField
              label="Manual rows"
              onChange={setManualDefaultStatus}
              value={manualDefaultStatus}
            />
            <CurationStatusField
              label="Imported rows"
              onChange={setImportDefaultStatus}
              value={importDefaultStatus}
            />
            <CurationStatusField
              label="Trace rows"
              onChange={setTraceDefaultStatus}
              value={traceDefaultStatus}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Trace input path</FieldLabel>
              <Input onChange={(event) => setInputPath(event.target.value)} value={inputPath} />
            </Field>
            <Field>
              <FieldLabel>Trace expected path</FieldLabel>
              <Input
                onChange={(event) => setExpectedPath(event.target.value)}
                value={expectedPath}
              />
            </Field>
            <Field>
              <FieldLabel>Trace observed path</FieldLabel>
              <Input
                onChange={(event) => setObservedOutputPath(event.target.value)}
                value={observedOutputPath}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Anonymization</FieldLabel>
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
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="realistic">Realistic</SelectItem>
                  <SelectItem value="redact">Redact</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Retention</FieldLabel>
              <Select
                onValueChange={(value) => setRetentionProfile(value as RetentionProfile)}
                value={retentionProfile}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="fast_iteration">Fast iteration</SelectItem>
                  <SelectItem value="audit_friendly">Audit friendly</SelectItem>
                  <SelectItem value="minimal_storage">Minimal storage</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Default metric</FieldLabel>
              <Input onChange={(event) => setMetricId(event.target.value)} value={metricId} />
            </Field>
          </div>
          {mutation.error ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mutation.error.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => void mutation.mutateAsync()}
            type="button"
          >
            <Settings data-icon="inline-start" />
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetPromotionDialog({
  projectId,
  run,
}: {
  projectId: string;
  run: {
    baselineTargetSnapshotId: string;
    causedEvaluationRunIds: string[];
    selectedCandidateSnapshotId?: string | null;
    comparisonIds: string[];
  };
}) {
  const telemetryClient = useTelemetryClient();
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
      disabled={
        !run.selectedCandidateSnapshotId || run.comparisonIds.length === 0 || mutation.isPending
      }
      onClick={() => void mutation.mutateAsync()}
      size="sm"
      type="button"
      variant="outline"
    >
      <CheckCircle2 data-icon="inline-start" />
      Promote
    </Button>
  );
}

function ValueTypeField({
  label,
  onChange,
  value,
}: {
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
          <SelectItem value="text">Text</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function SplitField({
  label = "Split",
  onChange,
  value,
}: {
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
              {split}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CurationStatusField({
  label = "Curation status",
  onChange,
  value,
}: {
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
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function readSection(value: string | null): AiEvalSection {
  return value === "evaluations" ? "evaluations" : "datasets";
}

function datasetSetting(dataset: Dataset, key: string): JSONValue | undefined {
  const settings = (dataset as Dataset & { settings?: Record<string, JSONValue> | null }).settings;
  return settings?.[key];
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
      return { value: {}, error: "Metadata must use key=value lines." };
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
