import { expect, type Page, test } from "@playwright/test";

const projectId = "project-uxv2";
const project = {
  id: projectId,
  organizationId: "local",
  name: "UX v2 project",
  slug: "ux-v2",
  status: "active",
  telemetry: {
    traceCount: 4,
    logCount: 8,
    metricCount: 1,
    serviceCount: 2,
    lastIngestAt: "2026-05-15T08:00:00.000Z",
  },
};

async function mockViewer(page: Page, selectedProject: typeof project | null = null) {
  await page.route("**/graphql", async (route) => {
    const requestBody = route.request().postDataJSON() as { operationName?: string };
    if (requestBody.operationName === "Viewer") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            viewer: {
              user: {
                id: "local",
                displayName: "Local user",
                email: null,
              },
              organizations: [
                {
                  id: "local",
                  name: "Personal",
                  slug: "local",
                  role: "admin",
                  projects: [project],
                },
              ],
              selectedProject,
            },
          },
        },
      });
      return;
    }

    if (requestBody.operationName === "SelectProject") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            selectProject: {
              user: {
                id: "local",
                displayName: "Local user",
                email: null,
              },
              organizations: [
                {
                  id: "local",
                  name: "Personal",
                  slug: "local",
                  role: "admin",
                  projects: [project],
                },
              ],
              selectedProject: project,
            },
          },
        },
      });
      return;
    }

    if (requestBody.operationName === "Dashboards") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { dashboards: { items: [], pinnedDashboardIds: [] } } },
      });
      return;
    }

    if (requestBody.operationName === "CompanyAiProviderSettings") {
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
              updatedAt: "2026-05-15T08:00:00.000Z",
              updatedByUserId: null,
            },
          },
        },
      });
      return;
    }

    if (requestBody.operationName === "TraceSearch") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { traces: { items: [], nextCursor: null } } },
      });
      return;
    }

    if (requestBody.operationName === "TelemetryFacets") {
      await route.fulfill({
        contentType: "application/json",
        json: {
          data: {
            telemetryFacets: {
              services: [],
              operations: [],
              spanNames: [],
              severities: [],
              attributeKeys: [],
            },
          },
        },
      });
      return;
    }

    if (requestBody.operationName === "IngestCredentials") {
      await route.fulfill({
        contentType: "application/json",
        json: { data: { ingestCredentials: { items: [] } } },
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      json: { data: {} },
    });
  });
}

test("projects route is a centered project-card picker without telemetry navigation", async ({
  page,
}) => {
  await mockViewer(page, null);

  await page.goto("/projects");

  await expect(
    page.getByRole("heading", { name: /select the project for this session/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^traces$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /search projects/i })).toHaveCount(0);
  await expect(page.getByPlaceholder(/search projects/i)).toBeVisible();
  await expect(page.getByRole("main").getByText("UX v2 project")).toBeVisible();
  await expect(page.getByText(/companies$/i)).toHaveCount(0);
});

test("project route selects the project and lands in the trace workspace", async ({ page }) => {
  await mockViewer(page, project);

  await page.goto(`/projects/${projectId}`);

  await expect(page).toHaveURL(/\/traces$/);
  await expect(page.getByRole("heading", { name: /trace search/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^live$/i })).toHaveCount(0);

  await page.goto(`/projects/${projectId}/settings/ingest`);
  await expect(page.getByRole("heading", { name: "API Keys", exact: true })).toBeVisible();
  await expect(page.getByText(/stored credential secrets are never displayed/i)).toBeVisible();
});

test("project settings use a settings sidebar and focused forms", async ({ page }) => {
  await mockViewer(page, project);

  await page.goto(`/projects/${projectId}/settings`);

  await expect(page.getByRole("heading", { name: /^general$/i })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /settings/i }).getByRole("link", { name: /^api keys$/i }),
  ).toHaveAttribute("href", `/projects/${projectId}/settings/ingest`);
  await page.goto(`/projects/${projectId}/settings/ingest`);
  await expect(page.getByRole("heading", { name: "API Keys", exact: true })).toBeVisible();
  await expect(page.getByText(/stored credential secrets are never displayed/i)).toBeVisible();
});
