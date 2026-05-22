import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { AuthenticatedPrincipal, AuthProviderFixture } from "./auth";
import { createAppWithBridge } from "./index";
import { bridge, ssoAuthConfig, viewer } from "./test-helpers";

describe("BFF auth routes and sessions", () => {
  test("local mode does not require login and sends anonymous auth context to GraphQL resolvers", async () => {
    let authContext: unknown;
    const { app } = createAppWithBridge(
      bridge({
        async viewer(context) {
          authContext = context;
          return viewer();
        },
      }),
      { auth: { mode: "local", sessionTtlSeconds: 28_800 } },
      createLogger("bff"),
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(body.data.viewer.user.id).toBe("user-local");
    expect(authContext).toMatchObject({
      mode: "anonymous",
      authMode: "local",
      principalId: "local-user",
      tenantId: "local",
      companyId: "local",
      projectId: "default",
      readAllowed: true,
    });
  });

  test("starts SSO login with PKCE transaction cookie and provider redirect", async () => {
    const provider = fixtureProvider();
    const { app } = createAppWithBridge(bridge(), {
      auth: ssoAuthConfig(),
      authProvider: provider,
    });

    const response = await app.request("/auth/login?returnTo=/projects");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toStartWith("https://issuer.test/oauth/authorize?");
    expect(response.headers.get("location")).toContain("code_challenge=");
    expect(response.headers.get("set-cookie")).toContain("cloudgrid_login=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  test("rejects invalid SSO callback state with sanitized problem details", async () => {
    const provider = fixtureProvider({
      async completeCallback() {
        throw new Error("provider leaked raw callback detail");
      },
    });
    const { app } = createAppWithBridge(bridge(), {
      auth: ssoAuthConfig(),
      authProvider: provider,
    });

    const response = await app.request("/auth/callback?state=missing&code=bad");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      id: "ERR-015",
      code: "UNAUTHENTICATED",
      detail: "Authentication is required",
    });
    expect(JSON.stringify(body)).not.toContain("provider leaked raw callback detail");
  });

  test("callback creates an HttpOnly server-side session and logout clears it", async () => {
    const provider = fixtureProvider();
    const { app } = createAppWithBridge(bridge(), {
      auth: ssoAuthConfig(),
      authProvider: provider,
    });

    const login = await app.request("/auth/login?returnTo=/projects");
    const loginCookie = login.headers.get("set-cookie") ?? "";
    const state = new URL(login.headers.get("location") ?? "").searchParams.get("state");
    const callback = await app.request(`/auth/callback?state=${state}&code=ok`, {
      headers: { cookie: loginCookie },
    });

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/projects");
    expect(callback.headers.get("set-cookie")).toContain("cloudgrid_session=");
    expect(callback.headers.get("set-cookie")).toContain("HttpOnly");
    expect(callback.headers.get("set-cookie")).not.toContain("access_token");

    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: { cookie: callback.headers.get("set-cookie") ?? "" },
    });

    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("cloudgrid_session=;");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("SSO session auth context forwards verified provider email", async () => {
    let authContext: unknown;
    const provider = fixtureProvider({
      async completeCallback(): Promise<AuthenticatedPrincipal> {
        return {
          principalId: "user-1",
          user: {
            id: "user-1",
            displayName: "Ada Lovelace",
            email: "Ada@Example.Test",
          },
          principalEmailVerified: true,
          scopes: ["telemetry:read"],
        } as AuthenticatedPrincipal & { principalEmailVerified: boolean };
      },
    });
    const { app } = createAppWithBridge(
      bridge({
        async viewer(context) {
          authContext = context;
          return viewer();
        },
      }),
      { auth: ssoAuthConfig(), authProvider: provider },
    );

    const login = await app.request("/auth/login?returnTo=/projects");
    const state = new URL(login.headers.get("location") ?? "").searchParams.get("state");
    const callback = await app.request(`/auth/callback?state=${state}&code=ok`, {
      headers: { cookie: login.headers.get("set-cookie") ?? "" },
    });
    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: callback.headers.get("set-cookie") ?? "",
      },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(authContext).toMatchObject({
      principalEmail: "Ada@Example.Test",
      principalEmailVerified: true,
    });
  });

  test("deployed GraphQL rejects missing and invalid credentials with sanitized errors", async () => {
    const { app } = createAppWithBridge(bridge(), {
      auth: ssoAuthConfig(),
      authProvider: fixtureProvider(),
    });

    const missing = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });
    const invalid = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer raw.provider.failure.token",
      },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });

    const missingBody = await missing.json();
    const invalidBody = await invalid.json();
    expect(missingBody.errors[0].extensions).toMatchObject({
      code: "UNAUTHENTICATED",
      problem: { id: "ERR-015", detail: "Authentication is required" },
    });
    expect(invalidBody.errors[0].extensions.problem).toMatchObject({
      id: "ERR-015",
      detail: "Authentication is required",
    });
    expect(JSON.stringify(invalidBody)).not.toContain("raw.provider.failure.token");
  });

  test("Bearer JWT authenticates machine GraphQL callers without using browser sessions", async () => {
    let authContext: unknown;
    const { app, auth } = createAppWithBridge(
      bridge({
        async viewer(context) {
          authContext = context;
          return viewer();
        },
      }),
      { auth: ssoAuthConfig(), authProvider: fixtureProvider() },
    );
    const token = await auth.issueTestBearerToken({
      sub: "machine-1",
      scopes: ["telemetry:read", "telemetry:live"],
    });

    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(authContext).toMatchObject({
      mode: "service",
      authMode: "sso",
      principalId: "machine-1",
      scopes: ["telemetry:read", "telemetry:live"],
      readAllowed: true,
    });
  });

  test("GitHub login exchanges provider callback and forwards normalized user profile", async () => {
    let authContext: unknown;
    const fetchCalls: string[] = [];
    const authFetch = async (input: RequestInfo | URL) => {
      const url = input.toString();
      fetchCalls.push(url);
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({ access_token: "github-access-token" });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ id: 42, login: "ada", name: "Ada Lovelace", email: null });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([{ email: "ada@example.test", primary: true, verified: true }]);
      }
      return new Response(null, { status: 404 });
    };
    const { app } = createAppWithBridge(
      bridge({
        async viewer(context) {
          authContext = context;
          return viewer();
        },
      }),
      { auth: ssoAuthConfig(), authFetch: authFetch as typeof fetch },
    );

    const login = await app.request("/auth/login?provider=github&returnTo=/projects");
    const loginCookie = login.headers.get("set-cookie") ?? "";
    const state = new URL(login.headers.get("location") ?? "").searchParams.get("state");
    const callback = await app.request(`/auth/callback?state=${state}&code=ok`, {
      headers: { cookie: loginCookie },
    });
    const sessionCookie = callback.headers.get("set-cookie") ?? "";
    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({ query: "{ viewer { user { id } } }" }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(fetchCalls).toEqual([
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
      "https://api.github.com/user/emails",
    ]);
    expect(authContext).toMatchObject({
      mode: "authenticated",
      authMode: "sso",
      principalId: "github:42",
      principalDisplayName: "Ada Lovelace",
      principalEmail: "ada@example.test",
      principalEmailVerified: true,
      companyId: "company-1",
      readAllowed: true,
    });
  });
});

function fixtureProvider(overrides: Partial<AuthProviderFixture> = {}): AuthProviderFixture {
  return {
    authorizationEndpoint: "https://issuer.test/oauth/authorize",
    async completeCallback(): Promise<AuthenticatedPrincipal> {
      return {
        principalId: "user-1",
        user: {
          id: "user-1",
          displayName: "Ada Lovelace",
          email: "ada@example.test",
        },
        scopes: ["telemetry:read", "telemetry:live"],
      };
    },
    ...overrides,
  };
}
