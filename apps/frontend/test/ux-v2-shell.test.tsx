import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Viewer } from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CommandPalette } from "../src/features/navigation/command-palette";
import { isProjectScopedQueryKey, queryKeys } from "../src/lib/query-keys";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import { AppShell } from "../src/routes/app-shell";

const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Checkout",
  slug: "checkout",
  status: "active" as const,
  telemetry: {
    lastIngestAt: null,
    traceCount: 0,
    logCount: 0,
    metricCount: 0,
    serviceCount: 0,
  },
};

const dashboard = {
  id: "dashboard-1",
  projectId: "project-1",
  slug: "service-health",
  name: "Service health",
  description: "Service health overview.",
  tags: ["service"],
  version: 1,
  visibility: "project" as const,
  defaultTimeWindow: "PT1H",
  pinned: true,
  widgets: [],
  createdAt: "2026-05-15T08:00:00.000Z",
  updatedAt: "2026-05-15T08:00:00.000Z",
  createdBy: "user-1",
  updatedBy: "user-1",
};

const dashboardChild = {
  ...dashboard,
  id: "dashboard-2",
  slug: "latency-drilldown",
  name: "Latency drilldown",
  pinned: false,
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
  selectedProject: null,
};

function shellMarkup({ path, sessionViewer }: { path: string; sessionViewer: Viewer }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  queryClient.setQueryData(["Viewer"], sessionViewer);
  queryClient.setQueryData(queryKeys.dashboards({ includeBuiltins: true }), {
    items: [dashboard, dashboardChild],
    pinnedDashboardIds: [dashboard.id],
  });

  const client = {
    createProject: async () => project,
    deleteDashboard: async () => true,
    getDashboards: async () => ({
      items: [dashboard, dashboardChild],
      pinnedDashboardIds: [dashboard.id],
    }),
    getViewer: async () => sessionViewer,
    reorderDashboardPins: async () => ({
      projectId: "project-1",
      pinnedDashboardIds: [dashboard.id],
      updatedAt: "2026-05-15T08:00:00.000Z",
    }),
    saveDashboard: async () => dashboard,
    selectProject: async () => ({ ...sessionViewer, selectedProject: project }),
    setDashboardPinned: async () => ({
      projectId: "project-1",
      pinnedDashboardIds: [dashboard.id],
      updatedAt: "2026-05-15T08:00:00.000Z",
    }),
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider client={client} mode="deployed">
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route element={<main>Route content</main>} path="*" />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function headerMarkup(markup: string) {
  return markup.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
}

function firstAsideMarkup(markup: string) {
  return markup.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
}

function commandPaletteMarkup() {
  const client = {
    getViewer: async () => ({ ...viewer, selectedProject: project }),
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AppSessionProvider client={client} mode="deployed">
          <MemoryRouter initialEntries={["/traces"]}>
            <CommandPalette onOpenChange={() => undefined} open={true} />
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("UX v2 app shell", () => {
  test("identifies project-scoped query keys for selection resets", () => {
    expect(isProjectScopedQueryKey(queryKeys.traces({}))).toBe(true);
    expect(isProjectScopedQueryKey(queryKeys.logs({}))).toBe(true);
    expect(isProjectScopedQueryKey(["Viewer"])).toBe(false);
  });

  test("keeps project-selection mode centered and free of telemetry navigation", () => {
    const markup = shellMarkup({ path: "/projects", sessionViewer: viewer });

    expect(markup).toContain('data-shell-mode="project-selection"');
    expect(markup).toContain("CloudGrid");
    expect(markup).toContain("Select project");
    expect(markup).not.toContain("<aside");
    expect(markup).not.toContain(">Live<");
    expect(markup).not.toContain(">Traces<");
    expect(markup).not.toContain(">Logs<");
    expect(markup).not.toContain(">Metrics<");
  });

  test("keeps project creation in project-selection mode even with a selected project", () => {
    const markup = shellMarkup({
      path: "/projects/new",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    expect(markup).toContain('data-shell-mode="project-selection"');
    expect(markup).not.toContain("<aside");
    expect(markup).not.toContain(">Traces<");
  });

  test("renders project navigation without the removed project overview route", () => {
    const markup = shellMarkup({
      path: "/traces",
      sessionViewer: { ...viewer, selectedProject: project },
    });
    const aside = firstAsideMarkup(markup);

    expect(markup).toContain('data-shell-mode="project-workspace"');
    expect(markup).toContain("<aside");

    const aiChat = markup.indexOf(">AI Chat<");
    const pinned = markup.indexOf(">Pinned dashboards<");
    const traces = markup.indexOf(">Traces<");
    const logs = markup.indexOf(">Logs<");
    const metrics = markup.indexOf(">Metrics<");
    const dashboards = markup.indexOf(">Dashboards<");
    const evaluations = markup.indexOf(">Evaluations<");
    const settings = markup.indexOf(">Settings<");

    expect(markup).not.toContain(">Overview<");
    expect(aside).not.toContain(">Selected project<");
    expect(aside).not.toContain(">Checkout<");
    expect(aiChat).toBeGreaterThan(-1);
    expect(pinned).toBeGreaterThan(aiChat);
    expect(traces).toBeGreaterThan(pinned);
    expect(logs).toBeGreaterThan(traces);
    expect(metrics).toBeGreaterThan(logs);
    expect(dashboards).toBeGreaterThan(metrics);
    expect(evaluations).toBeGreaterThan(dashboards);
    expect(settings).toBeGreaterThan(evaluations);
    expect(markup).not.toContain(">Live<");
    expect(markup).toContain("Pinned dashboards");
    expect(markup).toContain("Service health");
    expect(markup).toContain("/dashboards?dashboard=dashboard-1");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Latency drilldown");
  });

  test("keeps the project sidebar visible on project settings routes", () => {
    const markup = shellMarkup({
      path: "/projects/project-1/settings/ingest",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    expect(markup).toContain('data-shell-mode="project-workspace"');
    expect(markup).toContain("<aside");
    expect(markup).not.toContain(">Overview<");
    expect(markup).toContain(">Settings<");
    expect(markup).toContain("Route content");
  });

  test("renders a mobile navigation sheet trigger with current context", () => {
    const markup = shellMarkup({
      path: "/traces",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    expect(markup).toContain('aria-label="Projects"');
    expect(markup).toContain("Checkout");
  });

  test("does not render telemetry route tabs in the global topbar", () => {
    const markup = shellMarkup({
      path: "/traces",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    const header = headerMarkup(markup);

    expect(header).toContain("CloudGrid");
    expect(header).not.toContain('aria-label="Selected company"');
    expect(header).toContain("Checkout");
    expect(header).not.toContain(">Live<");
    expect(header).not.toContain(">Traces<");
    expect(header).not.toContain(">Logs<");
    expect(header).not.toContain(">Metrics<");
  });

  test("does not expose the removed GraphQL UI from the shell", () => {
    const markup = shellMarkup({
      path: "/traces",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    expect(markup).not.toContain("GraphQL UI");
    expect(markup).not.toContain('aria-label="GraphQL UI"');
    expect(markup).not.toContain('href="/graphql"');
  });

  test("does not expose the removed GraphQL UI from the command menu", () => {
    const markup = commandPaletteMarkup();

    expect(markup).not.toContain("Open GraphQL UI");
    expect(markup).not.toContain("/graphql");
  });

  test("shows the company selector only when the viewer belongs to multiple companies", () => {
    const multiCompanyViewer = {
      ...viewer,
      organizations: [
        viewer.organizations[0],
        {
          id: "org-2",
          name: "Second Co",
          slug: "second",
          role: "user" as const,
          projects: [{ ...project, id: "project-2", organizationId: "org-2", name: "Billing" }],
        },
      ],
      selectedProject: project,
    };

    const markup = shellMarkup({ path: "/traces", sessionViewer: multiCompanyViewer });
    const header = headerMarkup(markup);

    expect(header).toContain('aria-label="Selected company"');
    expect(header).toContain("Example Co");
    expect(header).toContain("Second Co");
  });

  test("groups project options by company and shows selected company/project", () => {
    const multiCompanyViewer: Viewer = {
      ...viewer,
      organizations: [
        viewer.organizations[0],
        {
          id: "org-2",
          name: "Second Co",
          slug: "second",
          role: "user",
          projects: [{ ...project, id: "project-2", organizationId: "org-2", name: "Billing" }],
        },
      ],
      selectedProject: project,
    };

    const markup = shellMarkup({ path: "/traces", sessionViewer: multiCompanyViewer });
    const header = headerMarkup(markup);

    expect(header).toContain("Example Co / Checkout");
    expect(markup).toContain("Example Co");
    expect(markup).toContain("Second Co");

    const source = readFileSync(new URL("../src/routes/app-shell.tsx", import.meta.url), "utf8");
    expect(source).toContain("function ProjectSelectGroups");
    expect(source).toContain("<SelectLabel>{organization.name}</SelectLabel>");
    expect(source).toContain("<SelectSeparator />");
  });

  test("uses the admin route company in the topbar selector", () => {
    const multiCompanyViewer: Viewer = {
      ...viewer,
      organizations: [
        viewer.organizations[0],
        {
          id: "org-2",
          name: "Second Co",
          slug: "second",
          role: "admin",
          projects: [{ ...project, id: "project-2", organizationId: "org-2", name: "Billing" }],
        },
      ],
      selectedProject: project,
    };

    const markup = shellMarkup({
      path: "/organizations/org-2/projects",
      sessionViewer: multiCompanyViewer,
    });
    const header = headerMarkup(markup);

    expect(header).toContain('aria-label="Selected company"');
    expect(header).toContain('<span class="truncate">Second Co</span>');
    expect(header).toContain("Example Co / Checkout");
    expect(header).toContain('href="/organizations/org-2/projects"');
  });

  test("shows a topbar company settings action for company admins", () => {
    const markup = shellMarkup({
      path: "/traces",
      sessionViewer: { ...viewer, selectedProject: project },
    });
    const header = headerMarkup(markup);

    expect(header).toContain('aria-label="Company settings"');
    expect(header).toContain('href="/organizations/org-1/projects"');
  });

  test("hides the topbar company settings action from non-admin company users", () => {
    const memberViewer: Viewer = {
      ...viewer,
      organizations: [{ ...viewer.organizations[0], role: "user" }],
      selectedProject: project,
    };
    const markup = shellMarkup({ path: "/traces", sessionViewer: memberViewer });
    const header = headerMarkup(markup);

    expect(header).not.toContain('aria-label="Company settings"');
    expect(header).not.toContain('href="/organizations/org-1/projects"');
  });

  test("keeps company AI provider settings in the admin settings shell", () => {
    const markup = shellMarkup({
      path: "/organizations/org-1/ai-provider",
      sessionViewer: { ...viewer, selectedProject: project },
    });

    expect(markup).toContain('data-shell-mode="admin-settings"');
    expect(markup).toContain(">AI Provider<");
    expect(markup).toContain(">Projects<");
    expect(markup).toContain(">Members<");
    expect(markup).not.toContain(">Companies<");
    expect(markup).not.toContain(">Company<");
    expect(markup).not.toContain(">Traces<");
  });
});
