import type { LogEvent, Span, TraceDetail, TraceStatus } from "@cloudgrid/ui-contracts";
import { jsonPreview } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { useTraceDetailFilters } from "../../lib/url-filters";

export type TraceDetailFilters = ReturnType<typeof useTraceDetailFilters>;
export type DetailTab = "attributes" | "events" | "exceptions" | "links";
export type TraceViewMode = "waterfall" | "flow";
export type LogsMode = "selected" | "trace";
export type RelatedLogsSortKey = "timestamp" | "severity" | "service" | "span" | "body";

export const severityRank = new Map([
  ["TRACE", 10],
  ["DEBUG", 20],
  ["INFO", 30],
  ["WARN", 40],
  ["ERROR", 50],
  ["FATAL", 60],
]);

export const detailTabs: DetailTab[] = ["attributes", "events", "exceptions", "links"];
export const statuses: TraceStatus[] = ["ok", "error", "unset"];

export function sortSpans(spans: Span[]) {
  return [...spans].sort((left, right) => {
    const startedDelta = new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
    if (startedDelta !== 0) {
      return startedDelta;
    }
    return left.depth - right.depth;
  });
}

export function traceSpanCount(detail: TraceDetail) {
  return detail.structure.serviceBreakdown.reduce((sum, service) => sum + service.spanCount, 0);
}

export function traceErrorSpanCount(detail: TraceDetail) {
  return detail.structure.serviceBreakdown.reduce(
    (sum, service) => sum + service.errorSpanCount,
    0,
  );
}

export function tabLabel(tab: DetailTab) {
  switch (tab) {
    case "attributes":
      return t("traceDetail.attributes");
    case "events":
      return t("traceDetail.events");
    case "exceptions":
      return t("traceDetail.exceptions");
    case "links":
      return t("traceDetail.links");
  }
}

export function isTab(value: string): value is DetailTab {
  return detailTabs.includes(value as DetailTab);
}

export function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

export function selectedSpanFor(detail: TraceDetail, selectedSpanId: string | null) {
  if (selectedSpanId) {
    return detail.spans.find((span) => span.id === selectedSpanId) ?? detail.selectedSpan ?? null;
  }

  return detail.selectedSpan ?? null;
}

export function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "");
}

export function compareRelatedLogs(left: LogEvent, right: LogEvent, key: RelatedLogsSortKey) {
  switch (key) {
    case "timestamp":
      return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    case "severity":
      return (
        (severityRank.get(left.severityText ?? "") ?? left.severityNumber ?? 0) -
        (severityRank.get(right.severityText ?? "") ?? right.severityNumber ?? 0)
      );
    case "service":
      return compareText(left.serviceName, right.serviceName);
    case "span":
      return compareText(left.spanId, right.spanId);
    case "body":
      return jsonPreview(left.body).localeCompare(jsonPreview(right.body));
  }
}

export function traceSearchBackHref(searchParams: URLSearchParams) {
  const returnTo = searchParams.get("returnTo");
  if (returnTo?.startsWith("/traces") && !returnTo.startsWith("/traces/")) {
    return returnTo;
  }

  return "/traces";
}

export function filterSpans(detail: TraceDetail, traceFilters: TraceDetailFilters) {
  const query = traceFilters.filters.spanQuery?.toLowerCase();
  const spanName = traceFilters.filters.spanName?.toLowerCase();
  const service = traceFilters.filters.spanService?.toLowerCase();
  const status = traceFilters.filters.spanStatus;
  const minDuration = traceFilters.filters.minSpanDurationMs;
  const maxDuration = traceFilters.filters.maxSpanDurationMs;
  const matchedSpanIds = new Set(detail.spanMatches.map((match) => match.spanId));

  return sortSpans(detail.spans).filter((span) => {
    if (query) {
      const searchable = `${span.name} ${span.id} ${span.serviceName ?? ""}`.toLowerCase();
      if (!searchable.includes(query)) {
        return false;
      }
    }
    if (spanName && !span.name.toLowerCase().includes(spanName)) {
      return false;
    }
    if (service && !(span.serviceName ?? "").toLowerCase().includes(service)) {
      return false;
    }
    if (status && span.status !== status) {
      return false;
    }
    if (typeof minDuration === "number" && span.durationMs < minDuration) {
      return false;
    }
    if (typeof maxDuration === "number" && span.durationMs > maxDuration) {
      return false;
    }
    if (traceFilters.errorsOnly && !span.hasError) {
      return false;
    }
    if (traceFilters.criticalPathOnly && !span.isCriticalPath) {
      return false;
    }
    if (traceFilters.filters.showMatchesOnly && !matchedSpanIds.has(span.id)) {
      return false;
    }
    return true;
  });
}
