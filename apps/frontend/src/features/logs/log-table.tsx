import type { JSONValue, LogEvent, LogSearchResult, LogSort } from "@cloudgrid/ui-contracts";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { CodeBlock } from "../../components/code-block";
import { CopyButton } from "../../components/copy-button";
import { JsonViewer } from "../../components/json-viewer";
import { SearchInput } from "../../components/search-input";
import { Button } from "../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
  type TableSortDirection,
} from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { formatDateTime, jsonPreview } from "../../lib/format";
import { t } from "../../lib/i18n";
import { LogTracePreview } from "./log-trace-preview";

export function LogTable({
  onSelectLog,
  onSortChange,
  result,
  selectedLogId,
  sort,
}: {
  onSelectLog?: (log: LogEvent) => void;
  onSortChange?: (sort: LogSort | null) => void;
  result: LogSearchResult;
  selectedLogId?: string | null;
  sort?: LogSort | null;
}) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const effectiveSort = sort ?? null;
  const setSort = (value: LogSort | null) => {
    onSortChange?.(value);
  };
  const timestampDirection: TableSortDirection =
    effectiveSort === "timestamp_asc" ? "asc" : effectiveSort === "timestamp_desc" ? "desc" : null;
  const severityDirection: TableSortDirection = effectiveSort === "severity_desc" ? "desc" : null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead
            direction={timestampDirection}
            onSort={() =>
              setSort(effectiveSort === "timestamp_desc" ? "timestamp_asc" : "timestamp_desc")
            }
          >
            {t("logs.column.timestamp")}
          </SortableTableHead>
          <SortableTableHead
            direction={severityDirection}
            onSort={() =>
              setSort(effectiveSort === "severity_desc" ? "timestamp_desc" : "severity_desc")
            }
          >
            {t("logs.column.severity")}
          </SortableTableHead>
          <TableHead>{t("logs.column.service")}</TableHead>
          <TableHead>{t("logs.column.trace")}</TableHead>
          <TableHead>{t("logs.column.span")}</TableHead>
          <TableHead>{t("logs.column.attributes")}</TableHead>
          <TableHead>{t("logs.column.body")}</TableHead>
          <TableHead className="w-20">{t("logs.column.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.items.map((log) => {
          const isExpanded = expandedLogId === log.id;
          const toggleLabel = isExpanded ? t("actions.collapse") : t("actions.expand");

          return (
            <Fragment key={log.id}>
              <TableRow
                className={selectedLogId === log.id ? "bg-muted/60" : undefined}
                onClick={() => onSelectLog?.(log)}
              >
                <TableCell title={log.timestamp}>{formatDateTime(log.timestamp)}</TableCell>
                <TableCell>{log.severityText ?? t("value.unknown")}</TableCell>
                <TableCell>{log.serviceName ?? t("value.unknown")}</TableCell>
                <TableCell className="max-w-56 truncate font-mono text-xs">
                  {log.traceId ? (
                    <div className="flex min-w-0 items-center gap-1">
                      <Link
                        className="truncate underline underline-offset-4"
                        onClick={(event) => event.stopPropagation()}
                        to={`/traces/${log.traceId}`}
                      >
                        {log.traceId}
                      </Link>
                      <LogTracePreview spanId={log.spanId ?? null} traceId={log.traceId} />
                    </div>
                  ) : (
                    t("value.none")
                  )}
                </TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs">
                  {log.traceId && log.spanId ? (
                    <Link
                      className="underline underline-offset-4"
                      onClick={(event) => event.stopPropagation()}
                      to={`/traces/${log.traceId}?spanId=${log.spanId}`}
                    >
                      {log.spanId}
                    </Link>
                  ) : (
                    (log.spanId ?? t("value.none"))
                  )}
                </TableCell>
                <TableCell>{attributeRows(log.attributes).length}</TableCell>
                <TableCell className="max-w-96">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs">{jsonPreview(log.body)}</span>
                    <Button
                      className="lg:hidden"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedLogId(isExpanded ? null : log.id);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {isExpanded ? (
                        <ChevronUp data-icon="inline-start" />
                      ) : (
                        <ChevronDown data-icon="inline-start" />
                      )}
                      {toggleLabel}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <CopyValueButton ariaLabel="Copy log ID" value={log.id} />
                    {log.traceId ? (
                      <Button
                        aria-label={t("actions.openTrace")}
                        asChild
                        onClick={(event) => event.stopPropagation()}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <Link
                          to={`/traces/${log.traceId}${log.spanId ? `?spanId=${log.spanId}` : ""}`}
                        >
                          <ExternalLink />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {isExpanded ? (
                <TableRow className="lg:hidden">
                  <TableCell colSpan={8}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <JsonViewer value={log.body} />
                      <JsonViewer value={log.attributes} />
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function LogInspector({
  log,
  onTabChange,
  tab,
}: {
  log: LogEvent | null;
  onTabChange: (tab: "body" | "attributes" | "correlation") => void;
  tab: "body" | "attributes" | "correlation";
}) {
  if (!log) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <h2 className="font-semibold">{t("logs.select.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("logs.select.description")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{log.id}</h2>
          <CopyValueButton ariaLabel="Copy log ID" value={log.id} />
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</p>
      </div>
      <Tabs
        className="min-h-0 flex-1 gap-0"
        onValueChange={(value) => onTabChange(value as "body" | "attributes" | "correlation")}
        value={tab}
      >
        <div className="shrink-0 border-b px-3 py-2">
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="body">{t("traceDetail.body")}</TabsTrigger>
            <TabsTrigger value="attributes">{t("traceDetail.attributes")}</TabsTrigger>
            <TabsTrigger value="correlation">{t("logs.correlation")}</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <TabsContent className="m-0" value="body">
            <LogBodyPanel log={log} />
          </TabsContent>
          <TabsContent className="m-0" value="attributes">
            <LogAttributesPanel attributes={log.attributes} />
          </TabsContent>
          <TabsContent className="m-0" value="correlation">
            <LogCorrelationPanel log={log} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function LogBodyPanel({ log }: { log: LogEvent }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("traceDetail.body")}</h3>
        <CopyValueButton ariaLabel={t("logs.copyBody")} value={stringifyCopyValue(log.body)} />
      </div>
      {isScalar(log.body) ? (
        <CodeBlock code={String(log.body)} language="log" maxHeightClassName="max-h-64" />
      ) : (
        <JsonViewer value={log.body} />
      )}
      <Collapsible className="rounded-md border p-2">
        <CollapsibleTrigger asChild>
          <Button className="h-7 justify-start px-2 text-xs" type="button" variant="ghost">
            <ChevronDown data-icon="inline-start" />
            {t("logs.rawJson")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <JsonViewer value={log.body} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function LogAttributesPanel({ attributes }: { attributes: JSONValue }) {
  const [query, setQuery] = useState("");
  const rows = attributeRows(attributes).filter((row) =>
    `${row.key} ${row.value}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = groupAttributeRows(rows);

  return (
    <section className="flex flex-col gap-3">
      <SearchInput
        aria-label={t("traceDetail.searchAttributes")}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("traceDetail.searchAttributes")}
        value={query}
      />
      {groups.map((group) => (
        <div className="flex flex-col gap-1" key={group.label}>
          <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
          <div className="divide-y rounded-md border">
            {group.rows.map((row) => (
              <AttributeRow key={row.key} row={row} />
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("logs.noAttributesMatch")}</p>
      ) : null}
      <Collapsible className="rounded-md border p-2">
        <CollapsibleTrigger asChild>
          <Button className="h-7 justify-start px-2 text-xs" type="button" variant="ghost">
            <ChevronDown data-icon="inline-start" />
            {t("logs.rawAttributes")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <JsonViewer value={attributes} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function LogCorrelationPanel({ log }: { log: LogEvent }) {
  return (
    <section className="flex flex-col gap-3">
      <dl className="grid gap-2 text-sm">
        <CorrelationRow label={t("filters.status")}>{log.correlation}</CorrelationRow>
        <CorrelationRow label={t("filters.service")}>
          {log.serviceName ?? t("value.unknown")}
        </CorrelationRow>
        <CorrelationRow label={t("logs.column.timestamp")}>
          {formatDateTime(log.timestamp)}
        </CorrelationRow>
        <CopyableCorrelationRow label={t("logs.column.trace")} value={log.traceId} />
        <CopyableCorrelationRow label={t("logs.column.span")} value={log.spanId} />
      </dl>
      {log.traceId ? (
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link to={`/traces/${log.traceId}`}>
              <ExternalLink data-icon="inline-start" />
              {t("actions.openTrace")}
            </Link>
          </Button>
          {log.spanId ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/traces/${log.traceId}?spanId=${log.spanId}`}>
                <ExternalLink data-icon="inline-start" />
                {t("actions.openSpan")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CorrelationRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-xs">{children}</dd>
    </div>
  );
}

function CopyableCorrelationRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_2rem] items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-xs">{value ?? t("value.none")}</dd>
      {value ? (
        <CopyValueButton ariaLabel={`Copy ${label.toLowerCase()} ID`} value={value} />
      ) : (
        <span />
      )}
    </div>
  );
}

function AttributeRow({ row }: { row: { key: string; value: string } }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_2rem_2rem] items-center gap-2 px-2 py-1.5 text-xs">
      <code className="min-w-0 truncate">{row.key}</code>
      <code className="min-w-0 truncate text-muted-foreground">{row.value}</code>
      <CopyValueButton ariaLabel={`Copy attribute key ${row.key}`} value={row.key} />
      <CopyValueButton ariaLabel={`Copy attribute value ${row.key}`} value={row.value} />
    </div>
  );
}

function CopyValueButton({ ariaLabel, value }: { ariaLabel: string; value: string }) {
  return <CopyButton aria-label={ariaLabel} value={value} />;
}

function attributeRows(value: JSONValue): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).map(([key, item]) => ({
    key,
    value: stringifyCopyValue(item),
  }));
}

function groupAttributeRows(rows: Array<{ key: string; value: string }>) {
  const groupNames = ["service", "http", "db", "rpc", "net", "cloud", "host", "process", "log"];
  const groups = groupNames
    .map((prefix) => ({
      label: prefix.toUpperCase(),
      rows: rows.filter((row) => row.key.startsWith(`${prefix}.`)),
    }))
    .filter((group) => group.rows.length > 0);
  const groupedKeys = new Set(groups.flatMap((group) => group.rows.map((row) => row.key)));
  const rawRows = rows.filter((row) => !groupedKeys.has(row.key));

  return rawRows.length > 0 ? [...groups, { label: "Raw attributes", rows: rawRows }] : groups;
}

function stringifyCopyValue(value: JSONValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isScalar(value: JSONValue): boolean {
  return value === null || typeof value !== "object";
}
