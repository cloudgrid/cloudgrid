import {
  type AuthRuntimeConfig,
  type CloudGridErrorId,
  type DeploymentMode,
  type SelfObservabilityRuntimeConfig,
  parseBooleanFlag,
  parseDeploymentRuntimeConfig,
  parsePort,
} from "@cloudgrid/runtime";

export interface RuntimeConfig {
  deploymentMode: DeploymentMode;
  auth: AuthRuntimeConfig;
  selfObservability: SelfObservabilityRuntimeConfig;
  host: string;
  port: number;
  natsUrl: string;
  requestTimeoutMs: number;
  graphqlUI: boolean;
  graphqlMaxDepth: number;
  graphqlMaxComplexity: number;
  graphqlResponseMediaType: GraphQLResponseMediaType;
  frontendServeStatic: boolean;
  frontendStaticDir: string;
  datasetTransferDir: string;
}

export type GraphQLResponseMediaType = "compatible" | "graphql-response-json";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const deployment = parseDeploymentRuntimeConfig(env);
  return {
    deploymentMode: deployment.deploymentMode,
    auth: deployment.auth,
    selfObservability: deployment.selfObservability,
    host: env.CLOUDGRID_BFF_HOST || "0.0.0.0",
    port: parsePort(env.CLOUDGRID_BFF_PORT, 3000),
    natsUrl: parseNatsUrl(env.CLOUDGRID_NATS_URL || "nats://localhost:4222"),
    requestTimeoutMs: 2000,
    graphqlUI: parseBooleanFlag(env.CLOUDGRID_GRAPHQL_UI, env.NODE_ENV !== "production"),
    graphqlMaxDepth: parseIntegerEnv(
      env.CLOUDGRID_GRAPHQL_MAX_DEPTH,
      12,
      1,
      64,
      "CLOUDGRID_GRAPHQL_MAX_DEPTH",
    ),
    graphqlMaxComplexity: parseIntegerEnv(
      env.CLOUDGRID_GRAPHQL_MAX_COMPLEXITY,
      500,
      1,
      10_000,
      "CLOUDGRID_GRAPHQL_MAX_COMPLEXITY",
    ),
    graphqlResponseMediaType: parseGraphQLResponseMediaType(
      env.CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE,
    ),
    frontendServeStatic: parseBooleanFlag(
      env.CLOUDGRID_FRONTEND_SERVE_STATIC,
      env.NODE_ENV === "production",
    ),
    frontendStaticDir: env.CLOUDGRID_FRONTEND_STATIC_DIR || "./apps/backend/public",
    datasetTransferDir: env.CLOUDGRID_DATASET_TRANSFER_DIR || ".cloudgrid/dataset-transfer",
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

function parseIntegerEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`ERR-009 CONFIG_INVALID: ${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseGraphQLResponseMediaType(raw: string | undefined): GraphQLResponseMediaType {
  const value = raw?.trim() || "compatible";
  if (value === "compatible" || value === "graphql-response-json") {
    return value;
  }
  throw new Error(
    "ERR-009 CONFIG_INVALID: CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE must be compatible or graphql-response-json",
  );
}
