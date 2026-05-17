import type {
  AgentRun,
  AgentRunSearchInput,
  AiQualityOverview,
  AiQualityOverviewInput,
  AnnotationQueueItem,
  AnnotationQueueSearchInput,
  CreateDatasetInput,
  CreateExperimentInput,
  CreateScorerInput,
  Dataset,
  DatasetExportFormat,
  DatasetExportJob,
  DatasetImportCommitMode,
  DatasetImportFieldMappingInput,
  DatasetImportFormat,
  DatasetImportJob,
  DatasetImportScalarMappingInput,
  DatasetReviewStatus,
  DatasetSplit,
  Experiment,
  ExperimentRun,
  ExperimentSearchInput,
  JSONValue,
  PrepareDatasetImportInput,
  ProjectAiSettings,
  Scorer,
  ScorerKind,
  StartExperimentRunInput,
} from "@cloudgrid/ui-contracts";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  MessageSquareText,
  PanelRightOpen,
  PencilLine,
  Plus,
  Settings,
  Trash2,
  Trophy,
  Upload,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CodeBlock } from "../components/code-block";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  agentRunTimelineRows,
  experimentScoreboardRows,
  itemRunScoreSummary,
  jsonPreview,
} from "../features/ai-eval/view-model";
import { t } from "../lib/i18n";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

export const aiEvalEnabled =
  import.meta.env.CLOUDGRID_AI_EVAL_ENABLED !== "false" &&
  import.meta.env.VITE_CLOUDGRID_AI_EVAL_ENABLED !== "false";

type AiEvalTab = "runs" | "datasets" | "scorers" | "experiments" | "production" | "annotations";

export function AiEvalRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readTab(searchParams.get("tab"));
  const query = searchParams.get("query") ?? "";
  const status = searchParams.get("status") ?? "";
  const selectedRunId = searchParams.get("run");
  const selectedDatasetId = searchParams.get("dataset");
  const selectedScorerId = searchParams.get("scorer");
  const selectedExperimentId = searchParams.get("experiment");
  const selectedAnnotationId = searchParams.get("annotation");
  const telemetryClient = useTelemetryClient();
  const { client: controlClient, viewer } = useAppSession();
  const selectedProject = viewer?.selectedProject ?? null;
  const projectId = selectedProject?.id ?? "";
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "tab") {
      next.delete("cursor");
    }
    if (key === "tab") {
      next.delete("run");
      next.delete("dataset");
      next.delete("scorer");
      next.delete("experiment");
      next.delete("annotation");
    }
    setSearchParams(next);
  };
  const setSelected = (
    key: "run" | "dataset" | "scorer" | "experiment" | "annotation",
    value: string,
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
    setInspectorOpen(true);
  };

  const agentRunInput = useMemo<AgentRunSearchInput>(
    () => ({
      query: query || null,
      status: readAgentRunStatus(status),
      limit: 25,
      cursor: searchParams.get("cursor"),
    }),
    [query, searchParams, status],
  );
  const experimentInput = useMemo<ExperimentSearchInput>(
    () => ({
      query: query || null,
      status: readExperimentStatus(status),
      limit: 25,
      cursor: searchParams.get("cursor"),
    }),
    [query, searchParams, status],
  );
  const annotationInput = useMemo<AnnotationQueueSearchInput>(
    () => ({
      status: readAnnotationStatus(status),
      reason: query || null,
      limit: 25,
      cursor: searchParams.get("cursor"),
    }),
    [query, searchParams, status],
  );
  const qualityInput = useMemo<AiQualityOverviewInput>(
    () => ({
      projectId,
      limit: 25,
    }),
    [projectId],
  );

  const shouldQueryAiEval = aiEvalEnabled && Boolean(projectId);

  const agentRunsQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "runs",
    queryKey: ["AgentRuns", agentRunInput],
    queryFn: () => telemetryClient.searchAgentRuns(agentRunInput),
  });
  const datasetsQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "datasets" || tab === "experiments"),
    queryKey: ["Datasets", { query: query || null }],
    queryFn: () => telemetryClient.searchDatasets({ query: query || null, limit: 25 }),
  });
  const scorersQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "scorers" || tab === "experiments"),
    queryKey: ["Scorers", { query: query || null }],
    queryFn: () => telemetryClient.searchScorers({ query: query || null, limit: 25 }),
  });
  const experimentsQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "experiments",
    queryKey: ["Experiments", experimentInput],
    queryFn: () => telemetryClient.searchExperiments(experimentInput),
  });
  const annotationsQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "annotations",
    queryKey: ["AnnotationQueue", annotationInput],
    queryFn: () => telemetryClient.searchAnnotationQueue(annotationInput),
  });
  const qualityQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "production",
    queryKey: ["AiQualityOverview", qualityInput],
    queryFn: () => telemetryClient.getAiQualityOverview(qualityInput),
  });
  const settingsQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "production",
    queryKey: ["ProjectAiSettings", projectId],
    queryFn: () => controlClient.getProjectAiSettings(projectId),
  });
  const selectedRun =
    agentRunsQuery.data?.items.find((run) => run.id === selectedRunId) ??
    agentRunsQuery.data?.items[0] ??
    null;
  const selectedDataset =
    datasetsQuery.data?.items.find((dataset) => dataset.id === selectedDatasetId) ??
    datasetsQuery.data?.items[0] ??
    null;
  const selectedScorer =
    scorersQuery.data?.items.find((scorer) => scorer.id === selectedScorerId) ??
    scorersQuery.data?.items[0] ??
    null;
  const selectedExperiment =
    experimentsQuery.data?.items.find((experiment) => experiment.id === selectedExperimentId) ??
    experimentsQuery.data?.items[0] ??
    null;
  const selectedAnnotation =
    annotationsQuery.data?.items.find((annotation) => annotation.id === selectedAnnotationId) ??
    annotationsQuery.data?.items[0] ??
    null;

  if (!aiEvalEnabled) {
    return (
      <EmptyState
        filtered
        primaryAction={
          <Button asChild variant="outline">
            <Link to="/projects">{t("projects.select")}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold tracking-normal">{t("aiEval.title")}</h1>
        <p className="text-sm text-muted-foreground">
          Inspect agent runs, curate datasets, run evaluations, and monitor production quality.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SearchInput
          aria-label={t("filters.query")}
          className="max-w-80"
          onChange={(event) => setParam("query", event.target.value)}
          placeholder={t("aiEval.searchPlaceholder")}
          value={query}
        />
        {(tab === "runs" || tab === "experiments" || tab === "annotations") && (
          <Select
            aria-label={t("filters.status")}
            onValueChange={(value) => setParam("status", value === "all" ? "" : value)}
            value={status || "all"}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                {(tab === "annotations"
                  ? ["open", "in_review", "resolved", "dismissed"]
                  : tab === "runs"
                    ? ["ok", "error", "unset", "cancelled"]
                    : ["queued", "running", "failed", "finished"]
                ).map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {aiEvalStatusLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>
      <AiEvalWorkflowStrip activeTab={tab} onSelect={(value) => setParam("tab", value)} />
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden border xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <Tabs className="contents" onValueChange={(value) => setParam("tab", value)} value={tab}>
          <aside
            className="min-h-0 overflow-auto border-r bg-background p-3"
            data-ai-eval-left-rail="true"
          >
            <TabsList className="grid h-auto gap-1 bg-transparent p-0" variant="line">
              <TabsTrigger className="justify-start" value="runs">
                <Bot />
                {t("aiEval.runs")}
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="datasets">
                <Database />
                {t("aiEval.datasets")}
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="scorers">
                <FlaskConical />
                {t("aiEval.scorers")}
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="experiments">
                <Trophy />
                {t("aiEval.experiments")}
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="production">
                <Gauge />
                Production quality
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="annotations">
                <PencilLine />
                {t("aiEval.annotations")}
              </TabsTrigger>
            </TabsList>
          </aside>
          <main className="min-h-0 overflow-auto p-3" data-ai-eval-main-workspace="true">
            <div className="mb-3 flex justify-end xl:hidden">
              <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline">
                    <PanelRightOpen data-icon="inline-start" />
                    {t("aiEval.inspector")}
                  </Button>
                </SheetTrigger>
                <SheetContent className="flex flex-col gap-0 p-0" side="right">
                  <SheetHeader className="border-b px-4 py-3">
                    <SheetTitle>{t("aiEval.inspector")}</SheetTitle>
                  </SheetHeader>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    <AiEvalInspector
                      annotation={selectedAnnotation}
                      dataset={selectedDataset}
                      experiment={selectedExperiment}
                      run={selectedRun}
                      scorer={selectedScorer}
                      tab={tab}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <TabsContent className="m-0 min-h-0" value="runs">
              <AgentRunsView
                onNext={(cursor) => setParam("cursor", cursor)}
                onSelect={(id) => setSelected("run", id)}
                query={agentRunsQuery}
                selectedId={selectedRun?.id ?? null}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="datasets">
              <DatasetsView
                onSelect={(id) => setSelected("dataset", id)}
                projectId={projectId}
                query={datasetsQuery}
                selectedId={selectedDataset?.id ?? null}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="scorers">
              <ScorersView
                onSelect={(id) => setSelected("scorer", id)}
                query={scorersQuery}
                selectedId={selectedScorer?.id ?? null}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="experiments">
              <ExperimentsView
                datasets={datasetsQuery.data?.items ?? []}
                onChanged={() => {
                  void experimentsQuery.refetch();
                  void datasetsQuery.refetch();
                  void scorersQuery.refetch();
                }}
                onSelect={(id) => setSelected("experiment", id)}
                query={experimentsQuery}
                scorers={scorersQuery.data?.items ?? []}
                selectedId={selectedExperiment?.id ?? null}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="production">
              <ProductionView
                qualityQuery={qualityQuery}
                selectedProjectId={projectId}
                settingsQuery={settingsQuery}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="annotations">
              <AnnotationQueueView
                onSelect={(id) => setSelected("annotation", id)}
                query={annotationsQuery}
                selectedId={selectedAnnotation?.id ?? null}
              />
            </TabsContent>
          </main>
          <aside
            className="hidden min-h-0 overflow-auto border-l bg-background p-3 xl:block"
            data-ai-eval-right-inspector="true"
          >
            <AiEvalInspector
              annotation={selectedAnnotation}
              dataset={selectedDataset}
              experiment={selectedExperiment}
              run={selectedRun}
              scorer={selectedScorer}
              tab={tab}
            />
          </aside>
        </Tabs>
      </div>
    </section>
  );
}

type QueryResult<T> = UseQueryResult<T, Error>;

const aiEvalWorkflowSteps: Array<{
  tab: AiEvalTab;
  label: string;
  description: string;
}> = [
  {
    tab: "runs",
    label: "Observe runs",
    description: "Review agent behavior from telemetry.",
  },
  {
    tab: "datasets",
    label: "Curate datasets",
    description: "Create, import, review, and export examples.",
  },
  {
    tab: "scorers",
    label: "Define scorers",
    description: "Register deterministic or judge-based checks.",
  },
  {
    tab: "experiments",
    label: "Run evaluations",
    description: "Create experiments and execute evaluation runs.",
  },
  {
    tab: "production",
    label: "Monitor quality",
    description: "Track online policy results and regressions.",
  },
];

function AiEvalWorkflowStrip({
  activeTab,
  onSelect,
}: {
  activeTab: AiEvalTab;
  onSelect: (tab: AiEvalTab) => void;
}) {
  return (
    <div className="grid shrink-0 gap-2 border bg-background p-2 xl:grid-cols-5">
      {aiEvalWorkflowSteps.map((step, index) => (
        <button
          className="grid min-h-16 gap-1 border-l px-3 py-2 text-left text-sm first:border-l-0 hover:bg-muted/40 data-[active=true]:bg-muted"
          data-active={activeTab === step.tab}
          key={step.tab}
          onClick={() => onSelect(step.tab)}
          type="button"
        >
          <span className="font-medium">
            {index + 1}. {step.label}
          </span>
          <span className="text-xs text-muted-foreground">{step.description}</span>
        </button>
      ))}
    </div>
  );
}

function AgentRunsView({
  query,
  onNext,
  onSelect,
  selectedId,
}: {
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchAgentRuns"]>>>;
  onNext: (cursor: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <QueryFrame query={query}>
      {query.data && query.data.items.length > 0 ? (
        <div className="min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("aiEval.agent")}</TableHead>
                <TableHead>{t("filters.status")}</TableHead>
                <TableHead>{t("traceDetail.duration")}</TableHead>
                <TableHead>{t("traceDetail.traceStructure")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((run) => (
                <TableRow
                  aria-selected={run.id === selectedId}
                  key={run.id}
                  onClick={() => onSelect(run.id)}
                >
                  <TableCell>{run.agent.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>{formatMs(run.durationMs)}</TableCell>
                  <TableCell>
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      to={`/traces/${run.traceId}`}
                    >
                      {run.traceId.slice(0, 12)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {query.data.nextCursor ? (
            <Button onClick={() => onNext(query.data.nextCursor ?? "")} variant="outline">
              <ArrowRight data-icon="inline-start" />
              {t("actions.nextPage")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </QueryFrame>
  );
}

function AgentRunDetail({ run }: { run: AgentRun }) {
  const timelineRows = agentRunTimelineRows(run);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="border-b pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bot />
          {run.agent.name}
        </h2>
        <div className="mt-3 grid gap-3 text-sm">
          <Metric label={t("aiEval.tokens")} value={run.tokenTotals?.total ?? t("value.none")} />
          <Metric label={t("aiEval.cost")} value={formatMoney(run.costEstimate)} />
          <Metric label={t("traceDetail.duration")} value={formatMs(run.durationMs)} />
        </div>
      </section>
      <section className="grid gap-4">
        <div>
          <h2 className="mb-2 text-sm font-medium">{t("aiEval.timeline")}</h2>
          <div className="flex flex-col gap-2">
            {timelineRows.map((row) => (
              <div className="border-b bg-background py-3 text-sm last:border-b-0" key={row.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.label}</span>
                  <Badge variant="outline">{row.kind}</Badge>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <span>{row.spanId}</span>
                  <span>
                    {formatMs(row.latencyMs)}
                    {row.tokenTotal ? ` · ${row.tokenTotal} ${t("aiEval.tokens")}` : ""}
                  </span>
                  <span>{row.details}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-medium">{t("aiEval.transcript")}</h2>
          <div className="flex flex-col gap-2">
            {run.transcript.map((message) => (
              <div
                className="border-b bg-background py-3 text-sm last:border-b-0"
                key={`${message.spanId}-${message.timestamp ?? message.role}-${message.contentDigest ?? jsonPreview(message.content, 24)}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4" />
                  <span className="font-medium">{message.role}</span>
                  <span className="text-xs text-muted-foreground">{message.timestamp}</span>
                </div>
                <p className="mt-2 break-words text-muted-foreground">
                  {message.contentDigest ?? jsonPreview(message.content, 240)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function DatasetsView({
  query,
  onSelect,
  projectId,
  selectedId,
}: {
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchDatasets"]>>>;
  onSelect: (id: string) => void;
  projectId: string;
  selectedId: string | null;
}) {
  const selected =
    query.data?.items.find((dataset) => dataset.id === selectedId) ?? query.data?.items[0];
  const onCreated = (dataset: Dataset) => {
    onSelect(dataset.id);
    void query.refetch();
  };

  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h2 className="text-sm font-medium">Dataset administration</h2>
          <p className="text-sm text-muted-foreground">
            Create datasets, stage imports, review rows, and export canonical examples.
          </p>
        </div>
        <CreateDatasetDialog onCreated={onCreated} />
      </div>
      {query.data && query.data.items.length > 0 ? (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("aiEval.dataset")}</TableHead>
                  <TableHead>{t("aiEval.version")}</TableHead>
                  <TableHead>{t("aiEval.items")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((dataset) => (
                  <TableRow
                    aria-selected={dataset.id === selected?.id}
                    key={dataset.id}
                    onClick={() => onSelect(dataset.id)}
                  >
                    <TableCell>{dataset.name}</TableCell>
                    <TableCell>{dataset.version}</TableCell>
                    <TableCell>{dataset.itemCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {selected ? (
            <DatasetItems
              dataset={selected}
              onImported={() => void query.refetch()}
              projectId={projectId}
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          description="Create a dataset first, then import JSONL, JSON, CSV, or ZIP examples for evaluation runs."
          filtered={false}
          primaryAction={<CreateDatasetDialog onCreated={onCreated} triggerVariant="default" />}
          title="No datasets yet"
        />
      )}
    </div>
  );
}

function CreateDatasetDialog({
  onCreated,
  triggerVariant = "outline",
}: {
  onCreated: (dataset: Dataset) => void;
  triggerVariant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateDatasetInput = {
        name: name.trim(),
        description: description.trim() || null,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      return telemetryClient.createDataset(input);
    },
    onSuccess(dataset) {
      onCreated(dataset);
      setOpen(false);
      setName("");
      setDescription("");
      setTags("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant={triggerVariant}>
          <Plus data-icon="inline-start" />
          Create dataset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create dataset</DialogTitle>
          <DialogDescription>
            Datasets hold versioned examples used by experiments and exports.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Input onChange={(event) => setDescription(event.target.value)} value={description} />
          </Field>
          <Field>
            <FieldLabel>Tags</FieldLabel>
            <Input
              onChange={(event) => setTags(event.target.value)}
              placeholder="baseline, checkout"
              value={tags}
            />
          </Field>
          {(localError ?? mutation.error?.message) ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {localError ?? mutation.error?.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setLocalError(null);
              if (!name.trim()) {
                setLocalError("Name is required.");
                return;
              }
              void mutation.mutateAsync();
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />
            {mutation.isPending ? "Creating..." : "Create dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DatasetItems({
  dataset,
  onImported,
  projectId,
}: {
  dataset: Dataset;
  onImported: () => void;
  projectId: string;
}) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{dataset.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <DatasetImportSheet dataset={dataset} onImported={onImported} projectId={projectId} />
          <DatasetExportDialog dataset={dataset} />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("aiEval.input")}</TableHead>
            <TableHead>{t("aiEval.expected")}</TableHead>
            <TableHead>{t("aiEval.source")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(dataset.items?.items ?? []).map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-72 truncate">{jsonPreview(item.input)}</TableCell>
              <TableCell className="max-w-72 truncate">{jsonPreview(item.expected)}</TableCell>
              <TableCell>{item.sourceTraceId ?? t("value.none")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

type DatasetImportUploadResponse = {
  uploadId: string;
  projectId: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  detectedFormat?: DatasetImportFormat;
  containedFiles?: Array<{
    path: string;
    sizeBytes: number;
    detectedFormat: DatasetImportFormat | "unsupported";
  }>;
  expiresAt: string;
};

type MappingSourceKind = "column" | "jsonPath" | "constant" | "defaultValue";

type FieldMappingDraft = {
  id: string;
  targetPath: string;
  sourceKind: MappingSourceKind;
  sourceValue: string;
};

type ScalarMappingDraft = {
  sourceKind: MappingSourceKind;
  sourceValue: string;
};

const datasetImportFormats: DatasetImportFormat[] = ["jsonl", "json_array", "csv", "zip"];
const datasetExportFormats: DatasetExportFormat[] = ["jsonl", "json_array", "csv"];
const datasetSplits: DatasetSplit[] = [
  "dev",
  "optimization",
  "validation",
  "regression",
  "holdout",
];
const datasetReviewStatuses: DatasetReviewStatus[] = ["unreviewed", "reviewed", "rejected"];
const mappingSourceKinds: MappingSourceKind[] = ["column", "jsonPath", "constant", "defaultValue"];
const scorerKinds: ScorerKind[] = [
  "deterministic",
  "schema_json",
  "semantic",
  "rag",
  "llm_judge",
  "tool_correctness",
  "trajectory",
  "human",
];

function DatasetImportSheet({
  dataset,
  onImported,
  projectId,
}: {
  dataset: Dataset;
  onImported: () => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<DatasetImportFormat>("jsonl");
  const [upload, setUpload] = useState<DatasetImportUploadResponse | null>(null);
  const [includedFiles, setIncludedFiles] = useState<string[]>([]);
  const [inputMappings, setInputMappings] = useState<FieldMappingDraft[]>([
    mappingDraft("input", "prompt"),
  ]);
  const [expectedMappings, setExpectedMappings] = useState<FieldMappingDraft[]>([]);
  const [metadataMappings, setMetadataMappings] = useState<FieldMappingDraft[]>([]);
  const [sourceTraceId, setSourceTraceId] = useState<ScalarMappingDraft>(emptyScalarMapping());
  const [sourceSpanId, setSourceSpanId] = useState<ScalarMappingDraft>(emptyScalarMapping());
  const [splitMapping, setSplitMapping] = useState<ScalarMappingDraft>(emptyScalarMapping());
  const [reviewStatusMapping, setReviewStatusMapping] = useState<ScalarMappingDraft>(
    emptyScalarMapping(),
  );
  const [defaultSplit, setDefaultSplit] = useState<DatasetSplit>("dev");
  const [defaultReviewStatus, setDefaultReviewStatus] = useState<DatasetReviewStatus>("unreviewed");
  const [allowPartialCommit, setAllowPartialCommit] = useState(false);
  const [previewJob, setPreviewJob] = useState<DatasetImportJob | null>(null);
  const [committedJob, setCommittedJob] = useState<DatasetImportJob | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        throw new Error("Choose a dataset file before uploading.");
      }
      return uploadDatasetImportFile(projectId, file);
    },
    onSuccess(nextUpload) {
      setUpload(nextUpload);
      setFormat(nextUpload.detectedFormat ?? format);
      setPreviewJob(null);
      setCommittedJob(null);
      setIncludedFiles(
        nextUpload.containedFiles
          ?.filter((containedFile) => containedFile.detectedFormat !== "unsupported")
          .map((containedFile) => containedFile.path) ?? [],
      );
    },
  });
  const prepareMutation = useMutation({
    mutationFn: () =>
      telemetryClient.prepareDatasetImport(
        buildPrepareDatasetImportInput({
          allowPartialCommit,
          dataset,
          defaultReviewStatus,
          defaultSplit,
          expectedMappings,
          format,
          includedFiles,
          inputMappings,
          metadataMappings,
          reviewStatusMapping,
          sourceSpanId,
          sourceTraceId,
          splitMapping,
          upload,
        }),
      ),
    onSuccess(job) {
      setPreviewJob(job);
      setCommittedJob(null);
    },
  });
  const commitMutation = useMutation({
    mutationFn: (mode: DatasetImportCommitMode) => {
      if (!previewJob) {
        throw new Error("Preview the import before committing.");
      }
      return telemetryClient.commitDatasetImport({
        importId: previewJob.id,
        expectedDatasetVersion: dataset.version,
        mode,
      });
    },
    onSuccess(job) {
      setCommittedJob(job);
      setPreviewJob(job);
      void queryClient.invalidateQueries({ queryKey: ["Datasets"] });
      onImported();
    },
  });

  const sourceFiles = previewJob?.sourceFiles ?? [];
  const previewHasErrors = (previewJob?.errorRows ?? 0) > 0;
  const canCommit =
    previewJob?.status === "preview_ready" && (!previewHasErrors || allowPartialCommit);
  const commitMode: DatasetImportCommitMode = allowPartialCommit
    ? "valid_rows_only"
    : "reject_if_any_error";
  const error =
    localError ??
    uploadMutation.error?.message ??
    prepareMutation.error?.message ??
    commitMutation.error?.message ??
    null;

  const onPrepare = () => {
    setLocalError(null);
    try {
      void prepareMutation.mutateAsync();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Import preview failed.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Upload data-icon="inline-start" />
          Import
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl" side="right">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Import dataset items</SheetTitle>
          <SheetDescription>
            Upload JSONL, JSON array, CSV, or ZIP bytes, then preview backend validation before
            commit.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          <div className="grid gap-5">
            <section className="grid gap-3 border-b pb-4">
              <h3 className="text-sm font-medium">1. Upload file</h3>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="dataset-import-file">File</FieldLabel>
                  <Input
                    accept=".jsonl,.json,.csv,.zip"
                    id="dataset-import-file"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setUpload(null);
                      setPreviewJob(null);
                      setCommittedJob(null);
                    }}
                    type="file"
                  />
                </Field>
                <Field>
                  <FieldLabel>Format</FieldLabel>
                  <Select
                    onValueChange={(value) => setFormat(value as DatasetImportFormat)}
                    value={format}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {datasetImportFormats.map((candidate) => (
                        <SelectItem key={candidate} value={candidate}>
                          {datasetImportFormatLabel(candidate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  disabled={!file || uploadMutation.isPending}
                  onClick={() => void uploadMutation.mutateAsync()}
                  type="button"
                  variant="secondary"
                >
                  <Upload data-icon="inline-start" />
                  {uploadMutation.isPending ? "Uploading..." : "Stage upload"}
                </Button>
              </FieldGroup>
              {upload ? (
                <div className="grid gap-1 text-sm text-muted-foreground">
                  <span>
                    {upload.filename} · {formatBytes(upload.sizeBytes)} · expires {upload.expiresAt}
                  </span>
                  <span className="break-all">SHA-256 {upload.sha256}</span>
                </div>
              ) : null}
              {(upload?.containedFiles?.length ?? 0) > 0 ? (
                <SourceFileSelector
                  containedFiles={upload?.containedFiles ?? []}
                  includedFiles={includedFiles}
                  onChange={setIncludedFiles}
                />
              ) : null}
            </section>
            <section className="grid gap-4 border-b pb-4">
              <div>
                <h3 className="text-sm font-medium">2. Map fields</h3>
                <p className="text-sm text-muted-foreground">
                  Use explicit columns, JSON paths, constants, or defaults. Row parsing and
                  validation happen in CloudGrid after preview.
                </p>
              </div>
              <FieldMappingGroup
                label="Input"
                mappings={inputMappings}
                onChange={setInputMappings}
                targetPrefix="input"
              />
              <FieldMappingGroup
                label="Expected"
                mappings={expectedMappings}
                onChange={setExpectedMappings}
                targetPrefix="expected"
              />
              <FieldMappingGroup
                label="Metadata"
                mappings={metadataMappings}
                onChange={setMetadataMappings}
                targetPrefix="metadata"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ScalarMappingControl
                  label="sourceTraceId"
                  onChange={setSourceTraceId}
                  value={sourceTraceId}
                />
                <ScalarMappingControl
                  label="sourceSpanId"
                  onChange={setSourceSpanId}
                  value={sourceSpanId}
                />
                <ScalarMappingControl
                  label="split"
                  onChange={setSplitMapping}
                  value={splitMapping}
                />
                <ScalarMappingControl
                  label="reviewStatus"
                  onChange={setReviewStatusMapping}
                  value={reviewStatusMapping}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Default split</FieldLabel>
                  <Select
                    onValueChange={(value) => setDefaultSplit(value as DatasetSplit)}
                    value={defaultSplit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {datasetSplits.map((candidate) => (
                        <SelectItem key={candidate} value={candidate}>
                          {candidate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Default review status</FieldLabel>
                  <Select
                    onValueChange={(value) => setDefaultReviewStatus(value as DatasetReviewStatus)}
                    value={defaultReviewStatus}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {datasetReviewStatuses.map((candidate) => (
                        <SelectItem key={candidate} value={candidate}>
                          {candidate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <Checkbox
                  id="dataset-import-partial-commit"
                  checked={allowPartialCommit}
                  onCheckedChange={(checked) => setAllowPartialCommit(checked === true)}
                />
                <label htmlFor="dataset-import-partial-commit">
                  Allow partial commit of valid rows when preview reports row errors.
                  <span className="block text-muted-foreground">
                    Uses commit mode <code>valid_rows_only</code>; otherwise commit uses{" "}
                    <code>reject_if_any_error</code>.
                  </span>
                </label>
              </div>
              <Button
                disabled={!upload || prepareMutation.isPending}
                onClick={onPrepare}
                type="button"
                variant="secondary"
              >
                <FileText data-icon="inline-start" />
                {prepareMutation.isPending ? "Previewing..." : "Preview import"}
              </Button>
            </section>
            <DatasetImportPreview job={previewJob} sourceFiles={sourceFiles} />
            {committedJob?.committedDatasetVersion ? (
              <section className="grid gap-2 border-b pb-4 text-sm">
                <h3 className="font-medium">Committed</h3>
                <p className="text-muted-foreground">
                  Dataset version {committedJob.committedDatasetVersion} was created from import{" "}
                  {committedJob.id}.
                </p>
              </section>
            ) : null}
            {error ? (
              <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        </div>
        <SheetFooter className="border-t px-4 py-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={!canCommit || commitMutation.isPending} type="button">
                <CheckCircle2 data-icon="inline-start" />
                Commit preview
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Commit dataset import?</DialogTitle>
                <DialogDescription>
                  CloudGrid will append previewed rows to {dataset.name} using the prepared import
                  job. This creates a new dataset version.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 text-sm">
                <Metric label="Commit mode" value={commitMode} />
                <Metric label="Valid rows" value={previewJob?.validRows ?? 0} />
                <Metric label="Error rows" value={previewJob?.errorRows ?? 0} />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">
                    <XCircle data-icon="inline-start" />
                    Cancel
                  </Button>
                </DialogClose>
                <Button onClick={() => void commitMutation.mutateAsync(commitMode)} type="button">
                  <CheckCircle2 data-icon="inline-start" />
                  Commit import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SourceFileSelector({
  containedFiles,
  includedFiles,
  onChange,
}: {
  containedFiles: DatasetImportUploadResponse["containedFiles"];
  includedFiles: string[];
  onChange: (files: string[]) => void;
}) {
  const supportedFiles =
    containedFiles?.filter((file) => file.detectedFormat !== "unsupported") ?? [];
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">ZIP contents</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">Use</TableHead>
            <TableHead>Path</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(containedFiles ?? []).map((containedFile) => {
            const supported = containedFile.detectedFormat !== "unsupported";
            const checked = includedFiles.includes(containedFile.path);
            return (
              <TableRow key={containedFile.path}>
                <TableCell>
                  <Checkbox
                    checked={checked}
                    disabled={!supported}
                    onCheckedChange={(nextChecked) => {
                      onChange(
                        nextChecked === true
                          ? [...includedFiles, containedFile.path]
                          : includedFiles.filter((path) => path !== containedFile.path),
                      );
                    }}
                  />
                </TableCell>
                <TableCell className="max-w-64 truncate">{containedFile.path}</TableCell>
                <TableCell>{containedFile.detectedFormat}</TableCell>
                <TableCell>{formatBytes(containedFile.sizeBytes)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {supportedFiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No supported files were detected in this archive.
        </p>
      ) : null}
    </div>
  );
}

function FieldMappingGroup({
  label,
  mappings,
  onChange,
  targetPrefix,
}: {
  label: string;
  mappings: FieldMappingDraft[];
  onChange: (mappings: FieldMappingDraft[]) => void;
  targetPrefix: "input" | "expected" | "metadata";
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
        <Button
          onClick={() => onChange([...mappings, mappingDraft(targetPrefix, "")])}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </div>
      {mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} mapping.</p>
      ) : null}
      {mappings.map((mapping, index) => (
        <div
          className="grid gap-2 border-b pb-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto]"
          key={mapping.id}
        >
          <Field>
            <FieldLabel>{targetPrefix} target path</FieldLabel>
            <Input
              onChange={(event) => {
                const next = [...mappings];
                next[index] = { ...mapping, targetPath: event.target.value };
                onChange(next);
              }}
              placeholder={targetPrefix === "expected" ? "answer" : "prompt"}
              value={mapping.targetPath}
            />
          </Field>
          <SourceKindSelect
            onChange={(sourceKind) => {
              const next = [...mappings];
              next[index] = { ...mapping, sourceKind };
              onChange(next);
            }}
            value={mapping.sourceKind}
          />
          <Field>
            <FieldLabel>{mapping.sourceKind}</FieldLabel>
            <Input
              onChange={(event) => {
                const next = [...mappings];
                next[index] = { ...mapping, sourceValue: event.target.value };
                onChange(next);
              }}
              placeholder={mappingSourcePlaceholder(mapping.sourceKind)}
              value={mapping.sourceValue}
            />
          </Field>
          <Button
            aria-label={`Remove ${targetPrefix} mapping`}
            disabled={targetPrefix === "input" && mappings.length === 1}
            onClick={() => onChange(mappings.filter((candidate) => candidate.id !== mapping.id))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ScalarMappingControl({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: ScalarMappingDraft) => void;
  value: ScalarMappingDraft;
}) {
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <SourceKindSelect
          onChange={(sourceKind) => onChange({ ...value, sourceKind })}
          value={value.sourceKind}
        />
        <Input
          onChange={(event) => onChange({ ...value, sourceValue: event.target.value })}
          placeholder={mappingSourcePlaceholder(value.sourceKind)}
          value={value.sourceValue}
        />
      </div>
    </div>
  );
}

function SourceKindSelect({
  onChange,
  value,
}: {
  onChange: (value: MappingSourceKind) => void;
  value: MappingSourceKind;
}) {
  return (
    <Field>
      <FieldLabel>Source</FieldLabel>
      <Select onValueChange={(nextValue) => onChange(nextValue as MappingSourceKind)} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {mappingSourceKinds.map((sourceKind) => (
            <SelectItem key={sourceKind} value={sourceKind}>
              {sourceKind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function DatasetImportPreview({
  job,
  sourceFiles,
}: {
  job: DatasetImportJob | null;
  sourceFiles: DatasetImportJob["sourceFiles"];
}) {
  if (!job) {
    return (
      <section className="grid gap-2 border-b pb-4 text-sm text-muted-foreground">
        <h3 className="font-medium text-foreground">3. Preview rows</h3>
        <p>Preview uses the GraphQL import contract and returns normalized sample rows.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3 border-b pb-4">
      <h3 className="text-sm font-medium">3. Preview rows</h3>
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <Metric label="Total rows" value={job.totalRows} />
        <Metric label="Valid rows" value={job.validRows} />
        <Metric label="Error rows" value={job.errorRows} />
        <Metric label="Warnings" value={job.warnings.length} />
      </div>
      {sourceFiles.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourceFiles.map((sourceFile) => (
              <TableRow key={sourceFile.path}>
                <TableCell className="max-w-72 truncate">{sourceFile.path}</TableCell>
                <TableCell>{sourceFile.format}</TableCell>
                <TableCell>{sourceFile.rowCount ?? "–"}</TableCell>
                <TableCell>{formatBytes(sourceFile.sizeBytes)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {job.warnings.length > 0 ? (
        <div className="grid gap-1 text-sm text-muted-foreground">
          {job.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Item preview</TableHead>
            <TableHead>Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {job.previewRows.map((row) => (
            <TableRow key={`${row.filePath}:${row.rowNumber}`}>
              <TableCell className="max-w-48 truncate">
                {row.filePath}:{row.rowNumber}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                {row.item ? jsonPreview(row.item as unknown as JSONValue, 180) : "–"}
              </TableCell>
              <TableCell className="max-w-80 whitespace-normal">
                {[...row.errors, ...row.warnings]
                  .map((issue) => `${issue.code}: ${issue.message}`)
                  .join("; ") || "–"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function DatasetExportDialog({ dataset }: { dataset: Dataset }) {
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DatasetExportFormat>("jsonl");
  const [split, setSplit] = useState<DatasetSplit | "all">("all");
  const [reviewStatus, setReviewStatus] = useState<DatasetReviewStatus | "all">("all");
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeSourcePointers, setIncludeSourcePointers] = useState(true);
  const [job, setJob] = useState<DatasetExportJob | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const exportMutation = useMutation({
    mutationFn: () =>
      telemetryClient.startDatasetExport({
        datasetId: dataset.id,
        format,
        split: split === "all" ? null : split,
        reviewStatus: reviewStatus === "all" ? null : reviewStatus,
        includeMetadata,
        includeSourcePointers,
      }),
    onSuccess(nextJob) {
      setJob(nextJob);
      if (nextJob.status === "ready" && nextJob.downloadUrl) {
        downloadSameOriginExport(nextJob);
      }
    },
  });

  const exportJobQuery = useQuery({
    enabled: open && job?.status === "queued",
    queryKey: ["DatasetExport", job?.id],
    queryFn: async () => {
      const nextJob = await telemetryClient.getDatasetExport(job?.id ?? "");
      if (!nextJob) {
        throw new Error("Dataset export job was not found.");
      }
      return nextJob;
    },
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!exportJobQuery.data || exportJobQuery.data.id !== job?.id) {
      return;
    }
    setJob(exportJobQuery.data);
    if (exportJobQuery.data.status === "ready" && exportJobQuery.data.downloadUrl) {
      try {
        downloadSameOriginExport(exportJobQuery.data);
      } catch (caught) {
        setLocalError(caught instanceof Error ? caught.message : "Export download failed.");
      }
    }
  }, [exportJobQuery.data, job?.id]);

  const error =
    localError ?? exportMutation.error?.message ?? exportJobQuery.error?.message ?? null;

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
          <DialogTitle>Export canonical dataset</DialogTitle>
          <DialogDescription>
            Export {dataset.name} as CloudGrid dataset-item data, not the original source file
            layout.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Format</FieldLabel>
            <Select
              onValueChange={(value) => setFormat(value as DatasetExportFormat)}
              value={format}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {datasetExportFormats.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {datasetExportFormatLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Split</FieldLabel>
              <Select
                onValueChange={(value) => setSplit(value as DatasetSplit | "all")}
                value={split}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All splits</SelectItem>
                  {datasetSplits.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {candidate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Review status</FieldLabel>
              <Select
                onValueChange={(value) => setReviewStatus(value as DatasetReviewStatus | "all")}
                value={reviewStatus}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {datasetReviewStatuses.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {candidate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="dataset-export-include-metadata"
              checked={includeMetadata}
              onCheckedChange={(checked) => setIncludeMetadata(checked === true)}
            />
            <label htmlFor="dataset-export-include-metadata">Include metadata</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="dataset-export-include-source-pointers"
              checked={includeSourcePointers}
              onCheckedChange={(checked) => setIncludeSourcePointers(checked === true)}
            />
            <label htmlFor="dataset-export-include-source-pointers">
              Include source trace/span pointers
            </label>
          </div>
          {job ? (
            <div className="grid gap-2 border-y py-3 text-sm">
              <Metric label="Status" value={job.status} />
              <Metric label="Rows" value={job.rowCount} />
              <Metric label="Size" value={formatBytes(job.sizeBytes)} />
              <Metric label="Expires" value={job.expiresAt} />
            </div>
          ) : null}
          {error ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <XCircle data-icon="inline-start" />
              Close
            </Button>
          </DialogClose>
          {job?.status === "ready" && job.downloadUrl ? (
            <Button
              onClick={() => {
                setLocalError(null);
                try {
                  downloadSameOriginExport(job);
                } catch (caught) {
                  setLocalError(
                    caught instanceof Error ? caught.message : "Export download failed.",
                  );
                }
              }}
              type="button"
              variant="secondary"
            >
              <Download data-icon="inline-start" />
              Download
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setLocalError(null);
              void exportMutation.mutateAsync().catch((caught) => {
                setLocalError(caught instanceof Error ? caught.message : "Dataset export failed.");
              });
            }}
            type="button"
          >
            <Download data-icon="inline-start" />
            {exportMutation.isPending ? "Starting..." : "Start export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScorersView({
  query,
  onSelect,
  selectedId,
}: {
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchScorers"]>>>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const onCreated = (scorer: Scorer) => {
    onSelect(scorer.id);
    void query.refetch();
  };

  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h2 className="text-sm font-medium">Scorer registry</h2>
          <p className="text-sm text-muted-foreground">
            Create scorer definitions that experiments use to evaluate dataset items.
          </p>
        </div>
        <CreateScorerDialog onCreated={onCreated} />
      </div>
      {query.data && query.data.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiEval.scorer")}</TableHead>
              <TableHead>{t("aiEval.kind")}</TableHead>
              <TableHead>{t("aiEval.version")}</TableHead>
              <TableHead>{t("aiEval.definition")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((scorer) => (
              <TableRow
                aria-selected={scorer.id === selectedId}
                key={scorer.id}
                onClick={() => onSelect(scorer.id)}
              >
                <TableCell>{scorer.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{scorer.kind}</Badge>
                </TableCell>
                <TableCell>{scorer.version}</TableCell>
                <TableCell className="max-w-xl truncate">
                  {jsonPreview(scorer.definition, 160)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          description="Create at least one scorer before running an experiment."
          filtered={false}
          primaryAction={<CreateScorerDialog onCreated={onCreated} triggerVariant="default" />}
          title="No scorers yet"
        />
      )}
    </div>
  );
}

function CreateScorerDialog({
  onCreated,
  triggerVariant = "outline",
}: {
  onCreated: (scorer: Scorer) => void;
  triggerVariant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScorerKind>("deterministic");
  const [definition, setDefinition] = useState(
    '{"type":"contains","field":"answer","expected":"ok"}',
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const input: CreateScorerInput = {
        name: name.trim(),
        kind,
        definition: JSON.parse(definition) as JSONValue,
      };
      return telemetryClient.createScorer(input);
    },
    onSuccess(scorer) {
      onCreated(scorer);
      setOpen(false);
      setName("");
      setDefinition('{"type":"contains","field":"answer","expected":"ok"}');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant={triggerVariant}>
          <Plus data-icon="inline-start" />
          Create scorer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create scorer</DialogTitle>
          <DialogDescription>
            A scorer evaluates each experiment item and returns structured results.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input onChange={(event) => setName(event.target.value)} value={name} />
          </Field>
          <Field>
            <FieldLabel>Kind</FieldLabel>
            <Select onValueChange={(value) => setKind(value as ScorerKind)} value={kind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scorerKinds.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Definition JSON</FieldLabel>
            <Input onChange={(event) => setDefinition(event.target.value)} value={definition} />
          </Field>
          {(localError ?? mutation.error?.message) ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {localError ?? mutation.error?.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending}
            onClick={() => {
              setLocalError(null);
              if (!name.trim()) {
                setLocalError("Name is required.");
                return;
              }
              try {
                JSON.parse(definition);
              } catch {
                setLocalError("Definition must be valid JSON.");
                return;
              }
              void mutation.mutateAsync();
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />
            {mutation.isPending ? "Creating..." : "Create scorer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExperimentsView({
  datasets,
  onChanged,
  query,
  onSelect,
  scorers,
  selectedId,
}: {
  datasets: Dataset[];
  onChanged: () => void;
  query: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchExperiments"]>>
  >;
  onSelect: (id: string) => void;
  scorers: Scorer[];
  selectedId: string | null;
}) {
  const runs = query.data?.items.flatMap((experiment) => experiment.runs?.items ?? []) ?? [];
  const rows = experimentScoreboardRows(runs);
  const onCreated = (experiment: Experiment) => {
    onSelect(experiment.id);
    onChanged();
  };
  const onRunStarted = () => {
    onChanged();
  };

  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h2 className="text-sm font-medium">Evaluation experiments</h2>
          <p className="text-sm text-muted-foreground">
            Pair a dataset version with scorers, then run an evaluation and compare results.
          </p>
        </div>
        <CreateExperimentDialog datasets={datasets} onCreated={onCreated} scorers={scorers} />
      </div>
      {query.data && query.data.items.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("aiEval.experiment")}</TableHead>
                <TableHead>{t("aiEval.dataset")}</TableHead>
                <TableHead>{t("aiEval.scorers")}</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>{t("aiEval.tags")}</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((experiment) => (
                <TableRow
                  aria-selected={experiment.id === selectedId}
                  key={experiment.id}
                  onClick={() => onSelect(experiment.id)}
                >
                  <TableCell>{experiment.name}</TableCell>
                  <TableCell>
                    {experiment.datasetId}@{experiment.datasetVersion}
                  </TableCell>
                  <TableCell>{experiment.scorerIds.length}</TableCell>
                  <TableCell>{experiment.runs?.items.length ?? 0}</TableCell>
                  <TableCell>{experiment.tags.join(", ") || t("value.none")}</TableCell>
                  <TableCell className="text-right">
                    <StartExperimentRunButton
                      experiment={experiment}
                      onStarted={onRunStarted}
                      size="sm"
                      variant="outline"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Scoreboard rows={rows} runs={runs} />
        </div>
      ) : (
        <EmptyState
          description="Create a dataset and scorer first, then define an experiment and run it."
          filtered={false}
          primaryAction={
            <CreateExperimentDialog
              datasets={datasets}
              onCreated={onCreated}
              scorers={scorers}
              triggerVariant="default"
            />
          }
          title="No experiments yet"
        />
      )}
    </div>
  );
}

function CreateExperimentDialog({
  datasets,
  onCreated,
  scorers,
  triggerVariant = "outline",
}: {
  datasets: Dataset[];
  onCreated: (experiment: Experiment) => void;
  scorers: Scorer[];
  triggerVariant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [scorerId, setScorerId] = useState(scorers[0]?.id ?? "");
  const [split, setSplit] = useState<DatasetSplit>("validation");
  const [solverRef, setSolverRef] = useState('{"kind":"local","name":"current-agent"}');
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId) ?? datasets[0];

  useEffect(() => {
    if (!datasetId && datasets[0]?.id) {
      setDatasetId(datasets[0].id);
    }
    if (!scorerId && scorers[0]?.id) {
      setScorerId(scorers[0].id);
    }
  }, [datasetId, datasets, scorerId, scorers]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedDataset) {
        throw new Error("Create a dataset before creating an experiment.");
      }
      const input: CreateExperimentInput = {
        name: name.trim(),
        datasetId: selectedDataset.id,
        datasetVersion: selectedDataset.version,
        splitSelector: { splits: [split], reviewedOnly: false, includeSynthetic: false },
        scorerIds: [scorerId],
        solverRef: JSON.parse(solverRef) as JSONValue,
        tags: [],
      };
      return telemetryClient.createExperiment(input);
    },
    onSuccess(experiment) {
      onCreated(experiment);
      setOpen(false);
      setName("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant={triggerVariant}>
          <Plus data-icon="inline-start" />
          Create experiment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create experiment</DialogTitle>
          <DialogDescription>
            Select the dataset version, scorer, and solver reference used by the evaluation run.
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
                    {dataset.name} v{dataset.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Scorer</FieldLabel>
            <Select onValueChange={setScorerId} value={scorerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select scorer" />
              </SelectTrigger>
              <SelectContent>
                {scorers.map((scorer) => (
                  <SelectItem key={scorer.id} value={scorer.id}>
                    {scorer.name} v{scorer.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Evaluation split</FieldLabel>
            <Select onValueChange={(value) => setSplit(value as DatasetSplit)} value={split}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {datasetSplits.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Solver reference JSON</FieldLabel>
            <Input onChange={(event) => setSolverRef(event.target.value)} value={solverRef} />
          </Field>
          {(localError ?? mutation.error?.message) ? (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {localError ?? mutation.error?.message}
            </div>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={mutation.isPending || datasets.length === 0 || scorers.length === 0}
            onClick={() => {
              setLocalError(null);
              if (!name.trim()) {
                setLocalError("Name is required.");
                return;
              }
              if (!datasetId || !scorerId) {
                setLocalError("Select a dataset and scorer.");
                return;
              }
              try {
                JSON.parse(solverRef);
              } catch {
                setLocalError("Solver reference must be valid JSON.");
                return;
              }
              void mutation.mutateAsync();
            }}
            type="button"
          >
            <Plus data-icon="inline-start" />
            {mutation.isPending ? "Creating..." : "Create experiment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartExperimentRunButton({
  experiment,
  onStarted,
  size = "sm",
  variant = "default",
}: {
  experiment: Experiment;
  onStarted: () => void;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const telemetryClient = useTelemetryClient();
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      const input: StartExperimentRunInput = { experimentId: experiment.id };
      return telemetryClient.startExperimentRun(input);
    },
    onSuccess() {
      onStarted();
    },
  });

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        disabled={mutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          setLocalError(null);
          void mutation.mutateAsync().catch((caught) => {
            setLocalError(caught instanceof Error ? caught.message : "Experiment run failed.");
          });
        }}
        size={size}
        type="button"
        variant={variant}
      >
        <FlaskConical data-icon="inline-start" />
        {mutation.isPending ? "Starting..." : "Run evaluation"}
      </Button>
      {localError ? <span className="max-w-48 text-xs text-destructive">{localError}</span> : null}
    </div>
  );
}

function Scoreboard({
  rows,
  runs,
}: {
  rows: ReturnType<typeof experimentScoreboardRows>;
  runs: ExperimentRun[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{t("aiEval.scoreboard")}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("aiEval.run")}</TableHead>
            <TableHead>{t("filters.status")}</TableHead>
            <TableHead>{t("aiEval.passRate")}</TableHead>
            <TableHead>{t("aiEval.meanScore")}</TableHead>
            <TableHead>{t("aiEval.p50")}</TableHead>
            <TableHead>{t("aiEval.p95")}</TableHead>
            <TableHead>{t("aiEval.regression")}</TableHead>
            <TableHead>{t("aiEval.items")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.runId}>
              <TableCell>{row.runId}</TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell>{formatPercent(row.passRate)}</TableCell>
              <TableCell>{formatNumber(row.meanScore)}</TableCell>
              <TableCell>{formatNumber(row.p50Score)}</TableCell>
              <TableCell>{formatNumber(row.p95Score)}</TableCell>
              <TableCell>
                {row.regression ? (
                  <XCircle className="size-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="size-4 text-success" />
                )}
              </TableCell>
              <TableCell>{row.itemRunCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 grid gap-3">
        {runs.flatMap((run) =>
          (run.itemRuns?.items ?? []).map((itemRun) => (
            <div className="border-b bg-background py-3 text-sm last:border-b-0" key={itemRun.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{itemRun.datasetItemId}</span>
                <span className="text-muted-foreground">{formatMs(itemRun.latencyMs)}</span>
              </div>
              <div className="mt-2 text-muted-foreground">{jsonPreview(itemRun.output, 180)}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {itemRunScoreSummary(itemRun).map((score) => (
                  <Badge key={score.id} variant={score.passed ? "secondary" : "destructive"}>
                    {score.scorerId}: {formatNumber(score.score)}
                  </Badge>
                ))}
              </div>
            </div>
          )),
        )}
      </div>
    </section>
  );
}

function ProductionView({
  qualityQuery,
  selectedProjectId,
  settingsQuery,
}: {
  qualityQuery: QueryResult<AiQualityOverview>;
  selectedProjectId: string;
  settingsQuery: QueryResult<ProjectAiSettings>;
}) {
  const isLoading = qualityQuery.isLoading || settingsQuery.isLoading;
  const error = qualityQuery.error ?? settingsQuery.error;

  if (isLoading) {
    return <LoadingRows />;
  }
  if (error) {
    return (
      <ErrorPanel
        error={error}
        onRetry={() => {
          void qualityQuery.refetch();
          void settingsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Online policies</h2>
          <Button asChild size="sm" variant="outline">
            <Link to={`/projects/${encodeURIComponent(selectedProjectId)}/settings/ai-eval`}>
              <Settings data-icon="inline-start" />
              Settings
            </Link>
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead>{t("filters.status")}</TableHead>
              <TableHead>Sample rate</TableHead>
              <TableHead>{t("aiEval.scorers")}</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(settingsQuery.data?.onlinePolicies ?? []).map((policy) => (
              <TableRow key={policy.id}>
                <TableCell>{policy.name}</TableCell>
                <TableCell>
                  <StatusBadge status={policy.enabled ? "enabled" : "disabled"} />
                </TableCell>
                <TableCell>{formatPercent(policy.sampleRate)}</TableCell>
                <TableCell>{policy.scorerIds.length}</TableCell>
                <TableCell>{policy.maxDailyRuns ?? t("value.none")}</TableCell>
                <TableCell className="max-w-80 truncate">
                  {jsonPreview(policy.target, 140)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium">Quality trend segments</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segment</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Scored</TableHead>
              <TableHead>{t("aiEval.passRate")}</TableHead>
              <TableHead>{t("aiEval.meanScore")}</TableHead>
              <TableHead>p95 latency</TableHead>
              <TableHead>{t("aiEval.cost")}</TableHead>
              <TableHead>{t("aiEval.regression")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(qualityQuery.data?.segments ?? []).map((segment) => (
              <TableRow key={segment.key}>
                <TableCell>{segment.label}</TableCell>
                <TableCell>{segment.runCount}</TableCell>
                <TableCell>{segment.scoredRunCount}</TableCell>
                <TableCell>{formatPercent(segment.passRate)}</TableCell>
                <TableCell>{formatNumber(segment.meanScore)}</TableCell>
                <TableCell>{formatMs(segment.p95LatencyMs)}</TableCell>
                <TableCell>{formatUsd(segment.costUsd)}</TableCell>
                <TableCell>{segment.regressionCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function AnnotationQueueView({
  query,
  onSelect,
  selectedId,
}: {
  query: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchAnnotationQueue"]>>
  >;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <QueryFrame query={query}>
      {query.data && query.data.items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("aiEval.reason")}</TableHead>
              <TableHead>{t("filters.status")}</TableHead>
              <TableHead>{t("aiEval.assignee")}</TableHead>
              <TableHead>{t("filters.traceId")}</TableHead>
              <TableHead>{t("filters.spanId")}</TableHead>
              <TableHead>{t("aiEval.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((item) => (
              <TableRow
                aria-selected={item.id === selectedId}
                key={item.id}
                onClick={() => onSelect(item.id)}
              >
                <TableCell>{item.reason}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.assignedTo ?? t("value.none")}</TableCell>
                <TableCell>
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    to={`/traces/${item.targetTraceId}`}
                  >
                    {item.targetTraceId}
                  </Link>
                </TableCell>
                <TableCell>{item.targetSpanId ?? t("value.none")}</TableCell>
                <TableCell>{item.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </QueryFrame>
  );
}

function AiEvalInspector({
  annotation,
  dataset,
  experiment,
  run,
  scorer,
  tab,
}: {
  annotation: AnnotationQueueItem | null;
  dataset: Dataset | null;
  experiment: Experiment | null;
  run: AgentRun | null;
  scorer: Scorer | null;
  tab: AiEvalTab;
}) {
  if (tab === "runs") {
    return run ? <AgentRunDetail run={run} /> : <InspectorEmpty />;
  }
  if (tab === "datasets") {
    return dataset ? <DatasetInspector dataset={dataset} /> : <InspectorEmpty />;
  }
  if (tab === "scorers") {
    return scorer ? <ScorerInspector scorer={scorer} /> : <InspectorEmpty />;
  }
  if (tab === "experiments") {
    return experiment ? <ExperimentInspector experiment={experiment} /> : <InspectorEmpty />;
  }
  if (tab === "production") {
    return <InspectorEmpty />;
  }
  return annotation ? <AnnotationInspector annotation={annotation} /> : <InspectorEmpty />;
}

function InspectorEmpty() {
  return <p className="text-sm text-muted-foreground">{t("aiEval.selectRow")}</p>;
}

function DatasetInspector({ dataset }: { dataset: Dataset }) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold">{dataset.name}</h2>
      <Metric label={t("aiEval.version")} value={dataset.version} />
      <Metric label={t("aiEval.items")} value={dataset.itemCount} />
      <Metric label="Reviewed" value={dataset.reviewedItemCount} />
      <Metric label="Health" value={dataset.health.status} />
      <Metric label="Duplicate candidates" value={dataset.health.duplicateCandidateCount} />
      <Metric label="Leakage warnings" value={dataset.health.leakageWarningCount} />
    </section>
  );
}

function ScorerInspector({ scorer }: { scorer: Scorer }) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold">{scorer.name}</h2>
      <Metric label={t("aiEval.kind")} value={scorer.kind} />
      <Metric label={t("aiEval.version")} value={scorer.version} />
      <CodeBlock
        code={JSON.stringify(scorer.definition, null, 2)}
        language="json"
        maxHeightClassName="max-h-56"
        title={t("aiEval.definition")}
      />
    </section>
  );
}

function ExperimentInspector({ experiment }: { experiment: Experiment }) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold">{experiment.name}</h2>
      <Metric
        label={t("aiEval.dataset")}
        value={
          experiment.datasetId
            ? `${experiment.datasetId}@${experiment.datasetVersion}`
            : t("value.none")
        }
      />
      <Metric label={t("aiEval.tags")} value={experiment.tags.join(", ") || t("value.none")} />
    </section>
  );
}

function AnnotationInspector({ annotation }: { annotation: AnnotationQueueItem }) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold">{annotation.reason}</h2>
      <Metric label={t("filters.status")} value={annotation.status} />
      <Metric label={t("aiEval.assignee")} value={annotation.assignedTo ?? t("value.none")} />
      <Metric label={t("aiEval.scorer")} value={annotation.scorerId ?? t("value.none")} />
      <Metric label={t("aiEval.meanScore")} value={formatNumber(annotation.score)} />
      <Button asChild variant="outline">
        <Link to={`/traces/${annotation.targetTraceId}`}>
          <ExternalLink data-icon="inline-start" />
          {t("traceDetail.traceStructure")}
        </Link>
      </Button>
    </section>
  );
}

function QueryFrame<T>({ query, children }: { query: QueryResult<T>; children: ReactNode }) {
  if (query.isLoading) {
    return <LoadingRows />;
  }
  if (query.isError) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.isSuccess && hasNoItems(query.data)) {
    return (
      <EmptyState
        filtered
        primaryAction={
          <Button asChild>
            <Link to="/projects">{t("projects.checklist.aiEval.action")}</Link>
          </Button>
        }
      />
    );
  }
  return children;
}

function hasNoItems(value: unknown) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray(value.items) &&
    value.items.length === 0
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "failed" || status === "error" ? "destructive" : "outline"}>
      {aiEvalStatusLabel(status)}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function readTab(value: string | null): AiEvalTab {
  if (
    value === "runs" ||
    value === "datasets" ||
    value === "scorers" ||
    value === "experiments" ||
    value === "production" ||
    value === "annotations"
  ) {
    return value;
  }
  return "runs";
}

function readAgentRunStatus(value: string | null) {
  if (value === "ok" || value === "error" || value === "unset" || value === "cancelled") {
    return value;
  }
  return null;
}

function readExperimentStatus(value: string | null) {
  if (
    value === "queued" ||
    value === "running" ||
    value === "cancelled" ||
    value === "failed" ||
    value === "finished"
  ) {
    return value;
  }
  return null;
}

function readAnnotationStatus(value: string | null) {
  if (value === "open" || value === "in_review" || value === "resolved" || value === "dismissed") {
    return value;
  }
  return null;
}

function aiEvalStatusLabel(status: string) {
  switch (status) {
    case "ok":
      return t("aiEval.status.ok");
    case "error":
      return t("aiEval.status.error");
    case "unset":
      return t("aiEval.status.unset");
    case "cancelled":
      return t("aiEval.status.cancelled");
    case "queued":
      return t("aiEval.status.queued");
    case "running":
      return t("aiEval.status.running");
    case "failed":
      return t("aiEval.status.failed");
    case "finished":
      return t("aiEval.status.finished");
    case "open":
      return t("aiEval.status.open");
    case "in_review":
      return t("aiEval.status.inReview");
    case "resolved":
      return t("aiEval.status.resolved");
    case "dismissed":
      return t("aiEval.status.dismissed");
    case "enabled":
      return "Enabled";
    case "disabled":
      return "Disabled";
    default:
      return status;
  }
}

function formatMs(value?: number | null) {
  return typeof value === "number" ? `${Math.round(value)} ms` : "–";
}

function formatMoney(value: { amount: number; currency: string } | null | undefined) {
  return value ? `${value.amount.toFixed(4)} ${value.currency}` : "–";
}

function formatPercent(value?: number | null) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "–";
}

function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toFixed(3) : "–";
}

function formatUsd(value?: number | null) {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "–";
}

function formatBytes(value?: number | null) {
  if (typeof value !== "number") {
    return "–";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function mappingDraft(targetPrefix: "input" | "expected" | "metadata", targetPath: string) {
  return {
    id: `${targetPrefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    targetPath,
    sourceKind: "column" as const,
    sourceValue: "",
  };
}

function emptyScalarMapping(): ScalarMappingDraft {
  return {
    sourceKind: "column",
    sourceValue: "",
  };
}

function mappingSourcePlaceholder(sourceKind: MappingSourceKind) {
  switch (sourceKind) {
    case "column":
      return "CSV header";
    case "jsonPath":
      return "$.messages[0].content";
    case "constant":
      return "Fixed value";
    case "defaultValue":
      return "Fallback value";
  }
}

function fieldMappingsFromDraft(mappings: FieldMappingDraft[]): DatasetImportFieldMappingInput[] {
  return mappings
    .map((mapping) => {
      const source = scalarMappingFromDraft(mapping);
      if (!mapping.targetPath.trim() || !source) {
        return null;
      }
      return {
        targetPath: mapping.targetPath.trim(),
        source,
      };
    })
    .filter((mapping): mapping is DatasetImportFieldMappingInput => Boolean(mapping));
}

function scalarMappingFromDraft(
  mapping: ScalarMappingDraft | FieldMappingDraft,
): DatasetImportScalarMappingInput | null {
  const sourceValue = mapping.sourceValue.trim();
  if (!sourceValue) {
    return null;
  }
  if (mapping.sourceKind === "column") {
    return { column: sourceValue };
  }
  if (mapping.sourceKind === "jsonPath") {
    return { jsonPath: sourceValue };
  }
  if (mapping.sourceKind === "constant") {
    return { constant: sourceValue };
  }
  return { defaultValue: sourceValue };
}

function buildPrepareDatasetImportInput({
  allowPartialCommit,
  dataset,
  defaultReviewStatus,
  defaultSplit,
  expectedMappings,
  format,
  includedFiles,
  inputMappings,
  metadataMappings,
  reviewStatusMapping,
  sourceSpanId,
  sourceTraceId,
  splitMapping,
  upload,
}: {
  allowPartialCommit: boolean;
  dataset: Dataset;
  defaultReviewStatus: DatasetReviewStatus;
  defaultSplit: DatasetSplit;
  expectedMappings: FieldMappingDraft[];
  format: DatasetImportFormat;
  includedFiles: string[];
  inputMappings: FieldMappingDraft[];
  metadataMappings: FieldMappingDraft[];
  reviewStatusMapping: ScalarMappingDraft;
  sourceSpanId: ScalarMappingDraft;
  sourceTraceId: ScalarMappingDraft;
  splitMapping: ScalarMappingDraft;
  upload: DatasetImportUploadResponse | null;
}): PrepareDatasetImportInput {
  if (!upload) {
    throw new Error("Stage an upload before previewing the import.");
  }
  const input = fieldMappingsFromDraft(inputMappings);
  if (input.length === 0) {
    throw new Error("At least one input mapping is required.");
  }
  return {
    datasetId: dataset.id,
    uploadId: upload.uploadId,
    format,
    fileSelector: includedFiles.length > 0 ? { include: includedFiles } : null,
    mapping: {
      input,
      expected: fieldMappingsFromDraft(expectedMappings),
      metadata: fieldMappingsFromDraft(metadataMappings),
      sourceTraceId: scalarMappingFromDraft(sourceTraceId),
      sourceSpanId: scalarMappingFromDraft(sourceSpanId),
      split: scalarMappingFromDraft(splitMapping),
      reviewStatus: scalarMappingFromDraft(reviewStatusMapping),
    },
    defaults: {
      split: defaultSplit,
      reviewStatus: defaultReviewStatus,
      metadata: {},
      synthetic: false,
      allowPartialCommit,
    },
    previewLimit: 100,
  };
}

async function uploadDatasetImportFile(projectId: string, file: File) {
  const formData = new FormData();
  formData.append("projectId", projectId);
  formData.append("file", file, file.name);
  formData.append("filename", file.name);

  const response = await fetch("/api/ai-eval/dataset-imports/uploads", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Dataset import upload failed with HTTP ${response.status}`);
  }
  return (await response.json()) as DatasetImportUploadResponse;
}

function downloadSameOriginExport(job: DatasetExportJob) {
  if (!job.downloadUrl) {
    throw new Error("Dataset export is not ready for download.");
  }
  const url = new URL(job.downloadUrl, window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error("Dataset export download URL must be same-origin.");
  }
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

function datasetImportFormatLabel(format: DatasetImportFormat) {
  if (format === "json_array") {
    return "JSON array";
  }
  return format.toUpperCase();
}

function datasetExportFormatLabel(format: DatasetExportFormat) {
  if (format === "json_array") {
    return "JSON array";
  }
  return format.toUpperCase();
}
