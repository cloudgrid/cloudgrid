import { buildDatasetSearchInput } from "@cloudgrid/ui-contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { traceDetailQueryInput } from "../features/traces/trace-detail-query";
import { TraceDetailView } from "../features/traces/trace-detail-view";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useTraceDetailFilters } from "../lib/url-filters";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

export function TraceDetailRoute() {
  const client = useTelemetryClient();
  const { viewer } = useAppSession();
  const { traceId } = useParams();
  const projectId = viewer?.selectedProject?.id ?? "";
  const traceFilters = useTraceDetailFilters();
  const queryInput = traceDetailQueryInput(traceFilters.filters);
  const query = useQuery({
    enabled: Boolean(traceId),
    queryKey: queryKeys.trace(traceId ?? "", queryInput),
    queryFn: () => client.getTrace(traceId ?? "", queryInput),
  });
  const datasetsQuery = useQuery({
    queryKey: ["Datasets", "trace-detail-candidates", projectId],
    queryFn: () =>
      client.searchDatasets({
        ...buildDatasetSearchInput({ limit: 50 }),
        projectId,
      }),
    enabled: Boolean(projectId),
  });
  if (query.isSuccess && query.data) {
    return (
      <TraceDetailView
        datasets={datasetsQuery.data?.items ?? []}
        detail={query.data}
        projectId={projectId}
        traceFilters={traceFilters}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-normal">{t("traceDetail.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("traceDetail.description")}</p>
      </div>
      {query.isLoading ? <LoadingRows /> : null}
      {query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess && query.data === null ? (
        <Alert>
          <AlertTitle>{t("traceDetail.notFound.title")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{t("traceDetail.notFound.description")}</span>
            <Button asChild>
              <Link to="/traces">
                <ArrowLeft data-icon="inline-start" />
                {t("actions.backToTraces")}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {!traceId ? (
        <EmptyState
          filtered
          primaryAction={
            <Button asChild>
              <Link to="/traces">
                <ArrowLeft data-icon="inline-start" />
                {t("actions.backToTraces")}
              </Link>
            </Button>
          }
        />
      ) : null}
    </section>
  );
}
