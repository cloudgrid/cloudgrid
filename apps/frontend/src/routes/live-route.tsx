import type {
  LiveTraceEvent,
  LiveTraceInput,
  TraceStatus,
  TraceSummary,
} from "@cloudgrid/ui-contracts";
import { Check, Copy, Pause, Play, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FilterChip } from "../components/filter-chip";
import { ErrorPanel } from "../components/query-state";
import { SearchInput } from "../components/search-input";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { TraceTable } from "../features/traces/trace-table";
import { copyToClipboard } from "../lib/feedback";
import type { LiveTraceConnectionState } from "../lib/graphql-client";
import { t } from "../lib/i18n";
import { useAppSession } from "../providers/app-session-provider";
import { useTelemetryClient } from "../providers/telemetry-client-provider";

const traceStatuses: TraceStatus[] = ["ok", "error", "unset"];
const defaultLiveLimit = 500;
const maxLiveLimit = 500;
const allStatusesValue = "__all";

export interface LiveTraceRow {
  eventType: LiveTraceEvent["type"];
  eventSeq: number;
  eventReceivedAt: string;
  trace: TraceSummary;
}

export function applyLiveTraceEvent(
  rows: LiveTraceRow[],
  event: LiveTraceEvent,
  limit: number,
  paused: boolean,
): LiveTraceRow[] {
  if (paused || event.type === "heartbeat" || !event.trace) {
    return rows;
  }

  const nextRow: LiveTraceRow = {
    eventType: event.type,
    eventSeq: event.seq,
    eventReceivedAt: event.receivedAt,
    trace: event.trace,
  };
  const deduped = rows.filter((row) => row.trace.id !== event.trace?.id);
  return [nextRow, ...deduped].slice(0, normalizeLimit(limit));
}

export function createLiveTraceInputFromSearchParams(
  searchParams: URLSearchParams,
): LiveTraceInput {
  return {
    service: stringOrNull(searchParams.get("service")),
    query: stringOrNull(searchParams.get("query")),
    operationName: stringOrNull(searchParams.get("operationName")),
    spanName: stringOrNull(searchParams.get("spanName")),
    from: stringOrNull(searchParams.get("from")),
    status: traceStatusOrNull(searchParams.get("status")),
    minDurationMs: numberOrNull(searchParams.get("minDurationMs")),
    maxDurationMs: numberOrNull(searchParams.get("maxDurationMs")),
    attributes: attributeFiltersOrNull(searchParams.get("attributeKey")),
    limit: normalizeLimit(numberOrNull(searchParams.get("limit")) ?? defaultLiveLimit),
  };
}

export function liveTraceSubscriptionKey(input: LiveTraceInput) {
  return `LiveTrace:${JSON.stringify({
    attributes: input.attributes ?? null,
    from: input.from ?? null,
    limit: input.limit ?? defaultLiveLimit,
    maxDurationMs: input.maxDurationMs ?? null,
    minDurationMs: input.minDurationMs ?? null,
    operationName: input.operationName ?? null,
    query: input.query ?? null,
    service: input.service ?? null,
    spanName: input.spanName ?? null,
    status: input.status ?? null,
  })}`;
}

export function LiveRoute({ embedded = false }: { embedded?: boolean }) {
  const client = useTelemetryClient();
  const { viewer } = useAppSession();
  const ingestSettingsHref = viewer?.selectedProject
    ? `/projects/${encodeURIComponent(viewer.selectedProject.id)}/settings/ingest`
    : "/projects";
  const [searchParams, setSearchParams] = useSearchParams();
  const input = useMemo(() => createLiveTraceInputFromSearchParams(searchParams), [searchParams]);
  const subscriptionKey = useMemo(() => liveTraceSubscriptionKey(input), [input]);
  const subscriptionInputRef = useRef(input);
  const paused = searchParams.get("paused") === "true";
  const pausedRef = useRef(paused);
  const [rows, setRows] = useState<LiveTraceRow[]>([]);
  const [connectionState, setConnectionState] = useState<LiveTraceConnectionState>("connecting");
  const [subscriptionError, setSubscriptionError] = useState<unknown>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [copiedLiveUrl, setCopiedLiveUrl] = useState(false);
  const limit = normalizeLimit(input.limit ?? defaultLiveLimit);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    subscriptionInputRef.current = input;
  }, [input]);

  useEffect(() => {
    void retryNonce;
    if (!subscriptionKey) {
      return;
    }
    setConnectionState("connecting");
    setSubscriptionError(null);
    let subscription: { unsubscribe: () => void };
    try {
      subscription = client.subscribeLiveTraces(subscriptionInputRef.current, {
        onStateChange: setConnectionState,
        onEvent(event) {
          setRows((current) => applyLiveTraceEvent(current, event, limit, pausedRef.current));
        },
        onError(error) {
          setSubscriptionError(error);
          setConnectionState("error");
        },
      });
    } catch (error) {
      setSubscriptionError(error);
      setConnectionState("error");
      return;
    }

    return () => subscription.unsubscribe();
  }, [client, limit, retryNonce, subscriptionKey]);

  const setFilter = (name: keyof LiveTraceInput | "attributeKey", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    const key = name === "attributes" ? "attributeKey" : name;

    if (value && value.trim().length > 0) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setSearchParams(next, { replace: true });
  };

  const setPaused = (nextPaused: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (nextPaused) {
      next.set("paused", "true");
    } else {
      next.delete("paused");
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (embedded) {
      next.set("mode", "live");
    }
    if (paused) {
      next.set("paused", "true");
    }
    setSearchParams(next, { replace: true });
  };

  const copyLiveUrl = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setCopiedLiveUrl(true);
      window.setTimeout(() => setCopiedLiveUrl(false), 1400);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {embedded ? null : (
          <div>
            <h1 className="text-xl font-semibold tracking-normal">{t("live.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("live.description")}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <ConnectionBadge state={connectionState} />
          <Button onClick={() => void copyLiveUrl()} type="button" variant="outline">
            {copiedLiveUrl ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copiedLiveUrl ? t("actions.copied") : t("live.copyUrl")}
          </Button>
          <Button onClick={() => setPaused(!paused)} type="button" variant="outline">
            {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
            {paused ? t("live.resume") : t("live.pause")}
          </Button>
          <Button onClick={() => setRows([])} type="button" variant="outline">
            <Trash2 data-icon="inline-start" />
            {t("live.clearBuffer")}
          </Button>
        </div>
      </div>

      <LiveFilterBar
        input={input}
        limit={limit}
        onChange={setFilter}
        onClear={clearFilters}
        searchParams={searchParams}
      />

      {subscriptionError ? (
        <ErrorPanel
          error={subscriptionError}
          onRetry={() => setRetryNonce((current) => current + 1)}
          title={t("live.error")}
        />
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden border bg-background">
        {rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div>
              <h2 className="font-semibold">{paused ? t("live.emptyPaused") : t("live.empty")}</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {paused ? t("live.emptyPausedDescription") : t("state.empty.ingested.description")}
              </p>
            </div>
            <Button
              asChild={!paused}
              onClick={() => {
                if (paused) {
                  setPaused(false);
                }
              }}
            >
              {paused ? (
                <>
                  <Play data-icon="inline-start" />
                  {t("live.resume")}
                </>
              ) : (
                <Link to={ingestSettingsHref}>
                  <Settings data-icon="inline-start" />
                  {t("projects.checklist.copy.action")}
                </Link>
              )}
            </Button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <TraceTable result={{ items: rows.map((row) => row.trace), nextCursor: null }} />
          </div>
        )}
      </section>
    </section>
  );
}

function LiveFilterBar({
  input,
  limit,
  onChange,
  onClear,
  searchParams,
}: {
  input: LiveTraceInput;
  limit: number;
  onChange: (name: keyof LiveTraceInput | "attributeKey", value: string | null) => void;
  onClear: () => void;
  searchParams: URLSearchParams;
}) {
  const chips = activeLiveFilterChips(input, searchParams);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="rounded-md border bg-background p-3">
        <FieldGroup className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_150px]">
          <Field>
            <FieldLabel htmlFor="live-query">{t("filters.query")}</FieldLabel>
            <SearchInput
              id="live-query"
              onChange={(event) => onChange("query", event.target.value)}
              placeholder={t("filters.placeholder.query")}
              value={input.query ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-service">{t("filters.service")}</FieldLabel>
            <Input
              id="live-service"
              onChange={(event) => onChange("service", event.target.value)}
              placeholder={t("filters.placeholder.service")}
              value={input.service ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-operation">{t("filters.operation")}</FieldLabel>
            <Input
              id="live-operation"
              onChange={(event) => onChange("operationName", event.target.value)}
              placeholder={t("filters.placeholder.operation")}
              value={input.operationName ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-span-name">{t("filters.spanName")}</FieldLabel>
            <Input
              id="live-span-name"
              onChange={(event) => onChange("spanName", event.target.value)}
              placeholder={t("filters.placeholder.spanName")}
              value={input.spanName ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-status">{t("filters.status")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                onChange("status", value === allStatusesValue ? null : value)
              }
              value={input.status ?? allStatusesValue}
            >
              <SelectTrigger className="w-full" id="live-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allStatusesValue}>{t("filters.allStatuses")}</SelectItem>
                {traceStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <FieldGroup className="mt-3 grid gap-3 lg:grid-cols-[180px_140px_140px_170px_140px_auto]">
          <Field>
            <FieldLabel htmlFor="live-from">{t("filters.from")}</FieldLabel>
            <Input
              id="live-from"
              onChange={(event) => onChange("from", event.target.value)}
              placeholder="2026-05-10T12:00:00Z"
              value={input.from ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-min-duration">{t("filters.minDuration")}</FieldLabel>
            <Input
              id="live-min-duration"
              min={0}
              onChange={(event) => onChange("minDurationMs", event.target.value)}
              type="number"
              value={input.minDurationMs?.toString() ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-max-duration">{t("filters.maxDuration")}</FieldLabel>
            <Input
              id="live-max-duration"
              min={0}
              onChange={(event) => onChange("maxDurationMs", event.target.value)}
              type="number"
              value={input.maxDurationMs?.toString() ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-attribute-key">{t("filters.attributeKeys")}</FieldLabel>
            <Input
              id="live-attribute-key"
              onChange={(event) => onChange("attributeKey", event.target.value)}
              placeholder="http.route"
              value={searchParams.get("attributeKey") ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="live-limit">{t("live.limit")}</FieldLabel>
            <Input
              id="live-limit"
              max={maxLiveLimit}
              min={1}
              onChange={(event) => onChange("limit", event.target.value)}
              type="number"
              value={String(limit)}
            />
          </Field>
          <div className="flex items-end">
            <Button className="w-full" onClick={onClear} type="button" variant="outline">
              <X data-icon="inline-start" />
              {t("filters.clear")}
            </Button>
          </div>
        </FieldGroup>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              onRemove={() => onChange(chip.key, null)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function activeLiveFilterChips(input: LiveTraceInput, searchParams: URLSearchParams) {
  const chips: Array<{ key: keyof LiveTraceInput | "attributeKey"; label: string }> = [];
  if (input.query) chips.push({ key: "query", label: `${t("filters.query")}: ${input.query}` });
  if (input.service) {
    chips.push({ key: "service", label: `${t("filters.service")}: ${input.service}` });
  }
  if (input.operationName) {
    chips.push({
      key: "operationName",
      label: `${t("filters.operation")}: ${input.operationName}`,
    });
  }
  if (input.spanName) {
    chips.push({ key: "spanName", label: `${t("filters.spanName")}: ${input.spanName}` });
  }
  if (input.status) {
    chips.push({ key: "status", label: `${t("filters.status")}: ${input.status}` });
  }
  if (input.from) chips.push({ key: "from", label: `${t("filters.from")}: ${input.from}` });
  if (input.minDurationMs !== null && input.minDurationMs !== undefined) {
    chips.push({
      key: "minDurationMs",
      label: `${t("filters.minDuration")}: ${input.minDurationMs}`,
    });
  }
  if (input.maxDurationMs !== null && input.maxDurationMs !== undefined) {
    chips.push({
      key: "maxDurationMs",
      label: `${t("filters.maxDuration")}: ${input.maxDurationMs}`,
    });
  }
  const attributeKey = stringOrNull(searchParams.get("attributeKey"));
  if (attributeKey) {
    chips.push({ key: "attributeKey", label: `${t("filters.attributeKeys")}: ${attributeKey}` });
  }
  if ((input.limit ?? defaultLiveLimit) !== defaultLiveLimit) {
    chips.push({ key: "limit", label: `${t("live.limit")}: ${input.limit ?? defaultLiveLimit}` });
  }
  return chips;
}

function ConnectionBadge({ state }: { state: LiveTraceConnectionState }) {
  const variant = state === "error" ? "destructive" : state === "live" ? "secondary" : "outline";
  return <Badge variant={variant}>{t(`live.state.${state}`)}</Badge>;
}

function stringOrNull(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function traceStatusOrNull(value: string | null): TraceStatus | null {
  return traceStatuses.includes(value as TraceStatus) ? (value as TraceStatus) : null;
}

function numberOrNull(value: string | null) {
  const normalized = stringOrNull(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLimit(value: number) {
  if (!Number.isFinite(value)) {
    return defaultLiveLimit;
  }
  return Math.min(maxLiveLimit, Math.max(1, Math.trunc(value)));
}

function attributeFiltersOrNull(value: string | null) {
  const key = stringOrNull(value);
  return key ? [{ key, operator: "exists" as const }] : null;
}
