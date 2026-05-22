import type { FacetValue } from "@cloudgrid/ui-contracts";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ServiceMultiSelect({
  id,
  options = [],
  placeholder = t("filters.placeholder.service"),
  selected,
  onChange,
}: {
  id: string;
  options?: FacetValue[] | undefined;
  placeholder?: string;
  selected: readonly string[];
  onChange: (services: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedSelected = useMemo(() => normalizeServices(selected), [selected]);
  const optionValues = useMemo(() => {
    const values = options.map((option) => option.value);
    return normalizeServices([...normalizedSelected, ...values]);
  }, [normalizedSelected, options]);
  const canCreate = query.trim().length > 0 && !optionValues.includes(query.trim());

  function toggleService(service: string) {
    const value = service.trim();
    if (!value) return;
    if (normalizedSelected.includes(value)) {
      onChange(normalizedSelected.filter((item) => item !== value));
      return;
    }
    onChange([...normalizedSelected, value]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="h-auto min-h-10 w-full justify-between px-3 py-2"
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {normalizedSelected.length > 0 ? (
              normalizedSelected.map((service) => (
                <Badge key={service} className="max-w-full gap-1" variant="secondary">
                  <span className="truncate">{service}</span>
                  <span aria-hidden className="rounded-full">
                    <X data-icon="inline-end" />
                  </span>
                </Badge>
              ))
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter>
          <CommandInput onValueChange={setQuery} placeholder={placeholder} value={query} />
          <CommandList>
            <CommandEmpty>{t("filters.noServices")}</CommandEmpty>
            <CommandGroup>
              {canCreate ? (
                <CommandItem
                  key={query.trim()}
                  onSelect={() => {
                    toggleService(query);
                    setQuery("");
                  }}
                  value={query.trim()}
                >
                  <span className="truncate">
                    {t("filters.useService")} {query.trim()}
                  </span>
                </CommandItem>
              ) : null}
              {optionValues.map((service) => {
                const isSelected = normalizedSelected.includes(service);
                const count = options.find((option) => option.value === service)?.count;
                return (
                  <CommandItem
                    key={service}
                    onSelect={() => toggleService(service)}
                    value={service}
                  >
                    <Check
                      className={cn("opacity-0", isSelected && "opacity-100")}
                      data-icon="inline-start"
                    />
                    <span className="min-w-0 flex-1 truncate">{service}</span>
                    {count !== undefined ? (
                      <Badge className="ml-auto tabular-nums" variant="secondary">
                        {count.toLocaleString()}
                      </Badge>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function normalizeServices(services: readonly string[]) {
  const seen = new Set<string>();
  return services
    .map((service) => service.trim())
    .filter((service) => {
      if (!service || seen.has(service)) {
        return false;
      }
      seen.add(service);
      return true;
    });
}
