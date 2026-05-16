import type { AlertRule, AlertRuleSearchInput } from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, RefreshCw, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RouteBreadcrumb } from "../components/route-breadcrumb";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { AlertRuleEditorSheet } from "../features/alerts/alert-editor";
import { AlertFilters } from "../features/alerts/alert-filters";
import { AlertInspector } from "../features/alerts/alert-inspector";
import { AlertRulesTable } from "../features/alerts/alert-table";
import {
  hasAlertRuleFilters,
  readAlertRuleSearchInput,
  writeAlertRuleFilter,
} from "../features/alerts/url-state";
import { notifyMutationError, notifyMutationSuccess } from "../lib/feedback";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useAppSession } from "../providers/app-session-provider";

type AlertRulesClient = {
  getAlertRules(projectId: string, input?: AlertRuleSearchInput): Promise<AlertRule[]>;
};

export function AlertsRoute() {
  const { client, viewer } = useAppSession();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProject = viewer?.selectedProject ?? null;
  const selectedOrganization = viewer?.organizations.find(
    (organization) => organization.id === selectedProject?.organizationId,
  );
  const canAdministerAlerts = selectedOrganization?.role === "admin";
  const projectId = selectedProject?.id ?? "";
  const selectedRuleId = searchParams.get("ruleId");
  const activeTab = searchParams.get("tab") ?? "overview";
  const alertRuleInput = useMemo(() => readAlertRuleSearchInput(searchParams), [searchParams]);
  const [editorOpen, setEditorOpen] = useState(searchParams.get("new") === "1");
  const rulesQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: queryKeys.alertRules(projectId),
    queryFn: () => (client as AlertRulesClient).getAlertRules(projectId, alertRuleInput),
  });
  const rules = rulesQuery.data ?? [];
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? rules[0] ?? null;
  const historyQuery = useQuery({
    enabled: Boolean(projectId && selectedRule),
    queryKey: queryKeys.alertHistory(projectId, selectedRule?.id ?? null),
    queryFn: () => client.getAlertHistory({ projectId, ruleId: selectedRule?.id ?? null }),
  });
  const silencesQuery = useQuery({
    enabled: Boolean(projectId && selectedRule),
    queryKey: queryKeys.alertSilences(projectId, selectedRule?.id ?? null),
    queryFn: () => client.getAlertSilences({ projectId, ruleId: selectedRule?.id ?? null }),
  });
  const updateRule = useMutation({
    mutationFn: client.updateAlertRule,
    async onSuccess(_rule, variables) {
      notifyMutationSuccess(
        typeof variables.enabled === "boolean" ? "Alert rule status updated." : "Alert rule updated.",
      );
      await queryClient.invalidateQueries({ queryKey: ["AlertRules", projectId] });
    },
    onError(error) {
      notifyMutationError(error, "Alert rule could not be updated.");
    },
  });
  const createRule = useMutation({
    mutationFn: client.createAlertRule,
    async onSuccess(rule) {
      notifyMutationSuccess("Alert rule created.");
      setEditorOpen(false);
      setSearchParams((current) => {
        current.delete("new");
        current.set("ruleId", rule.id);
        current.set("tab", "overview");
        return current;
      });
      await queryClient.invalidateQueries({ queryKey: ["AlertRules", projectId] });
    },
    onError(error) {
      notifyMutationError(error, "Alert rule could not be saved.");
    },
  });

  function selectRule(rule: AlertRule) {
    setSearchParams((current) => {
      current.set("ruleId", rule.id);
      current.set("tab", activeTab);
      return current;
    });
  }

  function selectTab(tab: string) {
    setSearchParams((current) => {
      if (selectedRule) {
        current.set("ruleId", selectedRule.id);
      }
      current.set("tab", tab);
      return current;
    });
  }

  function clearFilters() {
    setSearchParams((current) => {
      for (const key of ["search", "status", "severity", "signal", "enabled", "sort", "ruleId"]) {
        current.delete(key);
      }
      return current;
    });
  }

  if (!selectedProject) {
    return null;
  }

  const hasFilters = hasAlertRuleFilters(alertRuleInput);

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <RouteHeader
        action={
          <div className="flex items-center gap-2">
            <Button
              aria-label={t("alerts.refresh")}
              onClick={() => void rulesQuery.refetch()}
              size="icon"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden />
            </Button>
            {canAdministerAlerts ? (
              <Button onClick={() => setEditorOpen(true)} type="button">
                <Plus data-icon="inline-start" />
                {t("alerts.create")}
              </Button>
            ) : null}
          </div>
        }
        description={t("alerts.description")}
        eyebrow={
          <RouteBreadcrumb
            backLabel={t("actions.back")}
            backTo="/dashboards"
            items={[
              { label: t("nav.projects"), to: "/projects" },
              { label: selectedProject.name, to: `/projects/${selectedProject.id}` },
              { label: t("alerts.title") },
            ]}
          />
        }
        title={t("alerts.title")}
      />
      <ResizablePanelGroup className="min-h-0 rounded-lg border max-lg:block">
        <ResizablePanel defaultSize={66} minSize={48}>
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <AlertFilters
              filters={alertRuleInput}
              onChange={(key, value) => writeAlertRuleFilter(setSearchParams, key, value)}
              onClear={clearFilters}
            />
            <div className="min-h-0 overflow-auto">
              <AlertRulesTable
                canAdminister={canAdministerAlerts}
                onEnabledChange={(rule, enabled) =>
                  updateRule.mutate({ id: rule.id, enabled, expectedVersion: rule.version })
                }
                onSelect={selectRule}
                rules={rules}
                selectedRuleId={selectedRule?.id ?? null}
              />
              {rulesQuery.isSuccess && rules.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 border-t p-6 text-center">
                  <Bell className="size-8 text-muted-foreground" aria-hidden />
                  <div>
                    <h2 className="font-semibold">
                      {hasFilters ? t("alerts.noMatches.title") : t("alerts.noRules.title")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {hasFilters
                        ? t("state.empty.filtered.description")
                        : t("alerts.noRules.description")}
                    </p>
                  </div>
                  {hasFilters ? (
                    <Button onClick={clearFilters} type="button" variant="outline">
                      <X data-icon="inline-start" />
                      {t("alerts.clearFilters")}
                    </Button>
                  ) : canAdministerAlerts ? (
                    <Button onClick={() => setEditorOpen(true)} type="button">
                      <Plus data-icon="inline-start" />
                      {t("alerts.create")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle className="max-lg:hidden" withHandle />
        <ResizablePanel className="max-lg:hidden" defaultSize={34} minSize={26}>
          <AlertInspector
            history={historyQuery.data?.items ?? []}
            onTabChange={selectTab}
            rule={selectedRule}
            silences={silencesQuery.data ?? []}
            tab={activeTab}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <AlertRuleEditorSheet
        error={createRule.isError}
        onOpenChange={setEditorOpen}
        onSubmit={(input) => createRule.mutate(input)}
        open={editorOpen}
        pending={createRule.isPending}
        project={selectedProject}
      />
    </section>
  );
}

function RouteHeader({
  action,
  eyebrow,
  title,
  description,
}: {
  action?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
