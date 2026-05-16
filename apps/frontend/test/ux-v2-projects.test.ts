import { describe, expect, test } from "bun:test";
import type { Organization, Project, Viewer } from "@cloudgrid/ui-contracts";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  buildAdminSettingsModel,
  buildProjectPickerModel,
  buildProjectSettingsSections,
  canMutateOrganizationMember,
} from "../src/features/projects/project-view-model";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import {
  buildProjectSetupSnippet,
  mergeCreatedIngestCredential,
  ProjectSettingsRoute,
  ProjectsRoute,
  ProjectWorkspaceRedirectRoute,
} from "../src/routes/control-plane-routes";

const emptyTelemetry = {
  lastIngestAt: null,
  traceCount: 0,
  logCount: 0,
  metricCount: 0,
  serviceCount: 0,
};

const checkoutProject: Project = {
  id: "project-checkout",
  organizationId: "org-example",
  name: "Checkout API",
  slug: "checkout-api",
  status: "active",
  telemetry: {
    ...emptyTelemetry,
    traceCount: 12,
    logCount: 40,
    serviceCount: 3,
  },
};

const exampleOrganization: Organization = {
  id: "org-example",
  name: "Example Co",
  slug: "example",
  role: "admin",
  projects: [checkoutProject],
};

const viewer: Viewer = {
  user: {
    id: "user-1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
  },
  organizations: [exampleOrganization],
  selectedProject: null,
};

function controlPlaneMarkup(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  queryClient.setQueryData(["Viewer"], { ...viewer, selectedProject: checkoutProject });
  queryClient.setQueryData(["RetentionPolicy", "project-checkout"], {
    projectId: "project-checkout",
    rules: [
      {
        dataClass: "TRACES",
        mode: "delete",
        retentionDays: 30,
        softDeleteDays: null,
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
        version: 1,
      },
      {
        dataClass: "LOGS",
        mode: "retain",
        retentionDays: null,
        softDeleteDays: null,
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
        version: 1,
      },
      {
        dataClass: "METRICS",
        mode: "soft_delete_then_delete",
        retentionDays: 90,
        softDeleteDays: 14,
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
        version: 1,
      },
    ],
    updatedAt: "2026-05-15T08:00:00.000Z",
    updatedByUserId: "user-1",
    version: 1,
  });
  queryClient.setQueryData(
    ["ProjectMembers", "project-checkout"],
    [
      {
        projectId: "project-checkout",
        userId: "user-1",
        email: "ada@example.com",
        displayName: "Ada",
        role: "admin",
        effectiveRole: "admin",
        source: "local_personal",
        createdAt: "2026-05-15T08:00:00.000Z",
        createdByUserId: "user-1",
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
      },
    ],
  );
  const client = {
    createIngestCredential: async () => ({
      credential: {
        id: "credential-2",
        title: "new key",
        secretPreview: "cg_live_...",
        createdAt: "2026-05-15T08:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        createdByUserId: "user-1",
      },
      secret: "cg_live_new",
    }),
    createProject: async () => checkoutProject,
    getIngestCredentials: async () => ({
      items: [
        {
          id: "credential-1",
          title: "checkout service",
          secretPreview: "cg_live_123...",
          createdAt: "2026-05-15T08:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    }),
    getProjectMembers: async () => [
      {
        projectId: "project-checkout",
        userId: "user-1",
        email: "ada@example.com",
        displayName: "Ada",
        role: "admin",
        effectiveRole: "admin",
        source: "local_personal",
        createdAt: "2026-05-15T08:00:00.000Z",
        createdByUserId: "user-1",
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
      },
    ],
    getRetentionPolicy: async () => ({
      projectId: "project-checkout",
      rules: [
        {
          dataClass: "TRACES",
          mode: "delete",
          retentionDays: 30,
          softDeleteDays: null,
          updatedAt: "2026-05-15T08:00:00.000Z",
          updatedByUserId: "user-1",
          version: 1,
        },
      ],
      updatedAt: "2026-05-15T08:00:00.000Z",
      updatedByUserId: "user-1",
      version: 1,
    }),
    getViewer: async () => ({ ...viewer, selectedProject: checkoutProject }),
    removeProjectMember: async () => true,
    revokeIngestCredential: async () => true,
    selectProject: async () => ({ ...viewer, selectedProject: checkoutProject }),
    updateProjectMember: async () => ({
      projectId: "project-checkout",
      userId: "user-1",
      email: "ada@example.com",
      displayName: "Ada",
      role: "admin",
      effectiveRole: "admin",
      source: "direct",
      createdAt: "2026-05-15T08:00:00.000Z",
      createdByUserId: "user-1",
      updatedAt: "2026-05-15T08:00:00.000Z",
      updatedByUserId: "user-1",
    }),
    updateRetentionPolicy: async () => ({
      projectId: "project-checkout",
      rules: [],
      updatedAt: "2026-05-15T08:00:00.000Z",
      updatedByUserId: "user-1",
      version: 2,
    }),
  };

  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          TooltipProvider,
          null,
          createElement(
            AppSessionProvider,
            { client, mode: "deployed" },
            createElement(
              MemoryRouter,
              { initialEntries: [path] },
              createElement(
                Routes,
                null,
                createElement(Route, {
                  path: "/projects",
                  element: createElement(ProjectsRoute),
                }),
                createElement(Route, {
                  path: "/projects/:projectId",
                  element: createElement(ProjectWorkspaceRedirectRoute),
                }),
                createElement(Route, {
                  path: "/projects/:projectId/settings/*",
                  element: createElement(ProjectSettingsRoute),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

describe("UX v2 project models", () => {
  test("builds a centered project picker model without global dashboard or company rail surfaces", () => {
    const picker = buildProjectPickerModel({
      viewer,
      organizationId: "org-example",
      search: "checkout",
    });

    expect(picker.layout).toBe("centered-picker");
    expect(picker.showGlobalStats).toBe(false);
    expect(picker.showCompanyRail).toBe(false);
    expect(picker.primaryAction).toBe("select-project");
    expect(picker.projects.map((project) => project.id)).toEqual(["project-checkout"]);
  });

  test("uses create project as the empty picker primary action", () => {
    const picker = buildProjectPickerModel({
      viewer: {
        ...viewer,
        organizations: [{ ...exampleOrganization, projects: [] }],
      },
      organizationId: "org-example",
      search: "",
    });

    expect(picker.primaryAction).toBe("create-project");
    expect(picker.emptyReason).toBe("no-projects");
  });

  test("exposes dedicated project settings sections under the project settings route", () => {
    expect(buildProjectSettingsSections("project-checkout")).toEqual([
      {
        id: "general",
        href: "/projects/project-checkout/settings",
        labelKey: "projects.settings.general",
      },
      {
        id: "ingest",
        href: "/projects/project-checkout/settings/ingest",
        labelKey: "projects.settings.apiKeys",
      },
      {
        id: "retention",
        href: "/projects/project-checkout/settings/retention",
        labelKey: "projects.settings.retention",
      },
      {
        id: "members",
        href: "/projects/project-checkout/settings/members",
        labelKey: "projects.settings.members",
      },
    ]);
  });

  test("renders project settings breadcrumbs above the route heading", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/ingest");

    const breadcrumb = markup.indexOf('aria-label="Back"');
    const heading = markup.lastIndexOf(">API Keys<");

    expect(breadcrumb).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(breadcrumb);
    expect(markup).toContain(">Projects<");
    expect(markup).toContain(">Checkout API<");
    expect(markup).toContain(">Settings<");
  });

  test("uses general as the project settings root without an overview subpage", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings");

    expect(markup).toContain(">General<");
    expect(markup).toContain("Checkout API");
    expect(markup).not.toContain("Project status, ingest health, and telemetry navigation.");
    expect(markup).not.toContain(
      "Save changes is unavailable until update mutations are specified.",
    );
  });

  test("keeps project picker cards flat without shadow or excessive radius", () => {
    const markup = controlPlaneMarkup("/projects");

    expect(markup).toContain("Checkout API");
    expect(markup).toContain("No ingest yet");
    expect(markup).toContain("<button");
    expect(markup).toContain("cursor-pointer");
    expect(markup).toContain("Open project");
    expect(markup).not.toContain("<button>Open project</button>");
    expect(markup).not.toContain("Current project");
    expect(markup).not.toContain(">none<");
    expect(markup).not.toContain("shadow-sm");
    expect(markup).not.toContain("rounded-xl");
  });

  test("opens selected or created projects directly in traces instead of a project overview", () => {
    const source = readFileSync(
      new URL("../src/routes/control-plane-routes.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('navigate("/traces")');
    expect(source).not.toContain("navigate(`/projects/$" + "{project.id}`)");
    expect(source).toContain("onClick={() => onOpenProject(project)}");
  });

  test("does not render the removed project overview page", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout");

    expect(markup).not.toContain("Project setup");
    expect(markup).not.toContain("Project status, ingest health, and telemetry navigation.");
  });

  test("does not revoke ingest credentials directly from the table action", () => {
    const source = readFileSync(
      new URL("../src/routes/control-plane-routes.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("onClick={() => revokeMutation.mutate(credential.id)}");
    expect(source).toContain("<Dialog");
  });

  test("prevents the single local Personal user from being demoted or removed", () => {
    expect(
      canMutateOrganizationMember({
        mode: "local",
        organization: {
          id: "local",
          name: "Personal",
          slug: "local",
          role: "admin",
          projects: [],
        },
        viewerUserId: "local",
        targetUserId: "local",
        mutation: "remove",
      }),
    ).toEqual({
      allowed: false,
      reason: "local-personal-single-admin",
    });

    expect(
      canMutateOrganizationMember({
        mode: "deployed",
        organization: exampleOrganization,
        viewerUserId: "user-1",
        targetUserId: "user-2",
        mutation: "promote",
      }),
    ).toEqual({ allowed: true });
  });

  test("limits local Personal admin settings surfaces", () => {
    const admin = buildAdminSettingsModel({
      mode: "local",
      organization: {
        id: "local",
        name: "Personal",
        slug: "local",
        role: "admin",
        projects: [],
      },
    });

    expect(admin.layout).toBe("admin-settings");
    expect(admin.sidebarItems.map((item) => item.id)).toEqual(["organization", "projects"]);
    expect(admin.showMemberAdministration).toBe(false);
  });

  test("renders retention settings from the GraphQL retention policy contract", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/retention");

    expect(markup).toContain("Retention");
    expect(markup).toContain("Traces");
    expect(markup).toContain("Delete");
    expect(markup).toContain("30");
    expect(markup).toContain("Save retention policy");
    expect(markup).not.toContain("Retention policy is not configurable");
    expect(markup).not.toContain("Retention policy could not be saved.");
  });

  test("disables retention fields that do not apply to the selected retention mode", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/retention");

    expect(markup).toMatch(/<input[^>]*aria-label="Logs Retention days"[^>]*disabled=""/);
    expect(markup).toMatch(/<input[^>]*aria-label="Logs Soft delete days"[^>]*disabled=""/);
    expect(markup).toMatch(/<input[^>]*aria-label="Traces Retention days"[^>]*max="365"/);
    expect(markup).not.toMatch(/<input[^>]*aria-label="Traces Retention days"[^>]*disabled=""/);
    expect(markup).toMatch(/<input[^>]*aria-label="Traces Soft delete days"[^>]*disabled=""/);
    expect(markup).toMatch(/<input[^>]*aria-label="Metrics Soft delete days"[^>]*max="90"/);
    expect(markup).not.toMatch(/<input[^>]*aria-label="Metrics Soft delete days"[^>]*disabled=""/);
  });

  test("renders project members from GraphQL and enforces local Personal safeguards", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/members");

    expect(markup).toContain("Ada");
    expect(markup).toContain("local_personal");
    expect(markup).toContain("Local Personal admin");
    expect(markup).toContain("cannot be removed or demoted");
    expect(markup).toContain("disabled");
    expect(markup).toContain(">Members<");
    expect(markup).not.toContain("Save member");
    expect(markup).not.toContain("User ID");
    expect(markup).not.toContain("Company members");
    expect(markup).not.toContain("Project members could not be updated.");
    expect(markup).not.toContain("Project-specific membership is not available");
  });

  test("keeps ingest settings flat and copyable without credential explainer bloat", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/ingest");

    expect(markup).toContain(">API Keys<");
    expect(markup).not.toContain(">Ingest<");
    expect(markup).toContain("OTLP HTTP endpoint");
    expect(markup).toContain('aria-label="Copy endpoint"');
    expect(markup).toContain("checkout service");
    expect(markup).toContain("Create API key");
    expect(markup).not.toContain("Stored secrets are never displayed.");
    expect(markup).not.toContain("Create titled project API keys for OTLP ingest.");
  });

  test("builds API key setup snippets without obsolete OTLP header exports", () => {
    expect(buildProjectSetupSnippet("http://localhost:4318", "cg_live_created")).toBe(
      `export CLOUDGRID_PROJECT_API_KEY='cg_live_created'
export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318'`,
    );
    expect(buildProjectSetupSnippet("http://localhost:4318", "cg_live_created").split("\n")).toEqual(
      [
        "export CLOUDGRID_PROJECT_API_KEY='cg_live_created'",
        "export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318'",
      ],
    );
    expect(buildProjectSetupSnippet("http://localhost:4318", null)).toBe(
      "export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318'",
    );
  });

  test("adds a newly created API key to the visible credential list", () => {
    expect(
      mergeCreatedIngestCredential(
        {
          items: [
            {
              id: "credential-1",
              title: "checkout service",
              secretPreview: "cg_live_123...",
              createdAt: "2026-05-15T08:00:00.000Z",
              lastUsedAt: null,
              revokedAt: null,
              createdByUserId: "user-1",
            },
          ],
        },
        {
          credential: {
            id: "credential-2",
            title: "worker",
            secretPreview: "cg_live_456...",
            createdAt: "2026-05-16T08:00:00.000Z",
            lastUsedAt: null,
            revokedAt: null,
            createdByUserId: "user-1",
          },
          secret: "cg_live_created",
        },
      ).items.map((item) => item.title),
    ).toEqual(["worker", "checkout service"]);
  });
});
