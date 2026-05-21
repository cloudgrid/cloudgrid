import { parseBooleanFlag, z } from "./validation";

export const deploymentModeSchema = z.enum(["local", "deployed"]);
export const authModeSchema = z.enum(["local", "sso"]);
export const authProviderSchema = z.enum(["github", "google", "azure"]);

export type DeploymentMode = z.infer<typeof deploymentModeSchema>;
export type AuthMode = z.infer<typeof authModeSchema>;
export type AuthProvider = z.infer<typeof authProviderSchema>;

export interface AuthProviderRuntimeConfig {
  provider: AuthProvider;
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

export interface AuthRuntimeConfig {
  mode: AuthMode;
  provider?: AuthProvider;
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  sessionSecret?: string;
  sessionTtlSeconds: number;
  companyId?: string;
  providers?: Partial<Record<AuthProvider, AuthProviderRuntimeConfig>>;
}

export interface DeploymentRuntimeConfig {
  deploymentMode: DeploymentMode;
  auth: AuthRuntimeConfig;
  selfObservability: SelfObservabilityRuntimeConfig;
}

export interface SelfObservabilityRuntimeConfig {
  enabled: boolean;
  projectId: string;
  companyId?: string;
  otlpEndpoint?: string;
  otlpBearerToken?: string;
  exportIntervalSeconds: number;
  tracesEnabled: boolean;
  logsEnabled: boolean;
  metricsEnabled: boolean;
}

export function parseDeploymentRuntimeConfig(env: NodeJS.ProcessEnv): DeploymentRuntimeConfig {
  const deploymentMode = parseEnum(
    deploymentModeSchema,
    env.CLOUDGRID_DEPLOYMENT_MODE,
    "local",
    "CLOUDGRID_DEPLOYMENT_MODE",
  );
  const authMode = parseEnum(
    authModeSchema,
    env.CLOUDGRID_AUTH_MODE,
    "local",
    "CLOUDGRID_AUTH_MODE",
  );

  if (deploymentMode === "local" && authMode !== "local") {
    throwConfig("CLOUDGRID_DEPLOYMENT_MODE=local requires CLOUDGRID_AUTH_MODE=local");
  }
  if (deploymentMode === "deployed" && authMode !== "sso") {
    throwConfig("CLOUDGRID_DEPLOYMENT_MODE=deployed requires CLOUDGRID_AUTH_MODE=sso");
  }

  const sessionTtlSeconds = parseSessionTtl(env.CLOUDGRID_SESSION_TTL_SECONDS);
  const auth: AuthRuntimeConfig = {
    mode: authMode,
    sessionTtlSeconds,
  };

  if (authMode === "sso") {
    auth.sessionSecret = requireString(env.CLOUDGRID_SESSION_SECRET, "CLOUDGRID_SESSION_SECRET");
    const companyId = optionalString(env.CLOUDGRID_AUTH_COMPANY_ID);
    if (companyId) {
      auth.companyId = companyId;
    }
    const providers = parseAuthProviders(env);
    auth.providers = providers;
    auth.provider = Object.keys(providers)[0] as AuthProvider;
  } else if (env.CLOUDGRID_AUTH_PROVIDER) {
    throwConfig("CLOUDGRID_AUTH_PROVIDER is only valid when CLOUDGRID_AUTH_MODE=sso");
  }

  return {
    deploymentMode,
    auth,
    selfObservability: parseSelfObservabilityConfig(env, deploymentMode),
  };
}

function parseSelfObservabilityConfig(
  env: NodeJS.ProcessEnv,
  deploymentMode: DeploymentMode,
): SelfObservabilityRuntimeConfig {
  const enabled = parseBooleanFlag(
    env.CLOUDGRID_SELF_OBSERVABILITY_ENABLED,
    deploymentMode === "local",
  );
  const exportIntervalSeconds = parseSelfObservabilityExportInterval(
    env.CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS,
  );
  const projectId = optionalString(env.CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID);
  const companyId = optionalString(env.CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID);
  const otlpEndpoint = optionalString(env.CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT);
  const otlpBearerToken = optionalString(env.CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN);

  if (deploymentMode === "deployed" && enabled) {
    if (!companyId) {
      throwConfig(
        "CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID is required when deployed self-observability is enabled",
      );
    }
    if (!projectId) {
      throwConfig(
        "CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID is required when deployed self-observability is enabled",
      );
    }
    if (!otlpEndpoint) {
      throwConfig(
        "CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT is required when deployed self-observability is enabled",
      );
    }
    if (!otlpBearerToken) {
      throwConfig(
        "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN is required when deployed self-observability is enabled",
      );
    }
  }
  if (deploymentMode === "local" && enabled && !otlpBearerToken) {
    throwConfig(
      "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN is required when self-observability is enabled",
    );
  }

  const resolvedProjectId = projectId ?? "cloudgrid-system";
  const resolvedCompanyId = companyId ?? (deploymentMode === "local" ? "local" : undefined);
  const resolvedEndpoint =
    otlpEndpoint ?? (deploymentMode === "local" ? "http://localhost:4318" : undefined);
  const tracesEnabled =
    enabled && parseBooleanFlag(env.CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED, true);
  const logsEnabled =
    enabled && parseBooleanFlag(env.CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED, true);
  const metricsEnabled =
    enabled && parseBooleanFlag(env.CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED, true);

  return {
    enabled,
    projectId: resolvedProjectId,
    ...(resolvedCompanyId ? { companyId: resolvedCompanyId } : {}),
    ...(resolvedEndpoint ? { otlpEndpoint: resolvedEndpoint } : {}),
    ...(otlpBearerToken ? { otlpBearerToken } : {}),
    exportIntervalSeconds,
    tracesEnabled,
    logsEnabled,
    metricsEnabled,
  };
}

function parseAuthProviders(
  env: NodeJS.ProcessEnv,
): Partial<Record<AuthProvider, AuthProviderRuntimeConfig>> {
  const configured = configuredProviders(env);
  const providers: Partial<Record<AuthProvider, AuthProviderRuntimeConfig>> = {};
  for (const provider of configured) {
    providers[provider] = parseProviderConfig(env, provider);
  }
  return providers;
}

function configuredProviders(env: NodeJS.ProcessEnv): AuthProvider[] {
  if (!env.CLOUDGRID_AUTH_PROVIDERS) {
    throwConfig("CLOUDGRID_AUTH_PROVIDERS is required when CLOUDGRID_AUTH_MODE=sso");
  }
  const values = env.CLOUDGRID_AUTH_PROVIDERS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throwConfig("CLOUDGRID_AUTH_PROVIDERS must name at least one provider");
  }
  return values.map((value) =>
    parseRequiredEnum(authProviderSchema, value, "CLOUDGRID_AUTH_PROVIDERS"),
  );
}

function parseProviderConfig(
  env: NodeJS.ProcessEnv,
  provider: AuthProvider,
): AuthProviderRuntimeConfig {
  const prefix = `CLOUDGRID_AUTH_${provider.toUpperCase()}`;
  const issuer =
    provider === "github"
      ? optionalString(env[`${prefix}_ISSUER`])
      : requireString(env[`${prefix}_ISSUER`], `${prefix}_ISSUER`);
  const config: AuthProviderRuntimeConfig = {
    provider,
    clientId: requireString(env[`${prefix}_CLIENT_ID`], `${prefix}_CLIENT_ID`),
    redirectUri: requireString(env[`${prefix}_REDIRECT_URI`], `${prefix}_REDIRECT_URI`),
  };
  if (issuer) {
    config.issuer = issuer;
  }
  const audience = optionalString(env[`${prefix}_AUDIENCE`]);
  if (audience) {
    config.audience = audience;
  }
  const jwksUrl = optionalString(env[`${prefix}_JWKS_URL`]);
  if (jwksUrl) {
    config.jwksUrl = jwksUrl;
  }
  const clientSecret = optionalString(env[`${prefix}_CLIENT_SECRET`]);
  if (clientSecret) {
    config.clientSecret = clientSecret;
  }
  return config;
}

function parseEnum<T extends z.ZodEnum>(
  schema: T,
  value: string | undefined,
  fallback: z.infer<T>,
  label: string,
): z.infer<T> {
  if (value === undefined || value === "") {
    return fallback;
  }
  return parseRequiredEnum(schema, value, label);
}

function parseRequiredEnum<T extends z.ZodEnum>(
  schema: T,
  value: string | undefined,
  label: string,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throwConfig(`invalid ${label}`);
  }
  return parsed.data;
}

function parseSessionTtl(value: string | undefined): number {
  if (value === undefined || value === "") {
    return 28_800;
  }
  const parsed = z.coerce.number().int().min(300).safeParse(value);
  if (!parsed.success) {
    throwConfig("invalid CLOUDGRID_SESSION_TTL_SECONDS");
  }
  return parsed.data;
}

function parseSelfObservabilityExportInterval(value: string | undefined): number {
  if (value === undefined || value === "") {
    return 10;
  }
  const parsed = z.coerce.number().int().min(1).max(300).safeParse(value);
  if (!parsed.success) {
    throwConfig("invalid CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS");
  }
  return parsed.data;
}

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throwConfig(`${label} is required when CLOUDGRID_AUTH_MODE=sso`);
  }
  return value;
}

function optionalString(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

function throwConfig(message: string): never {
  throw new Error(`ERR-009 CONFIG_INVALID: ${message}`);
}
