import type { AlertRuleSearchInput } from "@cloudgrid/ui-contracts";
import { X } from "lucide-react";
import { SearchInput } from "../../components/search-input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { t } from "../../lib/i18n";
import { alertRuleSorts, alertSeverities, alertSignals, alertStatuses } from "./url-state";

export function AlertFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: AlertRuleSearchInput;
  onChange: (key: keyof AlertRuleSearchInput, value: string | boolean | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b p-3">
      <div className="grid min-w-52 flex-1 gap-1">
        <Label htmlFor="alert-search">{t("filters.search")}</Label>
        <SearchInput
          id="alert-search"
          onChange={(event) => onChange("search", event.currentTarget.value)}
          placeholder={t("alerts.search.placeholder")}
          value={filters.search ?? ""}
        />
      </div>
      <SelectFilter
        id="alert-status"
        label={t("alerts.status")}
        onChange={(value) => onChange("status", value)}
        options={alertStatuses}
        value={filters.status ?? "all"}
      />
      <SelectFilter
        id="alert-severity"
        label={t("alerts.severity")}
        onChange={(value) => onChange("severity", value)}
        options={alertSeverities}
        value={filters.severity ?? "all"}
      />
      <SelectFilter
        id="alert-signal"
        label={t("alerts.signal")}
        onChange={(value) => onChange("signal", value)}
        options={alertSignals}
        value={filters.signal ?? "all"}
      />
      <SelectFilter
        id="alert-enabled-filter"
        label={t("alerts.enabled")}
        onChange={(value) =>
          onChange("enabled", value === "enabled" ? true : value === "disabled" ? false : null)
        }
        options={["enabled", "disabled"]}
        value={
          filters.enabled === true ? "enabled" : filters.enabled === false ? "disabled" : "all"
        }
      />
      <SelectFilter
        id="alert-sort"
        label={t("filters.sort")}
        onChange={(value) => onChange("sort", value)}
        options={alertRuleSorts}
        value={filters.sort ?? "updatedAt_desc"}
      />
      <Button onClick={onClear} type="button" variant="outline">
        <X data-icon="inline-start" />
        {t("filters.clear")}
      </Button>
    </div>
  );
}

function SelectFilter({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{t("value.all")}</SelectItem>
            {options.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {candidate}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
