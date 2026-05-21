import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type {
  AiChatActionProposal,
  AiChatConversation,
  AiChatHistory,
  CompanyAiProviderSettings,
  Project,
  Viewer,
} from "@cloudgrid/ui-contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  applyAiChatStreamEvent,
  aiChatApprovalInput,
  aiChatConversationQueryKey,
  aiChatHistoryQueryKey,
  aiChatProviderQueryKey,
  createAiChatStreamViewState,
  safeAiChatArtifactView,
  orderedAiChatProjectGroups,
} from "../src/features/ai-chat/view-model";
import { AiChatArtifactRenderer } from "../src/features/ai-chat/artifact-renderer";
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
    parameters: {},
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
  actionKind: "dashboard.save",
  graphqlMutation: "saveDashboard",
  inputPreview: { dashboard: "Checkout latency" },
  requiresApproval: true,
  result: null,
  requestedAt: "2026-05-18T08:04:00.000Z",
  decidedAt: null,
  decidedByUserId: null,
  expiresAt: "2026-05-18T08:19:00.000Z",
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
        {
          type: "text",
          text: "**p95** spike matches `checkout-api` deploy window.\n\n- traces increased\n- errors stayed flat\n\n<script>alert(1)</script>",
        },
        { type: "artifact", artifactId: "artifact-1", renderer: "table" },
        { type: "action_proposal", actionProposalId: "action-1" },
      ],
      createdAt: "2026-05-18T08:02:00.000Z",
    },
  ],
  latestRun: {
    id: "run-1",
    conversationId: "chat-new",
    projectId: "project-1",
    userId: "user-1",
    status: "awaiting_approval",
    providerKind: "openai",
    providerProfileId: "provider-1",
    model: "gpt-5-mini",
    traceId: null,
    toolCallCount: 0,
    sandboxScriptCount: 0,
    artifactCount: 1,
    inputTokenCount: null,
    outputTokenCount: null,
    estimatedCostUsd: null,
    artifacts: [
      {
        id: "artifact-1",
        conversationId: "chat-new",
        runId: "run-1",
        kind: "json_render",
        label: "Latency summary",
        mediaType: "application/json",
        sizeBytes: 128,
        renderSpec: { renderer: "table", rows: [{ service: "checkout-api", p95: 940 }] },
        fileRef: null,
        createdAt: "2026-05-18T08:03:00.000Z",
      },
    ],
    actionProposals: [actionProposal],
    startedAt: "2026-05-18T08:01:00.000Z",
    completedAt: null,
    problem: null,
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
  conversation = activeConversation,
  historyData = history,
  path = "/ai-chat?conversation=chat-new",
  provider = providerSettings,
  sessionViewer = viewer,
}: {
  conversation?: AiChatConversation;
  historyData?: AiChatHistory;
  path?: string;
  provider?: CompanyAiProviderSettings;
  sessionViewer?: Viewer;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["Viewer"], sessionViewer);
  queryClient.setQueryData(aiChatProviderQueryKey("org-1"), provider);
  queryClient.setQueryData(
    aiChatConversationQueryKey({
      conversationId: conversation.id,
      projectId: "project-1",
      userId: sessionViewer.user.id,
    }),
    conversation,
  );
  queryClient.setQueryData(
    aiChatHistoryQueryKey({
      companyId: "org-1",
      projectId: "project-1",
      userId: sessionViewer.user.id,
    }),
    {
      ...historyData,
      projectGroups: [...historyData.projectGroups],
    },
  );

  const client = {
    approveAiChatAction: async () => ({ ...actionProposal, status: "approved" as const }),
    createAiChatConversation: async () => conversation,
    createProject: async () => project,
    deleteAiChatConversation: async () => true,
    getAiChatConversation: async () => conversation,
    getAiChatHistory: async () => historyData,
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

  test("renders only selected project history for the current user with newest conversation first", () => {
    const markup = aiChatMarkup();
    const checkout = markup.indexOf(">Checkout<");
    const billing = markup.indexOf(">Billing<");
    const newest = markup.indexOf("Investigate checkout latency");
    const older = markup.indexOf("Older checkout question");

    expect(checkout).toBeGreaterThan(-1);
    expect(billing).toBe(-1);
    expect(newest).toBeGreaterThan(-1);
    expect(older).toBeGreaterThan(newest);
    expect(markup).toContain('aria-label="Delete conversation"');
    expect(markup).toContain("<strong>p95</strong>");
    expect(markup).toContain("<code");
    expect(markup).toContain("checkout-api");
    expect(markup).toContain("<li>traces increased</li>");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("Latency summary");
  });

  test("new conversation route keeps history visible without selecting the latest chat", () => {
    const markup = aiChatMarkup({ path: "/ai-chat" });

    expect(markup).toContain('aria-label="New conversation"');
    expect(markup).toContain("Investigate checkout latency");
    expect(markup).toContain("Older checkout question");
    expect(markup).toContain("No conversations yet");
    expect(markup).not.toContain("<strong>p95</strong>");
  });

  test("selected chat uses hydrated conversation data when history only has summaries", () => {
    const summaryHistory: AiChatHistory = {
      ...history,
      projectGroups: history.projectGroups.map((group) => ({
        ...group,
        conversations: group.conversations.map((conversation) => ({
          ...conversation,
          messages: [],
          latestRun: null,
        })),
      })),
    };
    const markup = aiChatMarkup({ historyData: summaryHistory });

    expect(markup).toContain("Why did checkout latency spike?");
    expect(markup).toContain("<strong>p95</strong>");
    expect(markup).toContain("Latency summary");
  });

  test("does not render a direct-url conversation from another project", () => {
    const markup = aiChatMarkup({
      conversation: otherProjectConversation,
      path: "/ai-chat?conversation=chat-billing",
    });

    expect(markup).not.toContain("Billing retry errors");
    expect(markup).not.toContain("Why did checkout latency spike?");
    expect(markup).toContain("No conversations yet");
  });

  test("rejects stale cached history for another project or user", () => {
    const staleUserConversation: AiChatConversation = {
      ...activeConversation,
      id: "chat-other-user",
      title: "Other user's checkout incident",
      userId: "user-2",
      lastMessageAt: "2026-05-18T09:00:00.000Z",
    };
    const staleHistory: AiChatHistory = {
      ...history,
      projectGroups: [
        {
          projectId: "project-1",
          projectName: "Checkout",
          conversations: [staleUserConversation, activeConversation],
        },
        {
          projectId: "project-2",
          projectName: "Billing",
          conversations: [otherProjectConversation],
        },
      ],
    };

    expect(
      orderedAiChatProjectGroups(staleHistory, "project-1", "user-1").flatMap(
        (group) => group.conversations,
      ),
    ).toEqual([activeConversation]);
    expect(
      aiChatHistoryQueryKey({ companyId: "org-1", projectId: "project-1", userId: "user-1" }),
    ).not.toEqual(
      aiChatHistoryQueryKey({ companyId: "org-1", projectId: "project-1", userId: "user-2" }),
    );
    expect(
      aiChatConversationQueryKey({
        conversationId: "chat-new",
        projectId: "project-1",
        userId: "user-1",
      }),
    ).not.toEqual(
      aiChatConversationQueryKey({
        conversationId: "chat-new",
        projectId: "project-1",
        userId: "user-2",
      }),
    );
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
        conversationId: "chat-new",
        runId: "run-1",
        kind: "json_render",
        label: "Table",
        mediaType: "application/json",
        sizeBytes: 64,
        renderSpec: { renderer: "table", rows: [] },
        fileRef: null,
        createdAt: "2026-05-18T08:03:00.000Z",
      }),
    ).toMatchObject({ kind: "json_render", renderer: "table" });
    expect(
      safeAiChatArtifactView({
        id: "artifact-bad",
        conversationId: "chat-new",
        runId: "run-1",
        kind: "json_render",
        label: "Unknown",
        mediaType: "application/json",
        sizeBytes: 64,
        renderSpec: { renderer: "external_iframe", src: "https://example.com" },
        fileRef: null,
        createdAt: "2026-05-18T08:03:00.000Z",
      }),
    ).toMatchObject({ kind: "unsupported" });
  });

  test("renders json-render artifacts through the shared AI artifact renderer", () => {
    const routeSource = readFileSync(
      new URL("../src/routes/ai-chat-route.tsx", import.meta.url),
      "utf8",
    );
    const rendererSource = readFileSync(
      new URL("../src/features/ai-chat/artifact-renderer.tsx", import.meta.url),
      "utf8",
    );

    expect(routeSource).toContain("AiChatArtifactRenderer");
    expect(routeSource).not.toContain("function ArtifactContent");
    expect(rendererSource).toContain("MetricSeriesExplorer");
    expect(rendererSource).toContain("TelemetryChart");
  });

  test("renders status summary artifact rows for rich AI Eval answers", () => {
    const markup = renderToStaticMarkup(
      <AiChatArtifactRenderer
        renderer="status_summary"
        content={{
          renderer: "status_summary",
          title: "AI Eval production quality",
          ariaLabel: "AI Eval production quality summary",
          values: { projectId: "project-1", segments: 1 },
          rows: [
            {
              segment: "Production quality",
              runs: 12,
              passRate: 0.92,
              regressions: 1,
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("projectId");
    expect(markup).toContain("Production quality");
    expect(markup).toContain("passRate");
    expect(markup).toContain("0.92");
  });

  test("renders mixed server-ordered message parts with safe tool status details", () => {
    const mixedConversation: AiChatConversation = {
      ...activeConversation,
      messages: [
        {
          id: "message-mixed",
          conversationId: "chat-new",
          role: "assistant",
          parts: [
            { type: "text", text: "First finding." },
            {
              type: "tool_status",
              toolCallId: "tool-1",
              toolName: "analysis.summarizeTrace",
              label: "Summarize trace",
              status: "running",
              json: {
                input: { traceId: "secret-trace" },
                output: { rows: ["sensitive-row-output"] },
              },
            },
            { type: "artifact", artifactId: "artifact-1", renderer: "table" },
            { type: "approval_result", text: "Approved by Ada." },
            { type: "error", problem: { code: "ERR-AIC-005", detail: "Renderer rejected" } },
            { type: "compaction_summary", text: "Earlier investigation retained." },
            { type: "text", text: "Final note." },
          ],
          createdAt: "2026-05-18T08:05:00.000Z",
        },
      ],
    };
    const markup = aiChatMarkup({ conversation: mixedConversation });
    const first = markup.indexOf("First finding.");
    const tool = markup.indexOf("Summarize trace");
    const artifact = markup.indexOf("Latency summary");
    const approval = markup.indexOf("Approved by Ada.");
    const error = markup.indexOf("ERR-AIC-005");
    const compaction = markup.indexOf("Earlier investigation retained.");
    const final = markup.indexOf("Final note.");

    expect(first).toBeGreaterThan(-1);
    expect(tool).toBeGreaterThan(first);
    expect(artifact).toBeGreaterThan(tool);
    expect(approval).toBeGreaterThan(artifact);
    expect(error).toBeGreaterThan(approval);
    expect(compaction).toBeGreaterThan(error);
    expect(final).toBeGreaterThan(compaction);
    expect(markup).toContain("analysis.summarizeTrace");
    expect(markup).toContain("running");
    expect(markup).not.toContain("secret-trace");
    expect(markup).not.toContain("sensitive-row-output");
  });

  test("keeps cloudgrid-json-render fences inert unless a persisted artifact part backs them", () => {
    const fencedConversation: AiChatConversation = {
      ...activeConversation,
      messages: [
        {
          id: "message-fence",
          conversationId: "chat-new",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: '```cloudgrid-json-render:table\n{ "artifactId": "artifact-forged", "renderer": "table", "spec": { "title": "Forged artifact" } }\n```',
            },
            { type: "artifact", artifactId: "artifact-1", renderer: "table" },
          ],
          createdAt: "2026-05-18T08:05:00.000Z",
        },
      ],
    };
    const markup = aiChatMarkup({ conversation: fencedConversation });

    expect(markup).toContain("artifact-forged");
    expect(markup).not.toContain("Forged artifact</h3>");
    expect(markup).toContain("Latency summary");
  });

  test("preserves mixed stream event ordering before the conversation refreshes", () => {
    const started = createAiChatStreamViewState({
      conversationId: "chat-new",
      userText: "Investigate latency",
    });
    const streamed = [
      {
        type: "run.started" as const,
        conversationId: "chat-new",
        runId: "run-stream",
        sequence: 1,
        createdAt: "2026-05-18T08:05:00.000Z",
        payload: { status: "streaming" },
      },
      {
        type: "text.delta" as const,
        conversationId: "chat-new",
        runId: "run-stream",
        sequence: 2,
        createdAt: "2026-05-18T08:05:01.000Z",
        payload: { messageId: "message-stream", text: "First." },
      },
      {
        type: "tool.started" as const,
        conversationId: "chat-new",
        runId: "run-stream",
        sequence: 3,
        createdAt: "2026-05-18T08:05:02.000Z",
        payload: {
          toolCallId: "tool-1",
          toolName: "analysis.summarizeTrace",
          label: "Summarize trace",
          status: "running",
          input: { traceId: "must-not-render" },
        },
      },
      {
        type: "artifact.created" as const,
        conversationId: "chat-new",
        runId: "run-stream",
        sequence: 4,
        createdAt: "2026-05-18T08:05:03.000Z",
        payload: {
          messageId: "message-stream",
          artifactId: "artifact-stream",
          renderer: "table",
          label: "Stream artifact",
          renderSpec: { renderer: "table", rows: [{ service: "checkout-api" }] },
        },
      },
      {
        type: "text.delta" as const,
        conversationId: "chat-new",
        runId: "run-stream",
        sequence: 5,
        createdAt: "2026-05-18T08:05:04.000Z",
        payload: { messageId: "message-stream", text: " Done." },
      },
    ].reduce(applyAiChatStreamEvent, started);

    expect(streamed.runId).toBe("run-stream");
    expect(streamed.assistantParts.map((part) => part.type)).toEqual([
      "text",
      "tool_status",
      "artifact",
      "text",
    ]);
    expect(streamed.assistantParts[1]).toMatchObject({
      label: "Summarize trace",
      status: "running",
      toolName: "analysis.summarizeTrace",
    });
    expect(JSON.stringify(streamed.assistantParts)).not.toContain("must-not-render");
    expect(streamed.artifacts.map((artifact) => artifact.label)).toEqual(["Stream artifact"]);
  });

  test("approval inputs are derived only from server-issued proposal IDs", () => {
    expect(aiChatApprovalInput(actionProposal, true)).toEqual({
      actionProposalId: "action-1",
      idempotencyKey: "approve:action-1:approve:3",
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

  test("uses AI Elements primitives and exposes retry controls for failed chat work", () => {
    const source = readFileSync(
      new URL("../src/routes/ai-chat-route.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("../components/ai-elements/conversation");
    expect(source).toContain("../components/ai-elements/message");
    expect(source).toContain("../components/ai-elements/prompt-input");
    expect(source).toContain("createConversation.error");
    expect(source).toContain('streamState?.status === "failed"');
    expect(source).toContain("actions.retry");
  });

  test("uses react-markdown with GFM and keeps raw HTML disabled", () => {
    const source = readFileSync(
      new URL("../src/components/ai-elements/message.tsx", import.meta.url),
      "utf8",
    );
    const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");

    expect(packageJson).toContain('"react-markdown"');
    expect(packageJson).toContain('"remark-gfm"');
    expect(source).toContain('from "react-markdown"');
    expect(source).toContain('from "remark-gfm"');
    expect(source).toContain("remarkPlugins={[remarkGfm]}");
    expect(source).toContain('url.hostname === "cloudgrid.dev"');
    expect(source).not.toContain("rehype-raw");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  test("prompt input submits on Enter while preserving Shift Enter newlines", () => {
    const source = readFileSync(
      new URL("../src/components/ai-elements/prompt-input.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('event.key === "Enter" && !event.shiftKey');
    expect(source).toContain("event.currentTarget.form?.requestSubmit()");
  });
});
