import type { AlertEvent, AlertRule, AlertSilence } from "@cloudgrid/ui-contracts";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { formatDateTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { alertRuleSignal, formatDurationSeconds, safeAlertTab } from "./helpers";

export function AlertInspector({
  history,
  onTabChange,
  rule,
  silences,
  tab,
}: {
  history: AlertEvent[];
  onTabChange: (tab: string) => void;
  rule: AlertRule | null;
  silences: AlertSilence[];
  tab: string;
}) {
  if (!rule) {
    return (
      <aside className="flex h-full min-h-0 flex-col justify-center p-4 text-center text-sm text-muted-foreground">
        {t("alerts.selectRule")}
      </aside>
    );
  }

  return (
    <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="border-b p-4">
        <h2 className="truncate font-semibold">{rule.name}</h2>
        <p className="text-sm text-muted-foreground">{rule.kind}</p>
      </div>
      <Tabs className="min-h-0 p-4" onValueChange={onTabChange} value={safeAlertTab(tab)}>
        <TabsList>
          <TabsTrigger value="overview">{t("alerts.overview")}</TabsTrigger>
          <TabsTrigger value="history">{t("alerts.history")}</TabsTrigger>
          <TabsTrigger value="silences">{t("alerts.silences")}</TabsTrigger>
        </TabsList>
        <TabsContent className="min-h-0 overflow-auto" value="overview">
          <dl className="grid gap-3 text-sm">
            <InspectorRow label={t("alerts.status")} value={rule.enabled ? "OK" : t("alerts.disabled")} />
            <InspectorRow label={t("alerts.severity")} value={rule.severity} />
            <InspectorRow label={t("alerts.signal")} value={alertRuleSignal(rule.kind)} />
            <InspectorRow label={t("alerts.window")} value={formatDurationSeconds(rule.evaluationWindowSeconds)} />
            <InspectorRow label={t("alerts.pendingFor")} value={formatDurationSeconds(rule.pendingForSeconds)} />
            <InspectorRow label={t("alerts.cooldown")} value={formatDurationSeconds(rule.cooldownSeconds)} />
            <InspectorRow label={t("alerts.adapters")} value={rule.notificationAdapterIds.join(", ") || t("value.none")} />
            <InspectorRow label={t("alerts.version")} value={String(rule.version)} />
            <InspectorRow label={t("alerts.updated")} value={formatDateTime(rule.updatedAt)} />
          </dl>
        </TabsContent>
        <TabsContent className="min-h-0 overflow-auto" value="history">
          <AlertHistoryTable history={history} />
        </TabsContent>
        <TabsContent className="min-h-0 overflow-auto" value="silences">
          <AlertSilenceTable silences={silences} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function AlertHistoryTable({ history }: { history: AlertEvent[] }) {
  if (history.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">{t("alerts.noHistory")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("alerts.status")}</TableHead>
          <TableHead>{t("alerts.severity")}</TableHead>
          <TableHead>{t("alerts.lastEvent")}</TableHead>
          <TableHead>{t("alerts.rule")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((event) => (
          <TableRow key={event.id}>
            <TableCell className={event.state === "FIRING" ? "text-destructive" : undefined}>{event.state}</TableCell>
            <TableCell>{event.severity}</TableCell>
            <TableCell>{formatDateTime(event.createdAt)}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <span>{event.summary}</span>
                {event.evidenceTraceId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/traces/${event.evidenceTraceId}${event.evidenceSpanId ? `?spanId=${encodeURIComponent(event.evidenceSpanId)}` : ""}`}>
                      <ExternalLink data-icon="inline-start" />
                      {t("alerts.openTrace")}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AlertSilenceTable({ silences }: { silences: AlertSilence[] }) {
  if (silences.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">{t("alerts.noSilences")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("alerts.silenceReason")}</TableHead>
          <TableHead>{t("alerts.silenceWindow")}</TableHead>
          <TableHead>{t("alerts.status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {silences.map((silence) => (
          <TableRow key={silence.id}>
            <TableCell>{silence.reason}</TableCell>
            <TableCell>
              {formatDateTime(silence.startsAt)} - {formatDateTime(silence.endsAt)}
            </TableCell>
            <TableCell>{silence.active ? t("alerts.active") : t("alerts.expired")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b pb-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
