import {
  parseBooleanFlag,
  parseDeploymentRuntimeConfig,
  parsePort,
  type AuthRuntimeConfig,
  type CloudGridErrorId,
  type DeploymentMode,
} from "@cloudgrid/runtime";

export interface RuntimeConfig {
  deploymentMode: DeploymentMode;
  auth: AuthRuntimeConfig;
  host: string;
  port: number;
  natsUrl: string;
  requestTimeoutMs: number;
  graphqlUI: boolean;
  frontendServeStatic: boolean;
  frontendStaticDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const deployment = parseDeploymentRuntimeConfig(env);
  return {
    deploymentMode: deployment.deploymentMode,
    auth: deployment.auth,
    host: env.CLOUDGRID_BFF_HOST || "0.0.0.0",
    port: parsePort(env.CLOUDGRID_BFF_PORT, 3000),
    natsUrl: parseNatsUrl(env.CLOUDGRID_NATS_URL || "nats://localhost:4222"),
    requestTimeoutMs: 2000,
    graphqlUI: parseBooleanFlag(env.CLOUDGRID_GRAPHQL_UI, env.NODE_ENV !== "production"),
    frontendServeStatic: parseBooleanFlag(
      env.CLOUDGRID_FRONTEND_SERVE_STATIC,
      env.NODE_ENV === "production",
    ),
    frontendStaticDir: env.CLOUDGRID_FRONTEND_STATIC_DIR || "./apps/backend/public",
  };
}

export function startupProblem(error: unknown): {
  errorId: CloudGridErrorId;
  errorCode: string;
  message: string;
} {
  if (error instanceof Error && error.message.startsWith("ERR-009")) {
    return {
      errorId: "ERR-009",
      errorCode: "CONFIG_INVALID",
      message: error.message,
    };
  }
  return {
    errorId: "ERR-013",
    errorCode: "MESSAGE_BRIDGE_UNAVAILABLE",
    message: "Message bridge is unavailable",
  };
}

function parseNatsUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "nats:" && parsed.protocol !== "tls:") {
      throw new Error("unsupported protocol");
    }
    return value;
  } catch {
    throw new Error("ERR-009 CONFIG_INVALID: invalid NATS URL");
  }
}
