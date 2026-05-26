import type { TraceStatus } from "@cloudgrid/ui-contracts";
import { Badge } from "../../../components/ui/badge";
import { t } from "../../../lib/i18n";
import { formatDuration, statusVariant } from "../../../lib/format";

type TraceEntry = {
  id: string;
  serviceName?: string | null;
  durationMs?: number | null;
  status?: TraceStatus | null;
};

type TraceSearchResult = {
  items: TraceEntry[];
};

export function TraceWidgetPreview({ result }: { result: TraceSearchResult }) {
  if (result.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("state.empty.filtered.title")}</p>;
  }

  return (
    <div className="grid gap-2 text-xs">
      {result.items.slice(0, 8).map((trace) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 border-b pb-2"
          key={trace.id}
        >
          <span className="min-w-0">
            <span className="block truncate">{trace.serviceName ?? t("value.unknown")}</span>
            <code className="block truncate text-muted-foreground">{trace.id}</code>
          </span>
          <span className="font-mono">{formatDuration(trace.durationMs)}</span>
          <Badge variant={statusVariant(trace.status)}>{trace.status ?? t("value.unknown")}</Badge>
        </div>
      ))}
    </div>
  );
}
