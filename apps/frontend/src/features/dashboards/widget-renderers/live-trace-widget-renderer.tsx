import { useEffect, useState } from "react";
import type { LiveTraceInput, TraceStatus } from "@cloudgrid/ui-contracts";
import { Badge } from "../../../components/ui/badge";
import { ErrorPanel } from "../../../components/query-state";
import { t } from "../../../lib/i18n";
import { formatDuration, statusVariant } from "../../../lib/format";
import type { useTelemetryClient } from "../../../providers/telemetry-client-provider";

type TraceEntry = {
  id: string;
  serviceName?: string | null;
  durationMs?: number | null;
  status?: TraceStatus | null;
};

export function LiveTraceWidgetPreview({
  input,
  telemetryClient,
}: {
  input: LiveTraceInput;
  telemetryClient: ReturnType<typeof useTelemetryClient>;
}) {
  const inputKey = JSON.stringify(input);
  const [rows, setRows] = useState<TraceEntry[]>([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [subscriptionError, setSubscriptionError] = useState<unknown>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    void retryNonce;
    const subscriptionInput = JSON.parse(inputKey) as LiveTraceInput;
    const limit = subscriptionInput.limit ?? 50;
    setRows([]);
    setConnectionState("connecting");
    setSubscriptionError(null);

    const subscription = telemetryClient.subscribeLiveTraces(subscriptionInput, {
      onStateChange: setConnectionState,
      onEvent(event) {
        if (event.type === "heartbeat" || !event.trace) {
          return;
        }
        const trace = event.trace;
        setRows((current) => {
          const deduped = current.filter((candidate) => candidate.id !== trace.id);
          return [trace, ...deduped].slice(0, limit);
        });
      },
      onError(error) {
        setSubscriptionError(error);
        setConnectionState("error");
      },
    });

    return () => subscription.unsubscribe();
  }, [inputKey, retryNonce, telemetryClient]);

  if (subscriptionError) {
    return (
      <ErrorPanel
        error={subscriptionError}
        onRetry={() => setRetryNonce((current) => current + 1)}
      />
    );
  }

  return (
    <div className="grid gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline">{connectionState}</Badge>
        <Badge variant="secondary">
          {rows.length} {t("traces.title")}
        </Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("live.empty")}</p>
      ) : (
        rows.slice(0, 8).map((trace) => (
          <div
            className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-b pb-2"
            key={trace.id}
          >
            <span className="min-w-0">
              <span className="block truncate">{trace.serviceName ?? t("value.unknown")}</span>
              <code className="block truncate text-muted-foreground">{trace.id}</code>
            </span>
            <span className="font-mono">{formatDuration(trace.durationMs)}</span>
            <Badge variant={statusVariant(trace.status)}>
              {trace.status ?? t("value.unknown")}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}
