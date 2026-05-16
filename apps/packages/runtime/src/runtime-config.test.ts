import { describe, expect, test } from "bun:test";
import { parseDeploymentRuntimeConfig } from "./runtime-config";

describe("deployment runtime config", () => {
  test("defaults to local deployment with local auth", () => {
    expect(parseDeploymentRuntimeConfig({})).toEqual({
      deploymentMode: "local",
      auth: {
        mode: "local",
        sessionTtlSeconds: 28_800,
      },
    });
  });

  test("parses deployed SSO config for configured providers", () => {
    const config = parseDeploymentRuntimeConfig({
      CLOUDGRID_DEPLOYMENT_MODE: "deployed",
      CLOUDGRID_AUTH_MODE: "sso",
      CLOUDGRID_AUTH_PROVIDERS: "github,google,azure",
      CLOUDGRID_AUTH_COMPANY_ID: "acme",
      CLOUDGRID_AUTH_GITHUB_CLIENT_ID: "github-client-id",
      CLOUDGRID_AUTH_GITHUB_CLIENT_SECRET: "github-client-secret",
      CLOUDGRID_AUTH_GITHUB_REDIRECT_URI: "https://cloudgrid.example/auth/callback",
      CLOUDGRID_AUTH_GOOGLE_ISSUER: "https://accounts.google.com",
      CLOUDGRID_AUTH_GOOGLE_AUDIENCE: "google-audience",
      CLOUDGRID_AUTH_GOOGLE_JWKS_URL: "https://www.googleapis.com/oauth2/v3/certs",
      CLOUDGRID_AUTH_GOOGLE_CLIENT_ID: "google-client-id",
      CLOUDGRID_AUTH_GOOGLE_CLIENT_SECRET: "google-client-secret",
      CLOUDGRID_AUTH_GOOGLE_REDIRECT_URI: "https://cloudgrid.example/auth/callback",
      CLOUDGRID_AUTH_AZURE_ISSUER: "https://login.microsoftonline.com/tenant/v2.0",
      CLOUDGRID_AUTH_AZURE_AUDIENCE: "azure-audience",
      CLOUDGRID_AUTH_AZURE_CLIENT_ID: "azure-client-id",
      CLOUDGRID_AUTH_AZURE_CLIENT_SECRET: "azure-client-secret",
      CLOUDGRID_AUTH_AZURE_REDIRECT_URI: "https://cloudgrid.example/auth/callback",
      CLOUDGRID_SESSION_SECRET: "session-secret",
      CLOUDGRID_SESSION_TTL_SECONDS: "900",
    });

    expect(config).toEqual({
      deploymentMode: "deployed",
      auth: {
        mode: "sso",
        provider: "github",
        companyId: "acme",
        providers: {
          github: {
            provider: "github",
            clientId: "github-client-id",
            clientSecret: "github-client-secret",
            redirectUri: "https://cloudgrid.example/auth/callback",
          },
          google: {
            provider: "google",
            issuer: "https://accounts.google.com",
            audience: "google-audience",
            jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
            clientId: "google-client-id",
            clientSecret: "google-client-secret",
            redirectUri: "https://cloudgrid.example/auth/callback",
          },
          azure: {
            provider: "azure",
            issuer: "https://login.microsoftonline.com/tenant/v2.0",
            audience: "azure-audience",
            clientId: "azure-client-id",
            clientSecret: "azure-client-secret",
            redirectUri: "https://cloudgrid.example/auth/callback",
          },
        },
        sessionSecret: "session-secret",
        sessionTtlSeconds: 900,
      },
    });
  });

  test("rejects invalid deployment and auth mode combinations", () => {
    expect(() =>
      parseDeploymentRuntimeConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "local",
        CLOUDGRID_AUTH_MODE: "sso",
      }),
    ).toThrow("ERR-009 CONFIG_INVALID");
    expect(() =>
      parseDeploymentRuntimeConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "deployed",
        CLOUDGRID_AUTH_MODE: "local",
      }),
    ).toThrow("ERR-009 CONFIG_INVALID");
  });

  test("rejects SSO without providers and required provider fields", () => {
    expect(() =>
      parseDeploymentRuntimeConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "deployed",
        CLOUDGRID_AUTH_MODE: "sso",
        CLOUDGRID_SESSION_SECRET: "session-secret",
      }),
    ).toThrow("CLOUDGRID_AUTH_PROVIDERS");

    expect(() =>
      parseDeploymentRuntimeConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "deployed",
        CLOUDGRID_AUTH_MODE: "sso",
        CLOUDGRID_AUTH_PROVIDERS: "google",
        CLOUDGRID_SESSION_SECRET: "session-secret",
      }),
    ).toThrow("CLOUDGRID_AUTH_GOOGLE_ISSUER");
  });
});
