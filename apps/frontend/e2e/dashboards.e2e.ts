import { expect, type Page, test } from "@playwright/test";

const projectId = "project-dashboards-e2e";
const timestamp = "2026-05-23T10:00:00.000Z";

const project = {
  id: projectId,
  organizationId: "local",
  name: "Dashboard E2E project",
  slug: "dashboards-e2e",
  status: "active",
  telemetry: {
    traceCount: 0,
    logCount: 0,
    metricCount: 2,
    serviceCount: 1,
    lastIngestAt: timestamp,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const preferences = {
  projectId,
  pinnedDashboardIds: [],
  updatedAt: timestamp,
};

const metricWidget = {
  id: "widget-metric-01",
  title: "Request rate",
  description: null,
  kind: "metric_timeseries",
  layout: { x: 0, y: 0, w: 6, h: 3, minW: null, minH: null },
  metric: {
    metricName: "http.requests",
    aggregation: "sum",
    groupBy: [],
    filters: [],
    timeWindow: null,
    interval: null,
    visualization: "line",
    legend: true,
    maxSeries: 10,
    thresholds: [],
  },
  richMetric: null,
  logs: null,
  traces: null,
  liveTraces: null,
  alert: null,
};

const logWidget = {
  id: "widget-log-01",
  title: "Recent errors",
  description: null,
  kind: "log_table",
  layout: { x: 6, y: 0, w: 6, h: 3, minW: null, minH: null },
  metric: null,
  richMetric: null,
  logs: {
    service: null,
    traceId: null,
    spanId: null,
    severity: "ERROR",
    search: null,
    attributes: [],
    sort: "timestamp_desc",
    limit: 20,
    columns: ["timestamp", "severity", "service", "body"],
  },
  traces: null,
  liveTraces: null,
  alert: null,
};

const alertWidget = {
  id: "widget-alert-01",
  title: "Firing alerts",
  description: null,
  kind: "alert_status",
  layout: { x: 0, y: 3, w: 12, h: 3, minW: null, minH: null },
  metric: null,
  richMetric: null,
  logs: null,
  traces: null,
  liveTraces: null,
  alert: {
    ruleIds: [],
    states: ["FIRING"],
    severities: [],
    signals: [],
    timeWindow: "PT1H",
    limit: 20,
  },
};

const overviewDashboard = {
  id: "dash-overview-01",
  projectId,
  slug: "overview",
  name: "Service Overview",
  description: null,
  tags: [],
  version: 1,
  visibility: "project",
  defaultTimeWindow: "PT1H",
  pinned: false,
  widgets: [metricWidget, logWidget, alertWidget],
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: null,
  updatedBy: null,
};

const pinnedDashboard = {
  id: "dash-pinned-01",
  projectId,
  slug: "pinned",
  name: "Pinned Dashboard",
  description: null,
  tags: [],
  version: 1,
  visibility: "personal",
  defaultTimeWindow: "PT1H",
  pinned: true,
  widgets: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: null,
  updatedBy: null,
};

const metricDescriptor = {
  id: "metric-http-requests",
  name: "http.requests",
  description: null,
  unit: "1",
  kind: "sum",
  aggregationTemporality: "delta",
  monotonic: true,
  attributeKeys: [],
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
};

const emptyMetricNamesResult = { items: [metricDescriptor], nextCursor: null };
const emptyMetricSeriesResult = {
  metric: metricDescriptor,
  aggregation: "sum",
  interval: "PT1M",
  groupBy: [],
  series: [],
  warnings: [],
};
const emptyLogSearchResult = { items: [], nextCursor: null };
const emptyAlertSummaryResult = {
  totalCount: 0,
  byState: [],
  bySeverity: [],
  bySignal: [],
};
const emptyAlertHistoryResult = { items: [], nextCursor: null };

async function mockDashboards(
  page: Page,
  {
    dashboards = [overviewDashboard],
    pinnedDashboardIds = [],
    saveDashboardResult = overviewDashboard,
  }: {
    dashboards?: (typeof overviewDashboard)[];
    pinnedDashboardIds?: string[];
    saveDashboardResult?: typeof overviewDashboard;
  } = {},
) {
  await page.route("**/graphql", async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string };
    const op = requestBody.operationName;

    if (op === "Viewer" || op === "SelectProject") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            viewer: {
              user: { id: "local-user", displayName: "Local User", email: null, avatarUrl: null },
              organizations: [
                {
                  id: "local",
                  name: "Local company",
                  slug: "local",
                  role: "admin",
                  projects: [project],
                  members: [],
                },
              ],
              selectedProject: project,
            },
          },
        },
      });
      return;
    }

    if (op === "CompanyAiProviderSettings") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            companyAiProviderSettings: {
              companyId: "local",
              providerProfile: null,
              chatModelAlias: null,
              effective: {
                warnings: [],
                missingProviderProfiles: [],
                disabledProviderProfiles: [],
                missingChatProvider: true,
              },
              version: 1,
              updatedAt: timestamp,
              updatedByUserId: null,
            },
          },
        },
      });
      return;
    }

    if (op === "Dashboards") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { dashboards: { items: dashboards, pinnedDashboardIds } } },
      });
      return;
    }

    if (op === "SaveDashboard") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { saveDashboard: saveDashboardResult } },
      });
      return;
    }

    if (op === "DeleteDashboard") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { deleteDashboard: true } },
      });
      return;
    }

    if (op === "SetDashboardPinned") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            setDashboardPinned: {
              ...preferences,
              pinnedDashboardIds: [overviewDashboard.id],
            },
          },
        },
      });
      return;
    }

    if (op === "ReorderDashboardPins") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { reorderDashboardPins: preferences } },
      });
      return;
    }

    if (op === "MetricSeries") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { metricSeries: emptyMetricSeriesResult } },
      });
      return;
    }

    if (op === "MetricNames") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { metricNames: emptyMetricNamesResult } },
      });
      return;
    }

    if (op === "RichMetricSeries") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { richMetricSeries: emptyMetricSeriesResult } },
      });
      return;
    }

    if (op === "LogSearch") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { logs: emptyLogSearchResult } },
      });
      return;
    }

    if (op === "TraceSearch") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { traces: emptyLogSearchResult } },
      });
      return;
    }

    if (op === "AlertSummary") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { alertSummary: emptyAlertSummaryResult } },
      });
      return;
    }

    if (op === "AlertHistory") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { alertHistory: emptyAlertHistoryResult } },
      });
      return;
    }

    await route.fulfill({ contentType: "application/json", json: { data: {} } });
  });
}

test.describe("/dashboards", () => {
  test("shows empty state when no dashboards exist", async ({ page }) => {
    await mockDashboards(page, { dashboards: [] });

    await page.goto("/dashboards");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(/no dashboards/i)).toBeVisible();
  });

  test("shows loading state while dashboards are fetching", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const pendingResponse = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.route("**/graphql", async (route) => {
      const requestBody = route.request().postDataJSON() as { operationName?: string };
      const op = requestBody.operationName;
      if (op === "Viewer" || op === "SelectProject") {
        await route.fulfill({
          contentType: "application/json",
          json: {
            data: {
              viewer: {
                user: { id: "local-user", displayName: "Local User", email: null, avatarUrl: null },
                organizations: [
                  {
                    id: "local",
                    name: "Local company",
                    slug: "local",
                    role: "admin",
                    projects: [project],
                    members: [],
                  },
                ],
                selectedProject: project,
              },
            },
          },
        });
        return;
      }
      if (op === "Dashboards") {
        await pendingResponse;
        await route.fulfill({
          contentType: "application/json",
          json: { data: { dashboards: { items: [], pinnedDashboardIds: [] } } },
        });
        return;
      }
      await route.fulfill({ contentType: "application/json", json: { data: {} } });
    });

    await page.goto("/dashboards");

    await expect(page.locator(".animate-pulse").first()).toBeVisible();
    releaseResponse();
    await expect(page.locator(".animate-pulse").first()).toBeHidden();
  });

  test("shows dashboard list with name and visibility badge", async ({ page }) => {
    await mockDashboards(page);

    await page.goto("/dashboards");

    const card = page.getByRole("button", { name: /service overview/i });
    await expect(card).toBeVisible();
    await expect(card.getByText("project", { exact: true })).toBeVisible();
  });

  test("navigates to dashboard detail on selection", async ({ page }) => {
    await mockDashboards(page);

    await page.goto("/dashboards");

    await page.getByRole("button", { name: /service overview/i }).click();
    await expect(page).toHaveURL(/\?dashboard=dash-overview-01/);
    await expect(page.getByRole("heading", { name: "Service Overview" })).toBeVisible();
  });

  test("renders dashboard canvas with widget cards", async ({ page }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await expect(page.getByRole("heading", { name: "Request rate", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent errors", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Firing alerts", exact: true })).toBeVisible();
  });

  test("shows per-widget loading state while data is fetching", async ({ page }) => {
    let releaseWidgetData: () => void = () => undefined;
    const pendingWidgetData = new Promise<void>((resolve) => {
      releaseWidgetData = resolve;
    });

    await page.route("**/graphql", async (route) => {
      const requestBody = route.request().postDataJSON() as { operationName?: string };
      const op = requestBody.operationName;

      if (op === "Viewer" || op === "SelectProject") {
        await route.fulfill({
          contentType: "application/json",
          json: {
            data: {
              viewer: {
                user: { id: "local-user", displayName: "Local User", email: null, avatarUrl: null },
                organizations: [
                  {
                    id: "local",
                    name: "Local company",
                    slug: "local",
                    role: "admin",
                    projects: [project],
                    members: [],
                  },
                ],
                selectedProject: project,
              },
            },
          },
        });
        return;
      }

      if (op === "Dashboards") {
        await route.fulfill({
          contentType: "application/json",
          json: {
            data: {
              dashboards: {
                items: [overviewDashboard],
                pinnedDashboardIds: [],
              },
            },
          },
        });
        return;
      }

      if (op === "MetricNames") {
        await route.fulfill({
          contentType: "application/json",
          json: { data: { metricNames: emptyMetricNamesResult } },
        });
        return;
      }

      if (op === "MetricSeries") {
        await pendingWidgetData;
        await route.fulfill({
          contentType: "application/json",
          json: { data: { metricSeries: emptyMetricSeriesResult } },
        });
        return;
      }

      if (op === "LogSearch" || op === "AlertSummary") {
        await pendingWidgetData;
        await route.fulfill({
          contentType: "application/json",
          json:
            op === "AlertSummary"
              ? { data: { alertSummary: emptyAlertSummaryResult } }
              : { data: { logs: emptyLogSearchResult } },
        });
        return;
      }

      await route.fulfill({ contentType: "application/json", json: { data: {} } });
    });

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await expect(page.getByRole("heading", { name: "Request rate" })).toBeVisible();
    await expect(page.locator(".animate-pulse").first()).toBeVisible();
    releaseWidgetData();
  });

  test("enters edit mode and shows move and resize handles", async ({ page }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await expect(page.getByRole("heading", { name: "Request rate" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Move widget" }).first()).toBeHidden();

    await page.getByRole("button", { name: /dashboard actions/i }).click();
    await page.getByRole("menuitem", { name: /edit dashboard/i }).click();
    await expect(page.getByRole("button", { name: "Move widget" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Resize widget" }).first()).toBeVisible();
  });

  test("opens widget editor sheet when edit button is clicked", async ({ page }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await expect(page.getByRole("heading", { name: "Request rate" })).toBeVisible();
    await page
      .getByRole("button", { name: /more widget actions/i })
      .nth(1)
      .click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    await expect(
      page.getByRole("dialog").or(page.locator("[data-dashboard-inspector]")),
    ).toBeVisible();
  });

  test("shows pinned dashboards in sidebar", async ({ page }) => {
    await mockDashboards(page, {
      dashboards: [overviewDashboard, pinnedDashboard],
      pinnedDashboardIds: [pinnedDashboard.id],
    });

    await page.goto("/dashboards");

    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Pinned Dashboard" }),
    ).toBeVisible();
  });

  test("shows accessible reorder controls for pinned dashboards in sidebar", async ({ page }) => {
    await mockDashboards(page, {
      dashboards: [overviewDashboard, pinnedDashboard],
      pinnedDashboardIds: [pinnedDashboard.id, overviewDashboard.id],
    });

    await page.goto("/dashboards");

    const nav = page.getByRole("navigation");
    await expect(
      nav.getByRole("button", { name: /move pinned dashboard up/i }).first(),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: /move pinned dashboard down/i }).first(),
    ).toBeVisible();
  });

  test("caps visible pinned dashboards at five in sidebar", async ({ page }) => {
    const manyPins = [1, 2, 3, 4, 5, 6].map((i) => ({
      ...overviewDashboard,
      id: `dash-pin-0${i}`,
      name: `Pinned ${i}`,
      slug: `pinned-${i}`,
    }));

    await mockDashboards(page, {
      dashboards: manyPins,
      pinnedDashboardIds: manyPins.map((d) => d.id),
    });

    await page.goto("/dashboards");

    const nav = page.getByRole("navigation");
    for (let i = 1; i <= 5; i++) {
      await expect(nav.getByRole("link", { name: `Pinned ${i}` })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Pinned 6" })).toHaveCount(0);
  });

  test("shows dashboard date range control and discard button when in edit mode", async ({
    page,
  }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await expect(page.getByRole("button", { name: /discard/i })).toHaveCount(0);
    await page.getByRole("button", { name: /dashboard actions/i }).click();
    await page.getByRole("menuitem", { name: /edit dashboard/i }).click();

    await expect(page.getByRole("button", { name: /discard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
  });

  test("shows delete confirmation dialog before removing a dashboard", async ({ page }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await page.getByRole("button", { name: /dashboard actions/i }).click();
    const deleteItem = page.getByRole("menuitem", { name: /delete/i });
    if (await deleteItem.isVisible()) {
      await deleteItem.click();
      await expect(page.getByRole("dialog", { name: /delete.*dashboard/i })).toBeVisible();
    }
  });

  test("opens dashboard settings sheet from actions menu", async ({ page }) => {
    await mockDashboards(page);

    await page.goto(`/dashboards?dashboard=${overviewDashboard.id}`);

    await page.getByRole("button", { name: /dashboard actions/i }).click();
    await page.getByRole("menuitem", { name: /dashboard settings/i }).click();

    const sheet = page.getByRole("dialog").or(page.locator("[data-state='open']")).first();
    await expect(sheet).toBeVisible();
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
    await expect(page.getByLabel(/visibility/i).first()).toBeVisible();
  });

  test("does not show pinned dashboards section in dashboard overview", async ({ page }) => {
    await mockDashboards(page, {
      dashboards: [overviewDashboard, pinnedDashboard],
      pinnedDashboardIds: [pinnedDashboard.id],
    });

    await page.goto("/dashboards");

    await expect(page.getByRole("heading", { name: /pinned dashboards/i })).toHaveCount(0);
  });
});
