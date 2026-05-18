export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export * from "./generated";

export type DateTime = string;

export type TraceStatus = "ok" | "error" | "unset";

export type LogCorrelation = "trace" | "span" | "contextual" | "none";

export type LiveTraceEventType = "snapshot" | "added" | "updated" | "heartbeat";

export type CompanyRole = "admin" | "user";

export type OrganizationInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type InvitationDeliveryStatus =
  | "not_configured"
  | "pending"
  | "sent"
  | "failed_retryable"
  | "failed_terminal"
  | "suppressed";

export type InvitationProjectGrantStatus = "pending" | "applied" | "revoked" | "failed";

export type ProjectInvitationOutcome = "invitation_pending" | "membership_created";

export type ProjectRole = "viewer" | "editor" | "admin";

export type ProjectMemberSource = "direct" | "company_admin" | "local_personal";

export type ProjectStatus = "active" | "read_only" | "disabled";

export type RetentionDataClass =
  | "TRACES"
  | "LOGS"
  | "METRICS"
  | "AI_EVALS"
  | "DATASETS"
  | "SCORERS"
  | "DASHBOARD_HISTORY"
  | "INGEST_CREDENTIAL_AUDIT";

export type RetentionMode = "retain" | "delete" | "soft_delete_then_delete";

export type AlertRuleKind =
  | "METRIC_THRESHOLD"
  | "METRIC_ABSENCE"
  | "LOG_MATCH"
  | "LOG_COUNT"
  | "TRACE_MATCH"
  | "TRACE_COUNT"
  | "TRACE_LATENCY"
  | "TRACE_ERROR";

export type AlertSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type AlertState = "OK" | "PENDING" | "FIRING" | "RESOLVED" | "SILENCED" | "ERROR";

export type AlertSignal = "METRIC" | "LOG" | "TRACE";

export type AlertRuleSort =
  | "updatedAt_desc"
  | "updatedAt_asc"
  | "createdAt_desc"
  | "createdAt_asc"
  | "name_asc"
  | "name_desc"
  | "severity_asc"
  | "severity_desc"
  | "kind_asc"
  | "kind_desc"
  | "enabled_asc"
  | "enabled_desc";

export type MetricAggregation =
  | "avg"
  | "sum"
  | "min"
  | "max"
  | "count"
  | "rate"
  | "p50"
  | "p90"
  | "p95"
  | "p99";

export type MetricChartType =
  | "line"
  | "area"
  | "bar"
  | "pie"
  | "donut"
  | "stat"
  | "radial"
  | "radar"
  | "heatmap"
  | "histogram"
  | "table";

export type DashboardVisibility = "builtin" | "project" | "personal";

export type DashboardSaveVisibility = "project" | "personal";

export type DashboardWidgetKind =
  | "metric_timeseries"
  | "metric_stat"
  | "metric_table"
  | "metric_rich"
  | "log_table"
  | "trace_table"
  | "live_trace_table";

export type DashboardMetricFormulaExpressionKind =
  | "ref"
  | "number"
  | "binary"
  | "unary"
  | "function";

export type DashboardMetricFormulaBinaryOperator = "add" | "subtract" | "multiply" | "divide";

export type DashboardMetricFormulaFunction =
  | "sum_series"
  | "avg_series"
  | "min_series"
  | "max_series"
  | "ratio"
  | "clamp_min"
  | "clamp_max"
  | "moving_average";

export type DashboardThresholdSeverity = "info" | "warning" | "error";

export type DashboardLogColumn =
  | "timestamp"
  | "observed_timestamp"
  | "severity"
  | "service"
  | "trace_span"
  | "body"
  | "attributes";

export type DashboardTraceColumn =
  | "started_at"
  | "status"
  | "service"
  | "operation"
  | "duration"
  | "span_count"
  | "log_count";

export type MetricKind = "gauge" | "sum" | "histogram" | "exponential_histogram" | "summary";

export type MetricAggregationTemporality = "unspecified" | "delta" | "cumulative";

export type AgentRunStatus = "ok" | "error" | "unset" | "cancelled";

export type ScorerKind =
  | "deterministic"
  | "schema_json"
  | "semantic"
  | "rag"
  | "llm_judge"
  | "tool_correctness"
  | "trajectory"
  | "human";

export type EvalTargetKind = "agentRun" | "span" | "datasetItemRun";

export type ExperimentRunStatus = "queued" | "running" | "cancelled" | "failed" | "finished";

export type AnnotationStatus = "open" | "in_review" | "resolved" | "dismissed";

export type OptimizerKind =
  | "bootstrap_fewshot"
  | "critic_mutate_judge_pick"
  | "mipro_v2"
  | "reflective_text_gradient";

export type DatasetSplit = "dev" | "optimization" | "validation" | "regression" | "holdout";

export type DatasetReviewStatus = "unreviewed" | "reviewed" | "rejected";

export type DatasetHealthStatus =
  | "ready"
  | "needs_review"
  | "low_confidence"
  | "leakage_warning"
  | "invalid";

export type DatasetImportFormat = "jsonl" | "json_array" | "csv" | "zip";

export type DatasetExportFormat = "jsonl" | "json_array" | "csv";

export type DatasetImportCommitMode = "valid_rows_only" | "reject_if_any_error";

export type DatasetImportStatus = "staged" | "preview_ready" | "committed" | "failed" | "expired";

export type DatasetExportStatus = "queued" | "ready" | "failed" | "expired";

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "azure_openai"
  | "google_vertex"
  | "bedrock"
  | "openai_compatible"
  | "local_harness"
  | "custom_harness";

export type ModelPurpose = "judge" | "optimizer" | "embedding" | "replay" | "default";

export type ExperimentRunEventType =
  | "started"
  | "item_completed"
  | "progress"
  | "heartbeat"
  | "cancelled"
  | "failed"
  | "finished";

export type AttributeFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "exists"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in";

export type TraceSort =
  | "startedAt_desc"
  | "startedAt_asc"
  | "duration_desc"
  | "duration_asc"
  | "errorFirst";

export type LogSort = "timestamp_desc" | "timestamp_asc" | "severity_desc";

export type SpanLinkDirection = "forward" | "backward" | "unknown";

export type SpanMatchReason = "selected" | "search" | "filter" | "error" | "criticalPath";

export type TraceWarningCode =
  | "missingRoot"
  | "missingParent"
  | "clockSkew"
  | "partialTrace"
  | "largeTracePreview";

export interface AttributeFilterInput {
  key: string;
  operator: AttributeFilterOperator;
  value?: JSONValue | null;
}

export interface TraceSearchInput {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  from?: DateTime | null;
  to?: DateTime | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: TraceSort | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface LiveTraceInput {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  from?: DateTime | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  limit?: number | null;
}

export interface TraceDetailInput {
  selectedSpanId?: string | null;
  spanQuery?: string | null;
  spanService?: string | null;
  spanName?: string | null;
  spanStatus?: TraceStatus | null;
  minSpanDurationMs?: number | null;
  maxSpanDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  showMatchesOnly?: boolean | null;
  relatedLogLimit?: number | null;
  logSearch?: string | null;
}

export interface LogSearchInput {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  from?: DateTime | null;
  to?: DateTime | null;
  search?: string | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: LogSort | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface TelemetryFacetInput {
  from?: DateTime | null;
  to?: DateTime | null;
  service?: string | null;
  search?: string | null;
  limit?: number | null;
}

export interface MetricNameSearchInput {
  query?: string | null;
  service?: string | null;
  from?: DateTime | null;
  to?: DateTime | null;
  limit?: number | null;
}

export interface MetricSeriesInput {
  metricName: string;
  from: DateTime;
  to: DateTime;
  interval?: string | null;
  aggregation: MetricAggregation;
  groupBy?: string[] | null;
  filters?: AttributeFilterInput[] | null;
  limit?: number | null;
}

export interface RichMetricSeriesInput {
  from: DateTime;
  to: DateTime;
  query: DashboardMetricQueryInput;
}

export interface DashboardListInput {
  includeBuiltins?: boolean | null;
  query?: string | null;
  tag?: string | null;
  visibility?: DashboardVisibility | null;
  pinnedOnly?: boolean | null;
}

export interface SaveDashboardInput {
  id?: string | null;
  version?: number | null;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  visibility?: DashboardSaveVisibility | null;
  defaultTimeWindow?: string | null;
  widgets: DashboardWidgetInput[];
}

export interface DashboardWidgetInput {
  id: string;
  title: string;
  description?: string | null;
  kind: DashboardWidgetKind;
  layout: DashboardWidgetLayoutInput;
  metric?: DashboardMetricWidgetInput | null;
  richMetric?: DashboardRichMetricWidgetInput | null;
  logs?: DashboardLogWidgetInput | null;
  traces?: DashboardTraceWidgetInput | null;
  liveTraces?: DashboardLiveTraceWidgetInput | null;
}

export interface DashboardWidgetLayoutInput {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number | null;
  minH?: number | null;
}

export interface DashboardMetricWidgetInput {
  metricName: string;
  aggregation: MetricAggregation;
  groupBy?: string[] | null;
  filters?: AttributeFilterInput[] | null;
  timeWindow?: string | null;
  interval?: string | null;
  visualization: MetricChartType;
  legend?: boolean | null;
  maxSeries?: number | null;
  thresholds?: DashboardThresholdInput[] | null;
}

export interface DashboardRichMetricWidgetInput {
  query: DashboardMetricQueryInput;
  visualization: MetricChartType;
  legend?: boolean | null;
  maxSeries?: number | null;
  thresholds?: DashboardThresholdInput[] | null;
}

export interface DashboardMetricQueryInput {
  timeWindow?: string | null;
  interval?: string | null;
  queries: DashboardMetricQueryRowInput[];
  formulas?: DashboardMetricFormulaInput[] | null;
  displaySeries?: DashboardMetricDisplaySeriesInput[] | null;
}

export interface DashboardMetricQueryRowInput {
  id: string;
  label: string;
  metricName: string;
  aggregation: MetricAggregation;
  groupBy?: string[] | null;
  filters?: AttributeFilterInput[] | null;
  maxSeries?: number | null;
}

export interface DashboardMetricFormulaInput {
  id: string;
  label: string;
  expression: DashboardMetricFormulaExpressionInput;
  unit?: string | null;
}

export interface DashboardMetricFormulaExpressionInput {
  kind: DashboardMetricFormulaExpressionKind;
  refId?: string | null;
  value?: number | null;
  operator?: DashboardMetricFormulaBinaryOperator | null;
  left?: DashboardMetricFormulaExpressionInput | null;
  right?: DashboardMetricFormulaExpressionInput | null;
  function?: DashboardMetricFormulaFunction | null;
  arguments?: DashboardMetricFormulaExpressionInput[] | null;
}

export interface DashboardMetricDisplaySeriesInput {
  id: string;
  label: string;
  sourceId: string;
  visible?: boolean | null;
}

export interface DashboardLogWidgetInput {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  search?: string | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: LogSort | null;
  limit?: number | null;
  columns?: DashboardLogColumn[] | null;
}

export interface DashboardTraceWidgetInput {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: TraceSort | null;
  limit?: number | null;
  columns?: DashboardTraceColumn[] | null;
}

export interface DashboardLiveTraceWidgetInput {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  limit?: number | null;
}

export interface DashboardThresholdInput {
  value: number;
  severity: DashboardThresholdSeverity;
  label?: string | null;
}

export interface SetDashboardPinnedInput {
  dashboardId: string;
  pinned: boolean;
}

export interface ReorderDashboardPinsInput {
  dashboardIds: string[];
}

export interface AgentRunSearchInput {
  agentId?: string | null;
  agentName?: string | null;
  status?: AgentRunStatus | null;
  from?: DateTime | null;
  to?: DateTime | null;
  experimentRunId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface DatasetSearchInput {
  query?: string | null;
  tag?: string | null;
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface DatasetItemSearchInput {
  query?: string | null;
  sourceTraceId?: string | null;
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
  synthetic?: boolean | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface ScorerSearchInput {
  kind?: ScorerKind | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface ExperimentSearchInput {
  datasetId?: string | null;
  status?: ExperimentRunStatus | null;
  split?: DatasetSplit | null;
  baselineRunId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface EvalResultSearchInput {
  scorerId?: string | null;
  experimentRunId?: string | null;
  targetKind?: EvalTargetKind | null;
  targetId?: string | null;
  passed?: boolean | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface AnnotationQueueSearchInput {
  status?: AnnotationStatus | null;
  reason?: string | null;
  assignedTo?: string | null;
  scorerId?: string | null;
  targetKind?: EvalTargetKind | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface CreateDatasetInput {
  name: string;
  description?: string | null;
  tags?: string[] | null;
}

export interface DatasetItemInput {
  input: JSONValue;
  expected?: JSONValue;
  metadata?: JSONValue;
  sourceTraceId?: string | null;
  sourceSpanId?: string | null;
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
}

export interface AppendDatasetItemsInput {
  datasetId: string;
  items: DatasetItemInput[];
}

export interface PromoteSpanToDatasetItemInput {
  datasetId: string;
  traceId: string;
  spanId?: string | null;
  input?: JSONValue;
  expected?: JSONValue;
  metadata?: JSONValue;
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
}

export interface PrepareDatasetImportInput {
  datasetId: string;
  uploadId: string;
  format: DatasetImportFormat;
  fileSelector?: DatasetImportFileSelectorInput | null;
  mapping: DatasetImportMappingInput;
  defaults?: DatasetImportDefaultsInput | null;
  previewLimit?: number | null;
}

export interface DatasetImportFileSelectorInput {
  include?: string[] | null;
  exclude?: string[] | null;
}

export interface DatasetImportMappingInput {
  input: DatasetImportFieldMappingInput[];
  expected?: DatasetImportFieldMappingInput[] | null;
  metadata?: DatasetImportFieldMappingInput[] | null;
  sourceTraceId?: DatasetImportScalarMappingInput | null;
  sourceSpanId?: DatasetImportScalarMappingInput | null;
  split?: DatasetImportScalarMappingInput | null;
  reviewStatus?: DatasetImportScalarMappingInput | null;
}

export interface DatasetImportFieldMappingInput {
  targetPath: string;
  source: DatasetImportScalarMappingInput;
}

export interface DatasetImportScalarMappingInput {
  column?: string | null;
  jsonPath?: string | null;
  constant?: JSONValue;
  defaultValue?: JSONValue;
}

export interface DatasetImportDefaultsInput {
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
  metadata?: JSONValue;
  synthetic?: boolean | null;
  allowPartialCommit?: boolean | null;
}

export interface CommitDatasetImportInput {
  importId: string;
  expectedDatasetVersion: number;
  mode?: DatasetImportCommitMode | null;
}

export interface StartDatasetExportInput {
  datasetId: string;
  format: DatasetExportFormat;
  split?: DatasetSplit | null;
  reviewStatus?: DatasetReviewStatus | null;
  includeMetadata?: boolean | null;
  includeSourcePointers?: boolean | null;
}

export interface CreateScorerInput {
  name: string;
  kind: ScorerKind;
  definition: JSONValue;
  judgeModelRef?: string | null;
}

export interface CreateExperimentInput {
  name: string;
  datasetId: string;
  datasetVersion: number;
  splitSelector?: DatasetSplitSelectorInput | null;
  scorerIds: string[];
  solverRef: JSONValue;
  baselineRef?: JSONValue;
  promptVersionRefs?: string[] | null;
  skillSnapshotRefs?: string[] | null;
  toolSnapshotRefs?: string[] | null;
  providerProfileRefs?: string[] | null;
  tags?: string[] | null;
}

export interface StartExperimentRunInput {
  experimentId: string;
  solverRef?: JSONValue;
  splitSelector?: DatasetSplitSelectorInput | null;
}

export interface StartOptimizationRunInput {
  experimentId: string;
  optimizerKind: OptimizerKind;
  basePromptVersionId: string;
  splitSelector?: DatasetSplitSelectorInput | null;
  config?: JSONValue;
}

export interface PromotePromptVersionInput {
  promptVersionId: string;
  tag: string;
}

export interface ResolveAnnotationInput {
  annotationQueueItemId: string;
  datasetItemId?: string | null;
  status: AnnotationStatus;
}

export interface LiveExperimentRunInput {
  experimentRunId: string;
}

export interface DatasetSplitSelectorInput {
  splits: DatasetSplit[];
  reviewedOnly?: boolean | null;
  includeSynthetic?: boolean | null;
}

export interface AiQualityOverviewInput {
  projectId: string;
  from?: DateTime | null;
  to?: DateTime | null;
  agentName?: string | null;
  environment?: string | null;
  service?: string | null;
  route?: string | null;
  toolName?: string | null;
  model?: string | null;
  policyId?: string | null;
  scorerId?: string | null;
  limit?: number | null;
}

export interface UpdateProjectAiSettingsInput {
  projectId: string;
  enabled: boolean;
  defaultProviderProfileId?: string | null;
  defaultJudgeProfileId?: string | null;
  defaultOptimizerProfileId?: string | null;
  defaultEmbeddingProfileId?: string | null;
  providerProfiles?: ProviderProfileInput[] | null;
  modelAliases?: ModelAliasInput[] | null;
  onlinePolicies?: OnlineEvaluationPolicyInput[] | null;
  budget: AiEvalBudgetInput;
  sampling: AiEvalSamplingInput;
  datasetDefaults: DatasetDefaultsInput;
  expectedVersion: number;
}

export interface ProviderProfileInput {
  id?: string | null;
  label: string;
  providerKind: ProviderKind;
  baseUrl?: string | null;
  credentialRef?: string | null;
  models: JSONValue;
  timeoutMs?: number | null;
  maxConcurrency?: number | null;
  disabled?: boolean | null;
}

export interface ModelAliasInput {
  id?: string | null;
  name: string;
  providerProfileId: string;
  model: string;
  purpose: ModelPurpose;
  parameters?: JSONValue;
}

export interface OnlineEvaluationPolicyInput {
  id?: string | null;
  enabled: boolean;
  name: string;
  target: JSONValue;
  scorerIds: string[];
  sampleRate: number;
  maxDailyRuns?: number | null;
  annotationRules?: AnnotationRuleInput[] | null;
}

export interface AnnotationRuleInput {
  reason: string;
  threshold?: number | null;
  assignTo?: string | null;
  datasetId?: string | null;
}

export interface AiEvalBudgetInput {
  dailyUsd: number;
  perRunUsd?: number | null;
  deterministicOnly?: boolean | null;
}

export interface AiEvalSamplingInput {
  defaultOnlineSampleRate: number;
  maxOnlineSampleRate: number;
  maxConcurrentExperimentItems: number;
  maxConcurrentOptimizationCandidates: number;
}

export interface DatasetDefaultsInput {
  splitAllocation: JSONValue;
  smallDatasetReviewedThreshold?: number | null;
  requireReviewForRegression?: boolean | null;
}

export interface ProjectListInput {
  organizationId?: string | null;
  status?: ProjectStatus | null;
}

export interface CreateProjectInput {
  organizationId: string;
  name: string;
  slug: string;
}

export interface UpdateProjectInput {
  name?: string | null;
  status?: ProjectStatus | null;
}

export interface UpdateOrganizationMemberInput {
  organizationId: string;
  userId: string;
  role: CompanyRole;
}

export interface InviteOrganizationMemberInput {
  organizationId: string;
  email: string;
}

export interface RemoveOrganizationMemberInput {
  organizationId: string;
  userId: string;
}

export interface UpdateRetentionPolicyInput {
  projectId: string;
  expectedVersion: number;
  rules: RetentionRuleInput[];
}

export interface RetentionRuleInput {
  dataClass: RetentionDataClass;
  mode: RetentionMode;
  retentionDays?: number | null;
  softDeleteDays?: number | null;
}

export interface CreateAlertRuleInput {
  projectId: string;
  name: string;
  enabled: boolean;
  kind: AlertRuleKind;
  severity: AlertSeverity;
  query: JSONValue;
  condition: JSONValue;
  evaluationWindowSeconds: number;
  pendingForSeconds: number;
  cooldownSeconds: number;
  notificationAdapterIds: string[];
}

export interface UpdateAlertRuleInput {
  id: string;
  name?: string | null;
  enabled?: boolean | null;
  kind?: AlertRuleKind | null;
  severity?: AlertSeverity | null;
  query?: JSONValue | null;
  condition?: JSONValue | null;
  evaluationWindowSeconds?: number | null;
  pendingForSeconds?: number | null;
  cooldownSeconds?: number | null;
  notificationAdapterIds?: string[] | null;
  expectedVersion: number;
}

export interface AlertRuleSearchInput {
  search?: string | null;
  status?: AlertState | null;
  severity?: AlertSeverity | null;
  signal?: AlertSignal | null;
  enabled?: boolean | null;
  sort?: AlertRuleSort | null;
}

export interface CreateAlertSilenceInput {
  projectId: string;
  ruleId: string;
  reason: string;
  startsAt: DateTime;
  endsAt: DateTime;
}

export interface Trace {
  id: string;
  serviceName?: string | null;
  startedAt: DateTime;
  startedAtUnixNano: string;
  endedAt?: DateTime | null;
  endedAtUnixNano?: string | null;
  durationNano?: string | null;
  durationMs?: number | null;
  rootSpanId?: string | null;
  status?: TraceStatus | null;
  attributes: JSONValue;
}

export interface TraceSummary extends Trace {
  operationName?: string | null;
  spanCount: number;
  errorSpanCount: number;
  logCount: number;
  serviceCount: number;
}

export interface SpanEvent {
  name: string;
  timestamp: DateTime;
  timestampUnixNano: string;
  attributes: JSONValue;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  traceState?: string | null;
  attributes: JSONValue;
  direction: SpanLinkDirection;
}

export interface SpanException {
  timestamp: DateTime;
  type?: string | null;
  message?: string | null;
  stacktrace?: string | null;
  escaped?: boolean | null;
  attributes: JSONValue;
  frames: StackTraceFrame[];
}

export interface StackTraceFrame {
  raw: string;
  functionName?: string | null;
  fileName?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
  language?: string | null;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string | null;
  name: string;
  kind?: string | null;
  serviceName?: string | null;
  startedAt: DateTime;
  startedAtUnixNano: string;
  endedAt: DateTime;
  endedAtUnixNano: string;
  startOffsetNano: string;
  durationNano: string;
  durationMs: number;
  status?: TraceStatus | null;
  attributes: JSONValue;
  depth: number;
  childCount: number;
  hasError: boolean;
  isCriticalPath: boolean;
  isOrphan: boolean;
  isServiceEntry: boolean;
  exceptionCount: number;
  events: SpanEvent[];
  links: SpanLink[];
  exceptions: SpanException[];
}

export interface LogEvent {
  id: string;
  traceId?: string | null;
  spanId?: string | null;
  serviceName?: string | null;
  severityText?: string | null;
  severityNumber?: number | null;
  body: JSONValue;
  timestamp: DateTime;
  observedTimestamp?: DateTime | null;
  attributes: JSONValue;
  correlation: LogCorrelation;
}

export interface LiveTraceEvent {
  type: LiveTraceEventType;
  seq: number;
  receivedAt: DateTime;
  trace?: TraceSummary | null;
}

export interface TraceSearchResult {
  items: TraceSummary[];
  nextCursor?: string | null;
}

export interface TraceDetail {
  trace: Trace;
  structure: TraceStructure;
  spans: Span[];
  selectedSpan?: Span | null;
  spanMatches: SpanMatch[];
  logs: LogEvent[];
  relatedLogs: LogEvent[];
  warnings: TraceWarning[];
}

export interface LogSearchResult {
  items: LogEvent[];
  nextCursor?: string | null;
}

export interface TraceStructure {
  rootSpanIds: string[];
  orphanSpanIds: string[];
  criticalPathSpanIds: string[];
  maxDepth: number;
  serviceBreakdown: ServiceTraceBreakdown[];
}

export interface ServiceTraceBreakdown {
  serviceName: string;
  spanCount: number;
  errorSpanCount: number;
  durationMs: number;
  percentOfTraceDuration: number;
}

export interface SpanMatch {
  spanId: string;
  reason: SpanMatchReason;
  fields: string[];
}

export interface TraceWarning {
  code: TraceWarningCode;
  message: string;
  spanId?: string | null;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface AgentIdentity {
  id?: string | null;
  name: string;
  version?: string | null;
}

export interface TokenTotals {
  input?: number | null;
  output?: number | null;
  total?: number | null;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface AgentRunTranscriptMessage {
  role: string;
  content?: JSONValue;
  contentDigest?: string | null;
  spanId: string;
  timestamp?: DateTime | null;
}

export interface LlmCall {
  id: string;
  traceId: string;
  spanId: string;
  provider?: string | null;
  requestModel?: string | null;
  responseModel?: string | null;
  latencyMs: number;
  tokenTotals?: TokenTotals | null;
  tokenDetails: JSONValue;
}

export interface ToolCall {
  id: string;
  traceId: string;
  spanId: string;
  toolName: string;
  toolCallId?: string | null;
  parametersDigest?: string | null;
  resultDigest?: string | null;
  latencyMs: number;
  status: TraceStatus;
  synthetic: boolean;
}

export interface RetrievalEvent {
  id: string;
  traceId: string;
  spanId: string;
  documentCount: number;
  topK?: number | null;
  embeddingModel?: string | null;
  latencyMs: number;
  documentDigests: string[];
}

export interface AgentRun {
  id: string;
  traceId: string;
  rootSpanId: string;
  agent: AgentIdentity;
  status: AgentRunStatus;
  startedAt: DateTime;
  endedAt?: DateTime | null;
  durationMs?: number | null;
  tokenTotals?: TokenTotals | null;
  costEstimate?: Money | null;
  transcript: AgentRunTranscriptMessage[];
  llmCalls: LlmCall[];
  toolCalls: ToolCall[];
  retrievalEvents: RetrievalEvent[];
  evalResults: EvalResult[];
}

export interface Dataset {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  createdAt: DateTime;
  itemCount: number;
  reviewedItemCount: number;
  splitCounts: JSONValue;
  health: DatasetHealth;
  tags: string[];
  items?: DatasetItemSearchResult;
}

export interface DatasetHealth {
  status: DatasetHealthStatus;
  reviewedItemCount: number;
  totalItemCount: number;
  splitCounts: JSONValue;
  duplicateCandidateCount: number;
  leakageWarningCount: number;
  missingExpectedCount: number;
  schemaIssueCount: number;
  smallDataset: boolean;
  warnings: string[];
}

export interface DatasetItem {
  id: string;
  datasetId: string;
  version: number;
  input: JSONValue;
  expected?: JSONValue;
  metadata: JSONValue;
  sourceTraceId?: string | null;
  sourceSpanId?: string | null;
  split: DatasetSplit;
  reviewStatus: DatasetReviewStatus;
  synthetic: boolean;
  duplicateOfItemId?: string | null;
  leakageWarnings: string[];
}

export interface DatasetImportJob {
  id: string;
  datasetId: string;
  status: DatasetImportStatus;
  format: DatasetImportFormat;
  sourceFiles: DatasetImportSourceFile[];
  mapping: JSONValue;
  defaults: JSONValue;
  previewRows: DatasetImportPreviewRow[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warnings: string[];
  createdAt: string;
  expiresAt: string;
  committedDatasetVersion?: number | null;
}

export interface DatasetImportSourceFile {
  path: string;
  format: DatasetImportFormat;
  sizeBytes: number;
  rowCount?: number | null;
  sha256: string;
}

export interface DatasetImportPreviewRow {
  rowNumber: number;
  filePath: string;
  item?: DatasetItemPreview | null;
  errors: DatasetImportRowIssue[];
  warnings: DatasetImportRowIssue[];
}

export interface DatasetItemPreview {
  input: JSONValue;
  expected?: JSONValue;
  metadata: JSONValue;
  split: DatasetSplit;
  reviewStatus: DatasetReviewStatus;
  sourceTraceId?: string | null;
  sourceSpanId?: string | null;
  synthetic: boolean;
}

export interface DatasetImportRowIssue {
  code: string;
  message: string;
  path?: string | null;
}

export interface DatasetExportJob {
  id: string;
  datasetId: string;
  datasetVersion: number;
  status: DatasetExportStatus;
  format: DatasetExportFormat;
  rowCount: number;
  sizeBytes?: number | null;
  sha256?: string | null;
  downloadUrl?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface Scorer {
  id: string;
  name: string;
  kind: ScorerKind;
  definition: JSONValue;
  judgeModelRef?: string | null;
  version: number;
  calibration?: JSONValue;
}

export interface EvalResult {
  id: string;
  scorerId: string;
  scorerVersion: number;
  targetKind: EvalTargetKind;
  targetId: string;
  experimentRunId?: string | null;
  score: number;
  passed: boolean;
  evidence?: JSONValue;
  judgeRunRef?: string | null;
  producedAt: DateTime;
}

export interface Experiment {
  id: string;
  name: string;
  datasetId: string;
  datasetVersion: number;
  splitSelector: DatasetSplitSelector;
  scorerIds: string[];
  baselineRef?: JSONValue;
  promptVersionRefs: string[];
  skillSnapshotRefs: string[];
  toolSnapshotRefs: string[];
  providerProfileRefs: string[];
  createdAt: DateTime;
  tags: string[];
  runs?: ExperimentRunSearchResult;
}

export interface ExperimentRun {
  id: string;
  experimentId: string;
  solverRef: JSONValue;
  manifest?: ExperimentManifest | null;
  baselineRunId?: string | null;
  status: ExperimentRunStatus;
  startedAt: DateTime;
  endedAt?: DateTime | null;
  summary: JSONValue;
  itemRuns?: DatasetItemRunSearchResult;
}

export interface DatasetSplitSelector {
  splits: DatasetSplit[];
  reviewedOnly: boolean;
  includeSynthetic: boolean;
}

export interface VersionedRef {
  id: string;
  version: number;
}

export interface ExperimentManifest {
  schema: string;
  version: number;
  digest: string;
  experimentRunId: string;
  experimentId: string;
  datasetId: string;
  datasetVersion: number;
  splitSelector: DatasetSplitSelector;
  datasetItemIds: string[];
  scorerRefs: VersionedRef[];
  baselineRef?: JSONValue;
  solverRef: JSONValue;
  promptVersionRefs: string[];
  skillSnapshotRefs: string[];
  toolSnapshotRefs: string[];
  providerProfileRefs: string[];
  budget: JSONValue;
  concurrency: JSONValue;
  createdAt: DateTime;
}

export interface DatasetItemRun {
  id: string;
  experimentRunId: string;
  datasetItemId: string;
  harnessRunId?: string | null;
  output: JSONValue;
  latencyMs: number;
  tokenTotals?: TokenTotals | null;
  evalResults: EvalResult[];
}

export interface PromptVersion {
  id: string;
  name: string;
  text: string;
  variableSchema?: JSONValue;
  metadata?: JSONValue;
  hash: string;
  tag?: string | null;
  createdAt: DateTime;
  notes?: string | null;
}

export interface AnnotationQueueItem {
  id: string;
  targetTraceId: string;
  targetSpanId?: string | null;
  reason: string;
  assignedTo?: string | null;
  status: AnnotationStatus;
  createdAt: DateTime;
  resolvedDatasetItemId?: string | null;
  scorerId?: string | null;
  score?: number | null;
  evidence?: JSONValue;
}

export interface ProjectAiSettings {
  projectId: string;
  enabled: boolean;
  defaultProviderProfileId?: string | null;
  defaultJudgeProfileId?: string | null;
  defaultOptimizerProfileId?: string | null;
  defaultEmbeddingProfileId?: string | null;
  providerProfiles: ProviderProfile[];
  modelAliases: ModelAlias[];
  onlinePolicies: OnlineEvaluationPolicy[];
  budget: AiEvalBudget;
  sampling: AiEvalSampling;
  datasetDefaults: DatasetDefaults;
  effective: ProjectAiSettingsEffective;
  version: number;
  updatedAt: DateTime;
  updatedByUserId: string;
}

export interface ProviderProfile {
  id: string;
  projectId: string;
  label: string;
  providerKind: ProviderKind;
  baseUrl?: string | null;
  credentialRef?: string | null;
  models: JSONValue;
  timeoutMs: number;
  maxConcurrency?: number | null;
  disabledAt?: DateTime | null;
}

export interface ModelAlias {
  id: string;
  name: string;
  providerProfileId: string;
  model: string;
  purpose: ModelPurpose;
  parameters: JSONValue;
}

export interface OnlineEvaluationPolicy {
  id: string;
  enabled: boolean;
  name: string;
  target: JSONValue;
  scorerIds: string[];
  sampleRate: number;
  maxDailyRuns?: number | null;
  annotationRules: AnnotationRule[];
  updatedAt: DateTime;
  updatedByUserId: string;
}

export interface AnnotationRule {
  reason: string;
  threshold?: number | null;
  assignTo?: string | null;
  datasetId?: string | null;
}

export interface AiEvalBudget {
  dailyUsd: number;
  perRunUsd?: number | null;
  deterministicOnly: boolean;
  spentTodayUsd: number;
}

export interface AiEvalSampling {
  defaultOnlineSampleRate: number;
  maxOnlineSampleRate: number;
  maxConcurrentExperimentItems: number;
  maxConcurrentOptimizationCandidates: number;
}

export interface DatasetDefaults {
  splitAllocation: JSONValue;
  smallDatasetReviewedThreshold: number;
  requireReviewForRegression: boolean;
}

export interface ProjectAiSettingsEffective {
  warnings: string[];
  deterministicOnly: boolean;
  missingProviderProfiles: string[];
  disabledProviderProfiles: string[];
  budgetExhausted: boolean;
}

export interface AiQualityOverview {
  projectId: string;
  from?: DateTime | null;
  to?: DateTime | null;
  summary: JSONValue;
  segments: AiQualitySegment[];
  warnings: string[];
}

export interface AiQualitySegment {
  key: string;
  label: string;
  dimensions: JSONValue;
  runCount: number;
  scoredRunCount: number;
  passRate?: number | null;
  meanScore?: number | null;
  p50LatencyMs?: number | null;
  p95LatencyMs?: number | null;
  costUsd?: number | null;
  regressionCount: number;
}

export interface ExperimentRunEvent {
  type: ExperimentRunEventType;
  seq: number;
  receivedAt: DateTime;
  run?: ExperimentRun | null;
  itemRun?: DatasetItemRun | null;
}

export interface AgentRunSearchResult {
  items: AgentRun[];
  nextCursor?: string | null;
}
export interface DatasetSearchResult {
  items: Dataset[];
  nextCursor?: string | null;
}
export interface DatasetItemSearchResult {
  items: DatasetItem[];
  nextCursor?: string | null;
}
export interface ScorerSearchResult {
  items: Scorer[];
  nextCursor?: string | null;
}
export interface ExperimentSearchResult {
  items: Experiment[];
  nextCursor?: string | null;
}
export interface ExperimentRunSearchResult {
  items: ExperimentRun[];
  nextCursor?: string | null;
}
export interface DatasetItemRunSearchResult {
  items: DatasetItemRun[];
  nextCursor?: string | null;
}
export interface EvalResultSearchResult {
  items: EvalResult[];
  nextCursor?: string | null;
}
export interface AnnotationQueueResult {
  items: AnnotationQueueItem[];
  nextCursor?: string | null;
}

export interface TelemetryFacetResult {
  services: FacetValue[];
  operations: FacetValue[];
  spanNames: FacetValue[];
  severities: FacetValue[];
  attributeKeys: FacetValue[];
}

export interface MetricDescriptor {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  description?: string | null;
  unit: string;
  kind: MetricKind;
  aggregationTemporality?: MetricAggregationTemporality | null;
  monotonic?: boolean | null;
  attributeKeys: string[];
  firstSeenAt: DateTime;
  lastSeenAt: DateTime;
}

export interface MetricExemplar {
  timestamp: DateTime;
  value: number;
  traceId?: string | null;
  spanId?: string | null;
  attributes: JSONValue;
}

export interface MetricSeriesPoint {
  timestamp: DateTime;
  value: number;
  count?: number | null;
  exemplars: MetricExemplar[];
}

export interface MetricSeries {
  labels: JSONValue;
  points: MetricSeriesPoint[];
}

export interface MetricQueryWarning {
  code: string;
  message: string;
  field?: string | null;
}

export interface MetricNameSearchResult {
  items: MetricDescriptor[];
}

export interface MetricSeriesResult {
  metric: MetricDescriptor;
  aggregation: MetricAggregation;
  interval?: string | null;
  groupBy: string[];
  series: MetricSeries[];
  warnings: MetricQueryWarning[];
}

export interface RichMetricSeriesResult {
  interval: string;
  series: RichMetricSeries[];
  displaySeries: RichMetricDisplaySeries[];
  warnings: MetricQueryWarning[];
}

export interface RichMetricSeries {
  id: string;
  label: string;
  sourceId: string;
  unit?: string | null;
  labels: JSONValue;
  points: MetricSeriesPoint[];
}

export interface RichMetricDisplaySeries {
  id: string;
  label: string;
  sourceId: string;
  visible: boolean;
}

export interface DashboardListResult {
  items: Dashboard[];
  pinnedDashboardIds: string[];
}

export interface Dashboard {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description?: string | null;
  tags: string[];
  version: number;
  visibility: DashboardVisibility;
  defaultTimeWindow: string;
  pinned: boolean;
  widgets: DashboardWidget[];
  createdAt: DateTime;
  updatedAt: DateTime;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface DashboardWidget {
  id: string;
  title: string;
  description?: string | null;
  kind: DashboardWidgetKind;
  layout: DashboardWidgetLayout;
  metric?: DashboardMetricWidget | null;
  richMetric?: DashboardRichMetricWidget | null;
  logs?: DashboardLogWidget | null;
  traces?: DashboardTraceWidget | null;
  liveTraces?: DashboardLiveTraceWidget | null;
}

export interface DashboardWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export interface DashboardMetricWidget {
  metricName: string;
  aggregation: MetricAggregation;
  groupBy: string[];
  filters: AttributeFilterInput[];
  timeWindow: string;
  interval?: string | null;
  visualization: MetricChartType;
  legend: boolean;
  maxSeries: number;
  thresholds: DashboardThreshold[];
}

export interface DashboardRichMetricWidget {
  query: DashboardMetricQuery;
  visualization: MetricChartType;
  legend: boolean;
  maxSeries: number;
  thresholds: DashboardThreshold[];
}

export interface DashboardMetricQuery {
  timeWindow: string;
  interval?: string | null;
  queries: DashboardMetricQueryRow[];
  formulas: DashboardMetricFormula[];
  displaySeries: DashboardMetricDisplaySeries[];
}

export interface DashboardMetricQueryRow {
  id: string;
  label: string;
  metricName: string;
  aggregation: MetricAggregation;
  groupBy: string[];
  filters: AttributeFilterInput[];
  maxSeries: number;
}

export interface DashboardMetricFormula {
  id: string;
  label: string;
  expression: DashboardMetricFormulaExpression;
  unit?: string | null;
}

export interface DashboardMetricFormulaExpression {
  kind: DashboardMetricFormulaExpressionKind;
  refId?: string | null;
  value?: number | null;
  operator?: DashboardMetricFormulaBinaryOperator | null;
  left?: DashboardMetricFormulaExpression | null;
  right?: DashboardMetricFormulaExpression | null;
  function?: DashboardMetricFormulaFunction | null;
  arguments: DashboardMetricFormulaExpression[];
}

export interface DashboardMetricDisplaySeries {
  id: string;
  label: string;
  sourceId: string;
  visible: boolean;
}

export interface DashboardLogWidget {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  search?: string | null;
  attributes: AttributeFilterInput[];
  sort: LogSort;
  limit: number;
  columns: DashboardLogColumn[];
}

export interface DashboardTraceWidget {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes: AttributeFilterInput[];
  sort: TraceSort;
  limit: number;
  columns: DashboardTraceColumn[];
}

export interface DashboardLiveTraceWidget {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes: AttributeFilterInput[];
  limit: number;
}

export interface DashboardThreshold {
  value: number;
  severity: DashboardThresholdSeverity;
  label?: string | null;
}

export interface DashboardPreferences {
  projectId: string;
  pinnedDashboardIds: string[];
  updatedAt: DateTime;
}

export interface User {
  id: string;
  displayName?: string | null;
  email?: string | null;
}

export interface ProjectTelemetryOverview {
  lastIngestAt?: DateTime | null;
  traceCount: number;
  logCount: number;
  metricCount: number;
  serviceCount: number;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  telemetry: ProjectTelemetryOverview;
}

export interface IngestCredential {
  id: string;
  projectId: string;
  title: string;
  scopes: string[];
  secretPreview: string;
  createdAt: DateTime;
  lastUsedAt?: DateTime | null;
  revokedAt?: DateTime | null;
  createdByUserId: string;
}

export interface IngestCredentialListResult {
  items: IngestCredential[];
}

export interface CreateIngestCredentialInput {
  projectId: string;
  title: string;
}

export interface CreatedIngestCredential {
  credential: IngestCredential;
  secret: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: CompanyRole;
  projects: Project[];
}

export interface Viewer {
  user: User;
  organizations: Organization[];
  selectedProject?: Project | null;
}

export interface OrganizationMember {
  user: User;
  role: CompanyRole;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: CompanyRole;
  status: OrganizationInvitationStatus;
  deliveryStatus: InvitationDeliveryStatus;
  lastDeliveryAttemptAt?: DateTime | null;
  lastDeliveryErrorCode?: string | null;
  lastEmailDeliveryId?: string | null;
  projectGrants: InvitationProjectGrant[];
  invitedByUserId: string;
  acceptedByUserId?: string | null;
  createdAt: DateTime;
  updatedAt: DateTime;
  acceptedAt?: DateTime | null;
  revokedAt?: DateTime | null;
  expiresAt?: DateTime | null;
}

export interface InvitationProjectGrant {
  projectId: string;
  role: ProjectRole;
  status: InvitationProjectGrantStatus;
  createdAt: DateTime;
  createdByUserId: string;
  appliedAt?: DateTime | null;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  role: ProjectRole;
  effectiveRole: ProjectRole;
  source: ProjectMemberSource;
  createdAt: DateTime;
  createdByUserId: string;
  updatedAt: DateTime;
  updatedByUserId: string;
}

export interface RetentionPolicy {
  projectId: string;
  rules: RetentionRule[];
  updatedAt: DateTime;
  updatedByUserId: string;
  version: number;
}

export interface RetentionRule {
  dataClass: RetentionDataClass;
  mode: RetentionMode;
  retentionDays?: number | null;
  softDeleteDays?: number | null;
  updatedAt: DateTime;
  updatedByUserId: string;
  version: number;
}

export interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  kind: AlertRuleKind;
  severity: AlertSeverity;
  query: JSONValue;
  condition: JSONValue;
  evaluationWindowSeconds: number;
  pendingForSeconds: number;
  cooldownSeconds: number;
  notificationAdapterIds: string[];
  createdAt: DateTime;
  updatedAt: DateTime;
  updatedByUserId: string;
  version: number;
}

export interface AlertEvent {
  id: string;
  projectId: string;
  ruleId: string;
  instanceId: string;
  state: AlertState;
  severity: AlertSeverity;
  summary: string;
  deduplicationKey: string;
  startedAt: DateTime;
  endedAt?: DateTime | null;
  createdAt: DateTime;
  evidenceTraceId?: string | null;
  evidenceSpanId?: string | null;
  evidenceLogId?: string | null;
  evidenceMetricName?: string | null;
}

export interface AlertSilence {
  id: string;
  projectId: string;
  ruleId: string;
  reason: string;
  startsAt: DateTime;
  endsAt: DateTime;
  createdAt: DateTime;
  createdByUserId: string;
  active: boolean;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface AlertEventConnection {
  items: AlertEvent[];
  pageInfo: PageInfo;
}

export interface GraphQLRequest<
  Variables extends Record<string, unknown> = Record<string, unknown>,
> {
  operationName: string;
  query: string;
  variables?: Variables;
}

export interface GraphQLResponse<Data> {
  data?: Data;
  errors?: Array<{
    message: string;
    path?: Array<string | number>;
    extensions?: Record<string, unknown>;
  }>;
}

export interface TraceSearchQueryData {
  traces: TraceSearchResult;
}

export interface TraceDetailQueryData {
  trace: TraceDetail | null;
}

export interface LogSearchQueryData {
  logs: LogSearchResult;
}

export interface TelemetryFacetQueryData {
  telemetryFacets: TelemetryFacetResult;
}

export interface MetricNamesQueryData {
  metricNames: MetricNameSearchResult;
}

export interface MetricSeriesQueryData {
  metricSeries: MetricSeriesResult;
}

export interface RichMetricSeriesQueryData {
  richMetricSeries: RichMetricSeriesResult;
}

export interface DashboardsQueryData {
  dashboards: DashboardListResult;
}

export interface LiveTraceSubscriptionData {
  liveTraces: LiveTraceEvent;
}

export interface ViewerQueryData {
  viewer?: Viewer | null;
}

export interface OrganizationsQueryData {
  organizations: Organization[];
}

export interface OrganizationQueryData {
  organization?: Organization | null;
}

export interface OrganizationMembersQueryData {
  organizationMembers: OrganizationMember[];
}

export interface OrganizationInvitationsQueryData {
  organizationInvitations: OrganizationInvitation[];
}

export interface ProjectsQueryData {
  projects: Project[];
}

export interface ProjectQueryData {
  project?: Project | null;
}

export interface ProjectMembersQueryData {
  projectMembers: ProjectMember[];
}

export interface IngestCredentialsQueryData {
  ingestCredentials: IngestCredentialListResult;
}

export interface RetentionPolicyQueryData {
  retentionPolicy: RetentionPolicy;
}

export interface AlertRulesQueryData {
  alertRules: AlertRule[];
}

export interface AlertHistoryQueryData {
  alertHistory: AlertEventConnection;
}

export interface AlertSilencesQueryData {
  alertSilences: AlertSilence[];
}

export interface AgentRunsQueryData {
  agentRuns: AgentRunSearchResult;
}

export interface AgentRunQueryData {
  agentRun?: AgentRun | null;
}

export interface DatasetsQueryData {
  datasets: DatasetSearchResult;
}

export interface DatasetQueryData {
  dataset?: Dataset | null;
}

export interface ScorersQueryData {
  scorers: ScorerSearchResult;
}

export interface ExperimentsQueryData {
  experiments: ExperimentSearchResult;
}

export interface ExperimentRunQueryData {
  experimentRun?: ExperimentRun | null;
}

export interface EvalResultsQueryData {
  evalResults: EvalResultSearchResult;
}

export interface AnnotationQueueQueryData {
  annotationQueue: AnnotationQueueResult;
}

export interface ProjectAiSettingsQueryData {
  projectAiSettings: ProjectAiSettings;
}

export interface AiQualityOverviewQueryData {
  aiQualityOverview: AiQualityOverview;
}

export interface SelectProjectMutationData {
  selectProject: Viewer;
}

export interface CreateProjectMutationData {
  createProject: Project;
}

export interface UpdateOrganizationMemberMutationData {
  updateOrganizationMember: OrganizationMember;
}

export interface InviteOrganizationMemberMutationData {
  inviteOrganizationMember: OrganizationInvitation;
}

export interface InviteProjectMemberInput {
  projectId: string;
  email: string;
  role: ProjectRole;
}

export interface ProjectInvitationResult {
  outcome: ProjectInvitationOutcome;
  invitation?: OrganizationInvitation | null;
  projectMember?: ProjectMember | null;
}

export interface InviteProjectMemberMutationData {
  inviteProjectMember: ProjectInvitationResult;
}

export interface ResendOrganizationInvitationMutationData {
  resendOrganizationInvitation: OrganizationInvitation;
}

export interface RevokeOrganizationInvitationMutationData {
  revokeOrganizationInvitation: OrganizationInvitation;
}

export interface RemoveOrganizationMemberMutationData {
  removeOrganizationMember: boolean;
}

export interface UpdateProjectMemberMutationData {
  updateProjectMember: ProjectMember;
}

export interface RemoveProjectMemberMutationData {
  removeProjectMember: boolean;
}

export interface CreateIngestCredentialMutationData {
  createIngestCredential: CreatedIngestCredential;
}

export interface RevokeIngestCredentialMutationData {
  revokeIngestCredential: IngestCredential;
}

export interface SaveDashboardMutationData {
  saveDashboard: Dashboard;
}

export interface DeleteDashboardMutationData {
  deleteDashboard: boolean;
}

export interface SetDashboardPinnedMutationData {
  setDashboardPinned: DashboardPreferences;
}

export interface ReorderDashboardPinsMutationData {
  reorderDashboardPins: DashboardPreferences;
}

export interface UpdateRetentionPolicyMutationData {
  updateRetentionPolicy: RetentionPolicy;
}

export interface CreateAlertRuleMutationData {
  createAlertRule: AlertRule;
}

export interface UpdateAlertRuleMutationData {
  updateAlertRule: AlertRule;
}

export interface DeleteAlertRuleMutationData {
  deleteAlertRule: boolean;
}

export interface CreateAlertSilenceMutationData {
  createAlertSilence: AlertSilence;
}

export interface DeleteAlertSilenceMutationData {
  deleteAlertSilence: boolean;
}

export interface CreateDatasetMutationData {
  createDataset: Dataset;
}

export interface AppendDatasetItemsMutationData {
  appendDatasetItems: Dataset;
}

export interface PromoteSpanToDatasetItemMutationData {
  promoteSpanToDatasetItem: DatasetItem;
}

export interface CreateScorerMutationData {
  createScorer: Scorer;
}

export interface CreateExperimentMutationData {
  createExperiment: Experiment;
}

export interface StartExperimentRunMutationData {
  startExperimentRun: ExperimentRun;
}

export interface CancelExperimentRunMutationData {
  cancelExperimentRun: ExperimentRun;
}

export interface StartOptimizationRunMutationData {
  startOptimizationRun: ExperimentRun;
}

export interface PromotePromptVersionMutationData {
  promotePromptVersion: PromptVersion;
}

export interface ResolveAnnotationMutationData {
  resolveAnnotation: AnnotationQueueItem;
}

export interface UpdateProjectAiSettingsMutationData {
  updateProjectAiSettings: ProjectAiSettings;
}

export interface LiveExperimentRunSubscriptionData {
  liveExperimentRun: ExperimentRunEvent;
}
