import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AppSessionProvider } from "../src/providers/app-session-provider";
import { ThemeProvider } from "../src/providers/theme-provider";
import { LoginRoute } from "../src/routes/auth-routes";

function loginMarkup(path = "/login?returnTo=/logs?service=checkout") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  queryClient.setQueryData(["Viewer"], null);

  const client = {
    createProject: async () => {
      throw new Error("not used");
    },
    getViewer: async () => null,
    selectProject: async () => {
      throw new Error("not used");
    },
  };

  return renderToStaticMarkup(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider client={client} mode="deployed">
          <MemoryRouter initialEntries={[path]}>
            <LoginRoute />
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("auth routes", () => {
  test("renders the adapted login-02 page as an SSO-only BFF entry", () => {
    const markup = loginMarkup();

    expect(markup).toContain('data-login-block="login-02"');
    expect(markup).toContain("Sign in to CloudGrid");
    expect(markup).toContain("Continue with GitHub");
    expect(markup).toContain("Continue with Google");
    expect(markup).toContain("Continue with Microsoft Azure");
    expect(markup).toContain(
      "/auth/login?returnTo=%2Flogs%3Fservice%3Dcheckout&amp;provider=github",
    );
    expect(markup).toContain(
      "/auth/login?returnTo=%2Flogs%3Fservice%3Dcheckout&amp;provider=google",
    );
    expect(markup).toContain(
      "/auth/login?returnTo=%2Flogs%3Fservice%3Dcheckout&amp;provider=azure",
    );
    expect(markup).toContain("Access is resolved through company and project membership.");
    expect(markup).not.toMatch(/<input\b/i);
    expect(markup).not.toMatch(/password|username/i);
  });
});
