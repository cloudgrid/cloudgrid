import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

type OperationName =
  | "Viewer"
  | "SelectProject"
  | "TraceSearch"
  | "TraceDetail"
  | "LogSearch"
  | "TelemetryFacets"
  | "Dashboards"
  | "IngestCredentials"
  | "CompanyAiProviderSettings";
type GraphQLPayload = Record<string, unknown>;
type GraphQLHandler = (operationName: OperationName) => GraphQLPayload | Promise<GraphQLPayload>;

const traceId = "trace-qa-001";
const spanId = "span-root-001";
const projectId = "project-smoke";
const timestamp = "2026-05-08T10:15:30.000Z";

const smokeProject = {
  id: projectId,
  organizationId: "local",
  name: "Smoke project",
  slug: "smoke",
  status: "active",
  telemetry: {
    traceCount: 1,
    logCount: 1,
    metricCount: 1,
    serviceCount: 2,
    lastIngestAt: timestamp,
  },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const viewerPayload = {
  data: {
    viewer: {
      user: {
        id: "local-user",
        displayName: "Local User",
        email: null,
        avatarUrl: null,
      },
      organizations: [
        {
          id: "local",
          name: "Local company",
          slug: "local",
          role: "admin",
          projects: [smokeProject],
          members: [],
        },
      ],
      selectedProject: smokeProject,
    },
  },
};

const traceSummary = {
  id: traceId,
  serviceName: "checkout-api",
  startedAt: timestamp,
  endedAt: "2026-05-08T10:15:30.245Z",
  durationMs: 245,
  rootSpanId: spanId,
  status: "ok",
  attributes: { "cloudgrid.test": true },
  spanCount: 2,
  errorSpanCount: 1,
  logCount: 1,
  serviceCount: 2,
};

const logEvent = {
  id: "log-qa-001",
  traceId,
  spanId,
  serviceName: "checkout-api",
  severityText: "INFO",
  severityNumber: 9,
  body: { message: "checkout completed" },
  timestamp,
  observedTimestamp: timestamp,
  attributes: { "log.source": "smoke" },
  correlation: "span",
};

const traceDetail = {
  trace: traceSummary,
  spans: [
    {
      id: spanId,
      traceId,
      parentSpanId: null,
      name: "POST /checkout",
      kind: "SERVER",
      serviceName: "checkout-api",
      startedAt: timestamp,
      endedAt: "2026-05-08T10:15:30.245Z",
      durationMs: 245,
      status: "ok",
      attributes: { "http.route": "/checkout" },
      depth: 0,
      childCount: 1,
      hasError: false,
      isCriticalPath: true,
      isOrphan: false,
      isServiceEntry: true,
      exceptionCount: 0,
      events: [{ name: "request.received", timestamp, attributes: { route: "/checkout" } }],
      links: [
        {
          traceId: "trace-linked-001",
          spanId: "span-linked-001",
          traceState: null,
          attributes: { link: "smoke" },
          direction: "forward",
        },
      ],
      exceptions: [],
    },
    {
      id: "span-worker-001",
      traceId,
      parentSpanId: spanId,
      name: "reserve inventory",
      kind: "CLIENT",
      serviceName: "inventory-worker",
      startedAt: "2026-05-08T10:15:30.050Z",
      endedAt: "2026-05-08T10:15:30.170Z",
      durationMs: 120,
      status: "error",
      attributes: { "messaging.system": "nats" },
      depth: 1,
      childCount: 0,
      hasError: true,
      isCriticalPath: true,
      isOrphan: false,
      isServiceEntry: true,
      exceptionCount: 1,
      events: [],
      links: [
        {
          traceId: "trace-linked-001",
          spanId: "span-linked-001",
          traceState: null,
          attributes: { link: "worker" },
          direction: "backward",
        },
      ],
      exceptions: [
        {
          timestamp: "2026-05-08T10:15:30.125Z",
          type: "InventoryError",
          message: "reservation failed",
          stacktrace: "InventoryError: reservation failed\n    at reserve (inventory.ts:42:7)",
          escaped: false,
          attributes: { handled: false },
          frames: [
            {
              raw: "at reserve (inventory.ts:42:7)",
              functionName: "reserve",
              fileName: "inventory.ts",
              lineNumber: 42,
              columnNumber: 7,
              language: "ts",
            },
          ],
        },
      ],
    },
  ],
  structure: {
    rootSpanIds: [spanId],
    orphanSpanIds: [],
    criticalPathSpanIds: [spanId, "span-worker-001"],
    maxDepth: 1,
    serviceBreakdown: [
      {
        serviceName: "checkout-api",
        spanCount: 1,
        errorSpanCount: 0,
        durationMs: 245,
        percentOfTraceDuration: 100,
      },
      {
        serviceName: "inventory-worker",
        spanCount: 1,
        errorSpanCount: 1,
        durationMs: 120,
        percentOfTraceDuration: 49,
      },
    ],
  },
  selectedSpan: null,
  spanMatches: [{ spanId: "span-worker-001", reason: "error", fields: ["status"] }],
  logs: [logEvent],
  relatedLogs: [logEvent],
  warnings: [
    {
      code: "missingParent",
      message: "A span references a parent that is not present in this trace.",
      spanId: "span-worker-001",
    },
  ],
};

const telemetryFacets = {
  services: [
    { value: "checkout-api", count: 4 },
    { value: "inventory-worker", count: 2 },
  ],
  operations: [{ value: "POST /checkout", count: 4 }],
  spanNames: [{ value: "reserve inventory", count: 2 }],
  severities: [{ value: "INFO", count: 6 }],
  attributeKeys: [{ value: "http.route", count: 4 }],
};

const companyAiProviderSettings = {
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
};

const emptyPayloads: Record<OperationName, GraphQLPayload> = {
  Viewer: viewerPayload,
  SelectProject: viewerPayload,
  TraceSearch: { data: { traces: { items: [], nextCursor: null } } },
  TraceDetail: { data: { trace: null } },
  LogSearch: { data: { logs: { items: [], nextCursor: null } } },
  TelemetryFacets: { data: { telemetryFacets } },
  Dashboards: { data: { dashboards: { items: [], pinnedDashboardIds: [] } } },
  IngestCredentials: { data: { ingestCredentials: { items: [] } } },
  CompanyAiProviderSettings: { data: { companyAiProviderSettings } },
};

const populatedPayloads: Record<OperationName, GraphQLPayload> = {
  TraceSearch: { data: { traces: { items: [traceSummary], nextCursor: "next-trace-page" } } },
  TraceDetail: { data: { trace: traceDetail } },
  LogSearch: { data: { logs: { items: [logEvent], nextCursor: "next-log-page" } } },
  TelemetryFacets: { data: { telemetryFacets } },
  Dashboards: emptyPayloads.Dashboards,
  IngestCredentials: emptyPayloads.IngestCredentials,
};

const errorPayload = {
  errors: [
    {
      message: "Telemetry unavailable",
      extensions: {
        code: "ERR-500",
        problem: {
          type: "about:blank",
          title: "Telemetry query failed",
          status: 500,
          detail: "The mocked telemetry backend failed.",
          id: "problem-qa-001",
          code: "ERR-500",
          retryable: true,
        },
      },
    },
  ],
};

async function mockGraphQL(page: Page, handler: GraphQLHandler) {
  await page.route("**/graphql", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      operationName: OperationName;
      variables?: { input?: { cursor?: string | null } };
    };
    if (requestBody.operationName === "Viewer") {
      await route.fulfill({
        contentType: "application/json",
        json: viewerPayload,
      });
      return;
    }
    if (
      requestBody.operationName === "Dashboards" ||
      requestBody.operationName === "IngestCredentials" ||
      requestBody.operationName === "CompanyAiProviderSettings"
    ) {
      await route.fulfill({
        contentType: "application/json",
        json: emptyPayloads[requestBody.operationName],
      });
      return;
    }
    if (
      (requestBody.operationName === "TraceSearch" || requestBody.operationName === "LogSearch") &&
      requestBody.variables?.input?.cursor
    ) {
      await route.fulfill({
        contentType: "application/json",
        json: emptyPayloads[requestBody.operationName],
      });
      return;
    }
    const payload =
      (await handler(requestBody.operationName)) ?? emptyPayloads[requestBody.operationName];
    await route.fulfill({
      contentType: "application/json",
      json: payload ?? emptyPayloads[requestBody.operationName],
    });
  });
}

async function expectNoConsoleErrors(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  return () => expect(consoleErrors).toEqual([]);
}

async function expectNoCriticalAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) => violation.impact === "critical"),
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

test("renders shell routes without a GraphQL UI link and applies dark theme", async ({ page }) => {
  await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);
  const assertNoConsoleErrors = await expectNoConsoleErrors(page);

  await page.goto("/traces");
  await expect(page.getByRole("heading", { name: /trace search/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /graphql ui/i })).toHaveCount(0);
  await page.getByRole("button", { name: /user menu/i }).click();
  await expect(page.getByRole("menuitem", { name: /log out/i })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /^logs$/i }).click();
  await expect(page.getByRole("heading", { name: /^logs$/i })).toBeVisible();

  await page.getByRole("button", { name: /toggle light and dark mode/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  assertNoConsoleErrors();
});

test("renders project selection and project setup shell modes", async ({ page }) => {
  await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);
  const assertNoConsoleErrors = await expectNoConsoleErrors(page);

  await page.goto("/projects");
  await expect(
    page.getByRole("heading", {
      name: /switch the active project|select the project for this session/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^traces$/i })).toHaveCount(0);
  await page.getByRole("button", { exact: true, name: "Create project" }).click();
  await expect(page.getByRole("dialog", { name: /add project/i })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await expect(page).toHaveURL(/\/traces$/);
  await expect(page.getByRole("link", { name: /^live$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^traces$/i })).toBeVisible();

  await page.goto(`/projects/${projectId}/settings/ingest`);
  await expect(page.getByRole("heading", { name: "API Keys", exact: true })).toBeVisible();
  await expect(page.getByText(/stored credential secrets are never displayed/i)).toBeVisible();
  assertNoConsoleErrors();
});

test.describe("/traces", () => {
  test("shows loading rows", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const pendingResponse = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await mockGraphQL(page, async (operationName) => {
      await pendingResponse;
      return emptyPayloads[operationName];
    });

    await page.goto("/traces");
    await expect(page.locator(".animate-pulse")).toHaveCount(16);
    releaseResponse();
  });

  test("shows empty state", async ({ page }) => {
    await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);

    await page.goto("/traces");
    await expect(page.getByText(/no traces for this project yet/i)).toBeVisible();
  });

  test("shows filtered empty state", async ({ page }) => {
    await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);

    await page.goto("/traces?service=missing");
    await expect(page.getByText(/no traces match these filters/i)).toBeVisible();
  });

  test("shows error state and retry affordance", async ({ page }) => {
    await mockGraphQL(page, () => errorPayload);

    await page.goto("/traces");
    await expect(page.getByText(/telemetry query failed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i }).first()).toBeVisible();
  });

  test("keeps populated traces visible when facet suggestions fail", async ({ page }) => {
    await mockGraphQL(page, (operationName) =>
      operationName === "TelemetryFacets" ? errorPayload : populatedPayloads[operationName],
    );

    await page.goto("/traces");
    await expect(page.getByRole("cell", { name: traceId })).toBeVisible();
    await expect(page.getByText(/facet suggestions failed/i)).toBeVisible();
    await expect(page.getByText(/the mocked telemetry backend failed/i)).toBeVisible();
  });

  test("shows populated traces and navigates to detail", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    await page.goto("/traces");
    await expect(page.getByRole("button", { name: /^history$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^live$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^facets$/i }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "checkout-api" })).toBeVisible();
    await expect(page.getByRole("cell", { name: traceId })).toBeVisible();

    await page.getByRole("cell", { name: traceId }).click();
    await expect(page).toHaveURL(new RegExp(`/traces/${traceId}(?:\\?.*)?$`));
    await expect(page.getByRole("tree").getByText("POST /checkout")).toBeVisible();
  });

  test("uses live as a traces mode instead of a primary navigation route", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    await page.goto("/traces");
    await expect(page.getByRole("link", { name: /^live$/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^live$/i }).click();
    await expect(page).toHaveURL(/\/traces\?mode=live/);
  });
});

test.describe("/traces/:traceId", () => {
  test("shows loading rows", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const pendingResponse = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await mockGraphQL(page, async () => {
      await pendingResponse;
      return emptyPayloads.TraceDetail;
    });

    await page.goto(`/traces/${traceId}`);
    await expect(page.locator(".animate-pulse")).toHaveCount(8);
    releaseResponse();
  });

  test("shows empty/not-found state", async ({ page }) => {
    await mockGraphQL(page, () => emptyPayloads.TraceDetail);

    await page.goto(`/traces/${traceId}`);
    await expect(page.getByText(/trace was not found/i)).toBeVisible();
  });

  test("shows error state and retry affordance", async ({ page }) => {
    await mockGraphQL(page, () => errorPayload);

    await page.goto(`/traces/${traceId}`);
    await expect(page.getByText(/telemetry query failed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("shows populated trace detail", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    await page.goto(`/traces/${traceId}`);
    await expect(page.getByText(traceId).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /trace tree waterfall/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("tree").getByText("POST /checkout")).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /reserve inventory/i })).toBeVisible();

    await page.getByRole("treeitem", { name: /reserve inventory/i }).click();
    await expect(page).toHaveURL(/spanId=span-worker-001/);
    await page.getByRole("tab", { name: /^exceptions$/i }).click();
    await expect(page.getByRole("button", { name: /InventoryError/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reservation failed/i })).toBeVisible();
    await page.getByRole("tab", { name: /^links$/i }).click();
    await expect(page.getByText("trace-linked-001")).toBeVisible();
    await expect(page.getByRole("heading", { name: /correlated logs/i })).toBeVisible();
    await expect(page.getByRole("cell", { name: /checkout completed/i })).toBeVisible();
  });
});

test.describe("/logs", () => {
  test("shows loading rows", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const pendingResponse = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await mockGraphQL(page, async (operationName) => {
      await pendingResponse;
      return emptyPayloads[operationName];
    });

    await page.goto("/logs");
    await expect(page.locator(".animate-pulse")).toHaveCount(8);
    releaseResponse();
  });

  test("shows empty state", async ({ page }) => {
    await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);

    await page.goto("/logs");
    await expect(page.getByText(/no logs for this project yet/i)).toBeVisible();
  });

  test("shows filtered empty state", async ({ page }) => {
    await mockGraphQL(page, (operationName) => emptyPayloads[operationName]);

    await page.goto("/logs?service=missing");
    await expect(page.getByText(/no logs match these filters/i)).toBeVisible();
  });

  test("shows error state and retry affordance", async ({ page }) => {
    await mockGraphQL(page, () => errorPayload);

    await page.goto("/logs");
    await expect(page.getByText(/telemetry query failed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i }).first()).toBeVisible();
  });

  test("keeps populated logs visible when facet suggestions fail", async ({ page }) => {
    await mockGraphQL(page, (operationName) =>
      operationName === "TelemetryFacets" ? errorPayload : populatedPayloads[operationName],
    );

    await page.goto("/logs");
    await expect(page.getByRole("cell", { name: "checkout-api" })).toBeVisible();
    await expect(page.getByText(/facet suggestions failed/i)).toHaveCount(0);
  });

  test("shows populated logs with trace link", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    await page.goto("/logs");
    await expect(page.getByRole("cell", { name: "checkout-api" })).toBeVisible();
    await expect(page.getByRole("link", { name: traceId })).toHaveAttribute(
      "href",
      `/traces/${traceId}`,
    );
    await expect(page.getByText(/checkout completed/i)).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("has no critical axe violations on MVP routes", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    for (const route of ["/traces", `/traces/${traceId}`, "/logs"]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoCriticalAxeViolations(page);
    }
  });
});

test.describe("mobile smoke", () => {
  const { defaultBrowserType: _defaultBrowserType, ...pixel5 } = devices["Pixel 5"];
  test.use(pixel5);

  test("renders trace detail without hiding the primary waterfall", async ({ page }) => {
    await mockGraphQL(page, (operationName) => populatedPayloads[operationName]);

    await page.goto(`/traces/${traceId}`);
    const tree = page.getByRole("tree").first();
    await expect(page.getByText(traceId).first()).toBeVisible();
    await expect(tree.getByText("POST /checkout")).toBeVisible();
    await expect(tree.getByRole("treeitem", { name: /reserve inventory/i })).toBeVisible();
  });
});
