import { describe, expect, test } from "bun:test";
import type { AlertEvent, AlertRule, AlertSilence, Project, Viewer } from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import { AlertsRoute } from "../src/routes/alerts-route";
import { AppShell } from "../src/routes/app-shell";

const project: Project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Checkout",
  slug: "checkout",
  status: "active",
  telemetry: {
    lastIngestAt: null,
    traceCount: 0,
    logCount: 0,
    metricCount: 0,
    serviceCount: 0,
  },
};

const viewer: Viewer = {
  user: {
    id: "user-1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
  },
  organizations: [
    {
      id: "org-1",
      name: "Example Co",
      slug: "example",
      role: "admin",
      projects: [project],
    },
  ],
  selectedProject: project,
};

const alertRule: AlertRule = {
  id: "rule-1",
  projectId: "project-1",
  name: "Checkout trace errors",
  enabled: true,
  kind: "TRACE_ERROR",
  severity: "ERROR",
  query: { status: "error" },
  condition: { minCount: 1 },
  evaluationWindowSeconds: 300,
  pendingForSeconds: 60,
  cooldownSeconds: 300,
  notificationAdapterIds: ["in_app"],
  createdAt: "2026-05-15T08:00:00.000Z",
  updatedAt: "2026-05-15T08:00:00.000Z",
  updatedByUserId: "user-1",
  version: 1,
};

const alertEvent: AlertEvent = {
  id: "event-1",
  projectId: "project-1",
  ruleId: "rule-1",
  instanceId: "instance-1",
  state: "FIRING",
  severity: "ERROR",
  summary: "Checkout trace errors is firing",
  deduplicationKey: "rule-1:error",
  startedAt: "2026-05-15T08:00:00.000Z",
  endedAt: null,
  createdAt: "2026-05-15T08:00:00.000Z",
  evidenceTraceId: "trace-1",
  evidenceSpanId: "span-1",
  evidenceLogId: null,
  evidenceMetricName: null,
};

const alertSilence: AlertSilence = {
  id: "silence-1",
  projectId: "project-1",
  ruleId: "rule-1",
  reason: "maintenance",
  startsAt: "2026-05-15T08:00:00.000Z",
  endsAt: "2026-05-15T09:00:00.000Z",
  createdAt: "2026-05-15T08:00:00.000Z",
  createdByUserId: "user-1",
  active: true,
};

function alertsMarkup({ path = "/alerts", rules }: { path?: string; rules: AlertRule[] }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  queryClient.setQueryData(["Viewer"], viewer);
  queryClient.setQueryData(["AlertRules", "project-1"], rules);
  queryClient.setQueryData(["AlertHistory", "project-1", "rule-1", 50, null], {
    items: [alertEvent],
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  queryClient.setQueryData(["AlertSilences", "project-1", "rule-1"], [alertSilence]);

  const client = {
    createAlertRule: async () => alertRule,
    createAlertSilence: async () => alertSilence,
    createProject: async () => project,
    deleteAlertRule: async () => true,
    deleteAlertSilence: async () => true,
    getAlertHistory: async () => ({
      items: [alertEvent],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    getAlertRules: async () => rules,
    getAlertSilences: async () => [alertSilence],
    getDashboards: async () => ({ items: [], pinnedDashboardIds: [] }),
    getViewer: async () => viewer,
    selectProject: async () => viewer,
    updateAlertRule: async () => alertRule,
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider client={client} mode="deployed">
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route element={<AlertsRoute />} path="/alerts" />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("alerts route", () => {
  test("keeps Alerts out of the primary project sidebar", () => {
    const source = readFileSync(new URL("../src/routes/app-shell.tsx", import.meta.url), "utf8");
    const navBlock = source.slice(
      source.indexOf("const projectNavItems"),
      source.indexOf("const enabledNavItems"),
    );

    expect(navBlock).toContain('t("nav.dashboards")');
    expect(navBlock).not.toContain('t("nav.alerts")');
  });

  test("renders empty alert rule state with create sheet controls", () => {
    const markup = alertsMarkup({ path: "/alerts?new=1", rules: [] });
    const source = [
      "../src/routes/alerts-route.tsx",
      "../src/features/alerts/alert-editor.tsx",
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");

    expect(markup).toContain("No alert rules yet");
    expect(markup).toContain("Create alert rule");
    expect(source).toContain('t("alerts.basics")');
    expect(source).toContain('t("alerts.signalQuery")');
    expect(source).toContain('t("alerts.condition")');
    expect(source).toContain('t("alerts.timing")');
    expect(source).toContain('t("alerts.notifications")');
    expect(source).not.toContain("JsonTextarea");
    expect(source).toContain("AlertSignalQueryControls");
    expect(source).toContain("AlertConditionControls");
  });

  test("keeps alert filters URL-backed and aligned to alertRules input", () => {
    const source = [
      "../src/routes/alerts-route.tsx",
      "../src/features/alerts/url-state.ts",
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");

    expect(source).toContain("readAlertRuleSearchInput");
    expect(source).toContain("writeAlertRuleFilter");
    expect(source).toContain("searchParams.get(\"search\")");
    expect(source).toContain("searchParams.get(\"status\")");
    expect(source).toContain("searchParams.get(\"severity\")");
    expect(source).toContain("searchParams.get(\"signal\")");
    expect(source).toContain("searchParams.get(\"enabled\")");
    expect(source).toContain("searchParams.get(\"sort\")");
    expect(source).toContain("getAlertRules(projectId, alertRuleInput)");
  });

  test("renders alert list, selected inspector, history, and silences from GraphQL", () => {
    const markup = alertsMarkup({ path: "/alerts?ruleId=rule-1&tab=history", rules: [alertRule] });
    const silencesMarkup = alertsMarkup({
      path: "/alerts?ruleId=rule-1&tab=silences",
      rules: [alertRule],
    });

    expect(markup).toContain("Checkout trace errors");
    expect(markup).toContain("TRACE_ERROR");
    expect(markup).toContain("ERROR");
    expect(markup).toContain("History");
    expect(markup).toContain("Checkout trace errors is firing");
    expect(markup).toContain("/traces/trace-1?spanId=span-1");
    expect(silencesMarkup).toContain("Silences");
    expect(silencesMarkup).toContain("maintenance");
  });
});
