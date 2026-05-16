#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildSchema,
  isInputObjectType,
  isNonNullType,
  parse as parseGraphQL,
  validate as validateGraphQL,
} from "graphql";
import { parse as parseYaml } from "yaml";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

execFileSync("bun", ["tooling/scripts/generate-contracts.mjs", "--check"], {
  cwd: root,
  stdio: "pipe",
});

const requiredNonEmpty = [
  "DESIGN.md",
  "specs/03-contracts/api/http-api.openapi.yaml",
  "specs/03-contracts/graphql/public-schema.graphql",
  "specs/03-contracts/messages/message-bridge.asyncapi.yaml",
  "specs/03-contracts/errors.yaml",
  "specs/04-backend/authentication-authorization.md",
  "specs/04-backend/contract-generation.md",
];

for (const file of requiredNonEmpty) {
  const content = read(file);
  if (!content.trim()) {
    throw new Error(`${file} is empty`);
  }
}

const designMd = read("DESIGN.md");
const designFrontmatter = designMd.match(/^---\n([\s\S]*?)\n---\n/);
if (!designFrontmatter) {
  throw new Error("DESIGN.md must start with YAML frontmatter");
}
const designTokens = parseYaml(designFrontmatter[1]);
for (const tokenGroup of ["colors", "typography", "rounded", "spacing", "components"]) {
  if (!designTokens?.[tokenGroup] || typeof designTokens[tokenGroup] !== "object") {
    throw new Error(`DESIGN.md frontmatter must define ${tokenGroup} tokens`);
  }
}
for (const section of [
  "Overview",
  "Colors",
  "Typography",
  "Layout",
  "Elevation & Depth",
  "Shapes",
  "Components",
  "Do's and Don'ts",
]) {
  if (!designMd.includes(`## ${section}`)) {
    throw new Error(`DESIGN.md must include section ${section}`);
  }
}

const graphqlSchemaSource = read("specs/03-contracts/graphql/public-schema.graphql");
parseGraphQL(graphqlSchemaSource);
const graphqlSchema = buildSchema(graphqlSchemaSource);
validateFrontendGraphQLOperations(graphqlSchema);

const asyncApi = parseYaml(read("specs/03-contracts/messages/message-bridge.asyncapi.yaml"));
if (asyncApi?.asyncapi !== "3.0.0") {
  throw new Error("AsyncAPI contract must declare asyncapi: 3.0.0");
}
const expectedChannels = [
  "telemetry.traces.search",
  "telemetry.traces.get",
  "telemetry.logs.search",
  "telemetry.facets",
  "telemetry.traces.live.start",
  "telemetry.traces.live.stop",
  "telemetry.traces.live.events",
  "telemetry.persisted.traces",
  "telemetry.ingest.traces",
  "telemetry.ingest.logs",
  "control.viewer.get",
  "control.organizations.list",
  "control.organizations.get",
  "control.projects.list",
  "control.projects.get",
  "control.projects.create",
  "control.projects.update",
  "control.projects.select",
  "control.members.update",
  "control.members.remove",
  "control.project_status.snapshot",
  "control.project_status.changed",
  "control.project_members.list",
  "control.project_members.update",
  "control.project_members.remove",
  "control.retention.get",
  "control.retention.update",
  "storage_maintenance.retention.execute_batch",
  "control.alert_rules.list",
  "control.alert_rules.create",
  "control.alert_rules.update",
  "control.alert_rules.delete",
  "control.alert_silences.list",
  "control.alert_silences.create",
  "control.alert_silences.delete",
  "control.alert_history.list",
  "control.alert_history.record",
  "alert_evaluator.tick",
  "alert_evaluator.rules.evaluate",
  "alert_evaluator.notifications.dispatch",
];
for (const channel of expectedChannels) {
  if (!asyncApi.channels?.[channel]?.address) {
    throw new Error(`AsyncAPI contract is missing channel ${channel}`);
  }
}
validateAsyncApiReferences(asyncApi);
validateAsyncApiRequestStructs(asyncApi);
if (asyncApi["x-cloudgrid"]?.error_mapping?.graphql_extension_path !== "extensions.problem") {
  throw new Error("AsyncAPI x-cloudgrid error mapping must declare GraphQL problem extension path");
}
if (asyncApi["x-cloudgrid"]?.validation?.bff_runtime !== "zod") {
  throw new Error("AsyncAPI x-cloudgrid validation must declare zod for BFF runtime validation");
}
const authContext = asyncApi.components?.schemas?.AuthContext;
for (const requiredAuthField of [
  "mode",
  "authMode",
  "tenantId",
  "companyId",
  "projectId",
  "scopes",
  "readAllowed",
  "ingestAllowed",
  "checkedAt",
]) {
  if (!authContext?.properties?.[requiredAuthField]) {
    throw new Error(`AsyncAPI AuthContext must define ${requiredAuthField}`);
  }
}
const runtimeConfig = JSON.parse(read("specs/03-contracts/entities/runtime-config.schema.json"));
if (!hasEnum(runtimeConfig, "deploymentMode", ["local", "deployed"])) {
  throw new Error("runtime config must enumerate deployment modes");
}
const otlpConfig = runtimeConfig.properties?.otlp;
for (const requiredOtlpField of [
  "httpAddr",
  "grpcAddr",
  "grpcMaxMessageBytes",
  "grpcCompression",
]) {
  if (!otlpConfig?.properties?.[requiredOtlpField]) {
    throw new Error(`runtime config otlp must define ${requiredOtlpField}`);
  }
}
if (
  !otlpConfig.properties.grpcCompression.enum?.includes("none") ||
  !otlpConfig.properties.grpcCompression.enum?.includes("gzip")
) {
  throw new Error("runtime config otlp grpcCompression must enumerate none and gzip");
}
const authProperties = runtimeConfig.properties?.auth?.properties;
if (!hasEnum(runtimeConfig.properties?.auth, "mode", ["local", "sso"])) {
  throw new Error("runtime config auth must enumerate local and sso modes");
}
for (const provider of ["github", "google", "azure"]) {
  if (!authProperties?.provider?.enum?.includes(provider)) {
    throw new Error(`runtime config auth provider enum must include ${provider}`);
  }
}
for (const scope of [
  "telemetry:read",
  "telemetry:live",
  "telemetry:ingest:traces",
  "telemetry:ingest:logs",
]) {
  if (!authContext.properties.scopes.items?.enum?.includes(scope)) {
    throw new Error(`AsyncAPI AuthContext scopes must include ${scope}`);
  }
}

const openApi = parseYaml(read("specs/03-contracts/api/http-api.openapi.yaml"));
if (!openApi?.openapi) {
  throw new Error("OpenAPI contract is missing an openapi version");
}
for (const path of ["/api/health", "/livez", "/readyz"]) {
  if (!openApi.paths?.[path]?.get) {
    throw new Error(`OpenAPI contract is missing health path ${path}`);
  }
}
for (const [path, method] of [
  ["/auth/login", "get"],
  ["/auth/callback", "get"],
  ["/auth/logout", "post"],
]) {
  if (!openApi.paths?.[path]?.[method]) {
    throw new Error(`OpenAPI contract is missing auth endpoint ${method.toUpperCase()} ${path}`);
  }
}
if (!openApi.components?.schemas?.HealthResponse?.required?.includes("checks")) {
  throw new Error("OpenAPI HealthResponse must include dependency checks");
}
for (const path of ["/v1/traces", "/v1/logs"]) {
  const responses = openApi.paths?.[path]?.post?.responses;
  if (!responses?.["200"] || responses?.["202"]) {
    throw new Error(`${path} must expose OTLP-compatible 200 success response and no 202 response`);
  }
  for (const contentType of ["application/json", "application/x-protobuf"]) {
    if (!responses["200"].content?.[contentType]) {
      throw new Error(`${path} 200 response must include ${contentType}`);
    }
  }
}
const otlpMapping = read("specs/04-backend/otlp-mapping.md");
for (const forbidden of [
  "HTTP response `messageId` equals",
  "attributes.resource",
  "attributes.scope",
  "attributes.otel",
]) {
  if (otlpMapping.includes(forbidden)) {
    throw new Error(`OTLP mapping spec contains stale CloudGrid mapping text: ${forbidden}`);
  }
}
for (const required of [
  "200 OK",
  "ExportTraceServiceResponse",
  "ExportLogsServiceResponse",
  "flat `attributes` object",
]) {
  if (!otlpMapping.includes(required)) {
    throw new Error(`OTLP mapping spec is missing ${required}`);
  }
}
const backendArchitecture = read("specs/04-backend/backend-architecture.md");
for (const required of [
  "core/storage-read/internal/adapters/surrealdb",
  "core/storage-write/internal/adapters/surrealdb",
  "apps/backend/public",
]) {
  if (
    !backendArchitecture.includes(required) &&
    !read("specs/04-backend/surrealdb-persistence.md").includes(required) &&
    !read("specs/02-capabilities/runtime/serve-application.md").includes(required)
  ) {
    throw new Error(`specs are missing required implementation boundary ${required}`);
  }
}
const problemDetails = openApi.components?.schemas?.ProblemDetails;
for (const required of ["type", "title", "status", "detail", "id", "code", "retryable"]) {
  if (!problemDetails?.required?.includes(required)) {
    throw new Error(`OpenAPI ProblemDetails schema must require ${required}`);
  }
}

const errors = parseYaml(read("specs/03-contracts/errors.yaml"));
for (const id of [
  "ERR-001",
  "ERR-002",
  "ERR-003",
  "ERR-004",
  "ERR-005",
  "ERR-006",
  "ERR-007",
  "ERR-008",
  "ERR-009",
  "ERR-010",
  "ERR-011",
  "ERR-012",
  "ERR-013",
  "ERR-014",
  "ERR-018",
  "ERR-019",
  "ERR-020",
  "ERR-021",
]) {
  if (!errors.errors?.[id]?.code || errors.errors[id].retryable === undefined) {
    throw new Error(`errors.yaml is missing ${id}`);
  }
}

for (const entity of [
  "trace",
  "span",
  "log-event",
  "span-event",
  "span-link",
  "service",
  "attribute-filter",
  "trace-search-query",
  "trace-detail-query",
  "log-search-query",
  "runtime-config",
  "ingest-command",
  "live-trace-query",
]) {
  const schema = JSON.parse(read(`specs/03-contracts/entities/${entity}.schema.json`));
  if (!schema.title || schema.type !== "object") {
    throw new Error(`${entity}.schema.json must declare an object schema title`);
  }
}

const uiContracts = read("apps/packages/ui-contracts/src/index.ts");
validateGraphQLInputTypesAgainstUiContracts(graphqlSchema, uiContracts);
for (const exportedType of [
  "TraceSearchInput",
  "TraceDetail",
  "LogSearchResult",
  "LogCorrelation",
  "TraceStructure",
  "SpanException",
  "TelemetryFacetResult",
  "LiveTraceInput",
  "LiveTraceEvent",
  "LiveTraceSubscriptionData",
  "Viewer",
  "Organization",
  "Project",
  "ProjectStatus",
  "OrganizationMember",
  "ProjectRole",
  "ProjectMemberSource",
  "ProjectMember",
  "RetentionDataClass",
  "RetentionMode",
  "RetentionPolicy",
  "AlertRuleKind",
  "AlertSeverity",
  "AlertState",
  "AlertSignal",
  "AlertRuleSort",
  "AlertRuleSearchInput",
  "AlertRule",
  "AlertEventConnection",
  "AlertSilence",
]) {
  if (!uiContracts.includes(` ${exportedType}`)) {
    throw new Error(`ui contracts missing ${exportedType}`);
  }
}
const generatedUiContracts = read("apps/packages/ui-contracts/src/generated.ts");
for (const generatedSymbol of [
  "DEPLOYMENT_MODES",
  "AUTH_MODES",
  "AUTH_PROVIDERS",
  "COMPANY_ROLES",
  "PROJECT_STATUSES",
  "CONTROL_PLANE_SUBJECTS",
  "STORAGE_MAINTENANCE_SUBJECTS",
  "ALERT_EVALUATOR_SUBJECTS",
]) {
  if (!generatedUiContracts.includes(`const ${generatedSymbol}`)) {
    throw new Error(`generated ui contracts missing ${generatedSymbol}`);
  }
}
if (!uiContracts.includes("events: SpanEvent[]")) {
  throw new Error("ui contracts must expose non-null span events arrays");
}
if (!uiContracts.includes("links: SpanLink[]")) {
  throw new Error("ui contracts must expose non-null span link arrays");
}
if (!uiContracts.includes("exceptions: SpanException[]")) {
  throw new Error("ui contracts must expose non-null span exception arrays");
}

const goContracts = read("core/go-contracts/contracts.go");
for (const exportedType of [
  "TraceSearchRequest",
  "TraceDetailResponse",
  "TelemetryFacetRequest",
  "TelemetryFacetResponse",
  "LiveTraceStartRequest",
  "LiveTraceStartResponse",
  "LiveTraceStopRequest",
  "LiveTraceStopResponse",
  "TracePersistedNotification",
  "LiveTraceEvent",
  "PersistTelemetryCommand",
  "IngestCommand",
  "CompanyRole",
  "ProjectStatus",
  "Viewer",
  "Organization",
  "Project",
  "OrganizationMember",
  "ViewerGetRequest",
  "ViewerGetResponse",
  "ProjectSelectRequest",
  "ProjectStatusSnapshotRequest",
  "ProjectStatusChangedNotification",
  "ProjectRole",
  "ProjectMemberSource",
  "ProjectMember",
  "ProjectMemberListRequest",
  "RetentionDataClass",
  "RetentionMode",
  "RetentionPolicy",
  "RetentionExecuteBatchRequest",
  "AlertRuleKind",
  "AlertSeverity",
  "AlertState",
  "AlertRule",
  "AlertEventConnection",
  "AlertSilence",
]) {
  if (!goContracts.includes(`type ${exportedType} `)) {
    throw new Error(`go contracts missing ${exportedType}`);
  }
}
const generatedGoContracts = read("core/go-contracts/generated_contracts.go");
for (const generatedSymbol of [
  "DeploymentModes",
  "AuthModes",
  "AuthProviders",
  "CompanyRoles",
  "ProjectStatuses",
  "ControlPlaneSubjects",
  "StorageMaintenanceSubjects",
  "AlertEvaluatorSubjects",
]) {
  if (!generatedGoContracts.includes(`var ${generatedSymbol}`)) {
    throw new Error(`generated go contracts missing ${generatedSymbol}`);
  }
}
if (!/Events\s+\[\]SpanEvent\s+`json:"events"`/.test(goContracts)) {
  throw new Error("go contracts must serialize non-null span events arrays");
}
if (!/Links\s+\[\]SpanLink\s+`json:"links"`/.test(goContracts)) {
  throw new Error("go contracts must serialize non-null span links arrays");
}
if (!/Exceptions\s+\[\]SpanException\s+`json:"exceptions"`/.test(goContracts)) {
  throw new Error("go contracts must serialize non-null span exception arrays");
}
if (!/Direction\s+\*SpanLinkDirection\s+`json:"direction,omitempty"`/.test(goContracts)) {
  throw new Error("go contracts must expose span link direction for trace detail view models");
}

for (const requiredGraphqlSymbol of [
  "projectMembers(projectId: ID!): [ProjectMember!]!",
  "retentionPolicy(projectId: ID!): RetentionPolicy!",
  "ingestCredentials(projectId: ID!): IngestCredentialListResult!",
  "alertRules(projectId: ID!, input: AlertRuleSearchInput): [AlertRule!]!",
  "alertHistory(projectId: ID!, ruleId: ID, first: Int = 50, after: String): AlertEventConnection!",
  "alertSilences(projectId: ID!, ruleId: ID): [AlertSilence!]!",
  "updateProjectMember(projectId: ID!, userId: ID!, role: ProjectRole!): ProjectMember!",
  "removeProjectMember(projectId: ID!, userId: ID!): Boolean!",
  "updateRetentionPolicy(input: UpdateRetentionPolicyInput!): RetentionPolicy!",
  "createAlertRule(input: CreateAlertRuleInput!): AlertRule!",
  "updateAlertRule(input: UpdateAlertRuleInput!): AlertRule!",
  "deleteAlertRule(id: ID!): Boolean!",
  "createAlertSilence(input: CreateAlertSilenceInput!): AlertSilence!",
  "deleteAlertSilence(id: ID!): Boolean!",
]) {
  if (!graphqlSchemaSource.includes(requiredGraphqlSymbol)) {
    throw new Error(`GraphQL schema missing ${requiredGraphqlSymbol}`);
  }
}

const readiness = parseYaml(read("specs/.implementation-readiness.yaml"));
if (readiness?.status !== "implementation_ready") {
  throw new Error("lightweight implementation readiness artifact must be implementation_ready");
}

console.log(
  "contract files parsed, generated contracts present, and cross-layer drift checks passed",
);

function validateAsyncApiReferences(document) {
  const messageNames = new Set(Object.keys(document.components?.messages ?? {}));
  const schemaNames = new Set(Object.keys(document.components?.schemas ?? {}));

  for (const [channelName, channel] of Object.entries(document.channels ?? {})) {
    for (const [messageName, messageRef] of Object.entries(channel.messages ?? {})) {
      const target = parseRefName(messageRef?.$ref, "#/components/messages/");
      if (!target || !messageNames.has(target)) {
        throw new Error(
          `AsyncAPI channel ${channelName} references missing message ${messageName}`,
        );
      }
    }
  }

  for (const [messageName, message] of Object.entries(document.components?.messages ?? {})) {
    const target = parseRefName(message.payload?.$ref, "#/components/schemas/");
    if (!target || !schemaNames.has(target)) {
      throw new Error(`AsyncAPI message ${messageName} references missing payload schema`);
    }
  }

  for (const [operationName, operation] of Object.entries(document.operations ?? {})) {
    const channelName = parseRefName(operation.channel?.$ref, "#/channels/");
    if (!channelName || !document.channels?.[channelName]) {
      throw new Error(`AsyncAPI operation ${operationName} references missing channel`);
    }
    for (const message of operation.messages ?? []) {
      const ref = message?.$ref;
      const expectedPrefix = `#/channels/${channelName}/messages/`;
      const messageName = parseRefName(ref, expectedPrefix);
      if (!messageName || !document.channels[channelName].messages?.[messageName]) {
        throw new Error(`AsyncAPI operation ${operationName} references missing channel message`);
      }
    }
  }

  for (const [schemaName, schema] of Object.entries(document.components?.schemas ?? {})) {
    validateSchemaRefs(schema, `AsyncAPI schema ${schemaName}`, schemaNames);
  }
}

function validateSchemaRefs(value, location, schemaNames) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (typeof value.$ref === "string") {
    if (value.$ref.startsWith("../entities/")) {
      const file = value.$ref.replace("../entities/", "specs/03-contracts/entities/");
      JSON.parse(read(file));
      return;
    }
    if (value.$ref.startsWith("#/components/schemas/")) {
      const target = parseRefName(value.$ref, "#/components/schemas/");
      if (!target || !schemaNames.has(target)) {
        throw new Error(`${location} references missing schema ${value.$ref}`);
      }
      return;
    }
    if (!value.$ref.startsWith("#/components/schemas/")) {
      throw new Error(`${location} contains unsupported ref ${value.$ref}`);
    }
  }
  for (const nested of Object.values(value)) {
    validateSchemaRefs(nested, location, schemaNames);
  }
}

function validateFrontendGraphQLOperations(schema) {
  const source = read("apps/frontend/src/lib/graphql-client.ts");
  const templates = extractTemplateLiteralExports(source);
  const operations = new Map(
    [...templates.entries()]
      .filter(([name]) => name.endsWith("Operation"))
      .map(([name, value]) => [name, resolveTemplate(value, templates, [name])]),
  );
  if (!operations.size) {
    throw new Error("frontend GraphQL client must export operation documents");
  }
  for (const [name, operation] of operations) {
    const document = parseGraphQL(operation);
    const errors = validateGraphQL(schema, document);
    if (errors.length > 0) {
      throw new Error(
        `frontend GraphQL operation ${name} does not match public schema: ${errors
          .map((error) => error.message)
          .join("; ")}`,
      );
    }
  }
}

function validateGraphQLInputTypesAgainstUiContracts(schema, uiContractsSource) {
  const tsInterfaces = parseTsInterfaces(uiContractsSource);
  for (const type of Object.values(schema.getTypeMap())) {
    if (!isInputObjectType(type) || type.name.startsWith("__")) {
      continue;
    }
    const fields = type.getFields();
    const requiredFields = Object.values(fields)
      .filter((field) => isNonNullType(field.type))
      .map((field) => field.name);
    if (requiredFields.length === 0) {
      continue;
    }
    const interfaceFields = tsInterfaces.get(type.name);
    if (!interfaceFields) {
      throw new Error(`ui contracts missing GraphQL input interface ${type.name}`);
    }
    for (const field of requiredFields) {
      const tsField = interfaceFields.get(field);
      if (!tsField) {
        throw new Error(`ui contract ${type.name} missing required GraphQL input field ${field}`);
      }
      if (tsField.optional) {
        throw new Error(`ui contract ${type.name}.${field} must not be optional`);
      }
    }
  }
}

function validateAsyncApiRequestStructs(document) {
  const goSource = goContractSource();
  for (const [schemaName, schema] of Object.entries(document.components?.schemas ?? {})) {
    if (!schemaName.endsWith("Request")) {
      continue;
    }
    const requiredFields = schemaRequiredFields(schema).filter(
      (field) => !["requestId", "issuedAt", "authContext"].includes(field),
    );
    if (requiredFields.length === 0) {
      continue;
    }
    const structBody = goStructBody(goSource, schemaName);
    if (!structBody) {
      throw new Error(`Go contracts missing AsyncAPI request struct ${schemaName}`);
    }
    for (const field of requiredFields) {
      if (!structBody.includes(`json:"${field}`)) {
        throw new Error(`Go request struct ${schemaName} missing required AsyncAPI field ${field}`);
      }
    }
  }
}

function extractTemplateLiteralExports(source) {
  const values = new Map();
  const pattern = /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*`([\s\S]*?)`;/g;
  for (const match of source.matchAll(pattern)) {
    const [, name, value] = match;
    values.set(name, value);
  }
  return values;
}

function resolveTemplate(value, templates, stack) {
  return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match, name) => {
    if (!templates.has(name)) {
      throw new Error(`GraphQL operation template references unknown fragment ${name}`);
    }
    if (stack.includes(name)) {
      throw new Error(`GraphQL operation template contains recursive fragment ${name}`);
    }
    return resolveTemplate(templates.get(name), templates, [...stack, name]);
  });
}

function parseTsInterfaces(source) {
  const interfaces = new Map();
  const pattern = /export\s+interface\s+([A-Za-z0-9_]+)\s*{([\s\S]*?)\n}/g;
  for (const match of source.matchAll(pattern)) {
    const [, name, body] = match;
    const fields = new Map();
    const fieldPattern = /^\s*([A-Za-z0-9_]+)(\??):/gm;
    for (const fieldMatch of body.matchAll(fieldPattern)) {
      const [, fieldName, optionalMarker] = fieldMatch;
      fields.set(fieldName, { optional: optionalMarker === "?" });
    }
    interfaces.set(name, fields);
  }
  return interfaces;
}

function schemaRequiredFields(schema) {
  const required = new Set(schema.required ?? []);
  for (const item of schema.allOf ?? []) {
    for (const field of item.required ?? []) {
      required.add(field);
    }
  }
  return [...required];
}

function goContractSource() {
  return [
    "core/go-contracts/contracts.go",
    ...goFiles("core/control-plane/internal"),
    ...goFiles("core/storage-read/internal"),
    ...goFiles("core/storage-write/internal/ingest"),
    ...goFiles("core/otlp-collector/internal/collector"),
  ]
    .filter((file) => statSync(join(root, file), { throwIfNoEntry: false })?.isFile())
    .map(read)
    .join("\n");
}

function goFiles(dir) {
  const absolute = join(root, dir);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }
  return readdirSync(absolute)
    .filter((entry) => entry.endsWith(".go"))
    .map((entry) => `${dir}/${entry}`);
}

function goStructBody(source, name) {
  const match = source.match(new RegExp(`type\\s+${name}\\s+struct\\s*{([\\s\\S]*?)\\n}`));
  return match?.[1] ?? "";
}

function parseRefName(ref, prefix) {
  if (typeof ref !== "string" || !ref.startsWith(prefix)) {
    return "";
  }
  return ref.slice(prefix.length);
}

function hasEnum(schema, propertyName, expectedValues) {
  const values = schema?.properties?.[propertyName]?.enum;
  return expectedValues.every((value) => values?.includes(value));
}
