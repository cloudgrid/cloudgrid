import { parseWithZod, z } from "@cloudgrid/runtime";
import type {
  AgentRunSearchInput,
  AiQualityOverviewInput,
  AlertRuleSearchInput,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  CommitDatasetImportInput,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateDatasetInput,
  CreateExperimentInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  CreateScorerInput,
  DashboardListInput,
  DatasetItemSearchInput,
  DatasetSearchInput,
  EvalResultSearchInput,
  ExperimentSearchInput,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  LiveExperimentRunInput,
  LiveTraceInput,
  LogSearchInput,
  MetricNameSearchInput,
  MetricSeriesInput,
  PrepareDatasetImportInput,
  ProjectListInput,
  ProjectRole,
  PromotePromptVersionInput,
  PromoteSpanToDatasetItemInput,
  RemoveOrganizationMemberInput,
  ReorderDashboardPinsInput,
  ResolveAnnotationInput,
  RichMetricSeriesInput,
  SaveDashboardInput,
  ScorerSearchInput,
  SetDashboardPinnedInput,
  StartDatasetExportInput,
  StartExperimentRunInput,
  StartOptimizationRunInput,
  TelemetryFacetInput,
  TraceDetailInput,
  TraceSearchInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
} from "@cloudgrid/ui-contracts";
import { compactInput, graphQLErrorFromBridge } from "./bridge";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const statusSchema = z.enum(["ok", "error", "unset"]);
const traceSortSchema = z.enum([
  "startedAt_desc",
  "startedAt_asc",
  "duration_desc",
  "duration_asc",
  "errorFirst",
]);
const logSortSchema = z.enum(["timestamp_desc", "timestamp_asc", "severity_desc"]);
const attributeOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "exists",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
]);
const attributeFilterSchema = z.object({
  key: z.string().min(1),
  operator: attributeOperatorSchema,
  value: z.unknown().optional().nullable(),
});

const traceSearchInputSchema = withTimeRange(
  withDurationRange(
    z.object({
      service: z.string().min(1).optional(),
      query: z.string().min(1).optional(),
      operationName: z.string().min(1).optional(),
      spanName: z.string().min(1).optional(),
      from: isoDateTimeSchema.optional(),
      to: isoDateTimeSchema.optional(),
      status: statusSchema.optional(),
      minDurationMs: z.number().min(0).optional(),
      maxDurationMs: z.number().min(0).optional(),
      attributes: z.array(attributeFilterSchema).optional(),
      sort: traceSortSchema.optional(),
      cursor: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    "minDurationMs",
    "maxDurationMs",
  ),
);

const liveTraceInputSchema = withDurationRange(
  z.object({
    service: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    operationName: z.string().min(1).optional(),
    spanName: z.string().min(1).optional(),
    from: isoDateTimeSchema.optional(),
    status: statusSchema.optional(),
    minDurationMs: z.number().min(0).optional(),
    maxDurationMs: z.number().min(0).optional(),
    attributes: z.array(attributeFilterSchema).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  "minDurationMs",
  "maxDurationMs",
);

const traceDetailInputSchema = withDurationRange(
  z.object({
    selectedSpanId: z.string().min(1).optional(),
    spanQuery: z.string().min(1).optional(),
    spanService: z.string().min(1).optional(),
    spanName: z.string().min(1).optional(),
    spanStatus: statusSchema.optional(),
    minSpanDurationMs: z.number().min(0).optional(),
    maxSpanDurationMs: z.number().min(0).optional(),
    attributes: z.array(attributeFilterSchema).optional(),
    showMatchesOnly: z.boolean().optional(),
    relatedLogLimit: z.number().int().min(1).max(200).optional(),
    logSearch: z.string().min(1).optional(),
  }),
  "minSpanDurationMs",
  "maxSpanDurationMs",
);

const logSearchInputSchema = withTimeRange(
  z.object({
    service: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
    spanId: z.string().min(1).optional(),
    severity: z.string().min(1).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    search: z.string().min(1).optional(),
    attributes: z.array(attributeFilterSchema).optional(),
    sort: logSortSchema.optional(),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
);

const telemetryFacetInputSchema = withTimeRange(
  z.object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    service: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
);
const metricAggregationSchema = z.enum([
  "avg",
  "sum",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p90",
  "p95",
  "p99",
]);
const metricChartTypeSchema = z.enum([
  "line",
  "area",
  "bar",
  "pie",
  "donut",
  "stat",
  "radial",
  "radar",
  "heatmap",
  "histogram",
  "table",
]);
const metricNameSearchInputSchema = withTimeRange(
  z.object({
    query: z.string().min(1).optional(),
    service: z.string().min(1).optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
);
const metricSeriesInputSchema = withTimeRange(
  z.object({
    metricName: z.string().min(1),
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    interval: z.string().min(1).optional(),
    aggregation: metricAggregationSchema,
    groupBy: z.array(z.string().min(1)).max(5).optional(),
    filters: z.array(attributeFilterSchema).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  }),
);
const dashboardVisibilitySchema = z.enum(["builtin", "project", "personal"]);
const dashboardSaveVisibilitySchema = z.enum(["project", "personal"]);
const dashboardWidgetKindSchema = z.enum([
  "metric_timeseries",
  "metric_stat",
  "metric_table",
  "metric_rich",
  "log_table",
  "trace_table",
  "live_trace_table",
]);
const dashboardThresholdSeveritySchema = z.enum(["info", "warning", "error"]);
const dashboardLogColumnSchema = z.enum([
  "timestamp",
  "observed_timestamp",
  "severity",
  "service",
  "trace_span",
  "body",
  "attributes",
]);
const dashboardTraceColumnSchema = z.enum([
  "started_at",
  "status",
  "service",
  "operation",
  "duration",
  "span_count",
  "log_count",
]);
const dashboardListInputSchema = z.object({
  includeBuiltins: z.boolean().optional(),
  query: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  visibility: dashboardVisibilitySchema.optional(),
  pinnedOnly: z.boolean().optional(),
});
const dashboardLayoutInputSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  minW: z.number().int().min(1).max(12).optional(),
  minH: z.number().int().min(1).max(12).optional(),
});
const dashboardThresholdInputSchema = z.object({
  value: z.number(),
  severity: dashboardThresholdSeveritySchema,
  label: z.string().min(1).optional(),
});
const dashboardMetricWidgetInputSchema = z.object({
  metricName: z.string().min(1),
  aggregation: metricAggregationSchema,
  groupBy: z.array(z.string().min(1)).max(5).optional(),
  filters: z.array(attributeFilterSchema).optional(),
  timeWindow: z.string().min(1).optional(),
  interval: z.string().min(1).optional(),
  visualization: metricChartTypeSchema,
  legend: z.boolean().optional(),
  maxSeries: z.number().int().min(1).max(50).optional(),
  thresholds: z.array(dashboardThresholdInputSchema).optional(),
});
const dashboardMetricFormulaExpressionSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    kind: z.enum(["ref", "number", "binary", "unary", "function"]),
    refId: z.string().min(1).optional(),
    value: z.number().optional(),
    operator: z.enum(["add", "subtract", "multiply", "divide"]).optional(),
    left: dashboardMetricFormulaExpressionSchema.optional().nullable(),
    right: dashboardMetricFormulaExpressionSchema.optional().nullable(),
    function: z
      .enum([
        "sum_series",
        "avg_series",
        "min_series",
        "max_series",
        "ratio",
        "clamp_min",
        "clamp_max",
        "moving_average",
      ])
      .optional(),
    arguments: z.array(dashboardMetricFormulaExpressionSchema).max(8).optional(),
  }),
);
const dashboardMetricQueryInputSchema = z
  .object({
    timeWindow: z.string().min(1).optional(),
    interval: z.string().min(1).optional(),
    queries: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          metricName: z.string().min(1),
          aggregation: metricAggregationSchema,
          groupBy: z.array(z.string().min(1)).max(6).optional(),
          filters: z.array(attributeFilterSchema).max(20).optional(),
          maxSeries: z.number().int().min(1).max(50).optional(),
        }),
      )
      .min(1)
      .max(8),
    formulas: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          expression: dashboardMetricFormulaExpressionSchema,
          unit: z.string().min(1).optional(),
        }),
      )
      .max(8)
      .optional(),
    displaySeries: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          sourceId: z.string().min(1),
          visible: z.boolean().optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .superRefine(validateDashboardMetricQueryDefinition);
const dashboardRichMetricWidgetInputSchema = z.object({
  query: dashboardMetricQueryInputSchema,
  visualization: metricChartTypeSchema,
  legend: z.boolean().optional(),
  maxSeries: z.number().int().min(1).max(50).optional(),
  thresholds: z.array(dashboardThresholdInputSchema).optional(),
});
const richMetricSeriesInputSchema = withTimeRange(
  z.object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    query: dashboardMetricQueryInputSchema,
  }),
);
const dashboardLogWidgetInputSchema = z.object({
  service: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  spanId: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  attributes: z.array(attributeFilterSchema).optional(),
  sort: logSortSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  columns: z.array(dashboardLogColumnSchema).optional(),
});
const dashboardTraceWidgetInputSchema = withDurationRange(
  z.object({
    service: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    operationName: z.string().min(1).optional(),
    spanName: z.string().min(1).optional(),
    status: statusSchema.optional(),
    minDurationMs: z.number().min(0).optional(),
    maxDurationMs: z.number().min(0).optional(),
    attributes: z.array(attributeFilterSchema).optional(),
    sort: traceSortSchema.optional(),
    limit: z.number().int().min(1).max(200).optional(),
    columns: z.array(dashboardTraceColumnSchema).optional(),
  }),
  "minDurationMs",
  "maxDurationMs",
);
const dashboardLiveTraceWidgetInputSchema = withDurationRange(
  z.object({
    service: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    operationName: z.string().min(1).optional(),
    spanName: z.string().min(1).optional(),
    status: statusSchema.optional(),
    minDurationMs: z.number().min(0).optional(),
    maxDurationMs: z.number().min(0).optional(),
    attributes: z.array(attributeFilterSchema).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  "minDurationMs",
  "maxDurationMs",
);
const dashboardWidgetInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    kind: dashboardWidgetKindSchema,
    layout: dashboardLayoutInputSchema,
    metric: dashboardMetricWidgetInputSchema.optional().nullable(),
    richMetric: dashboardRichMetricWidgetInputSchema.optional().nullable(),
    logs: dashboardLogWidgetInputSchema.optional().nullable(),
    traces: dashboardTraceWidgetInputSchema.optional().nullable(),
    liveTraces: dashboardLiveTraceWidgetInputSchema.optional().nullable(),
  })
  .superRefine((input, context) => {
    const presentConfigs = [
      input.metric ? "metric" : null,
      input.richMetric ? "richMetric" : null,
      input.logs ? "logs" : null,
      input.traces ? "traces" : null,
      input.liveTraces ? "liveTraces" : null,
    ].filter(Boolean);
    const expectedConfig =
      input.kind === "log_table"
        ? "logs"
        : input.kind === "metric_rich"
          ? "richMetric"
          : input.kind === "trace_table"
            ? "traces"
            : input.kind === "live_trace_table"
              ? "liveTraces"
              : "metric";
    if (presentConfigs.length !== 1 || presentConfigs[0] !== expectedConfig) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dashboard widget must provide exactly one matching config for its kind",
        path: [expectedConfig],
      });
    }
  });
const saveDashboardInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    version: z.number().int().min(1).optional(),
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    visibility: dashboardSaveVisibilitySchema.optional(),
    defaultTimeWindow: z.string().min(1).optional(),
    widgets: z.array(dashboardWidgetInputSchema).min(1).max(24),
  })
  .superRefine((input, context) => {
    if (containsSensitiveKey(input)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dashboard must not include secret-bearing keys",
        path: ["widgets"],
      });
    }
  });
const setDashboardPinnedInputSchema = z.object({
  dashboardId: z.string().min(1),
  pinned: z.boolean(),
});
const reorderDashboardPinsInputSchema = z.object({
  dashboardIds: z.array(z.string().min(1)).max(5),
});

const projectStatusSchema = z.enum(["active", "read_only", "disabled"]);
const companyRoleSchema = z.enum(["admin", "user"]);
const projectRoleSchema = z.enum(["viewer", "editor", "admin"]);
const retentionDataClassSchema = z.enum([
  "TRACES",
  "LOGS",
  "METRICS",
  "AI_EVALS",
  "DATASETS",
  "SCORERS",
  "DASHBOARD_HISTORY",
  "INGEST_CREDENTIAL_AUDIT",
]);
const retentionModeSchema = z.enum(["retain", "delete", "soft_delete_then_delete"]);
const alertRuleKindSchema = z.enum([
  "METRIC_THRESHOLD",
  "METRIC_ABSENCE",
  "LOG_MATCH",
  "LOG_COUNT",
  "TRACE_MATCH",
  "TRACE_COUNT",
  "TRACE_LATENCY",
  "TRACE_ERROR",
]);
const alertSeveritySchema = z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]);
const alertStateSchema = z.enum(["OK", "PENDING", "FIRING", "RESOLVED", "SILENCED", "ERROR"]);
const alertSignalSchema = z.enum(["METRIC", "LOG", "TRACE"]);
const alertRuleSortSchema = z.enum([
  "updatedAt_desc",
  "updatedAt_asc",
  "createdAt_desc",
  "createdAt_asc",
  "name_asc",
  "name_desc",
  "severity_asc",
  "severity_desc",
  "kind_asc",
  "kind_desc",
  "enabled_asc",
  "enabled_desc",
]);
const jsonObjectSchema = z.record(z.string(), z.unknown());
const agentRunStatusSchema = z.enum(["ok", "error", "unset", "cancelled"]);
const scorerKindSchema = z.enum([
  "deterministic",
  "schema_json",
  "semantic",
  "rag",
  "llm_judge",
  "tool_correctness",
  "trajectory",
  "human",
]);
const evalTargetKindSchema = z.enum(["agentRun", "span", "datasetItemRun"]);
const experimentRunStatusSchema = z.enum(["queued", "running", "cancelled", "failed", "finished"]);
const annotationStatusSchema = z.enum(["open", "in_review", "resolved", "dismissed"]);
const optimizerKindSchema = z.enum([
  "bootstrap_fewshot",
  "critic_mutate_judge_pick",
  "mipro_v2",
  "reflective_text_gradient",
]);
const datasetSplitSchema = z.enum(["dev", "optimization", "validation", "regression", "holdout"]);
const datasetReviewStatusSchema = z.enum(["unreviewed", "reviewed", "rejected"]);
const providerKindSchema = z.enum([
  "openai",
  "anthropic",
  "azure_openai",
  "google_vertex",
  "bedrock",
  "openai_compatible",
  "local_harness",
  "custom_harness",
]);
const modelPurposeSchema = z.enum(["judge", "optimizer", "embedding", "replay", "default"]);
const aiSearchPageSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});
const datasetSplitSelectorInputSchema = z.object({
  splits: z.array(datasetSplitSchema).min(1),
  reviewedOnly: z.boolean().optional(),
  includeSynthetic: z.boolean().optional(),
});
const agentRunSearchInputSchema = withTimeRange(
  aiSearchPageSchema.extend({
    agentId: z.string().min(1).optional(),
    agentName: z.string().min(1).optional(),
    status: agentRunStatusSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    experimentRunId: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
  }),
);
const datasetSearchInputSchema = aiSearchPageSchema.extend({
  query: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  split: datasetSplitSchema.optional(),
  reviewStatus: datasetReviewStatusSchema.optional(),
});
const datasetItemSearchInputSchema = aiSearchPageSchema.extend({
  query: z.string().min(1).optional(),
  sourceTraceId: z.string().min(1).optional(),
  split: datasetSplitSchema.optional(),
  reviewStatus: datasetReviewStatusSchema.optional(),
  synthetic: z.boolean().optional(),
});
const scorerSearchInputSchema = aiSearchPageSchema.extend({
  kind: scorerKindSchema.optional(),
  query: z.string().min(1).optional(),
});
const experimentSearchInputSchema = aiSearchPageSchema.extend({
  datasetId: z.string().min(1).optional(),
  status: experimentRunStatusSchema.optional(),
  split: datasetSplitSchema.optional(),
  baselineRunId: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});
const evalResultSearchInputSchema = aiSearchPageSchema.extend({
  scorerId: z.string().min(1).optional(),
  experimentRunId: z.string().min(1).optional(),
  targetKind: evalTargetKindSchema.optional(),
  targetId: z.string().min(1).optional(),
  passed: z.boolean().optional(),
});
const annotationQueueSearchInputSchema = aiSearchPageSchema.extend({
  status: annotationStatusSchema.optional(),
  reason: z.string().min(1).optional(),
  assignedTo: z.string().min(1).optional(),
  scorerId: z.string().min(1).optional(),
  targetKind: evalTargetKindSchema.optional(),
});
const createDatasetInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
});
const datasetItemInputSchema = z.object({
  input: z.unknown(),
  expected: z.unknown().optional().nullable(),
  metadata: z.unknown().optional(),
  sourceTraceId: z.string().min(1).optional(),
  sourceSpanId: z.string().min(1).optional(),
  split: datasetSplitSchema.optional(),
  reviewStatus: datasetReviewStatusSchema.optional(),
});
const appendDatasetItemsInputSchema = z.object({
  datasetId: z.string().min(1),
  items: z.array(datasetItemInputSchema).min(1).max(500),
});
const datasetImportFormatSchema = z.enum(["jsonl", "json_array", "csv", "zip"]);
const datasetExportFormatSchema = z.enum(["jsonl", "json_array", "csv"]);
const datasetImportCommitModeSchema = z.enum(["valid_rows_only", "reject_if_any_error"]);
const datasetImportScalarMappingInputSchema = z.object({
  column: z.string().min(1).optional().nullable(),
  jsonPath: z.string().min(1).optional().nullable(),
  constant: z.unknown().optional(),
  defaultValue: z.unknown().optional(),
});
const datasetImportFieldMappingInputSchema = z.object({
  targetPath: z.string().min(1),
  source: datasetImportScalarMappingInputSchema,
});
const datasetImportMappingInputSchema = z.object({
  input: z.array(datasetImportFieldMappingInputSchema).min(1),
  expected: z.array(datasetImportFieldMappingInputSchema).optional().nullable(),
  metadata: z.array(datasetImportFieldMappingInputSchema).optional().nullable(),
  sourceTraceId: datasetImportScalarMappingInputSchema.optional().nullable(),
  sourceSpanId: datasetImportScalarMappingInputSchema.optional().nullable(),
  split: datasetImportScalarMappingInputSchema.optional().nullable(),
  reviewStatus: datasetImportScalarMappingInputSchema.optional().nullable(),
});
const prepareDatasetImportInputSchema = z.object({
  datasetId: z.string().min(1),
  uploadId: z.string().min(1),
  format: datasetImportFormatSchema,
  fileSelector: z
    .object({
      include: z.array(z.string().min(1)).optional().nullable(),
      exclude: z.array(z.string().min(1)).optional().nullable(),
    })
    .optional()
    .nullable(),
  mapping: datasetImportMappingInputSchema,
  defaults: z
    .object({
      split: datasetSplitSchema.optional().nullable(),
      reviewStatus: datasetReviewStatusSchema.optional().nullable(),
      metadata: jsonObjectSchema.optional().nullable(),
      synthetic: z.boolean().optional().nullable(),
      allowPartialCommit: z.boolean().optional().nullable(),
    })
    .optional()
    .nullable(),
  previewLimit: z.number().int().min(1).max(100).optional().nullable(),
});
const commitDatasetImportInputSchema = z.object({
  importId: z.string().min(1),
  expectedDatasetVersion: z.number().int().min(1),
  mode: datasetImportCommitModeSchema.optional().nullable(),
});
const startDatasetExportInputSchema = z.object({
  datasetId: z.string().min(1),
  format: datasetExportFormatSchema,
  split: datasetSplitSchema.optional().nullable(),
  reviewStatus: datasetReviewStatusSchema.optional().nullable(),
  includeMetadata: z.boolean().optional().nullable(),
  includeSourcePointers: z.boolean().optional().nullable(),
});
const promoteSpanToDatasetItemInputSchema = z.object({
  datasetId: z.string().min(1),
  traceId: z.string().min(1),
  spanId: z.string().min(1).optional(),
  input: z.unknown().optional(),
  expected: z.unknown().optional().nullable(),
  metadata: z.unknown().optional(),
  split: datasetSplitSchema.optional(),
  reviewStatus: datasetReviewStatusSchema.optional(),
});
const createScorerInputSchema = z.object({
  name: z.string().min(1),
  kind: scorerKindSchema,
  definition: z.unknown(),
  judgeModelRef: z.string().min(1).optional(),
});
const createExperimentInputSchema = z.object({
  name: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.number().int().min(1),
  splitSelector: datasetSplitSelectorInputSchema.optional(),
  scorerIds: z.array(z.string().min(1)).min(1),
  solverRef: z.unknown(),
  baselineRef: z.unknown().optional().nullable(),
  promptVersionRefs: z.array(z.string().min(1)).optional(),
  skillSnapshotRefs: z.array(z.string().min(1)).optional(),
  toolSnapshotRefs: z.array(z.string().min(1)).optional(),
  providerProfileRefs: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});
const startExperimentRunInputSchema = z.object({
  experimentId: z.string().min(1),
  solverRef: z.unknown().optional(),
  splitSelector: datasetSplitSelectorInputSchema.optional().nullable(),
});
const startOptimizationRunInputSchema = z.object({
  experimentId: z.string().min(1),
  optimizerKind: optimizerKindSchema,
  basePromptVersionId: z.string().min(1),
  splitSelector: datasetSplitSelectorInputSchema.optional(),
  config: z.unknown().optional(),
});
const promotePromptVersionInputSchema = z.object({
  promptVersionId: z.string().min(1),
  tag: z.string().min(1),
});
const resolveAnnotationInputSchema = z.object({
  annotationQueueItemId: z.string().min(1),
  datasetItemId: z.string().min(1).optional(),
  status: annotationStatusSchema,
});
const liveExperimentRunInputSchema = z.object({
  experimentRunId: z.string().min(1),
});
const aiQualityOverviewInputSchema = withTimeRange(
  z.object({
    projectId: z.string().min(1),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    agentName: z.string().min(1).optional(),
    environment: z.string().min(1).optional(),
    service: z.string().min(1).optional(),
    route: z.string().min(1).optional(),
    toolName: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    policyId: z.string().min(1).optional(),
    scorerId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
);
const annotationRuleInputSchema = z.object({
  reason: z.string().min(1),
  threshold: z.number().optional().nullable(),
  assignTo: z.string().min(1).optional().nullable(),
  datasetId: z.string().min(1).optional().nullable(),
});
const providerProfileInputSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  label: z.string().min(1),
  providerKind: providerKindSchema,
  baseUrl: z.string().min(1).optional().nullable(),
  credentialRef: z.string().min(1).optional().nullable(),
  models: z.unknown(),
  timeoutMs: z.number().int().min(1).optional(),
  maxConcurrency: z.number().int().min(1).optional().nullable(),
  disabled: z.boolean().optional().nullable(),
});
const modelAliasInputSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  providerProfileId: z.string().min(1),
  model: z.string().min(1),
  purpose: modelPurposeSchema,
  parameters: z.unknown().optional(),
});
const onlineEvaluationPolicyInputSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  enabled: z.boolean(),
  name: z.string().min(1),
  target: z.unknown(),
  scorerIds: z.array(z.string().min(1)),
  sampleRate: z.number().min(0).max(1),
  maxDailyRuns: z.number().int().min(1).optional().nullable(),
  annotationRules: z.array(annotationRuleInputSchema).optional(),
});
const updateProjectAiSettingsInputSchema = z.object({
  projectId: z.string().min(1),
  enabled: z.boolean(),
  defaultProviderProfileId: z.string().min(1).optional().nullable(),
  defaultJudgeProfileId: z.string().min(1).optional().nullable(),
  defaultOptimizerProfileId: z.string().min(1).optional().nullable(),
  defaultEmbeddingProfileId: z.string().min(1).optional().nullable(),
  providerProfiles: z.array(providerProfileInputSchema).optional(),
  modelAliases: z.array(modelAliasInputSchema).optional(),
  onlinePolicies: z.array(onlineEvaluationPolicyInputSchema).optional(),
  budget: z.object({
    dailyUsd: z.number().min(0),
    perRunUsd: z.number().min(0).optional().nullable(),
    deterministicOnly: z.boolean().optional().nullable(),
  }),
  sampling: z.object({
    defaultOnlineSampleRate: z.number().min(0).max(1),
    maxOnlineSampleRate: z.number().min(0).max(1),
    maxConcurrentExperimentItems: z.number().int().min(1),
    maxConcurrentOptimizationCandidates: z.number().int().min(1),
  }),
  datasetDefaults: z.object({
    splitAllocation: z.unknown(),
    smallDatasetReviewedThreshold: z.number().int().min(1).optional().nullable(),
    requireReviewForRegression: z.boolean().optional().nullable(),
  }),
  expectedVersion: z.number().int().min(1),
});
const projectListInputSchema = z.object({
  organizationId: z.string().min(1).optional(),
  status: projectStatusSchema.optional(),
});
const createProjectInputSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
});
const createIngestCredentialInputSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(80),
});
const updateProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  status: projectStatusSchema.optional(),
});
const updateOrganizationMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: companyRoleSchema,
});
const inviteOrganizationMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().trim().email(),
});
const inviteProjectMemberInputSchema = z.object({
  projectId: z.string().min(1),
  email: z.string().trim().email(),
  role: projectRoleSchema,
});
const removeOrganizationMemberInputSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});
const retentionRuleInputSchema = z.object({
  dataClass: retentionDataClassSchema,
  mode: retentionModeSchema,
  retentionDays: z.number().int().min(1).max(365).optional(),
  softDeleteDays: z.number().int().min(1).max(90).optional(),
});
const updateRetentionPolicyInputSchema = z.object({
  projectId: z.string().min(1),
  expectedVersion: z.number().int().min(1),
  rules: z.array(retentionRuleInputSchema).length(8),
});
const createAlertRuleInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  kind: alertRuleKindSchema,
  severity: alertSeveritySchema,
  query: jsonObjectSchema,
  condition: jsonObjectSchema,
  evaluationWindowSeconds: z.number().int().min(1),
  pendingForSeconds: z.number().int().min(0),
  cooldownSeconds: z.number().int().min(0),
  notificationAdapterIds: z.array(z.string().min(1)),
});
const updateAlertRuleInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  kind: alertRuleKindSchema.optional(),
  severity: alertSeveritySchema.optional(),
  query: jsonObjectSchema.optional(),
  condition: jsonObjectSchema.optional(),
  evaluationWindowSeconds: z.number().int().min(1).optional(),
  pendingForSeconds: z.number().int().min(0).optional(),
  cooldownSeconds: z.number().int().min(0).optional(),
  notificationAdapterIds: z.array(z.string().min(1)).optional(),
  expectedVersion: z.number().int().min(1),
});
const alertRuleSearchInputSchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: alertStateSchema.optional(),
  severity: alertSeveritySchema.optional(),
  signal: alertSignalSchema.optional(),
  enabled: z.boolean().optional(),
  sort: alertRuleSortSchema.optional(),
});
const createAlertSilenceInputSchema = z
  .object({
    projectId: z.string().min(1),
    ruleId: z.string().min(1),
    reason: z.string().min(1),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
  })
  .superRefine((input, context) => {
    if (Date.parse(input.startsAt) >= Date.parse(input.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startsAt must be before endsAt",
        path: ["startsAt"],
      });
    }
  });

const formulaAstMaxDepth = 8;

function validateDashboardMetricQueryDefinition(
  input: z.infer<typeof dashboardMetricQueryInputSchema>,
  context: z.RefinementCtx,
) {
  const availableSourceIds = new Set<string>();
  const allSourceIds = new Set<string>();

  input.queries.forEach((query, index) => {
    if (allSourceIds.has(query.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rich metric query ids must be unique",
        path: ["queries", index, "id"],
      });
    }
    availableSourceIds.add(query.id);
    allSourceIds.add(query.id);
  });

  input.formulas?.forEach((formula, index) => {
    if (allSourceIds.has(formula.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rich metric query ids must be unique",
        path: ["formulas", index, "id"],
      });
    }
    validateFormulaExpression(
      formula.expression,
      context,
      ["formulas", index, "expression"],
      availableSourceIds,
      1,
    );
    availableSourceIds.add(formula.id);
    allSourceIds.add(formula.id);
  });

  input.displaySeries?.forEach((displaySeries, index) => {
    if (!allSourceIds.has(displaySeries.sourceId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "display series sourceId must reference a query or formula",
        path: ["displaySeries", index, "sourceId"],
      });
    }
  });
}

function validateFormulaExpression(
  expression: unknown,
  context: z.RefinementCtx,
  path: Array<string | number>,
  availableSourceIds: Set<string>,
  depth: number,
) {
  if (!isRecord(expression)) {
    return;
  }
  if (depth > formulaAstMaxDepth) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `formula expression depth must be ${formulaAstMaxDepth} or less`,
      path,
    });
    return;
  }

  const kind = expression.kind;
  if (kind === "ref") {
    if (typeof expression.refId !== "string" || !availableSourceIds.has(expression.refId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula refId must reference an earlier query or formula",
        path: [...path, "refId"],
      });
    }
  }
  if (kind === "number" && typeof expression.value !== "number") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "formula number expression requires value",
      path: [...path, "value"],
    });
  }
  if (kind === "binary") {
    if (typeof expression.operator !== "string") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula binary expression requires operator",
        path: [...path, "operator"],
      });
    }
    if (!isRecord(expression.left)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula binary expression requires left",
        path: [...path, "left"],
      });
    }
    if (!isRecord(expression.right)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula binary expression requires right",
        path: [...path, "right"],
      });
    }
  }
  if (kind === "unary" && !isRecord(expression.left)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "formula unary expression requires left",
      path: [...path, "left"],
    });
  }
  if (kind === "function") {
    if (typeof expression.function !== "string") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula function expression requires function",
        path: [...path, "function"],
      });
    }
    if (!Array.isArray(expression.arguments)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "formula function expression requires arguments",
        path: [...path, "arguments"],
      });
    }
  }

  if (isRecord(expression.left)) {
    validateFormulaExpression(
      expression.left,
      context,
      [...path, "left"],
      availableSourceIds,
      depth + 1,
    );
  }
  if (isRecord(expression.right)) {
    validateFormulaExpression(
      expression.right,
      context,
      [...path, "right"],
      availableSourceIds,
      depth + 1,
    );
  }
  if (Array.isArray(expression.arguments)) {
    expression.arguments.forEach((argument, index) => {
      validateFormulaExpression(
        argument,
        context,
        [...path, "arguments", index],
        availableSourceIds,
        depth + 1,
      );
    });
  }
}

export function validateTraceSearchInput(input: TraceSearchInput): TraceSearchInput {
  try {
    return parseWithZod(
      traceSearchInputSchema,
      compactInput(input as Record<string, unknown>),
      "trace search input",
    ) as TraceSearchInput;
  } catch {
    throw validationGraphQLError("Trace search input failed validation");
  }
}

export function validateLiveTraceInput(input: LiveTraceInput): LiveTraceInput {
  try {
    return parseWithZod(
      liveTraceInputSchema,
      compactInput(input as Record<string, unknown>),
      "live trace input",
    ) as LiveTraceInput;
  } catch {
    throw validationGraphQLError("Live trace input failed validation");
  }
}

export function validateLogSearchInput(input: LogSearchInput): LogSearchInput {
  try {
    return parseWithZod(
      logSearchInputSchema,
      compactInput(input as Record<string, unknown>),
      "log search input",
    ) as LogSearchInput;
  } catch {
    throw validationGraphQLError("Log search input failed validation");
  }
}

export function validateTraceDetailInput(input: TraceDetailInput): TraceDetailInput {
  try {
    return parseWithZod(
      traceDetailInputSchema,
      compactInput(input as Record<string, unknown>),
      "trace detail input",
    ) as TraceDetailInput;
  } catch {
    throw validationGraphQLError("Trace detail input failed validation");
  }
}

export function validateTelemetryFacetInput(input: TelemetryFacetInput): TelemetryFacetInput {
  try {
    return parseWithZod(
      telemetryFacetInputSchema,
      compactInput(input as Record<string, unknown>),
      "telemetry facet input",
    ) as TelemetryFacetInput;
  } catch {
    throw validationGraphQLError("Telemetry facet input failed validation");
  }
}

export function validateMetricNameSearchInput(input: MetricNameSearchInput): MetricNameSearchInput {
  return validateAiInput<MetricNameSearchInput>(
    metricNameSearchInputSchema,
    input,
    "Metric name search input",
  );
}

export function validateMetricSeriesInput(input: MetricSeriesInput): MetricSeriesInput {
  return validateAiInput<MetricSeriesInput>(metricSeriesInputSchema, input, "Metric series input");
}

export function validateRichMetricSeriesInput(input: RichMetricSeriesInput): RichMetricSeriesInput {
  return validateAiInput<RichMetricSeriesInput>(
    richMetricSeriesInputSchema,
    compactDashboardMetricQueryInput(input),
    "Rich metric series input",
  );
}

export function validateDashboardListInput(input: DashboardListInput): DashboardListInput {
  return validateAiInput<DashboardListInput>(
    dashboardListInputSchema,
    input,
    "Dashboard list input",
  );
}

export function validateSaveDashboardInput(input: SaveDashboardInput): SaveDashboardInput {
  return validateAiInput<SaveDashboardInput>(
    saveDashboardInputSchema,
    compactDashboardSaveInput(input),
    "Save dashboard input",
  );
}

export function validateSetDashboardPinnedInput(
  input: SetDashboardPinnedInput,
): SetDashboardPinnedInput {
  return validateAiInput<SetDashboardPinnedInput>(
    setDashboardPinnedInputSchema,
    input,
    "Set dashboard pinned input",
  );
}

export function validateReorderDashboardPinsInput(
  input: ReorderDashboardPinsInput,
): ReorderDashboardPinsInput {
  return validateAiInput<ReorderDashboardPinsInput>(
    reorderDashboardPinsInputSchema,
    input,
    "Reorder dashboard pins input",
  );
}

export function validateAgentRunSearchInput(input: AgentRunSearchInput): AgentRunSearchInput {
  return validateAiInput<AgentRunSearchInput>(
    agentRunSearchInputSchema,
    input,
    "Agent run search input",
  );
}

export function validateDatasetSearchInput(input: DatasetSearchInput): DatasetSearchInput {
  return validateAiInput<DatasetSearchInput>(
    datasetSearchInputSchema,
    input,
    "Dataset search input",
  );
}

export function validateDatasetItemSearchInput(
  input: DatasetItemSearchInput,
): DatasetItemSearchInput {
  return validateAiInput<DatasetItemSearchInput>(
    datasetItemSearchInputSchema,
    input,
    "Dataset item search input",
  );
}

export function validateScorerSearchInput(input: ScorerSearchInput): ScorerSearchInput {
  return validateAiInput<ScorerSearchInput>(scorerSearchInputSchema, input, "Scorer search input");
}

export function validateExperimentSearchInput(input: ExperimentSearchInput): ExperimentSearchInput {
  return validateAiInput<ExperimentSearchInput>(
    experimentSearchInputSchema,
    input,
    "Experiment search input",
  );
}

export function validateEvalResultSearchInput(input: EvalResultSearchInput): EvalResultSearchInput {
  return validateAiInput<EvalResultSearchInput>(
    evalResultSearchInputSchema,
    input,
    "Eval result search input",
  );
}

export function validateAnnotationQueueSearchInput(
  input: AnnotationQueueSearchInput,
): AnnotationQueueSearchInput {
  return validateAiInput<AnnotationQueueSearchInput>(
    annotationQueueSearchInputSchema,
    input,
    "Annotation queue search input",
  );
}

export function validateCreateDatasetInput(input: CreateDatasetInput): CreateDatasetInput {
  return validateAiInput<CreateDatasetInput>(
    createDatasetInputSchema,
    input,
    "Create dataset input",
  );
}

export function validateAppendDatasetItemsInput(
  input: AppendDatasetItemsInput,
): AppendDatasetItemsInput {
  return validateAiInput<AppendDatasetItemsInput>(
    appendDatasetItemsInputSchema,
    input,
    "Append dataset items input",
  );
}

export function validatePrepareDatasetImportInput(
  input: PrepareDatasetImportInput,
): PrepareDatasetImportInput {
  return validateAiInput<PrepareDatasetImportInput>(
    prepareDatasetImportInputSchema,
    input,
    "Prepare dataset import input",
  );
}

export function validateCommitDatasetImportInput(
  input: CommitDatasetImportInput,
): CommitDatasetImportInput {
  return validateAiInput<CommitDatasetImportInput>(
    commitDatasetImportInputSchema,
    input,
    "Commit dataset import input",
  );
}

export function validateStartDatasetExportInput(
  input: StartDatasetExportInput,
): StartDatasetExportInput {
  return validateAiInput<StartDatasetExportInput>(
    startDatasetExportInputSchema,
    input,
    "Start dataset export input",
  );
}

export function validatePromoteSpanToDatasetItemInput(
  input: PromoteSpanToDatasetItemInput,
): PromoteSpanToDatasetItemInput {
  return validateAiInput<PromoteSpanToDatasetItemInput>(
    promoteSpanToDatasetItemInputSchema,
    input,
    "Promote span to dataset item input",
  );
}

export function validateCreateScorerInput(input: CreateScorerInput): CreateScorerInput {
  return validateAiInput<CreateScorerInput>(createScorerInputSchema, input, "Create scorer input");
}

export function validateCreateExperimentInput(input: CreateExperimentInput): CreateExperimentInput {
  return validateAiInput<CreateExperimentInput>(
    createExperimentInputSchema,
    input,
    "Create experiment input",
  );
}

export function validateStartExperimentRunInput(
  input: StartExperimentRunInput,
): StartExperimentRunInput {
  return validateAiInput<StartExperimentRunInput>(
    startExperimentRunInputSchema,
    input,
    "Start experiment run input",
  );
}

export function validateStartOptimizationRunInput(
  input: StartOptimizationRunInput,
): StartOptimizationRunInput {
  return validateAiInput<StartOptimizationRunInput>(
    startOptimizationRunInputSchema,
    input,
    "Start optimization run input",
  );
}

export function validatePromotePromptVersionInput(
  input: PromotePromptVersionInput,
): PromotePromptVersionInput {
  return validateAiInput<PromotePromptVersionInput>(
    promotePromptVersionInputSchema,
    input,
    "Promote prompt version input",
  );
}

export function validateResolveAnnotationInput(
  input: ResolveAnnotationInput,
): ResolveAnnotationInput {
  return validateAiInput<ResolveAnnotationInput>(
    resolveAnnotationInputSchema,
    input,
    "Resolve annotation input",
  );
}

export function validateLiveExperimentRunInput(
  input: LiveExperimentRunInput,
): LiveExperimentRunInput {
  return validateAiInput<LiveExperimentRunInput>(
    liveExperimentRunInputSchema,
    input,
    "Live experiment run input",
  );
}

export function validateAiQualityOverviewInput(
  input: AiQualityOverviewInput,
): AiQualityOverviewInput {
  return validateAiInput<AiQualityOverviewInput>(
    aiQualityOverviewInputSchema,
    input,
    "AI quality overview input",
  );
}

export function validateUpdateProjectAiSettingsInput(
  input: UpdateProjectAiSettingsInput,
): UpdateProjectAiSettingsInput {
  return validateAiInput<UpdateProjectAiSettingsInput>(
    updateProjectAiSettingsInputSchema,
    input,
    "Update project AI settings input",
  );
}

export function validateTraceId(traceId: string): string {
  try {
    return parseWithZod(z.string().min(1), traceId, "trace id");
  } catch {
    throw validationGraphQLError("Trace id failed validation");
  }
}

export function validateId(id: string, label: string): string {
  try {
    return parseWithZod(z.string().min(1), id, label);
  } catch {
    throw validationGraphQLError(`${label} failed validation`);
  }
}

export function validateProjectListInput(input: ProjectListInput): ProjectListInput {
  try {
    return parseWithZod(
      projectListInputSchema,
      compactInput(input as Record<string, unknown>),
      "project list input",
    ) as ProjectListInput;
  } catch {
    throw validationGraphQLError("Project list input failed validation");
  }
}

export function validateCreateProjectInput(input: CreateProjectInput): CreateProjectInput {
  try {
    return parseWithZod(
      createProjectInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "create project input",
    ) as CreateProjectInput;
  } catch {
    throw validationGraphQLError("Create project input failed validation");
  }
}

export function validateCreateIngestCredentialInput(
  input: CreateIngestCredentialInput,
): CreateIngestCredentialInput {
  try {
    return parseWithZod(
      createIngestCredentialInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "create ingest credential input",
    ) as CreateIngestCredentialInput;
  } catch {
    throw validationGraphQLError("Create ingest credential input failed validation");
  }
}

export function validateUpdateProjectInput(input: UpdateProjectInput): UpdateProjectInput {
  try {
    return parseWithZod(
      updateProjectInputSchema,
      compactInput(input as Record<string, unknown>),
      "update project input",
    ) as UpdateProjectInput;
  } catch {
    throw validationGraphQLError("Update project input failed validation");
  }
}

export function validateUpdateOrganizationMemberInput(
  input: UpdateOrganizationMemberInput,
): UpdateOrganizationMemberInput {
  try {
    return parseWithZod(
      updateOrganizationMemberInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "update organization member input",
    ) as UpdateOrganizationMemberInput;
  } catch {
    throw validationGraphQLError("Update organization member input failed validation");
  }
}

export function validateInviteOrganizationMemberInput(
  input: InviteOrganizationMemberInput,
): InviteOrganizationMemberInput {
  try {
    return parseWithZod(
      inviteOrganizationMemberInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "invite organization member input",
    ) as InviteOrganizationMemberInput;
  } catch {
    throw validationGraphQLError("Invite organization member input failed validation");
  }
}

export function validateInviteProjectMemberInput(
  input: InviteProjectMemberInput,
): InviteProjectMemberInput {
  try {
    return parseWithZod(
      inviteProjectMemberInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "invite project member input",
    ) as InviteProjectMemberInput;
  } catch {
    throw validationGraphQLError("Invite project member input failed validation");
  }
}

export function validateRemoveOrganizationMemberInput(
  input: RemoveOrganizationMemberInput,
): RemoveOrganizationMemberInput {
  try {
    return parseWithZod(
      removeOrganizationMemberInputSchema,
      compactInput(input as unknown as Record<string, unknown>),
      "remove organization member input",
    ) as RemoveOrganizationMemberInput;
  } catch {
    throw validationGraphQLError("Remove organization member input failed validation");
  }
}

export function validateProjectRole(role: ProjectRole): ProjectRole {
  try {
    return parseWithZod(projectRoleSchema, role, "project role") as ProjectRole;
  } catch {
    throw validationGraphQLError("Project role failed validation");
  }
}

export function validateUpdateRetentionPolicyInput(
  input: UpdateRetentionPolicyInput,
): UpdateRetentionPolicyInput {
  return validateAiInput<UpdateRetentionPolicyInput>(
    updateRetentionPolicyInputSchema,
    input,
    "Update retention policy input",
  );
}

export function validateCreateAlertRuleInput(input: CreateAlertRuleInput): CreateAlertRuleInput {
  return validateAiInput<CreateAlertRuleInput>(
    createAlertRuleInputSchema,
    input,
    "Create alert rule input",
  );
}

export function validateUpdateAlertRuleInput(input: UpdateAlertRuleInput): UpdateAlertRuleInput {
  return validateAiInput<UpdateAlertRuleInput>(
    updateAlertRuleInputSchema,
    input,
    "Update alert rule input",
  );
}

export function validateAlertRuleSearchInput(
  input: AlertRuleSearchInput = {},
): AlertRuleSearchInput {
  return validateAiInput<AlertRuleSearchInput>(
    alertRuleSearchInputSchema,
    input,
    "Alert rule search input",
  );
}

export function validateCreateAlertSilenceInput(
  input: CreateAlertSilenceInput,
): CreateAlertSilenceInput {
  return validateAiInput<CreateAlertSilenceInput>(
    createAlertSilenceInputSchema,
    input,
    "Create alert silence input",
  );
}

function validateAiInput<T>(schema: z.ZodTypeAny, input: unknown, label: string): T {
  try {
    return parseWithZod(
      schema,
      compactInput(input as Record<string, unknown>),
      label.toLowerCase(),
    ) as T;
  } catch {
    throw validationGraphQLError(`${label} failed validation`);
  }
}

function compactDashboardSaveInput(input: SaveDashboardInput): SaveDashboardInput {
  return compactNullableDashboardValue(input) as SaveDashboardInput;
}

function compactDashboardMetricQueryInput(input: RichMetricSeriesInput): RichMetricSeriesInput {
  return compactNullableDashboardValue(input) as RichMetricSeriesInput;
}

function compactNullableDashboardValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactNullableDashboardValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value)
    .map(([key, item]) => [key, compactNullableDashboardValue(item)] as const)
    .filter(([, item]) => item !== null && item !== undefined && item !== "");
  return Object.fromEntries(entries);
}

function validationGraphQLError(message: string) {
  return graphQLErrorFromBridge({
    id: "ERR-001",
    code: "VALIDATION_FAILED",
    message,
    retryable: false,
  });
}

function withTimeRange<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((input, context) => {
    if (!isRecord(input)) {
      return;
    }
    if (typeof input.from !== "string" || typeof input.to !== "string") {
      return;
    }
    if (Date.parse(input.from) > Date.parse(input.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be before to",
        path: ["from"],
      });
    }
  }) as T;
}

function withDurationRange<T extends z.ZodTypeAny>(schema: T, minKey: string, maxKey: string): T {
  return schema.superRefine((input, context) => {
    if (!isRecord(input)) {
      return;
    }
    const min = input[minKey];
    const max = input[maxKey];
    if (typeof min !== "number" || typeof max !== "number") {
      return;
    }
    if (min > max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${minKey} must be less than or equal to ${maxKey}`,
        path: [minKey],
      });
    }
  }) as T;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

const sensitiveDashboardKeys = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api_key",
  "token",
  "secret",
  "password",
]);

function containsSensitiveKey(input: unknown): boolean {
  if (Array.isArray(input)) {
    return input.some((item) => containsSensitiveKey(item));
  }
  if (!isRecord(input)) {
    return false;
  }
  return Object.entries(input).some(([key, value]) => {
    if (sensitiveDashboardKeys.has(key.toLowerCase())) {
      return true;
    }
    if (
      key === "key" &&
      typeof value === "string" &&
      sensitiveDashboardKeys.has(value.toLowerCase())
    ) {
      return true;
    }
    return containsSensitiveKey(value);
  });
}
