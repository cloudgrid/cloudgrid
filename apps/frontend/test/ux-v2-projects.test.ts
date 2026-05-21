import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type {
  CompanyAiProviderSettings,
  Organization,
  Project,
  Viewer,
} from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "../src/components/ui/tooltip";
import {
  buildAdminSettingsModel,
  buildProjectPickerModel,
  buildProjectSettingsSections,
  canMutateOrganizationMember,
} from "../src/features/projects/project-view-model";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import {
  buildProjectSetupSnippet,
  mergeCreatedIngestCredential,
  OrganizationAiProviderRoute,
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

const companyAiProviderSettings: CompanyAiProviderSettings = {
  companyId: "org-example",
  providerProfile: {
    id: "company-chat-provider",
    ownerScope: "company",
    ownerId: "org-example",
    label: "Company chat",
    providerKind: "openai",
    baseUrl: null,
    credentialRef: "env:OPENAI_API_KEY",
    models: { chat: ["gpt-5-mini"] },
    parameters: {},
    timeoutMs: 30000,
    maxConcurrency: null,
    disabledAt: null,
  },
  chatModelAlias: {
    id: "company-chat",
    name: "chat",
    providerProfileId: "company-chat-provider",
    model: "gpt-5-mini",
    purpose: "chat",
    parameters: { extras: {} },
  },
  effective: {
    warnings: [],
    missingProviderProfiles: [],
    disabledProviderProfiles: [],
    missingChatProvider: false,
  },
  version: 1,
  updatedAt: "2026-05-15T08:00:00.000Z",
  updatedByUserId: "user-1",
};

function controlPlaneMarkup(
  path: string,
  options: { companyAiProviderSettings?: CompanyAiProviderSettings } = {},
) {
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
  queryClient.setQueryData(["ProjectAiSettings", "project-checkout"], {
    projectId: "project-checkout",
    enabled: true,
    defaultProviderProfileId: null,
    defaultJudgeProfileId: null,
    defaultOptimizerProfileId: null,
    defaultEmbeddingProfileId: null,
    providerProfiles: [
      {
        id: "profile-1",
        projectId: "project-checkout",
        label: "Default judge",
        providerKind: "openai",
        baseUrl: null,
        credentialRef: "secret://openai",
        models: ["gpt-5-mini"],
        parameters: {},
        timeoutMs: 30000,
        maxConcurrency: null,
        disabledAt: null,
      },
    ],
    modelAliases: [
      {
        id: "alias-1",
        name: "judge",
        providerProfileId: "profile-1",
        model: "gpt-5-mini",
        purpose: "judge",
        parameters: {},
      },
    ],
    onlinePolicies: [
      {
        id: "policy-1",
        enabled: true,
        name: "Checkout quality",
        target: { service: "checkout" },
        scorerIds: ["scorer-1"],
        sampleRate: 0.1,
        maxDailyRuns: 100,
        annotationRules: [],
        updatedAt: "2026-05-15T08:00:00.000Z",
        updatedByUserId: "user-1",
      },
    ],
    budget: {
      dailyUsd: 5,
      perRunUsd: 0.1,
      deterministicOnly: false,
      spentTodayUsd: 1.25,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentExperimentItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    datasetDefaults: {
      splitAllocation: { train: 0.8, validation: 0.2 },
      smallDatasetReviewedThreshold: 25,
      requireReviewForRegression: true,
    },
    effective: {
      warnings: [],
      deterministicOnly: false,
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      budgetExhausted: false,
    },
    version: 1,
    updatedAt: "2026-05-15T08:00:00.000Z",
    updatedByUserId: "user-1",
  });
  queryClient.setQueryData(
    ["CompanyAiProviderSettings", "org-example"],
    options.companyAiProviderSettings ?? companyAiProviderSettings,
  );
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
    getProjectAiSettings: async () =>
      queryClient.getQueryData(["ProjectAiSettings", "project-checkout"]),
    getCompanyAiProviderSettings: async () =>
      queryClient.getQueryData(["CompanyAiProviderSettings", "org-example"]),
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
    updateProjectAiSettings: async (input) => ({
      ...queryClient.getQueryData(["ProjectAiSettings", input.projectId]),
      enabled: input.enabled,
      version: input.expectedVersion + 1,
    }),
    updateCompanyAiProviderSettings: async (input) => ({
      ...companyAiProviderSettings,
      companyId: input.companyId,
      providerProfile: {
        ...companyAiProviderSettings.providerProfile,
        ...input.providerProfile,
        parameters: input.providerProfile.parameters ?? {},
        ownerScope: "company",
        ownerId: input.companyId,
        disabledAt: input.providerProfile.disabled ? "2026-05-15T08:00:00.000Z" : null,
      },
      chatModelAlias: {
        ...companyAiProviderSettings.chatModelAlias,
        ...input.chatModelAlias,
      },
      version: input.expectedVersion + 1,
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
                  path: "/organizations/:organizationId/ai-provider",
                  element: createElement(OrganizationAiProviderRoute),
                }),
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
    expect(buildProjectSettingsSections("project-checkout", { aiEvalEnabled: true })).toEqual([
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
        id: "ai-eval",
        href: "/projects/project-checkout/settings/ai-eval",
        labelKey: "projects.settings.aiEval",
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

  test("exposes editable AI Eval provider, budget, and parallel execution settings", () => {
    const source = readFileSync(
      new URL("../src/routes/control-plane-routes.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('name="defaultProviderProfileId"');
    expect(source).toContain('name="budgetDailyUsd"');
    expect(source).toContain('name="maxConcurrentExperimentItems"');
    expect(source).toContain("maxConcurrency");
    expect(source).toContain("Provider profiles");
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
    expect(admin.sidebarItems.map((item) => item.id)).toEqual([
      "organization",
      "projects",
      "ai-provider",
    ]);
    expect(admin.showMemberAdministration).toBe(false);
  });

  test("renders company AI Chat provider settings without raw secret inputs", () => {
    const markup = controlPlaneMarkup("/organizations/org-example/ai-provider");

    expect(markup).toContain("AI Provider");
    expect(markup).toContain("Company chat");
    expect(markup).toContain("env:OPENAI_API_KEY");
    expect(markup).toContain("gpt-5-mini");
    expect(markup).toContain("Save AI provider");
    expect(markup).toContain("credentialRef");
    expect(markup).not.toContain("api key value");
    expect(markup).not.toContain('name="secret"');
  });

  test("does not preserve unsupported legacy company AI credential refs", () => {
    const markup = controlPlaneMarkup("/organizations/org-example/ai-provider", {
      companyAiProviderSettings: {
        ...companyAiProviderSettings,
        providerProfile: companyAiProviderSettings.providerProfile
          ? {
              ...companyAiProviderSettings.providerProfile,
              credentialRef: "secret://ai/openai",
            }
          : null,
      },
    });

    expect(markup).toContain('name="credentialRef"');
    expect(markup).not.toContain("secret://ai/openai");
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

  test("renders project AI Eval settings from the GraphQL project settings contract", () => {
    const markup = controlPlaneMarkup("/projects/project-checkout/settings/ai-eval");

    expect(markup).toContain(">AI Eval<");
    expect(markup).toContain("Enable AI Eval for this project");
    expect(markup).toContain("Provider profiles");
    expect(markup).toContain("$1.25 / $5.00");
    expect(markup).toContain("Save AI Eval settings");
    expect(markup).toContain("Open AI Eval workspace");
    expect(markup).not.toContain("AI Eval settings could not be loaded.");
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
    expect(
      buildProjectSetupSnippet("http://localhost:4318", "cg_live_created").split("\n"),
    ).toEqual([
      "export CLOUDGRID_PROJECT_API_KEY='cg_live_created'",
      "export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:4318'",
    ]);
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
