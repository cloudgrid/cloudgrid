import type { JSONValue } from "@cloudgrid/ui-contracts";
import { Badge } from "../../../components/ui/badge";
import { t } from "../../../lib/i18n";
import { formatDateTime, jsonPreview } from "../../../lib/format";

type LogEntry = {
  id: string;
  timestamp: string;
  severityText?: string | null;
  severityNumber?: number | null;
  serviceName?: string | null;
  body?: unknown;
};

type LogSearchResult = {
  items: LogEntry[];
};

export function LogWidgetPreview({ result }: { result: LogSearchResult }) {
  if (result.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("state.empty.filtered.title")}</p>;
  }

  return (
    <div className="grid gap-2 text-xs">
      {result.items.slice(0, 8).map((log) => (
        <div
          className="grid grid-cols-[7.5rem_5rem_minmax(0,1fr)] gap-2 border-b pb-2"
          key={log.id}
        >
          <span className="truncate text-muted-foreground" title={log.timestamp}>
            {formatDateTime(log.timestamp)}
          </span>
          <Badge variant="outline">{log.severityText ?? log.severityNumber ?? "-"}</Badge>
          <span className="min-w-0">
            <span className="block truncate">{log.serviceName ?? t("value.unknown")}</span>
            <code className="block truncate text-muted-foreground">
              {jsonPreview(log.body as JSONValue)}
            </code>
          </span>
        </div>
      ))}
    </div>
  );
}
