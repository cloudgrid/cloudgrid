import { describe, expect, test } from "bun:test";
import type {
  AiChatActionProposal,
  AiChatConversation,
  AiChatHistory,
  CompanyAiProviderSettings,
  Project,
  Viewer,
} from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  aiChatApprovalInput,
  aiChatHistoryQueryKey,
  aiChatProviderQueryKey,
  safeAiChatArtifactView,
} from "../src/features/ai-chat/view-model";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import { AiChatRoute } from "../src/routes/ai-chat-route";
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

const otherProject: Project = {
  ...project,
  id: "project-2",
  name: "Billing",
  slug: "billing",
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
      projects: [project, otherProject],
    },
  ],
  selectedProject: project,
};

const providerSettings: CompanyAiProviderSettings = {
  companyId: "org-1",
  providerProfile: {
    id: "provider-1",
    ownerScope: "company",
    ownerId: "org-1",
    label: "Primary OpenAI",
    providerKind: "openai",
    credentialRef: "secret://ai/openai",
    models: ["gpt-5-mini"],
    timeoutMs: 30_000,
    maxConcurrency: null,
    disabledAt: null,
  },
  chatModelAlias: {
    id: "alias-1",
    name: "chat-default",
    providerProfileId: "provider-1",
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
  updatedAt: "2026-05-18T08:00:00.000Z",
  updatedByUserId: "user-1",
};

const actionProposal: AiChatActionProposal = {
  id: "action-1",
  runId: "run-1",
  conversationId: "chat-new",
  title: "Create dashboard",
  description: "Save a checkout latency dashboard.",
  risk: "destructive",
  status: "proposed",
  operation: "dashboard.save",
  preview: { dashboard: "Checkout latency" },
  result: null,
  requestedAt: "2026-05-18T08:04:00.000Z",
  decidedAt: null,
  decidedByUserId: null,
  version: 3,
};

const activeConversation: AiChatConversation = {
  id: "chat-new",
  companyId: "org-1",
  projectId: "project-1",
  userId: "user-1",
  title: "Investigate checkout latency",
  status: "active",
  messages: [
    {
      id: "message-1",
      conversationId: "chat-new",
      role: "user",
      parts: [{ type: "text", text: "Why did checkout latency spike?" }],
      createdAt: "2026-05-18T08:01:00.000Z",
    },
    {
      id: "message-2",
      conversationId: "chat-new",
      role: "assistant",
      parts: [
        { type: "text", text: "The p95 spike matches the checkout-api deploy window." },
        { type: "json_render", artifactId: "artifact-1" },
        { type: "action_request", actionId: "action-1" },
      ],
      createdAt: "2026-05-18T08:02:00.000Z",
    },
  ],
  latestRun: {
    id: "run-1",
    conversationId: "chat-new",
    status: "awaiting_approval",
    providerProfileId: "provider-1",
    model: "gpt-5-mini",
    artifacts: [
      {
        id: "artifact-1",
        runId: "run-1",
        kind: "json_render",
        label: "Latency summary",
        mimeType: "application/json",
        content: { renderer: "table", rows: [{ service: "checkout-api", p95: 940 }] },
        createdAt: "2026-05-18T08:03:00.000Z",
      },
    ],
    actionProposals: [actionProposal],
    startedAt: "2026-05-18T08:01:00.000Z",
    completedAt: null,
    error: null,
  },
  compaction: null,
  createdAt: "2026-05-18T08:00:00.000Z",
  updatedAt: "2026-05-18T08:04:00.000Z",
  lastMessageAt: "2026-05-18T08:04:00.000Z",
  version: 2,
};

const olderConversation: AiChatConversation = {
  ...activeConversation,
  id: "chat-old",
  title: "Older checkout question",
  messages: [],
  latestRun: null,
  lastMessageAt: "2026-05-18T07:00:00.000Z",
};

const otherProjectConversation: AiChatConversation = {
  ...activeConversation,
  id: "chat-billing",
  projectId: "project-2",
  title: "Billing retry errors",
  messages: [],
  latestRun: null,
  lastMessageAt: "2026-05-18T07:30:00.000Z",
};

const history: AiChatHistory = {
  companyId: "org-1",
  userId: "user-1",
  projectGroups: [
    {
      projectId: "project-2",
      projectName: "Billing",
      conversations: [otherProjectConversation],
    },
    {
      projectId: "project-1",
      projectName: "Checkout",
      conversations: [olderConversation, activeConversation],
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};

function aiChatMarkup({
  path = "/ai-chat?conversation=chat-new",
  provider = providerSettings,
  sessionViewer = viewer,
}: {
  path?: string;
  provider?: CompanyAiProviderSettings;
  sessionViewer?: Viewer;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["Viewer"], sessionViewer);
  queryClient.setQueryData(aiChatProviderQueryKey("org-1"), provider);
  queryClient.setQueryData(aiChatHistoryQueryKey({ companyId: "org-1", projectId: "project-1" }), {
    ...history,
    projectGroups: [...history.projectGroups],
  });

  const client = {
    approveAiChatAction: async () => ({ ...actionProposal, status: "approved" as const }),
    createAiChatConversation: async () => activeConversation,
    createProject: async () => project,
    getAiChatConversation: async () => activeConversation,
    getAiChatHistory: async () => history,
    getCompanyAiProviderSettings: async () => provider,
    getDashboards: async () => ({ items: [], pinnedDashboardIds: [] }),
    getViewer: async () => sessionViewer,
    selectProject: async () => sessionViewer,
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider client={client} mode="deployed">
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route element={<AiChatRoute />} path="/ai-chat" />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("AI Chat route", () => {
  test("adds AI Chat to project navigation after Dashboards and before AI Eval", () => {
    const markup = aiChatMarkup();
    const dashboards = markup.indexOf(">Dashboards<");
    const aiChat = markup.indexOf(">AI Chat<");
    const aiEval = markup.indexOf(">AI eval<");

    expect(dashboards).toBeGreaterThan(-1);
    expect(aiChat).toBeGreaterThan(dashboards);
    expect(aiEval).toBeGreaterThan(aiChat);
  });

  test("renders history grouped by project with selected project first and newest conversation first", () => {
    const markup = aiChatMarkup();
    const checkout = markup.indexOf(">Checkout<");
    const billing = markup.indexOf(">Billing<");
    const newest = markup.indexOf("Investigate checkout latency");
    const older = markup.indexOf("Older checkout question");

    expect(checkout).toBeGreaterThan(-1);
    expect(billing).toBeGreaterThan(checkout);
    expect(newest).toBeGreaterThan(-1);
    expect(older).toBeGreaterThan(newest);
    expect(markup).toContain("The p95 spike matches the checkout-api deploy window.");
    expect(markup).toContain("Latency summary");
  });

  test("shows distinct missing-provider states for company admins and non-admin users", () => {
    const missingProvider = {
      ...providerSettings,
      providerProfile: null,
      chatModelAlias: null,
      effective: { ...providerSettings.effective, missingChatProvider: true },
    };
    const adminMarkup = aiChatMarkup({ provider: missingProvider });
    const userMarkup = aiChatMarkup({
      provider: missingProvider,
      sessionViewer: {
        ...viewer,
        organizations: [{ ...viewer.organizations[0], role: "user" }],
      },
    });

    expect(adminMarkup).toContain("/organizations/org-1/ai-provider");
    expect(adminMarkup).toContain("Configure AI provider");
    expect(userMarkup).toContain("A company admin must configure AI Chat");
    expect(userMarkup).not.toContain("/organizations/org-1/ai-provider");
  });

  test("rejects unknown json-render artifact keys", () => {
    expect(
      safeAiChatArtifactView({
        id: "artifact-ok",
        runId: "run-1",
        kind: "json_render",
        label: "Table",
        mimeType: "application/json",
        content: { renderer: "table", rows: [] },
        createdAt: "2026-05-18T08:03:00.000Z",
      }),
    ).toMatchObject({ kind: "json_render", renderer: "table" });
    expect(
      safeAiChatArtifactView({
        id: "artifact-bad",
        runId: "run-1",
        kind: "json_render",
        label: "Unknown",
        mimeType: "application/json",
        content: { renderer: "external_iframe", src: "https://example.com" },
        createdAt: "2026-05-18T08:03:00.000Z",
      }),
    ).toMatchObject({ kind: "unsupported" });
  });

  test("approval inputs are derived only from server-issued proposal IDs", () => {
    expect(aiChatApprovalInput(actionProposal, true)).toEqual({
      actionId: "action-1",
      approved: true,
      expectedVersion: 3,
      reason: null,
    });
  });

  test("does not expose client-side execution hooks for action proposals", () => {
    const source = readFileSync(
      new URL("../src/routes/ai-chat-route.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("approveAiChatAction");
    expect(source).not.toMatch(/runAction|executeAction|eval\(|new Function/);
  });

  test("submits prompt runs through the public API client stream helper", () => {
    const source = readFileSync(
      new URL("../src/routes/ai-chat-route.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("streamAiChatRun");
    expect(source).not.toContain('fetch("/api/ai-chat/stream');
    expect(source).not.toContain("fetch('/api/ai-chat/stream");
  });
});
