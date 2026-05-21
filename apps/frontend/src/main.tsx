import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Toaster } from "./components/ui/sonner";
import { AppSessionProvider } from "./providers/app-session-provider";
import { TelemetryClientProvider } from "./providers/telemetry-client-provider";
import { ThemeProvider } from "./providers/theme-provider";
import { AiChatRoute, aiChatEnabled } from "./routes/ai-chat-route";
import { AiEvalRoute, aiEvalEnabled } from "./routes/ai-eval-route";
import { AlertsRoute } from "./routes/alerts-route";
import { AppShell } from "./routes/app-shell";
import { AuthCallbackRoute, AuthGate, LoginRoute, RootRedirect } from "./routes/auth-routes";
import {
  OrganizationMembersRoute,
  OrganizationAiProviderRoute,
  OrganizationOverviewRoute,
  OrganizationProjectsRoute,
  OrganizationsRoute,
  ProjectSettingsRoute,
  ProjectsRoute,
  ProjectWorkspaceRedirectRoute,
} from "./routes/control-plane-routes";
import { DashboardsRoute } from "./routes/dashboards-route";
import { LogsRoute } from "./routes/logs-route";
import { MetricsRoute } from "./routes/metrics-route";
import { TelemetryProjectGate } from "./routes/telemetry-project-gate";
import { TraceDetailRoute } from "./routes/trace-detail-route";
import { TracesRoute } from "./routes/traces-route";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function App() {
  return (
    <ThemeProvider>
      <Toaster />
      <TelemetryClientProvider>
        <QueryClientProvider client={queryClient}>
          <AppSessionProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<LoginRoute />} path="/login" />
                <Route element={<AuthCallbackRoute />} path="/auth/callback" />
                <Route element={<AuthGate />}>
                  <Route element={<AppShell />}>
                    <Route element={<RootRedirect />} index />
                    <Route element={<OrganizationsRoute />} path="/organizations" />
                    <Route
                      element={<OrganizationOverviewRoute />}
                      path="/organizations/:organizationId"
                    />
                    <Route
                      element={<OrganizationMembersRoute />}
                      path="/organizations/:organizationId/members"
                    />
                    {aiChatEnabled ? (
                      <Route
                        element={<OrganizationAiProviderRoute />}
                        path="/organizations/:organizationId/ai-provider"
                      />
                    ) : null}
                    <Route
                      element={<OrganizationProjectsRoute />}
                      path="/organizations/:organizationId/projects"
                    />
                    <Route element={<ProjectsRoute />} path="/projects" />
                    <Route
                      element={<ProjectWorkspaceRedirectRoute />}
                      path="/projects/:projectId"
                    />
                    <Route
                      element={<ProjectSettingsRoute />}
                      path="/projects/:projectId/settings"
                    />
                    <Route
                      element={<ProjectSettingsRoute />}
                      path="/projects/:projectId/settings/general"
                    />
                    <Route
                      element={<ProjectSettingsRoute />}
                      path="/projects/:projectId/settings/ingest"
                    />
                    <Route
                      element={<ProjectSettingsRoute />}
                      path="/projects/:projectId/settings/retention"
                    />
                    {aiEvalEnabled ? (
                      <Route
                        element={<ProjectSettingsRoute />}
                        path="/projects/:projectId/settings/ai-eval"
                      />
                    ) : null}
                    <Route
                      element={<ProjectSettingsRoute />}
                      path="/projects/:projectId/settings/members"
                    />
                    <Route element={<TelemetryProjectGate />}>
                      <Route element={<TracesRoute />} path="/traces" />
                      <Route element={<TraceDetailRoute />} path="/traces/:traceId" />
                      <Route element={<LogsRoute />} path="/logs" />
                      <Route element={<MetricsRoute />} path="/metrics" />
                      <Route element={<DashboardsRoute />} path="/dashboards" />
                      {aiChatEnabled ? <Route element={<AiChatRoute />} path="/ai-chat" /> : null}
                      <Route element={<AlertsRoute />} path="/alerts" />
                      {aiEvalEnabled ? <Route element={<AiEvalRoute />} path="/ai-eval" /> : null}
                    </Route>
                    <Route element={<Navigate replace to="/projects" />} path="*" />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AppSessionProvider>
        </QueryClientProvider>
      </TelemetryClientProvider>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<App />);
}
