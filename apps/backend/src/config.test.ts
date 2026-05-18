import { describe, expect, test } from "bun:test";
import { loadConfig, startupProblem } from "./config";

describe("BFF runtime config", () => {
  test("uses development defaults for local startup", () => {
    const config = loadConfig({});

    expect(config).toEqual({
      host: "0.0.0.0",
      port: 3000,
      natsUrl: "nats://localhost:4222",
      deploymentMode: "local",
      auth: {
        mode: "local",
        sessionTtlSeconds: 28_800,
      },
      selfObservability: {
        enabled: true,
        projectId: "cloudgrid-system",
        companyId: "local",
        otlpEndpoint: "http://localhost:4318",
        exportIntervalSeconds: 10,
        tracesEnabled: true,
        logsEnabled: true,
        metricsEnabled: true,
      },
      requestTimeoutMs: 2000,
      graphqlUI: true,
      graphqlMaxDepth: 12,
      graphqlMaxComplexity: 500,
      graphqlResponseMediaType: "compatible",
      frontendServeStatic: false,
      frontendStaticDir: "./apps/backend/public",
      datasetTransferDir: ".cloudgrid/dataset-transfer",
    });
  });

  test("uses production static-serving defaults and accepts tls NATS URLs", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      CLOUDGRID_BFF_HOST: "127.0.0.1",
      CLOUDGRID_BFF_PORT: "4000",
      CLOUDGRID_NATS_URL: "tls://nats.example.test:4222",
      CLOUDGRID_FRONTEND_STATIC_DIR: "/srv/cloudgrid/public",
    });

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 4000,
      natsUrl: "tls://nats.example.test:4222",
      graphqlUI: false,
      graphqlMaxDepth: 12,
      graphqlMaxComplexity: 500,
      graphqlResponseMediaType: "compatible",
      deploymentMode: "local",
      auth: {
        mode: "local",
        sessionTtlSeconds: 28_800,
      },
      selfObservability: {
        enabled: true,
        projectId: "cloudgrid-system",
        companyId: "local",
        otlpEndpoint: "http://localhost:4318",
        exportIntervalSeconds: 10,
        tracesEnabled: true,
        logsEnabled: true,
        metricsEnabled: true,
      },
      frontendServeStatic: true,
      frontendStaticDir: "/srv/cloudgrid/public",
      datasetTransferDir: ".cloudgrid/dataset-transfer",
    });
  });

  test("parses deployed SSO runtime config", () => {
    const config = loadConfig({
      CLOUDGRID_DEPLOYMENT_MODE: "deployed",
      CLOUDGRID_AUTH_MODE: "sso",
      CLOUDGRID_AUTH_PROVIDERS: "azure",
      CLOUDGRID_AUTH_AZURE_ISSUER: "https://login.microsoftonline.com/tenant/v2.0",
      CLOUDGRID_AUTH_AZURE_AUDIENCE: "api://cloudgrid",
      CLOUDGRID_AUTH_AZURE_CLIENT_ID: "client-id",
      CLOUDGRID_AUTH_AZURE_REDIRECT_URI: "https://cloudgrid.example/auth/callback",
      CLOUDGRID_SESSION_SECRET: "session-secret",
    });

    expect(config).toMatchObject({
      deploymentMode: "deployed",
      auth: {
        mode: "sso",
        provider: "azure",
        sessionSecret: "session-secret",
        providers: {
          azure: {
            provider: "azure",
            issuer: "https://login.microsoftonline.com/tenant/v2.0",
            audience: "api://cloudgrid",
            clientId: "client-id",
            redirectUri: "https://cloudgrid.example/auth/callback",
          },
        },
      },
    });
  });

  test("rejects invalid deployment/auth combinations", () => {
    expect(() =>
      loadConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "local",
        CLOUDGRID_AUTH_MODE: "sso",
      }),
    ).toThrow("ERR-009 CONFIG_INVALID");
    expect(() =>
      loadConfig({
        CLOUDGRID_DEPLOYMENT_MODE: "deployed",
        CLOUDGRID_AUTH_MODE: "local",
      }),
    ).toThrow("ERR-009 CONFIG_INVALID");
  });

  test("rejects unsupported NATS URL protocols as config errors", () => {
    expect(() => loadConfig({ CLOUDGRID_NATS_URL: "http://localhost:4222" })).toThrow(
      "ERR-009 CONFIG_INVALID",
    );
  });

  test("parses GraphQL backpressure config", () => {
    const config = loadConfig({
      CLOUDGRID_GRAPHQL_MAX_DEPTH: "8",
      CLOUDGRID_GRAPHQL_MAX_COMPLEXITY: "1000",
      CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE: "graphql-response-json",
    });

    expect(config.graphqlMaxDepth).toBe(8);
    expect(config.graphqlMaxComplexity).toBe(1000);
    expect(config.graphqlResponseMediaType).toBe("graphql-response-json");
  });

  test("rejects invalid GraphQL backpressure config", () => {
    expect(() => loadConfig({ CLOUDGRID_GRAPHQL_MAX_DEPTH: "0" })).toThrow(
      "ERR-009 CONFIG_INVALID",
    );
    expect(() => loadConfig({ CLOUDGRID_GRAPHQL_MAX_COMPLEXITY: "10001" })).toThrow(
      "ERR-009 CONFIG_INVALID",
    );
    expect(() => loadConfig({ CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE: "application/json" })).toThrow(
      "ERR-009 CONFIG_INVALID",
    );
  });

  test("maps startup failures to sanitized problem fields", () => {
    expect(startupProblem(new Error("ERR-009 CONFIG_INVALID: invalid NATS URL"))).toEqual({
      errorId: "ERR-009",
      errorCode: "CONFIG_INVALID",
      message: "ERR-009 CONFIG_INVALID: invalid NATS URL",
    });
    expect(startupProblem(new Error("dial tcp failed"))).toEqual({
      errorId: "ERR-013",
      errorCode: "MESSAGE_BRIDGE_UNAVAILABLE",
      message: "Message bridge is unavailable",
    });
  });
});
