import type {
  AgentRun,
  AgentRunSearchInput,
  AiQualityOverview,
  AiQualityOverviewInput,
  AnnotationQueueItem,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  Dataset,
  DatasetSearchInput,
  DatasetSearchResult,
  Experiment,
  ExperimentSearchResult,
  ExperimentRun,
  ExperimentSearchInput,
  GraphQLResponse,
  ProjectAiSettings,
  Scorer,
} from "@cloudgrid/ui-contracts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FlaskConical,
  FolderOpen,
  Gauge,
  PanelRightOpen,
  MessageSquareText,
  PencilLine,
  Settings,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CodeBlock } from "../components/code-block";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
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
  aiEvalOverviewModel,
  agentRunTimelineRows,
  experimentScoreboardRows,
  itemRunScoreSummary,
  jsonPreview,
} from "../features/ai-eval/view-model";
import { t } from "../lib/i18n";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

export const aiEvalEnabled =
  import.meta.env.CLOUDGRID_AI_EVAL_ENABLED === "true" ||
  import.meta.env.VITE_CLOUDGRID_AI_EVAL_ENABLED === "true";

type AiEvalTab =
  | "overview"
  | "runs"
  | "datasets"
  | "scorers"
  | "experiments"
  | "optimizations"
  | "production"
  | "annotations";

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
  const client = useTelemetryClient();
  const { viewer } = useAppSession();
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
    queryFn: () => client.searchAgentRuns(agentRunInput),
  });
  const datasetsQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "overview" || tab === "datasets"),
    queryKey: ["Datasets", { query: query || null }],
    queryFn: () => fetchDatasets({ query: query || null, limit: 25 }),
  });
  const scorersQuery = useQuery({
    enabled: shouldQueryAiEval && tab === "scorers",
    queryKey: ["Scorers", { query: query || null }],
    queryFn: () => client.searchScorers({ query: query || null, limit: 25 }),
  });
  const experimentsQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "experiments" || tab === "optimizations"),
    queryKey: ["Experiments", experimentInput],
    queryFn: () => fetchExperiments(experimentInput),
  });
  const annotationsQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "overview" || tab === "annotations"),
    queryKey: ["AnnotationQueue", annotationInput],
    queryFn: () => fetchAnnotationQueue(annotationInput),
  });
  const qualityQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "overview" || tab === "production"),
    queryKey: ["AiQualityOverview", qualityInput],
    queryFn: () => fetchAiQualityOverview(qualityInput),
  });
  const settingsQuery = useQuery({
    enabled: shouldQueryAiEval && (tab === "overview" || tab === "production"),
    queryKey: ["ProjectAiSettings", projectId],
    queryFn: () => fetchProjectAiSettings(projectId),
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
        <p className="text-sm text-muted-foreground">{t("aiEval.description")}</p>
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
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden border xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <Tabs className="contents" onValueChange={(value) => setParam("tab", value)} value={tab}>
          <aside
            className="min-h-0 overflow-auto border-r bg-background p-3"
            data-ai-eval-left-rail="true"
          >
            <TabsList className="grid h-auto gap-1 bg-transparent p-0" variant="line">
              <TabsTrigger className="justify-start" value="overview">
                <Gauge />
                Overview
              </TabsTrigger>
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
              <TabsTrigger className="justify-start" value="optimizations">
                <Sparkles />
                Optimizations
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="production">
                <Gauge />
                Production
              </TabsTrigger>
              <TabsTrigger className="justify-start" value="annotations">
                <PencilLine />
                {t("aiEval.annotations")}
              </TabsTrigger>
              {selectedProject ? (
                <Button asChild className="mt-3 justify-start" variant="ghost">
                  <Link to={`/projects/${encodeURIComponent(selectedProject.id)}/settings/ai-eval`}>
                    <Settings data-icon="inline-start" />
                    Settings
                  </Link>
                </Button>
              ) : null}
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
                      settings={settingsQuery.data ?? null}
                      tab={tab}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <TabsContent className="m-0 min-h-0" value="overview">
              <OverviewView
                annotationsQuery={annotationsQuery}
                datasetsQuery={datasetsQuery}
                qualityQuery={qualityQuery}
                selectedProjectId={projectId}
                settingsQuery={settingsQuery}
              />
            </TabsContent>
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
                onSelect={(id) => setSelected("experiment", id)}
                query={experimentsQuery}
                selectedId={selectedExperiment?.id ?? null}
              />
            </TabsContent>
            <TabsContent className="m-0 min-h-0" value="optimizations">
              <OptimizationsView query={experimentsQuery} />
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
              settings={settingsQuery.data ?? null}
              tab={tab}
            />
          </aside>
        </Tabs>
      </div>
    </section>
  );
}

type QueryResult<T> = UseQueryResult<T, Error>;

function OverviewView({
  annotationsQuery,
  datasetsQuery,
  qualityQuery,
  selectedProjectId,
  settingsQuery,
}: {
  annotationsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchAnnotationQueue"]>>
  >;
  datasetsQuery: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchDatasets"]>>
  >;
  qualityQuery: QueryResult<AiQualityOverview>;
  selectedProjectId: string;
  settingsQuery: QueryResult<ProjectAiSettings>;
}) {
  const isLoading =
    annotationsQuery.isLoading ||
    datasetsQuery.isLoading ||
    qualityQuery.isLoading ||
    settingsQuery.isLoading;
  const error =
    annotationsQuery.error ?? datasetsQuery.error ?? qualityQuery.error ?? settingsQuery.error;

  if (isLoading) {
    return <LoadingRows />;
  }
  if (error) {
    return (
      <ErrorPanel
        error={error}
        onRetry={() => {
          void annotationsQuery.refetch();
          void datasetsQuery.refetch();
          void qualityQuery.refetch();
          void settingsQuery.refetch();
        }}
      />
    );
  }

  const overview = aiEvalOverviewModel({
    annotationsOpen: annotationsQuery.data?.items.length ?? 0,
    datasets: datasetsQuery.data?.items ?? [],
    quality: qualityQuery.data,
    settings: settingsQuery.data,
  });

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 border-b pb-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Production pass rate" value={formatPercent(overview.qualityPassRate)} />
        <Metric label="Mean score" value={formatNumber(overview.qualityMeanScore)} />
        <Metric label="Annotation backlog" value={overview.annotationBacklog} />
        <Metric
          label="Budget today"
          value={`${formatUsd(overview.budgetSpentTodayUsd)} / ${formatUsd(overview.budgetDailyUsd)}`}
        />
      </section>
      <section className="grid gap-3 border-b pb-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Datasets" value={overview.datasetCount} />
        <Metric label="Datasets needing attention" value={overview.unhealthyDatasetCount} />
        <Metric label="Active production policies" value={overview.activePolicyCount} />
        <Metric label="Regressions" value={overview.qualityRegressionCount} />
      </section>
      {overview.warnings.length > 0 ? (
        <section className="grid gap-2 border-b pb-4">
          <h2 className="text-sm font-medium">Missing setup warnings</h2>
          {overview.warnings.map((warning) => (
            <div className="text-sm text-muted-foreground" key={warning}>
              {warning}
            </div>
          ))}
        </section>
      ) : null}
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">First-use setup</h2>
        <SetupChecklistRow
          actionHref="/traces"
          actionLabel="Open traces"
          label="Telemetry detected"
          status={(qualityQuery.data?.segments.length ?? 0) > 0 ? "Ready" : "Needs data"}
        />
        <SetupChecklistRow
          actionHref={`/projects/${encodeURIComponent(selectedProjectId)}/settings/ai-eval`}
          actionLabel="Open settings"
          label="Provider profile"
          status={(settingsQuery.data?.providerProfiles.length ?? 0) > 0 ? "Ready" : "Missing"}
        />
        <SetupChecklistRow
          actionHref="?tab=datasets"
          actionLabel="Open datasets"
          label="Dataset"
          status={overview.datasetCount > 0 ? "Ready" : "Missing"}
        />
        <SetupChecklistRow
          actionHref="?tab=scorers"
          actionLabel="Open scorers"
          label="Scorer"
          status="Use templates"
        />
        <SetupChecklistRow
          actionHref="?tab=experiments"
          actionLabel="Open experiments"
          label="Baseline experiment"
          status="Required before promotion"
        />
        <SetupChecklistRow
          actionHref="?tab=production"
          actionLabel="Open production"
          label="Production policy"
          status={overview.activePolicyCount > 0 ? "Ready" : "Optional"}
        />
      </section>
    </div>
  );
}

function SetupChecklistRow({
  actionHref,
  actionLabel,
  label,
  status,
}: {
  actionHref: string;
  actionLabel: string;
  label: string;
  status: string;
}) {
  return (
    <div className="grid gap-2 border-b py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
      <span className="font-medium">{label}</span>
      <Badge variant="outline">{status}</Badge>
      <Button asChild size="sm" variant="outline">
        <Link to={actionHref}>{actionLabel}</Link>
      </Button>
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
  selectedId,
}: {
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchDatasets"]>>>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const selected =
    query.data?.items.find((dataset) => dataset.id === selectedId) ?? query.data?.items[0];
  return (
    <QueryFrame query={query}>
      {query.data && query.data.items.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
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
          {selected ? <DatasetItems dataset={selected} /> : null}
        </div>
      ) : null}
    </QueryFrame>
  );
}

function DatasetItems({ dataset }: { dataset: Dataset }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{dataset.name}</h2>
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

function ScorersView({
  query,
  onSelect,
  selectedId,
}: {
  query: QueryResult<Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchScorers"]>>>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <QueryFrame query={query}>
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
      ) : null}
    </QueryFrame>
  );
}

function ExperimentsView({
  query,
  onSelect,
  selectedId,
}: {
  query: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchExperiments"]>>
  >;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const runs = query.data?.items.flatMap((experiment) => experiment.runs?.items ?? []) ?? [];
  const rows = experimentScoreboardRows(runs);
  return (
    <QueryFrame query={query}>
      {query.data && query.data.items.length > 0 ? (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("aiEval.experiment")}</TableHead>
                <TableHead>{t("aiEval.dataset")}</TableHead>
                <TableHead>{t("aiEval.scorers")}</TableHead>
                <TableHead>{t("aiEval.tags")}</TableHead>
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
                  <TableCell>{experiment.tags.join(", ") || t("value.none")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Scoreboard rows={rows} runs={runs} />
        </div>
      ) : null}
    </QueryFrame>
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

function OptimizationsView({
  query,
}: {
  query: QueryResult<
    Awaited<ReturnType<ReturnType<typeof useTelemetryClient>["searchExperiments"]>>
  >;
}) {
  const runs = query.data?.items.flatMap((experiment) =>
    (experiment.runs?.items ?? []).map((run) => ({ experiment, run })),
  );

  return (
    <QueryFrame query={query}>
      {query.data && query.data.items.length > 0 ? (
        <div className="grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>{t("aiEval.experiment")}</TableHead>
                <TableHead>{t("filters.status")}</TableHead>
                <TableHead>{t("aiEval.dataset")}</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Promotion gate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs ?? []).map(({ experiment, run }) => (
                <TableRow key={run.id}>
                  <TableCell className="max-w-72 truncate">
                    {jsonPreview(run.solverRef, 120)}
                  </TableCell>
                  <TableCell>{experiment.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    {experiment.datasetId}@{experiment.datasetVersion}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    {jsonPreview(run.manifest?.budget, 96) || t("value.none")}
                  </TableCell>
                  <TableCell className="max-w-72 truncate">
                    {jsonPreview(run.summary, 120)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </QueryFrame>
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
  settings,
  tab,
}: {
  annotation: AnnotationQueueItem | null;
  dataset: Dataset | null;
  experiment: Experiment | null;
  run: AgentRun | null;
  scorer: Scorer | null;
  settings: ProjectAiSettings | null;
  tab: AiEvalTab;
}) {
  if (tab === "overview") {
    return settings ? <SettingsInspector settings={settings} /> : <InspectorEmpty />;
  }
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
  if (tab === "optimizations") {
    return experiment ? <ExperimentInspector experiment={experiment} /> : <InspectorEmpty />;
  }
  if (tab === "production") {
    return settings ? <SettingsInspector settings={settings} /> : <InspectorEmpty />;
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

function SettingsInspector({ settings }: { settings: ProjectAiSettings }) {
  return (
    <section className="grid gap-3 text-sm">
      <h2 className="font-semibold">Project AI Eval settings</h2>
      <Metric label={t("filters.status")} value={settings.enabled ? "Enabled" : "Disabled"} />
      <Metric label="Provider profiles" value={settings.providerProfiles.length} />
      <Metric label="Model aliases" value={settings.modelAliases.length} />
      <Metric label="Online policies" value={settings.onlinePolicies.length} />
      <Metric
        label="Daily budget"
        value={`${formatUsd(settings.budget.spentTodayUsd)} / ${formatUsd(settings.budget.dailyUsd)}`}
      />
      <Metric
        label="Deterministic only"
        value={settings.effective.deterministicOnly ? "Yes" : "No"}
      />
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
            <Link to="/projects">
              <FolderOpen data-icon="inline-start" />
              {t("projects.checklist.aiEval.action")}
            </Link>
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
    value === "overview" ||
    value === "datasets" ||
    value === "scorers" ||
    value === "experiments" ||
    value === "optimizations" ||
    value === "production" ||
    value === "annotations"
  ) {
    return value;
  }
  return "overview";
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

async function fetchAiQualityOverview(input: AiQualityOverviewInput): Promise<AiQualityOverview> {
  const data = await requestAiEvalGraphQL<{ aiQualityOverview: AiQualityOverview }>(
    "AiQualityOverview",
    aiQualityOverviewOperation,
    { input },
  );
  return data.aiQualityOverview;
}

async function fetchDatasets(input: DatasetSearchInput): Promise<DatasetSearchResult> {
  const data = await requestAiEvalGraphQL<{ datasets: DatasetSearchResult }>(
    "Datasets",
    datasetsOperation,
    {
      input,
    },
  );
  return data.datasets;
}

async function fetchExperiments(input: ExperimentSearchInput): Promise<ExperimentSearchResult> {
  const data = await requestAiEvalGraphQL<{ experiments: ExperimentSearchResult }>(
    "Experiments",
    experimentsOperation,
    { input },
  );
  return data.experiments;
}

async function fetchAnnotationQueue(
  input: AnnotationQueueSearchInput,
): Promise<AnnotationQueueResult> {
  const data = await requestAiEvalGraphQL<{ annotationQueue: AnnotationQueueResult }>(
    "AnnotationQueue",
    annotationQueueOperation,
    { input },
  );
  return data.annotationQueue;
}

async function fetchProjectAiSettings(projectId: string): Promise<ProjectAiSettings> {
  const data = await requestAiEvalGraphQL<{ projectAiSettings: ProjectAiSettings }>(
    "ProjectAiSettings",
    projectAiSettingsOperation,
    { projectId },
  );
  return data.projectAiSettings;
}

async function requestAiEvalGraphQL<Data>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Data> {
  const response = await fetch(import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL ${operationName} failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as GraphQLResponse<Data>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  if (!payload.data) {
    throw new Error(`GraphQL ${operationName} returned no data`);
  }
  return payload.data;
}

const projectAiSettingsOperation = `
  query ProjectAiSettings($projectId: ID!) {
    projectAiSettings(projectId: $projectId) {
      projectId
      enabled
      providerProfiles {
        id
        label
        providerKind
        disabledAt
      }
      modelAliases {
        id
        name
        providerProfileId
        model
        purpose
      }
      onlinePolicies {
        id
        enabled
        name
        target
        scorerIds
        sampleRate
        maxDailyRuns
        updatedAt
        updatedByUserId
      }
      budget {
        dailyUsd
        perRunUsd
        deterministicOnly
        spentTodayUsd
      }
      sampling {
        defaultOnlineSampleRate
        maxOnlineSampleRate
        maxConcurrentExperimentItems
        maxConcurrentOptimizationCandidates
      }
      datasetDefaults {
        splitAllocation
        smallDatasetReviewedThreshold
        requireReviewForRegression
      }
      effective {
        warnings
        deterministicOnly
        missingProviderProfiles
        disabledProviderProfiles
        budgetExhausted
      }
      version
      updatedAt
      updatedByUserId
    }
  }
`;

const datasetItemFields = `
  id
  datasetId
  version
  input
  expected
  metadata
  sourceTraceId
  sourceSpanId
  split
  reviewStatus
  synthetic
  duplicateOfItemId
  leakageWarnings
`;

const evalResultFields = `
  id
  scorerId
  scorerVersion
  targetKind
  targetId
  experimentRunId
  score
  passed
  evidence
  judgeRunRef
  producedAt
`;

const datasetItemRunFields = `
  id
  experimentRunId
  datasetItemId
  harnessRunId
  output
  latencyMs
  tokenTotals {
    input
    output
    total
  }
  evalResults {
    ${evalResultFields}
  }
`;

const experimentRunFields = `
  id
  experimentId
  solverRef
  manifest {
    digest
    datasetId
    datasetVersion
    splitSelector {
      splits
      reviewedOnly
      includeSynthetic
    }
    scorerRefs {
      id
      version
    }
    baselineRef
    solverRef
    promptVersionRefs
    skillSnapshotRefs
    toolSnapshotRefs
    providerProfileRefs
    budget
    concurrency
    createdAt
  }
  baselineRunId
  status
  startedAt
  endedAt
  summary
  itemRuns {
    items {
      ${datasetItemRunFields}
    }
    nextCursor
  }
`;

const datasetsOperation = `
  query Datasets($input: DatasetSearchInput) {
    datasets(input: $input) {
      items {
        id
        name
        description
        version
        createdAt
        itemCount
        reviewedItemCount
        splitCounts
        health {
          status
          reviewedItemCount
          totalItemCount
          splitCounts
          duplicateCandidateCount
          leakageWarningCount
          missingExpectedCount
          schemaIssueCount
          smallDataset
          warnings
        }
        tags
        items {
          items {
            ${datasetItemFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

const experimentsOperation = `
  query Experiments($input: ExperimentSearchInput) {
    experiments(input: $input) {
      items {
        id
        name
        datasetId
        datasetVersion
        splitSelector {
          splits
          reviewedOnly
          includeSynthetic
        }
        scorerIds
        baselineRef
        promptVersionRefs
        skillSnapshotRefs
        toolSnapshotRefs
        providerProfileRefs
        createdAt
        tags
        runs {
          items {
            ${experimentRunFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

const annotationQueueOperation = `
  query AnnotationQueue($input: AnnotationQueueSearchInput) {
    annotationQueue(input: $input) {
      items {
        id
        targetTraceId
        targetSpanId
        reason
        assignedTo
        status
        createdAt
        resolvedDatasetItemId
        scorerId
        score
        evidence
      }
      nextCursor
    }
  }
`;

const aiQualityOverviewOperation = `
  query AiQualityOverview($input: AiQualityOverviewInput!) {
    aiQualityOverview(input: $input) {
      projectId
      from
      to
      summary
      warnings
      segments {
        key
        label
        dimensions
        runCount
        scoredRunCount
        passRate
        meanScore
        p50LatencyMs
        p95LatencyMs
        costUsd
        regressionCount
      }
    }
  }
`;
