import type { MetricNameSearchInput } from "@cloudgrid/ui-contracts";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { t } from "../../lib/i18n";
import { formatDateTime } from "../../lib/format";
import { queryKeys } from "../../lib/query-keys";
import type { useTelemetryClient } from "../../providers/telemetry-client-provider";

export function MetricNameCombobox({
  disabled,
  id,
  onChange,
  range,
  telemetryClient,
  value,
}: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  range: { from: string; to: string };
  telemetryClient: ReturnType<typeof useTelemetryClient>;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const namesInput: MetricNameSearchInput = {
    query: query || null,
    from: range.from,
    to: range.to,
    limit: 20,
  };
  const namesQuery = useQuery({
    enabled: open && !disabled,
    queryKey: queryKeys.metricNames(namesInput),
    queryFn: () => telemetryClient.getMetricNames(namesInput),
  });
  const descriptors = namesQuery.data?.items ?? [];
  const hasTypedValue =
    query.trim().length > 0 && descriptors.every((descriptor) => descriptor.name !== query.trim());

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate font-mono text-xs">
            {value || t("dashboards.metric.select")}
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            onValueChange={setQuery}
            placeholder={t("dashboards.metric.search")}
            value={query}
          />
          <CommandList>
            <CommandEmpty>
              {namesQuery.isLoading ? t("state.loading") : t("dashboards.metric.noMatches")}
            </CommandEmpty>
            <CommandGroup>
              {descriptors.map((descriptor) => (
                <CommandItem
                  key={descriptor.name}
                  onSelect={() => {
                    onChange(descriptor.name);
                    setOpen(false);
                  }}
                  value={descriptor.name}
                >
                  <Check
                    className={descriptor.name === value ? "opacity-100" : "opacity-0"}
                    data-icon="inline-start"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{descriptor.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{descriptor.kind}</span>
                      {descriptor.unit ? <span>{descriptor.unit}</span> : null}
                      <span>{formatDateTime(descriptor.lastSeenAt)}</span>
                    </span>
                  </span>
                </CommandItem>
              ))}
              {hasTypedValue ? (
                <CommandItem
                  onSelect={() => {
                    onChange(query.trim());
                    setOpen(false);
                  }}
                  value={query.trim()}
                >
                  <Plus data-icon="inline-start" />
                  <span className="truncate font-mono text-xs">{query.trim()}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
