import type { FacetValue, TraceSearchInput, TraceSort, TraceStatus } from "@cloudgrid/ui-contracts";
import { SlidersHorizontal, X } from "lucide-react";
import { FilterChip } from "../../components/filter-chip";
import { SearchInput } from "../../components/search-input";
import { Button } from "../../components/ui/button";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { t } from "../../lib/i18n";
import { ServiceMultiSelect } from "../telemetry/service-multi-select";

const statuses: TraceStatus[] = ["ok", "error", "unset"];
const sorts: TraceSort[] = [
  "startedAt_desc",
  "startedAt_asc",
  "duration_desc",
  "duration_asc",
  "errorFirst",
];

function traceSortLabel(sort: TraceSort) {
  switch (sort) {
    case "startedAt_asc":
      return t("sort.startedAt_asc");
    case "duration_desc":
      return t("sort.duration_desc");
    case "duration_asc":
      return t("sort.duration_asc");
    case "errorFirst":
      return t("sort.errorFirst");
    case "startedAt_desc":
      return t("sort.startedAt_desc");
  }
}

export function TraceFilters({
  serviceOptions,
  filters,
  onChange,
  onServicesChange,
  onClear,
}: {
  serviceOptions?: FacetValue[] | undefined;
  filters: TraceSearchInput;
  onChange: (name: keyof TraceSearchInput | "attributeKey", value: string | null) => void;
  onServicesChange: (services: string[]) => void;
  onClear: () => void;
}) {
  const chips = activeTraceFilterChips(filters);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="rounded-md border bg-background p-3">
        <FieldGroup className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_auto_auto]">
          <Field>
            <FieldLabel htmlFor="trace-query">{t("filters.query")}</FieldLabel>
            <SearchInput
              id="trace-query"
              onChange={(event) => onChange("query", event.target.value)}
              placeholder={t("filters.placeholder.query")}
              value={filters.query ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-service">{t("filters.service")}</FieldLabel>
            <ServiceMultiSelect
              id="trace-service"
              onChange={onServicesChange}
              options={serviceOptions}
              placeholder={t("filters.placeholder.service")}
              selected={filters.services ?? (filters.service ? [filters.service] : [])}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-status">{t("filters.status")}</FieldLabel>
            <Select
              onValueChange={(value) => onChange("status", value === "all" ? null : value)}
              value={filters.status ?? "all"}
            >
              <SelectTrigger className="w-full" id="trace-status">
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
          <div className="flex items-end">
            <TraceMoreFilters filters={filters} onChange={onChange} />
          </div>
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

function TraceMoreFilters({
  filters,
  onChange,
}: {
  filters: TraceSearchInput;
  onChange: (name: keyof TraceSearchInput | "attributeKey", value: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="w-full" type="button" variant="outline">
          <SlidersHorizontal data-icon="inline-start" />
          {t("filters.more")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] max-w-[calc(100vw-2rem)]">
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="trace-operation">{t("filters.operation")}</FieldLabel>
            <Input
              id="trace-operation"
              onChange={(event) => onChange("operationName", event.target.value)}
              placeholder={t("filters.placeholder.operation")}
              value={filters.operationName ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-span-name">{t("filters.spanName")}</FieldLabel>
            <Input
              id="trace-span-name"
              onChange={(event) => onChange("spanName", event.target.value)}
              placeholder={t("filters.placeholder.spanName")}
              value={filters.spanName ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-from">{t("filters.from")}</FieldLabel>
            <Input
              id="trace-from"
              onChange={(event) => onChange("from", event.target.value)}
              type="datetime-local"
              value={filters.from ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-to">{t("filters.to")}</FieldLabel>
            <Input
              id="trace-to"
              onChange={(event) => onChange("to", event.target.value)}
              type="datetime-local"
              value={filters.to ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-min-duration">{t("filters.minDuration")}</FieldLabel>
            <Input
              id="trace-min-duration"
              min="0"
              onChange={(event) => onChange("minDurationMs", event.target.value)}
              type="number"
              value={filters.minDurationMs ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-max-duration">{t("filters.maxDuration")}</FieldLabel>
            <Input
              id="trace-max-duration"
              min="0"
              onChange={(event) => onChange("maxDurationMs", event.target.value)}
              type="number"
              value={filters.maxDurationMs ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="trace-sort">{t("filters.sort")}</FieldLabel>
            <Select
              onValueChange={(value) => onChange("sort", value)}
              value={filters.sort ?? "startedAt_desc"}
            >
              <SelectTrigger className="w-full" id="trace-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {traceSortLabel(sort)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}

function activeTraceFilterChips(filters: TraceSearchInput) {
  const chips: Array<{ key: keyof TraceSearchInput | "attributeKey"; label: string }> = [];
  if (filters.query) chips.push({ key: "query", label: `${t("filters.query")}: ${filters.query}` });
  const services = filters.services ?? (filters.service ? [filters.service] : []);
  if (services.length > 0) {
    chips.push({ key: "service", label: `${t("filters.service")}: ${services.join(", ")}` });
  }
  if (filters.operationName) {
    chips.push({
      key: "operationName",
      label: `${t("filters.operation")}: ${filters.operationName}`,
    });
  }
  if (filters.spanName) {
    chips.push({ key: "spanName", label: `${t("filters.spanName")}: ${filters.spanName}` });
  }
  if (filters.status) {
    chips.push({ key: "status", label: `${t("filters.status")}: ${filters.status}` });
  }
  if (filters.from) chips.push({ key: "from", label: `${t("filters.from")}: ${filters.from}` });
  if (filters.to) chips.push({ key: "to", label: `${t("filters.to")}: ${filters.to}` });
  if (filters.minDurationMs !== null && filters.minDurationMs !== undefined) {
    chips.push({
      key: "minDurationMs",
      label: `${t("filters.minDuration")}: ${filters.minDurationMs}`,
    });
  }
  if (filters.maxDurationMs !== null && filters.maxDurationMs !== undefined) {
    chips.push({
      key: "maxDurationMs",
      label: `${t("filters.maxDuration")}: ${filters.maxDurationMs}`,
    });
  }
  if (filters.attributes?.[0]?.key) {
    chips.push({
      key: "attributeKey",
      label: `${t("filters.attributeKeys")}: ${filters.attributes[0].key}`,
    });
  }
  if (filters.sort && filters.sort !== "startedAt_desc") {
    chips.push({ key: "sort", label: `${t("filters.sort")}: ${filters.sort}` });
  }
  return chips;
}
