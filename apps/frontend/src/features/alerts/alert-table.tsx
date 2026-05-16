import type { AlertRule, AlertRuleKind } from "@cloudgrid/ui-contracts";
import { Checkbox } from "../../components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { formatDateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { alertRuleSignal, formatDurationSeconds } from "./helpers";

export function AlertRulesTable({
  canAdminister,
  onEnabledChange,
  onSelect,
  rules,
  selectedRuleId,
}: {
  canAdminister: boolean;
  onEnabledChange: (rule: AlertRule, enabled: boolean) => void;
  onSelect: (rule: AlertRule) => void;
  rules: AlertRule[];
  selectedRuleId: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("alerts.status")}</TableHead>
          <TableHead>{t("alerts.severity")}</TableHead>
          <TableHead>{t("alerts.rule")}</TableHead>
          <TableHead>{t("alerts.kind")}</TableHead>
          <TableHead>{t("alerts.signal")}</TableHead>
          <TableHead>{t("alerts.window")}</TableHead>
          <TableHead>{t("alerts.lastEvent")}</TableHead>
          <TableHead>{t("alerts.enabled")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow
            className={cn("cursor-pointer", selectedRuleId === rule.id && "bg-muted/60")}
            key={rule.id}
            onClick={() => onSelect(rule)}
          >
            <TableCell className="font-medium">{rule.enabled ? "OK" : t("alerts.disabled")}</TableCell>
            <TableCell className={rule.severity === "CRITICAL" ? "text-destructive" : undefined}>
              {rule.severity}
            </TableCell>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell className="font-mono text-xs">{rule.kind}</TableCell>
            <TableCell>{alertRuleSignal(rule.kind as AlertRuleKind)}</TableCell>
            <TableCell>{formatDurationSeconds(rule.evaluationWindowSeconds)}</TableCell>
            <TableCell>{formatDateTime(rule.updatedAt)}</TableCell>
            <TableCell onClick={(event) => event.stopPropagation()}>
              <Checkbox
                aria-label={`${rule.name} ${t("alerts.enabled")}`}
                checked={rule.enabled}
                disabled={!canAdminister}
                onCheckedChange={(checked) => onEnabledChange(rule, checked === true)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
