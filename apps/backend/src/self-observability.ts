import type { SelfObservabilityRuntimeConfig } from "@cloudgrid/runtime";
import type { MessageBridgeMetricRecord, MessageBridgeMetricsRecorder } from "./bridge";
import type { GraphQLMetricRecord, GraphQLMetricsRecorder } from "./graphql-metrics";

type MetricRecord = GraphQLMetricRecord | MessageBridgeMetricRecord;
type ExportFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Signal = "metrics" | "traces" | "logs";

export interface SelfObservabilitySpanRecord {
  name: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceState?: string;
  attributes?: Record<string, string>;
  result: "success" | "error";
  durationSeconds: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
}

export interface SelfObservabilityLogRecord {
  event: string;
  severity: "INFO" | "WARN" | "ERROR";
  attributes?: Record<string, string>;
}

export interface SelfObservabilityTraceRecorder {
  recordSpan(record: SelfObservabilitySpanRecord): void;
}

export interface SelfObservabilityLogRecorder {
  recordLog(record: SelfObservabilityLogRecord): void;
}

interface OTLPSelfObservabilityExporterOptions {
  serviceName: "cloudgrid.bff";
  deploymentMode: string;
  selfObservability: SelfObservabilityRuntimeConfig;
  fetch?: ExportFetch;
  now?: () => Date;
  idGenerator?: () => string;
  maxBuffer?: number;
}

export class OTLPSelfObservabilityExporter
  implements
    GraphQLMetricsRecorder,
    MessageBridgeMetricsRecorder,
    SelfObservabilityTraceRecorder,
    SelfObservabilityLogRecorder
{
  readonly #endpointBase: string;
  readonly #bearerToken: string | undefined;
  readonly #resource: Record<string, string>;
  readonly #fetch: ExportFetch;
  readonly #now: () => Date;
  readonly #idGenerator: () => string;
  readonly #maxBuffer: number;
  readonly #enabled: Record<Signal, boolean>;
  readonly #metricsBuffer: MetricRecord[] = [];
  readonly #spanBuffer: Array<SelfObservabilitySpanRecord & { observedAt: Date }> = [];
  readonly #logBuffer: Array<SelfObservabilityLogRecord & { observedAt: Date }> = [];
  readonly #timer: ReturnType<typeof setInterval>;
  #closed = false;

  constructor(options: OTLPSelfObservabilityExporterOptions) {
    const self = options.selfObservability;
    if (!self.otlpEndpoint) {
      throw new Error(
        "ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT is required",
      );
    }
    this.#endpointBase = self.otlpEndpoint.replace(/\/$/, "");
    this.#bearerToken = self.otlpBearerToken;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
    this.#idGenerator = options.idGenerator ?? (() => crypto.randomUUID().replaceAll("-", ""));
    this.#maxBuffer = options.maxBuffer ?? 1024;
    this.#enabled = {
      metrics: self.enabled && self.metricsEnabled,
      traces: self.enabled && self.tracesEnabled,
      logs: self.enabled && self.logsEnabled,
    };
    this.#resource = {
      "service.name": options.serviceName,
      "service.namespace": "cloudgrid",
      "cloudgrid.deployment_mode": options.deploymentMode,
      "cloudgrid.self_observability.project_id": self.projectId,
    };
    if (self.companyId) {
      this.#resource["cloudgrid.self_observability.company_id"] = self.companyId;
    }
    this.#timer = setInterval(() => {
      this.flush().catch(() => {});
    }, self.exportIntervalSeconds * 1000);
    this.#timer.unref?.();
  }

  static fromConfig(
    options: OTLPSelfObservabilityExporterOptions,
  ): OTLPSelfObservabilityExporter | undefined {
    const self = options.selfObservability;
    if (!self.enabled || (!self.metricsEnabled && !self.tracesEnabled && !self.logsEnabled)) {
      return undefined;
    }
    return new OTLPSelfObservabilityExporter(options);
  }

  record(record: MetricRecord): void {
    if (!this.#enabled.metrics) {
      return;
    }
    this.#append(this.#metricsBuffer, record);
  }

  recordSpan(record: SelfObservabilitySpanRecord): void {
    if (!this.#enabled.traces) {
      return;
    }
    this.#append(this.#spanBuffer, { ...record, observedAt: this.#now() });
  }

  recordLog(record: SelfObservabilityLogRecord): void {
    if (!this.#enabled.logs) {
      return;
    }
    this.#append(this.#logBuffer, { ...record, observedAt: this.#now() });
  }

  async flush(): Promise<void> {
    const metrics = this.#metricsBuffer.splice(0);
    const spans = this.#spanBuffer.splice(0);
    const logs = this.#logBuffer.splice(0);

    await Promise.all([
      this.#exportSignal("metrics", metrics, () => this.#metricsPayload(metrics)),
      this.#exportSignal("traces", spans, () => this.#tracesPayload(spans)),
      this.#exportSignal("logs", logs, () => this.#logsPayload(logs)),
    ]);
  }

  async shutdown(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer);
    await this.flush();
  }

  #append<T>(buffer: T[], record: T) {
    if (this.#closed || buffer.length >= this.#maxBuffer) {
      return;
    }
    buffer.push(record);
  }

  async #exportSignal(signal: Signal, records: unknown[], payload: () => unknown) {
    if (!this.#enabled[signal] || records.length === 0) {
      return;
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.#bearerToken) {
      headers.authorization = `Bearer ${this.#bearerToken}`;
    }
    try {
      const response = await this.#fetch(`${this.#endpointBase}/v1/${signal}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload()),
      });
      if (!response.ok) {
        return;
      }
    } catch {
      return;
    }
  }

  #metricsPayload(records: MetricRecord[]) {
    return {
      resourceMetrics: [
        {
          resource: { attributes: otlpAttributes(this.#resource) },
          scopeMetrics: [
            {
              scope: { name: "cloudgrid.self_observability" },
              metrics: records.map((record) => otlpMetric(record, this.#now())),
            },
          ],
        },
      ],
    };
  }

  #tracesPayload(records: Array<SelfObservabilitySpanRecord & { observedAt: Date }>) {
    return {
      resourceSpans: [
        {
          resource: { attributes: otlpAttributes(this.#resource) },
          scopeSpans: [
            {
              scope: { name: "cloudgrid.self_observability" },
              spans: records.map((record) => otlpSpan(record, this.#idGenerator)),
            },
          ],
        },
      ],
    };
  }

  #logsPayload(records: Array<SelfObservabilityLogRecord & { observedAt: Date }>) {
    return {
      resourceLogs: [
        {
          resource: { attributes: otlpAttributes(this.#resource) },
          scopeLogs: [
            {
              scope: { name: "cloudgrid.self_observability" },
              logRecords: records.map((record) => otlpLogRecord(record)),
            },
          ],
        },
      ],
    };
  }
}

export class OTLPMetricsExporter extends OTLPSelfObservabilityExporter {
  static fromConfig(
    options: OTLPSelfObservabilityExporterOptions,
  ): OTLPMetricsExporter | undefined {
    const self = options.selfObservability;
    if (!self.enabled || !self.metricsEnabled) {
      return undefined;
    }
    return new OTLPMetricsExporter({
      ...options,
      selfObservability: { ...self, tracesEnabled: false, logsEnabled: false },
    });
  }
}

function otlpMetric(record: MetricRecord, now: Date) {
  const point: Record<string, unknown> = {
    timeUnixNano: unixNano(now),
    attributes: otlpAttributes(record.attributes as unknown as Record<string, string>),
  };
  if (record.kind === "histogram") {
    return {
      name: record.metric,
      histogram: {
        aggregationTemporality: "AGGREGATION_TEMPORALITY_DELTA",
        dataPoints: [
          { ...point, count: "1", sum: record.value, bucketCounts: ["1"], explicitBounds: [] },
        ],
      },
    };
  }
  return {
    name: record.metric,
    sum: {
      aggregationTemporality: "AGGREGATION_TEMPORALITY_DELTA",
      isMonotonic: true,
      dataPoints: [{ ...point, asDouble: record.value }],
    },
  };
}

function otlpSpan(
  record: SelfObservabilitySpanRecord & { observedAt: Date },
  idGenerator: () => string,
) {
  const traceId = validTraceId(record.traceId) ?? validTraceId(fixedHex(idGenerator(), 32));
  const spanId = validSpanId(record.spanId) ?? validSpanId(fixedHex(idGenerator(), 16));
  const parentSpanId = validSpanId(record.parentSpanId);
  const endUnixNano = BigInt(record.observedAt.getTime()) * 1_000_000n;
  const durationNanos = BigInt(Math.max(0, Math.round(record.durationSeconds * 1_000_000_000)));
  const span: Record<string, unknown> = {
    traceId: hexBytesToBase64(traceId ?? randomHex(32)),
    spanId: hexBytesToBase64(spanId ?? randomHex(16)),
    name: record.name,
    kind: "SPAN_KIND_INTERNAL",
    startTimeUnixNano: `${endUnixNano - durationNanos}`,
    endTimeUnixNano: `${endUnixNano}`,
    attributes: otlpAttributes(record.attributes ?? {}),
    status: { code: record.result === "success" ? "STATUS_CODE_OK" : "STATUS_CODE_ERROR" },
  };
  if (parentSpanId) {
    span.parentSpanId = hexBytesToBase64(parentSpanId);
  }
  if (record.traceState) {
    span.traceState = record.traceState;
  }
  return span;
}

function otlpLogRecord(record: SelfObservabilityLogRecord & { observedAt: Date }) {
  return {
    timeUnixNano: unixNano(record.observedAt),
    severityText: record.severity,
    body: { stringValue: record.event },
    attributes: otlpAttributes(record.attributes ?? {}),
  };
}

function otlpAttributes(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .filter(([key, value]) => key !== "" && value !== "")
    .map(([key, value]) => ({ key, value: { stringValue: value } }));
}

function unixNano(date: Date): string {
  return `${BigInt(date.getTime()) * 1_000_000n}`;
}

function fixedHex(value: string, length: number): string {
  const hex = value
    .replaceAll("-", "")
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "");
  return hex.padEnd(length, "0").slice(0, length);
}

function hexBytesToBase64(value: string): string {
  return Buffer.from(value, "hex").toString("base64");
}

export function createTraceContext(
  options: {
    traceId?: () => string;
    spanId?: () => string;
    parentSpanId?: string;
    traceState?: string;
  } = {},
): TraceContext {
  const parentSpanId = normalizeHex(options.parentSpanId, 16);
  const validParentSpanId = validSpanId(parentSpanId);
  return {
    traceId: validTraceId(fixedHex(options.traceId?.() ?? randomHex(32), 32)) ?? randomHex(32),
    spanId: validSpanId(fixedHex(options.spanId?.() ?? randomHex(16), 16)) ?? randomHex(16),
    ...(validParentSpanId ? { parentSpanId: validParentSpanId } : {}),
    ...(validTraceState(options.traceState) ? { traceState: options.traceState } : {}),
  };
}

export function parseTraceContext(headers: {
  traceparent?: string | null;
  tracestate?: string | null;
}): TraceContext | undefined {
  const traceparent = headers.traceparent?.trim();
  const match = traceparent?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/);
  if (!match) {
    return undefined;
  }
  const traceId = validTraceId(match[1]);
  const parentSpanId = validSpanId(match[2]);
  if (!traceId || !parentSpanId) {
    return undefined;
  }
  return {
    traceId,
    spanId: parentSpanId,
    ...(validTraceState(headers.tracestate) ? { traceState: headers.tracestate } : {}),
  };
}

export function traceContextToTraceParent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-01`;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
  if (/^0+$/.test(hex)) {
    return `1${"0".repeat(length - 1)}`;
  }
  return hex;
}

function normalizeHex(value: string | undefined, length: number): string | undefined {
  if (!value) {
    return undefined;
  }
  return fixedHex(value, length);
}

function validTraceId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value) ? value : undefined;
}

function validSpanId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{16}$/.test(value) && !/^0+$/.test(value) ? value : undefined;
}

function validTraceState(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 512 && /^[\x20-\x7e]*$/.test(value);
}
