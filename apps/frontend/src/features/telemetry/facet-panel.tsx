import type { FacetValue, TelemetryFacetResult } from "@cloudgrid/ui-contracts";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SelectedFacetValue = string | readonly string[] | null | undefined;

export type FacetPanelSelected = {
  service?: SelectedFacetValue;
  operation?: SelectedFacetValue;
  spanName?: SelectedFacetValue;
  severity?: SelectedFacetValue;
  attributeKey?: SelectedFacetValue;
};

type FacetPanelGroupKey = keyof TelemetryFacetResult;

type FacetPanelGroup = {
  key: FacetPanelGroupKey;
  label: string;
  onSelect: ((value: string | null) => void) | undefined;
  selectedKey: keyof FacetPanelSelected;
};

export type FacetPanelProps = {
  facets: TelemetryFacetResult;
  className?: string;
  emptyMessage?: string;
  selected?: FacetPanelSelected;
  onAttributeKeySelect?: (value: string | null) => void;
  onOperationSelect?: (value: string | null) => void;
  onServiceSelect?: (value: string | null) => void;
  onSeveritySelect?: (value: string | null) => void;
  onSpanNameSelect?: (value: string | null) => void;
};

function selectedMatches(selected: SelectedFacetValue, value: string) {
  if (Array.isArray(selected)) {
    return selected.includes(value);
  }

  return selected === value;
}

function FacetRow({
  facet,
  isSelected,
  onSelect,
}: {
  facet: FacetValue;
  isSelected: boolean;
  onSelect: ((value: string | null) => void) | undefined;
}) {
  return (
    <Button
      aria-pressed={isSelected}
      className={cn(
        "h-8 w-full justify-start px-2 text-left font-normal",
        isSelected && "bg-accent text-accent-foreground",
      )}
      disabled={!onSelect}
      onClick={() => onSelect?.(isSelected ? null : facet.value)}
      type="button"
      variant="ghost"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {isSelected ? <Check data-icon="inline-start" /> : null}
        </span>
        <span className="truncate">{facet.value}</span>
      </span>
      <Badge className="ml-auto tabular-nums" variant="secondary">
        {facet.count.toLocaleString()}
      </Badge>
    </Button>
  );
}

export function FacetPanel({
  className,
  emptyMessage = t("charts.noFacetValues"),
  facets,
  onAttributeKeySelect,
  onOperationSelect,
  onServiceSelect,
  onSeveritySelect,
  onSpanNameSelect,
  selected,
}: FacetPanelProps) {
  const groups: FacetPanelGroup[] = [
    {
      key: "services",
      label: t("filters.service"),
      selectedKey: "service",
      onSelect: onServiceSelect,
    },
    {
      key: "operations",
      label: t("filters.operation"),
      selectedKey: "operation",
      onSelect: onOperationSelect,
    },
    {
      key: "spanNames",
      label: t("filters.spanName"),
      selectedKey: "spanName",
      onSelect: onSpanNameSelect,
    },
    {
      key: "severities",
      label: t("filters.severity"),
      selectedKey: "severity",
      onSelect: onSeveritySelect,
    },
    {
      key: "attributeKeys",
      label: t("filters.attributeKeys"),
      selectedKey: "attributeKey",
      onSelect: onAttributeKeySelect,
    },
  ];
  const [openGroups, setOpenGroups] = useState<ReadonlySet<FacetPanelGroupKey>>(
    () => new Set(groups.map((group) => group.key)),
  );

  function setGroupOpen(groupKey: FacetPanelGroupKey, isOpen: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (isOpen) {
        next.add(groupKey);
      } else {
        next.delete(groupKey);
      }
      return next;
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {groups.map((group) => {
        const isOpen = openGroups.has(group.key);
        const values = facets[group.key];

        return (
          <Collapsible
            key={group.key}
            onOpenChange={(nextOpen) => setGroupOpen(group.key, nextOpen)}
            open={isOpen}
          >
            <div className="rounded-md border bg-card">
              <CollapsibleTrigger asChild>
                <Button className="h-9 w-full justify-between px-3" type="button" variant="ghost">
                  <span className="flex min-w-0 items-center gap-2">
                    {isOpen ? (
                      <ChevronDown data-icon="inline-start" />
                    ) : (
                      <ChevronRight data-icon="inline-start" />
                    )}
                    <span className="truncate text-sm font-medium">{group.label}</span>
                  </span>
                  <Badge variant="outline">{values.length.toLocaleString()}</Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-1 p-2 pt-0">
                  {values.length > 0 ? (
                    values.map((facet) => (
                      <FacetRow
                        facet={facet}
                        isSelected={selectedMatches(selected?.[group.selectedKey], facet.value)}
                        key={facet.value}
                        onSelect={group.onSelect}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
