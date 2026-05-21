import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { buildSchema, isInputObjectType, isNonNullType, parse, validate } from "graphql";
import {
  AI_EVAL_SUBJECTS,
  AI_CHAT_ACTION_RISKS,
  AI_CHAT_ACTION_STATUSES,
  AI_CHAT_ARTIFACT_KINDS,
  AI_CHAT_CONVERSATION_STATUSES,
  AI_CHAT_RUN_STATUSES,
  AI_CHAT_STREAM_EVENT_TYPES,
  AI_MODEL_PURPOSES,
  AI_PROVIDER_KINDS,
  AUTH_MODES,
  AUTH_PROVIDERS,
  COMPANY_ROLES,
  CONTROL_PLANE_SUBJECTS,
  CLOUDGRID_ENV_VARS,
  DEPLOYMENT_MODES,
  MESSAGE_BRIDGE_SUBJECTS,
  PROJECT_STATUSES,
  TELEMETRY_SUBJECTS,
} from "../../apps/packages/definition/src/index";

const root = join(import.meta.dir, "..", "..");

describe("contract generation", () => {
  test("generated outputs are deterministic", async () => {
    const result = await $`bun tooling/scripts/generate-contracts.mjs --check`.cwd(root).quiet();
    expect(result.exitCode).toBe(0);
  });

  test("definition inventory is reflected in generated TypeScript and Go metadata", () => {
    const ts = readFileSync(join(root, "apps/packages/ui-contracts/src/generated.ts"), "utf8");
    const go = readFileSync(join(root, "core/go-contracts/generated_contracts.go"), "utf8");

    for (const value of [
      ...DEPLOYMENT_MODES,
      ...AUTH_MODES,
      ...AUTH_PROVIDERS,
      ...COMPANY_ROLES,
      ...PROJECT_STATUSES,
      ...AI_PROVIDER_KINDS,
      ...AI_MODEL_PURPOSES,
      ...AI_CHAT_CONVERSATION_STATUSES,
      ...AI_CHAT_RUN_STATUSES,
      ...AI_CHAT_ACTION_RISKS,
      ...AI_CHAT_ACTION_STATUSES,
      ...AI_CHAT_ARTIFACT_KINDS,
      ...AI_CHAT_STREAM_EVENT_TYPES,
      ...TELEMETRY_SUBJECTS,
      ...CONTROL_PLANE_SUBJECTS,
      ...AI_EVAL_SUBJECTS,
      ...MESSAGE_BRIDGE_SUBJECTS,
      ...CLOUDGRID_ENV_VARS,
    ]) {
      expect(ts).toContain(value);
      expect(go).toContain(value);
    }
  });

  test("AI Chat stream event metadata matches the stream schema", () => {
    const schema = JSON.parse(
      readFileSync(join(root, "specs/03-contracts/entities/ai/ai-chat-stream.schema.json"), "utf8"),
    ) as {
      $defs: {
        streamEvent: {
          properties: { type: { enum: string[] } };
        };
      };
    };

    expect(AI_CHAT_STREAM_EVENT_TYPES).toEqual(schema.$defs.streamEvent.properties.type.enum);
  });

  test("AI Chat json-render catalog constrains trace waterfall data", () => {
    const schema = JSON.parse(
      readFileSync(
        join(root, "specs/03-contracts/entities/ai/json-render-catalog.schema.json"),
        "utf8",
      ),
    ) as {
      allOf: Array<{
        if?: { properties?: { renderer?: { const?: string } } };
        then?: { properties?: { data?: unknown } };
      }>;
      $defs: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
    };
    const traceWaterfallRule = schema.allOf.find(
      (rule) => rule.if?.properties?.renderer?.const === "trace_waterfall",
    );

    expect(traceWaterfallRule?.then?.properties?.data).toEqual({
      $ref: "#/$defs/traceWaterfallData",
    });
    expect(schema.$defs.traceWaterfallData?.required).toEqual(["trace", "spans", "structure"]);
    expect(schema.$defs.traceWaterfallData?.properties?.trace).toEqual({ $ref: "#/$defs/trace" });
    expect(schema.$defs.traceWaterfallData?.properties?.spans).toMatchObject({
      type: "array",
      maxItems: 5000,
      items: { $ref: "#/$defs/span" },
    });
    expect(schema.$defs.traceWaterfallData?.properties?.structure).toEqual({
      $ref: "#/$defs/traceStructure",
    });
    expect(schema.$defs.span?.required).toEqual(
      expect.arrayContaining(["id", "traceId", "links", "exceptions"]),
    );
    expect(schema.$defs.traceStructure?.required).toEqual(
      expect.arrayContaining(["rootSpanIds", "orphanSpanIds", "criticalPathSpanIds"]),
    );
  });

  test("AI Chat json-render catalog constrains common artifact data shapes", () => {
    const schema = JSON.parse(
      readFileSync(
        join(root, "specs/03-contracts/entities/ai/json-render-catalog.schema.json"),
        "utf8",
      ),
    ) as {
      allOf: Array<{
        if?: { properties?: { renderer?: { const?: string } } };
        then?: { properties?: { data?: unknown } };
      }>;
      $defs: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
    };
    const dataRefFor = (renderer: string) =>
      schema.allOf.find((rule) => rule.if?.properties?.renderer?.const === renderer)?.then
        ?.properties?.data;

    expect(dataRefFor("table")).toEqual({ $ref: "#/$defs/tableData" });
    expect(dataRefFor("status_summary")).toEqual({ $ref: "#/$defs/statusSummaryData" });
    expect(dataRefFor("log_list")).toEqual({ $ref: "#/$defs/logListData" });
    expect(dataRefFor("metric_timeseries")).toEqual({ $ref: "#/$defs/metricSeriesData" });
    expect(schema.$defs.tableData?.required).toEqual(["rows"]);
    expect(schema.$defs.tableData?.properties?.rows).toMatchObject({
      type: "array",
      maxItems: 500,
    });
    expect(schema.$defs.logListData?.properties?.items).toMatchObject({
      type: "array",
      maxItems: 200,
    });
    expect(schema.$defs.metricSeriesData?.required).toEqual(["result"]);
  });

  test("public API GraphQL operations validate against the public schema", () => {
    const schema = buildSchema(
      readFileSync(join(root, "specs/03-contracts/graphql/public-schema.graphql"), "utf8"),
    );
    const source = sourceFiles(join(root, "apps/packages/public-api-client/src"))
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const templates = extractTemplates(source);
    const operations = [...templates.entries()]
      .filter(([name]) => name.endsWith("Operation"))
      .map(([name, value]) => [name, resolveTemplate(value, templates, [name])] as const);

    expect(operations.length).toBeGreaterThan(0);
    for (const [name, operation] of operations) {
      const errors = validate(schema, parse(operation));
      expect(errors.map((error) => `${name}: ${error.message}`)).toEqual([]);
    }
  });

  test("GraphQL required input fields are present in UI contract interfaces", () => {
    const schema = buildSchema(
      readFileSync(join(root, "specs/03-contracts/graphql/public-schema.graphql"), "utf8"),
    );
    const interfaces = parseInterfaces(
      readFileSync(join(root, "apps/packages/ui-contracts/src/index.ts"), "utf8"),
    );
    const violations: string[] = [];

    for (const type of Object.values(schema.getTypeMap())) {
      if (!isInputObjectType(type) || type.name.startsWith("__")) {
        continue;
      }
      const fields = Object.values(type.getFields()).filter((field) => isNonNullType(field.type));
      if (!fields.length) {
        continue;
      }
      const contractFields = interfaces.get(type.name);
      if (!contractFields) {
        violations.push(`${type.name}: missing interface`);
        continue;
      }
      for (const field of fields) {
        const contractField = contractFields.get(field.name);
        if (!contractField) {
          violations.push(`${type.name}.${field.name}: missing required field`);
        } else if (contractField.optional) {
          violations.push(`${type.name}.${field.name}: field must not be optional`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

function extractTemplates(source: string) {
  const values = new Map<string, string>();
  const pattern = /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*`([\s\S]*?)`;/g;
  for (const match of source.matchAll(pattern)) {
    values.set(match[1], match[2]);
  }
  return values;
}

function resolveTemplate(value: string, templates: Map<string, string>, stack: string[]): string {
  return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
    const replacement = templates.get(name);
    if (!replacement) {
      throw new Error(`unknown GraphQL template fragment ${name}`);
    }
    if (stack.includes(name)) {
      throw new Error(`recursive GraphQL template fragment ${name}`);
    }
    return resolveTemplate(replacement, templates, [...stack, name]);
  });
}

function parseInterfaces(source: string) {
  const interfaces = new Map<string, Map<string, { optional: boolean }>>();
  const pattern = /export\s+interface\s+([A-Za-z0-9_]+)\s*{([\s\S]*?)\n}/g;
  for (const match of source.matchAll(pattern)) {
    const fields = new Map<string, { optional: boolean }>();
    for (const fieldMatch of match[2].matchAll(/^\s*([A-Za-z0-9_]+)(\??):/gm)) {
      fields.set(fieldMatch[1], { optional: fieldMatch[2] === "?" });
    }
    interfaces.set(match[1], fields);
  }
  return interfaces;
}
