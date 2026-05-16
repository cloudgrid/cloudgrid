import type { Span } from "@cloudgrid/ui-contracts";
import { AlertTriangle, Filter, X } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "../../components/code-block";
import { SearchInput } from "../../components/search-input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { formatDateTime, formatDuration, jsonPreview } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { AttributeEvidenceBrowser } from "./attribute-browser";
import { SpanLinksTable } from "./span-links-table";
import {
  type DetailTab,
  type TraceDetailFilters,
  detailTabs,
  statuses,
  tabLabel,
} from "./trace-detail-types";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function activeSpanFilterCount(traceFilters: TraceDetailFilters) {
  return [
    traceFilters.filters.spanQuery,
    traceFilters.filters.spanService,
    traceFilters.filters.spanName,
    traceFilters.filters.spanStatus,
    traceFilters.filters.minSpanDurationMs,
    traceFilters.filters.maxSpanDurationMs,
    traceFilters.filters.showMatchesOnly,
    traceFilters.errorsOnly,
    traceFilters.criticalPathOnly,
  ].filter((value) => value !== null && value !== undefined && value !== "" && value !== false)
    .length;
}

export function SpanFiltersDialog({ traceFilters }: { traceFilters: TraceDetailFilters }) {
  const activeCount = activeSpanFilterCount(traceFilters);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("traceDetail.spanFilters")}
              className="relative"
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Filter />
              {activeCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {activeCount}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("traceDetail.spanFilters")}</TooltipContent>
        </Tooltip>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("traceDetail.spanFilters")}</DialogTitle>
          <DialogDescription>{t("traceDetail.spanFiltersHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FieldGroup className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr]">
            <Field>
              <FieldLabel htmlFor="span-query">{t("filters.search")}</FieldLabel>
              <SearchInput
                id="span-query"
                onChange={(event) => traceFilters.setFilter("spanQuery", event.target.value)}
                placeholder={t("filters.placeholder.query")}
                value={traceFilters.filters.spanQuery ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="span-service">{t("filters.service")}</FieldLabel>
              <Input
                id="span-service"
                onChange={(event) => traceFilters.setFilter("spanService", event.target.value)}
                placeholder={t("filters.placeholder.service")}
                value={traceFilters.filters.spanService ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="span-name">{t("filters.spanName")}</FieldLabel>
              <Input
                id="span-name"
                onChange={(event) => traceFilters.setFilter("spanName", event.target.value)}
                placeholder={t("filters.placeholder.spanName")}
                value={traceFilters.filters.spanName ?? ""}
              />
            </Field>
          </FieldGroup>
          <FieldGroup className="grid gap-3 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="span-status">{t("filters.status")}</FieldLabel>
              <Select
                onValueChange={(value) =>
                  traceFilters.setFilter("spanStatus", value === "all" ? null : value)
                }
                value={traceFilters.filters.spanStatus ?? "all"}
              >
                <SelectTrigger className="w-full" id="span-status">
                  <SelectValue placeholder={t("filters.allStatuses")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="span-min-duration">{t("filters.minDuration")}</FieldLabel>
              <Input
                id="span-min-duration"
                min="0"
                onChange={(event) =>
                  traceFilters.setFilter("minSpanDurationMs", event.target.value)
                }
                type="number"
                value={traceFilters.filters.minSpanDurationMs ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="span-max-duration">{t("filters.maxDuration")}</FieldLabel>
              <Input
                id="span-max-duration"
                min="0"
                onChange={(event) =>
                  traceFilters.setFilter("maxSpanDurationMs", event.target.value)
                }
                type="number"
                value={traceFilters.filters.maxSpanDurationMs ?? ""}
              />
            </Field>
          </FieldGroup>
          <ToggleGroup
            className="flex-wrap justify-start"
            onValueChange={(values) => {
              traceFilters.setBooleanFilters({
                errorsOnly: values.includes("errorsOnly"),
                criticalPathOnly: values.includes("criticalPathOnly"),
                showMatchesOnly: values.includes("showMatchesOnly"),
              });
            }}
            size="sm"
            type="multiple"
            value={[
              traceFilters.errorsOnly ? "errorsOnly" : null,
              traceFilters.criticalPathOnly ? "criticalPathOnly" : null,
              traceFilters.filters.showMatchesOnly ? "showMatchesOnly" : null,
            ].filter((value): value is string => Boolean(value))}
            variant="outline"
          >
            <ToggleGroupItem value="errorsOnly">{t("filters.errorsOnly")}</ToggleGroupItem>
            <ToggleGroupItem value="criticalPathOnly">
              {t("filters.criticalPathOnly")}
            </ToggleGroupItem>
            <ToggleGroupItem value="showMatchesOnly">{t("filters.matchesOnly")}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <DialogFooter>
          <Button onClick={traceFilters.clearFilters} type="button" variant="ghost">
            <X data-icon="inline-start" />
            {t("filters.clear")}
          </Button>
          <DialogClose asChild>
            <Button type="button">
              <X data-icon="inline-start" />
              {t("actions.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SpanInspector({
  currentTraceId,
  selectedSpan,
  selectedTab,
  setTab,
  onSelectSpanId,
}: {
  currentTraceId: string;
  selectedSpan: Span | null;
  selectedTab: DetailTab;
  setTab: (tab: DetailTab) => void;
  onSelectSpanId: (spanId: string) => void;
}) {
  const [attributeSearch, setAttributeSearch] = useState("");

  return (
    <aside className="flex h-full min-w-0 flex-col">
      <div className="border-b px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{t("traceDetail.selectedSpan")}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {selectedSpan?.name ?? t("traceDetail.noSelectedSpan")}
            </p>
          </div>
          {selectedSpan ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                selectedSpan.status === "error" && "font-medium text-error",
              )}
            >
              {selectedSpan.status === "error" ? <AlertTriangle className="size-3" /> : null}
              {selectedSpan.status ?? t("value.unknown")}
            </span>
          ) : null}
        </div>
        {selectedSpan ? (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Metric label="Span ID" value={selectedSpan.id} />
            <Metric
              label="Parent span"
              value={selectedSpan.parentSpanId ?? t("traceDetail.root")}
            />
            <Metric
              label={t("logs.column.service")}
              value={selectedSpan.serviceName ?? t("value.unknown")}
            />
            <Metric label={t("traceDetail.kind")} value={selectedSpan.kind ?? t("value.unknown")} />
            <Metric
              label={t("traceDetail.duration")}
              value={formatDuration(selectedSpan.durationMs)}
            />
            <Metric label={t("traceDetail.depth")} value={selectedSpan.depth} />
          </div>
        ) : null}
      </div>
      {selectedSpan ? (
        <Tabs
          className="flex min-h-0 flex-1 flex-col px-3 py-3"
          onValueChange={(value) => setTab(value as DetailTab)}
          value={selectedTab}
        >
          <div className="relative shrink-0 overflow-x-auto border-b pb-2 [scrollbar-width:thin]">
            <TabsList className="h-9 w-max min-w-full justify-start" variant="line">
              {detailTabs.map((tab) => (
                <TabsTrigger className="h-8 flex-none px-3" key={tab} value={tab}>
                  {tabLabel(tab)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <ScrollArea className="mt-3 min-h-0 flex-1">
            <TabsContent value="attributes">
              <AttributeEvidenceBrowser
                attributes={selectedSpan.attributes}
                search={attributeSearch}
                setSearch={setAttributeSearch}
              />
            </TabsContent>
            <TabsContent value="events">
              <EventsTable span={selectedSpan} />
            </TabsContent>
            <TabsContent value="exceptions">
              <ExceptionsList span={selectedSpan} />
            </TabsContent>
            <TabsContent value="links">
              <SpanLinksTable
                currentTraceId={currentTraceId}
                links={selectedSpan.links}
                onSelectSpanId={onSelectSpanId}
              />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      ) : (
        <p className="p-3 text-sm text-muted-foreground">{t("traceDetail.noSelectedSpan")}</p>
      )}
    </aside>
  );
}

function EventsTable({ span }: { span: Span }) {
  if (span.events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("traceDetail.noItems")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("logs.column.timestamp")}</TableHead>
          <TableHead>{t("filters.spanName")}</TableHead>
          <TableHead>{t("traceDetail.attributes")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {span.events.map((event) => (
          <TableRow key={`${event.timestamp}-${event.name}`}>
            <TableCell>{formatDateTime(event.timestamp)}</TableCell>
            <TableCell>{event.name}</TableCell>
            <TableCell className="max-w-64 truncate font-mono text-xs">
              {jsonPreview(event.attributes)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExceptionsList({ span }: { span: Span }) {
  if (span.exceptions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("traceDetail.noItems")}</p>;
  }

  return (
    <Accordion className="rounded-md border px-3" collapsible type="single">
      {span.exceptions.map((exception) => (
        <AccordionItem key={exception.timestamp} value={`exception-${exception.timestamp}`}>
          <AccordionTrigger>
            <span className="min-w-0 truncate">
              {exception.type ?? t("value.unknown")} · {exception.message ?? t("value.none")}
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            {exception.frames.length > 0 ? (
              <div className="flex flex-col gap-1">
                {exception.frames.map((frame) => (
                  <CodeBlock
                    code={frame.raw}
                    key={frame.raw}
                    language="log"
                    maxHeightClassName="max-h-28"
                    title={frame.functionName ?? t("traceDetail.exceptionMarkers")}
                  />
                ))}
              </div>
            ) : exception.stacktrace ? (
              <CodeBlock
                code={exception.stacktrace}
                language="log"
                maxHeightClassName="max-h-64"
                title={exception.type ?? t("traceDetail.exceptions")}
              />
            ) : null}
            <AttributeEvidenceBrowser
              attributes={exception.attributes}
              search=""
              setSearch={() => {}}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
