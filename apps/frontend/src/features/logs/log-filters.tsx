import type { LogSearchInput, LogSort, TelemetryFacetResult } from "@cloudgrid/ui-contracts";
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

const sorts: LogSort[] = ["timestamp_desc", "timestamp_asc", "severity_desc"];

function logSortLabel(sort: LogSort) {
  switch (sort) {
    case "timestamp_asc":
      return t("sort.timestamp_asc");
    case "severity_desc":
      return t("sort.severity_desc");
    case "timestamp_desc":
      return t("sort.timestamp_desc");
  }
}

export function LogFilters({
  facets,
  filters,
  onChange,
  onServicesChange,
  onClear,
}: {
  facets?: TelemetryFacetResult | undefined;
  filters: LogSearchInput;
  onChange: (name: keyof LogSearchInput, value: string | null) => void;
  onServicesChange: (services: string[]) => void;
  onClear: () => void;
}) {
  const chips = activeLogFilterChips(filters);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="rounded-md border bg-background p-3">
        <FieldGroup className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px_auto_auto]">
          <Field>
            <FieldLabel htmlFor="log-search">{t("filters.search")}</FieldLabel>
            <SearchInput
              id="log-search"
              onChange={(event) => onChange("search", event.target.value)}
              placeholder={t("filters.placeholder.search")}
              value={filters.search ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-service">{t("filters.service")}</FieldLabel>
            <ServiceMultiSelect
              id="log-service"
              onChange={onServicesChange}
              options={facets?.services}
              placeholder={t("filters.placeholder.service")}
              selected={filters.services ?? (filters.service ? [filters.service] : [])}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-severity">{t("filters.severity")}</FieldLabel>
            <Select
              onValueChange={(value) => onChange("severity", value === "all" ? null : value)}
              value={filters.severity ?? "all"}
            >
              <SelectTrigger className="w-full" id="log-severity">
                <SelectValue placeholder={t("filters.allSeverities")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filters.allSeverities")}</SelectItem>
                {facets?.severities.map((facet) => (
                  <SelectItem key={facet.value} value={facet.value}>
                    {facet.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end">
            <LogMoreFilters filters={filters} onChange={onChange} />
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

function LogMoreFilters({
  filters,
  onChange,
}: {
  filters: LogSearchInput;
  onChange: (name: keyof LogSearchInput, value: string | null) => void;
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
            <FieldLabel htmlFor="log-trace">{t("filters.traceId")}</FieldLabel>
            <Input
              id="log-trace"
              onChange={(event) => onChange("traceId", event.target.value)}
              placeholder={t("filters.placeholder.traceId")}
              value={filters.traceId ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-span">{t("filters.spanId")}</FieldLabel>
            <Input
              id="log-span"
              onChange={(event) => onChange("spanId", event.target.value)}
              placeholder={t("filters.placeholder.spanId")}
              value={filters.spanId ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-from">{t("filters.from")}</FieldLabel>
            <Input
              id="log-from"
              onChange={(event) => onChange("from", event.target.value)}
              type="datetime-local"
              value={filters.from ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-to">{t("filters.to")}</FieldLabel>
            <Input
              id="log-to"
              onChange={(event) => onChange("to", event.target.value)}
              type="datetime-local"
              value={filters.to ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="log-sort">{t("filters.sort")}</FieldLabel>
            <Select
              onValueChange={(value) => onChange("sort", value)}
              value={filters.sort ?? "timestamp_desc"}
            >
              <SelectTrigger className="w-full" id="log-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorts.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {logSortLabel(sort)}
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

function activeLogFilterChips(filters: LogSearchInput) {
  const chips: Array<{ key: keyof LogSearchInput; label: string }> = [];
  if (filters.search) {
    chips.push({ key: "search", label: `${t("filters.search")}: ${filters.search}` });
  }
  const services = filters.services ?? (filters.service ? [filters.service] : []);
  if (services.length > 0) {
    chips.push({ key: "service", label: `${t("filters.service")}: ${services.join(", ")}` });
  }
  if (filters.severity) {
    chips.push({ key: "severity", label: `${t("filters.severity")}: ${filters.severity}` });
  }
  if (filters.traceId) {
    chips.push({ key: "traceId", label: `${t("filters.traceId")}: ${filters.traceId}` });
  }
  if (filters.spanId) {
    chips.push({ key: "spanId", label: `${t("filters.spanId")}: ${filters.spanId}` });
  }
  if (filters.from) chips.push({ key: "from", label: `${t("filters.from")}: ${filters.from}` });
  if (filters.to) chips.push({ key: "to", label: `${t("filters.to")}: ${filters.to}` });
  if (filters.sort && filters.sort !== "timestamp_desc") {
    chips.push({ key: "sort", label: `${t("filters.sort")}: ${filters.sort}` });
  }
  return chips;
}
