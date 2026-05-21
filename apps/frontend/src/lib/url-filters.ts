import type {
  LogSearchInput,
  TraceDetailInput,
  TraceSearchInput,
  TraceStatus,
} from "@cloudgrid/ui-contracts";
import {
  LOG_SEARCH_DEFAULT_LIMIT,
  TRACE_RELATED_LOG_DEFAULT_LIMIT,
  TRACE_SEARCH_DEFAULT_LIMIT,
  logSortOrDefault,
  traceSortOrDefault,
} from "@cloudgrid/ui-contracts";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const traceStatuses: TraceStatus[] = ["ok", "error", "unset"];
function valueOrNull(value: string | null) {
  return value && value.trim().length > 0 ? value : null;
}

function traceStatusOrNull(value: string | null): TraceStatus | null {
  return traceStatuses.includes(value as TraceStatus) ? (value as TraceStatus) : null;
}

function numberOrNull(value: string | null) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrFalse(value: string | null) {
  return value === "true";
}

function attributeFiltersOrNull(value: string | null) {
  const key = valueOrNull(value);
  return key ? [{ key, operator: "exists" as const }] : null;
}

export function useTraceFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TraceSearchInput>(
    () => ({
      service: valueOrNull(searchParams.get("service")),
      query: valueOrNull(searchParams.get("query")),
      operationName: valueOrNull(searchParams.get("operationName")),
      spanName: valueOrNull(searchParams.get("spanName")),
      from: valueOrNull(searchParams.get("from")),
      to: valueOrNull(searchParams.get("to")),
      status: traceStatusOrNull(searchParams.get("status")),
      minDurationMs: numberOrNull(searchParams.get("minDurationMs")),
      maxDurationMs: numberOrNull(searchParams.get("maxDurationMs")),
      attributes: attributeFiltersOrNull(searchParams.get("attributeKey")),
      sort: traceSortOrDefault(searchParams.get("sort")),
      cursor: valueOrNull(searchParams.get("cursor")),
      limit: TRACE_SEARCH_DEFAULT_LIMIT,
    }),
    [searchParams],
  );

  const setFilter = (name: keyof TraceSearchInput | "attributeKey", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    const key = name === "attributes" ? "attributeKey" : name;

    if (value && value.trim().length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next);
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());

  return { filters, searchParams, setFilter, clearFilters };
}

export function useTraceDetailFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TraceDetailInput>(
    () => ({
      selectedSpanId: valueOrNull(searchParams.get("spanId")),
      spanQuery: valueOrNull(searchParams.get("spanQuery")),
      spanService: valueOrNull(searchParams.get("spanService")),
      spanName: valueOrNull(searchParams.get("spanName")),
      spanStatus: traceStatusOrNull(searchParams.get("spanStatus")),
      minSpanDurationMs: numberOrNull(searchParams.get("minSpanDurationMs")),
      maxSpanDurationMs: numberOrNull(searchParams.get("maxSpanDurationMs")),
      attributes: attributeFiltersOrNull(searchParams.get("attributeKey")),
      showMatchesOnly: booleanOrFalse(searchParams.get("showMatchesOnly")),
      relatedLogLimit: TRACE_RELATED_LOG_DEFAULT_LIMIT,
      logSearch: valueOrNull(searchParams.get("logSearch")),
    }),
    [searchParams],
  );

  const selectedTab = valueOrNull(searchParams.get("tab")) ?? "overview";
  const criticalPathOnly = booleanOrFalse(searchParams.get("criticalPathOnly"));
  const errorsOnly = booleanOrFalse(searchParams.get("errorsOnly"));

  const setFilter = (
    name: keyof TraceDetailInput | "spanId" | "tab" | "attributeKey" | "view",
    value: string | null,
  ) => {
    const next = new URLSearchParams(searchParams);
    const key =
      name === "selectedSpanId" ? "spanId" : name === "attributes" ? "attributeKey" : name;

    if (value && value.trim().length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next, { replace: true });
  };

  const setBooleanFilter = (
    name: "showMatchesOnly" | "criticalPathOnly" | "errorsOnly",
    value: boolean,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(name, "true");
    } else {
      next.delete(name);
    }
    setSearchParams(next, { replace: true });
  };

  const setBooleanFilters = (
    values: Partial<Record<"showMatchesOnly" | "criticalPathOnly" | "errorsOnly", boolean>>,
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(values)) {
      if (value) {
        next.set(name, "true");
      } else {
        next.delete(name);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    for (const key of [
      "spanQuery",
      "spanService",
      "spanName",
      "spanStatus",
      "minSpanDurationMs",
      "maxSpanDurationMs",
      "showMatchesOnly",
      "criticalPathOnly",
      "errorsOnly",
      "logSearch",
      "attributeKey",
    ]) {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  return {
    filters,
    searchParams,
    selectedSpanId: filters.selectedSpanId ?? null,
    selectedTab,
    criticalPathOnly,
    errorsOnly,
    setFilter,
    setBooleanFilter,
    setBooleanFilters,
    clearFilters,
  };
}

export function useLogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<LogSearchInput>(
    () => ({
      service: valueOrNull(searchParams.get("service")),
      traceId: valueOrNull(searchParams.get("traceId")),
      spanId: valueOrNull(searchParams.get("spanId")),
      severity: valueOrNull(searchParams.get("severity")),
      from: valueOrNull(searchParams.get("from")),
      to: valueOrNull(searchParams.get("to")),
      search: valueOrNull(searchParams.get("search")),
      attributes: attributeFiltersOrNull(searchParams.get("attributeKey")),
      sort: logSortOrDefault(searchParams.get("sort")),
      cursor: valueOrNull(searchParams.get("cursor")),
      limit: LOG_SEARCH_DEFAULT_LIMIT,
    }),
    [searchParams],
  );

  const setFilter = (name: keyof LogSearchInput | "attributeKey", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    const key = name === "attributes" ? "attributeKey" : name;

    if (value && value.trim().length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next);
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());

  return { filters, searchParams, setFilter, clearFilters };
}

export function hasActiveFilters(searchParams: URLSearchParams) {
  for (const key of searchParams.keys()) {
    if (key !== "cursor") {
      return true;
    }
  }

  return false;
}
