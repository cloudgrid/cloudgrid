export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export * from "./ai-eval-query";
export * from "./alert-query";
export * from "./dashboard-query";
export * from "./generated";
export * from "./telemetry-query";

export type DateTime = string;

export interface BridgeError {
  code: string;
  message: string;
  retryable?: boolean | null;
  details?: JSONValue;
}

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
  | "live_trace_table"
  | "alert_status"
  | "alert_history"
  | "alert_evidence";

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
  | "pairwise_judge"
  | "tool_correctness"
  | "trajectory"
  | "workflow"
  | "human"
  | "composite";

export type EvalTargetKind = "agentRun" | "span" | "datasetItemRun";

export type EvalRunMode =
  | "offline_experiment"
  | "optimization"
  | "continuous_measurement"
  | "dataset_backfill"
  | "ci_regression_gate"
  | "realtime_alerting";

export type EvalResultKind =
  | "classification"
  | "json_schema"
  | "llm_judge"
  | "pairwise_judge"
  | "semantic_similarity"
  | "rag"
  | "tool_correctness"
  | "trajectory"
  | "workflow"
  | "human_review"
  | "composite"
  | "deterministic";

export type EvalResultVisualizationKind =
  | "scalar"
  | "table"
  | "confusion_matrix"
  | "fact_coverage"
  | "rubric_breakdown"
  | "rag_grounding"
  | "tool_call_diff"
  | "trajectory_steps"
  | "workflow_steps"
  | "distribution"
  | "composite_gate";

export type ExperimentRunStatus =
  | "queued"
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed";

export type DatasetItemRunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "errored"
  | "skipped"
  | "needs_review"
  | "quarantined";

export type DatasetItemUpdateOperation =
  | "edit"
  | "remove"
  | "mark_ready"
  | "reject"
  | "split_change"
  | "metadata_update"
  | "curation_update";

export type DatasetItemQuarantineStatus = "none" | "needs_review" | "quarantined";

export type DatasetTargetShape =
  | "single_turn"
  | "conversation"
  | "tool_call"
  | "agent_trajectory"
  | "workflow_trace"
  | "retrieval_case"
  | "production_trace_ref";

export type DatasetContentTreatment =
  | "original"
  | "realistic_anonymized"
  | "redacted"
  | "synthetic";

export type DatasetCandidateStatus =
  | "suggested"
  | "reviewing"
  | "ready"
  | "committed"
  | "dismissed"
  | "superseded";

export type DatasetCandidateSourceKind =
  | "trace"
  | "import"
  | "metric_result"
  | "evaluation_item_run"
  | "coverage_gap"
  | "health_issue"
  | "failure_cluster"
  | "manual";

export type EvalBackpressureBehavior = "slow" | "pause" | "skip" | "fail";
export type EvalLimitBehavior = "skip_item" | "pause_run" | "fail_run";
export type EvalCheckpointCadence = "item" | "scorer" | "batch";

export type EvalContentClass =
  | "none"
  | "metadata_only"
  | "captured_content"
  | "dataset_content"
  | "retrieved_document_content";

export type EvalLatencyClass = "inline" | "near_realtime" | "batch";

export type DatasetAnonymizationMode = "off" | "realistic" | "redact";

export type DatasetAnonymizationConsistencyScope = "project" | "dataset";

export type AnnotationStatus = "open" | "in_review" | "resolved" | "dismissed";

export type OptimizerKind = "bootstrap_fewshot" | "critic_mutate_judge_pick";

export type EvalSolverKind = "prompt" | "agent" | "workflow" | "skill" | "tool";
export type EvalBaselineKind = "experiment_run" | "prompt_version" | "solver_ref" | "none";
export type BootstrapFewshotDiversityStrategy =
  | "none"
  | "by_label"
  | "by_cluster"
  | "by_failure_mode";

export type EvaluationFamily =
  | "classification"
  | "extraction"
  | "freeform_answer"
  | "tool_use"
  | "agent_loop"
  | "workflow"
  | "skill";

export type DatasetValueType = "text" | "json";

export type DatasetSplit = "training" | "validation" | "test";

export type DatasetCurationStatus = "draft" | "needs_expected" | "needs_review" | "ready" | "rejected";

export type DatasetReviewStatus = DatasetCurationStatus | "unreviewed" | "reviewed";

export type RetentionProfile = "balanced" | "fast_iteration" | "audit_friendly" | "minimal_storage";

export type RetentionRole =
  | "scratch"
  | "quick_shot"
  | "candidate"
  | "baseline"
  | "validation"
  | "test"
  | "promoted"
  | "pinned";

export type EvaluationDatasetVersionPolicy = "latest_ready" | "pinned";

export type EvaluationTargetKind =
  | "prompt"
  | "external_adapter"
  | "agent"
  | "workflow"
  | "custom_harness_target";

export type EvaluationRunKind =
  | "dataset_evaluation"
  | "quick_shot"
  | "optimization_validation"
  | "test";

export type EvaluationRunStatus =
  | "queued"
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed";

export type EvaluationItemRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "quarantined";

export type EvaluationRunEventType =
  | "started"
  | "item_completed"
  | "progress"
  | "heartbeat"
  | "cancelled"
  | "failed"
  | "completed";

export type QuickShotSelectionStrategy =
  | "failed_categories"
  | "weak_fields"
  | "edge_cases"
  | "high_cost_rows"
  | "recent_failures"
  | "representative_clusters"
  | "stratified_random";

export type MetricResultScope = "item_run" | "evaluation_run" | "comparison" | "optimization_run";
export type MetricPayloadKind =
  | "scalar"
  | "boolean"
  | "text"
  | "json"
  | "confusion_matrix"
  | "field_breakdown"
  | "distribution";
export type MetricUnit = "score" | "percent" | "count" | "milliseconds" | "tokens" | "usd";
export type MetricDirection = "higher_is_better" | "lower_is_better" | "informational";
export type MetricProblemCode =
  | "invalid_actual_output"
  | "invalid_expected_output"
  | "missing_evidence"
  | "adapter_failure"
  | "timeout"
  | "provider_failure"
  | "content_redacted"
  | "not_applicable"
  | "metric_config_invalid"
  | "internal_error";
export type TargetSnapshotSource =
  | "manual"
  | "evaluation_run"
  | "optimization_candidate"
  | "promotion";
export type TargetReproducibility =
  | "exact"
  | "same_inputs"
  | "best_effort"
  | "not_reproducible";

export type AiEvalSourceRefKind =
  | "trace"
  | "span"
  | "evaluation_run"
  | "evaluation_item_run"
  | "import"
  | "candidate"
  | "manual";

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

export type AiProviderKind =
  | "anthropic"
  | "openai"
  | "azure_foundry"
  | "aws_bedrock"
  | "openai_compatible";

export type AiModelPurpose = "default" | "chat" | "judge" | "optimizer" | "embedding" | "replay";

export type AiChatConversationStatus = "active" | "archived";

export type AiChatRunStatus =
  | "idle"
  | "queued"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

export type AiChatMessageRole = "user" | "assistant" | "system" | "tool";

export type AiChatMessagePartType =
  | "text"
  | "artifact"
  | "tool_status"
  | "action_proposal"
  | "approval_result"
  | "error"
  | "compaction_summary";

export type AiChatArtifactKind = "json_render" | "data_file" | "script" | "script_output";

export type AiChatActionRisk = "low" | "medium" | "high" | "destructive";

export type AiChatActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "expired";

export type ExperimentRunEventType =
  | "started"
  | "item_completed"
  | "progress"
  | "heartbeat"
  | "paused"
  | "resumed"
  | "cancelled"
  | "failed"
  | "completed";

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

export type MetricNameSort =
  | "lastSeenAt_desc"
  | "lastSeenAt_asc"
  | "name_asc"
  | "name_desc"
  | "kind_asc";

export type MetricSeriesSort = "timestamp_asc" | "timestamp_desc" | "value_desc" | "value_asc";

export type SpanLinkDirection = "forward" | "backward" | "unknown";

export type SpanMatchReason = "selected" | "search" | "filter" | "error" | "criticalPath";

export type TraceWarningCode =
  | "missingRoot"
  | "missingParent"
  | "clockSkew"
  | "partialTrace"
  | "largeTracePreview";
export type TelemetryFacetSignal = "traces" | "logs" | "metrics";

export interface AttributeFilterInput {
  key: string;
  operator: AttributeFilterOperator;
  value?: JSONValue | null;
}

export interface TraceSearchInput {
  service?: string | null;
  services?: string[] | null;
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
  services?: string[] | null;
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
  services?: string[] | null;
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
  services?: string[] | null;
  signal?: TelemetryFacetSignal | null;
  search?: string | null;
  limit?: number | null;
}

export interface MetricNameSearchInput {
  query?: string | null;
  service?: string | null;
  services?: string[] | null;
  from?: DateTime | null;
  to?: DateTime | null;
  sort?: MetricNameSort | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface MetricSeriesInput {
  metricName: string;
  from: DateTime;
  to: DateTime;
  interval?: string | null;
  aggregation: MetricAggregation;
  groupBy?: string[] | null;
  filters?: AttributeFilterInput[] | null;
  sort?: MetricSeriesSort | null;
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
  alert?: DashboardAlertWidgetInput | null;
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

export interface DashboardAlertWidgetInput {
  ruleIds?: string[] | null;
  states?: AlertState[] | null;
  severities?: AlertSeverity[] | null;
  signals?: AlertSignal[] | null;
  timeWindow?: string | null;
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
  evaluationRunId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface DatasetSearchInput {
  projectId?: string | null;
  query?: string | null;
  tag?: string | null;
  evaluationFamily?: EvaluationFamily | null;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface DatasetItemSearchInput {
  datasetId?: string | null;
  datasetVersionId?: string | null;
  query?: string | null;
  sourceTraceId?: string | null;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
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
  projectId?: string | null;
  evaluationRunId?: string | null;
  evaluationItemRunId?: string | null;
  metricId?: string | null;
  scope?: MetricResultScope | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface EvaluationResultsSearchInput extends EvalResultSearchInput {}

export interface EvaluationDefinitionSearchInput {
  projectId?: string | null;
  datasetId?: string | null;
  targetKind?: EvaluationTargetKind | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface EvaluationRunSearchInput {
  projectId?: string | null;
  evaluationDefinitionId?: string | null;
  datasetId?: string | null;
  datasetVersionId?: string | null;
  status?: EvaluationRunStatus | null;
  kind?: EvaluationRunKind | null;
  split?: DatasetSplit | null;
  targetSnapshotId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface EvaluationItemRunSearchInput {
  evaluationRunId?: string | null;
  datasetItemId?: string | null;
  datasetItemRevisionId?: string | null;
  status?: EvaluationItemRunStatus | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface EvaluationComparisonSearchInput {
  projectId?: string | null;
  baselineRunId?: string | null;
  candidateRunId?: string | null;
  metricId?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface OptimizationRunSearchInput {
  projectId?: string | null;
  status?: EvaluationRunStatus | null;
  baselineTargetSnapshotId?: string | null;
  selectedCandidateSnapshotId?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface AnnotationQueueSearchInput {
  status?: AnnotationStatus | null;
  reason?: string | null;
  assignedTo?: string | null;
  metricId?: string | null;
  targetKind?: EvalTargetKind | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface CreateDatasetInput {
  projectId: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  settings: DatasetSettingsInput;
  idempotencyKey: string;
}

export interface DatasetSettingsInput {
  evaluationFamily: EvaluationFamily;
  inputType: DatasetValueType;
  expectedType: DatasetValueType;
  inputJsonSchema?: JSONValue;
  expectedJsonSchema?: JSONValue;
  defaultSplit: DatasetSplit;
  intakePolicy: DatasetIntakePolicyInput;
  traceExtractionSettings?: DatasetTraceExtractionSettingsInput | null;
  anonymizationPolicy?: DatasetAnonymizationPolicyInput | null;
  defaultMetricSettings: MetricSettingInput[];
  retentionProfile: RetentionProfile;
}

export interface DatasetIntakePolicyInput {
  manualDefaultStatus?: DatasetCurationStatus | null;
  importDefaultStatus?: DatasetCurationStatus | null;
  traceDefaultStatus?: DatasetCurationStatus | null;
}

export interface DatasetTraceExtractionSettingsInput {
  inputPath: string;
  expectedPath?: string | null;
  observedOutputPath?: string | null;
  metadataPaths?: string[] | null;
}

export interface DatasetAnonymizationPolicyInput {
  mode: DatasetAnonymizationMode;
  policyId?: string | null;
  policyVersion?: number | null;
  consistencyScope?: DatasetAnonymizationConsistencyScope | null;
  blockedEntityTypes?: string[] | null;
}

export interface MetricSettingInput {
  metricId: string;
  metricVersion?: string | null;
  options?: JSONValue;
}

export interface DatasetItemInput {
  input: JSONValue;
  expected?: JSONValue;
  observedOutput?: JSONValue;
  reason?: string | null;
  metadata?: JSONValue;
  sourceRefs?: AiEvalSourceRefInput[] | null;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  contentTreatment?: DatasetContentTreatment | null;
  anonymizationProvenance?: DatasetAnonymizationProvenanceInput | null;
}

export interface AppendDatasetItemsInput {
  datasetId: string;
  expectedDatasetVersionId?: string | null;
  items: DatasetItemInput[];
  idempotencyKey: string;
}

export interface UpdateDatasetItemsInput {
  datasetId: string;
  expectedDatasetVersionId?: string | null;
  updates: DatasetItemUpdateInput[];
  idempotencyKey: string;
}

export interface DatasetItemUpdateInput {
  id: string;
  operation: DatasetItemUpdateOperation;
  input?: JSONValue;
  expected?: JSONValue;
  observedOutput?: JSONValue;
  reason?: string | null;
  metadata?: JSONValue;
  sourceRefs?: AiEvalSourceRefInput[] | null;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  curationNote?: string | null;
  contentTreatment?: DatasetContentTreatment | null;
  anonymizationProvenance?: DatasetAnonymizationProvenanceInput | null;
}

export interface DatasetCandidateSearchInput {
  datasetId?: string | null;
  status?: DatasetCandidateStatus | null;
  sourceKind?: DatasetCandidateSourceKind | null;
  curationStatus?: DatasetCurationStatus | null;
  contentTreatment?: DatasetContentTreatment | null;
  clusterId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export interface PrepareDatasetCandidatesInput {
  datasetId?: string | null;
  sources: DatasetCandidateSourceInput[];
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  contentTreatment?: DatasetContentTreatment | null;
  anonymizationPolicyId?: string | null;
  anonymizationPolicyVersion?: number | null;
  idempotencyKey: string;
}

export interface DatasetCandidateSourceInput {
  sourceKind: DatasetCandidateSourceKind;
  traceId?: string | null;
  spanId?: string | null;
  metricResultId?: string | null;
  evaluationRunId?: string | null;
  evaluationItemRunId?: string | null;
  policyId?: string | null;
  coverageGapId?: string | null;
  healthIssueId?: string | null;
  clusterId?: string | null;
}

export interface CommitDatasetCandidatesInput {
  datasetId: string;
  expectedDatasetVersionId?: string | null;
  candidateIds: string[];
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  idempotencyKey: string;
}

export interface PromoteSpanToDatasetItemInput {
  datasetId: string;
  traceId: string;
  spanId?: string | null;
  input?: JSONValue;
  expected?: JSONValue;
  observedOutput?: JSONValue;
  reason?: string | null;
  metadata?: JSONValue;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  idempotencyKey: string;
}

export interface PrepareDatasetImportInput {
  datasetId: string;
  uploadId: string;
  format: DatasetImportFormat;
  fileSelector?: DatasetImportFileSelectorInput | null;
  mapping: DatasetImportMappingInput;
  defaults?: DatasetImportDefaultsInput | null;
  previewLimit?: number | null;
  idempotencyKey: string;
}

export interface DatasetImportFileSelectorInput {
  include?: string[] | null;
  exclude?: string[] | null;
}

export interface DatasetImportMappingInput {
  input: DatasetImportFieldMappingInput[];
  expected?: DatasetImportFieldMappingInput[] | null;
  observedOutput?: DatasetImportFieldMappingInput[] | null;
  reason?: DatasetImportScalarMappingInput | null;
  metadata?: DatasetImportFieldMappingInput[] | null;
  sourceTraceId?: DatasetImportScalarMappingInput | null;
  sourceSpanId?: DatasetImportScalarMappingInput | null;
  split?: DatasetImportScalarMappingInput | null;
  curationStatus?: DatasetImportScalarMappingInput | null;
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
  curationStatus?: DatasetCurationStatus | null;
  metadata?: JSONValue;
  reason?: string | null;
  allowPartialCommit?: boolean | null;
}

export interface CommitDatasetImportInput {
  importId: string;
  expectedDatasetVersionId?: string | null;
  mode?: DatasetImportCommitMode | null;
  idempotencyKey: string;
}

export interface StartDatasetExportInput {
  datasetId: string;
  datasetVersionId?: string | null;
  format: DatasetExportFormat;
  split?: DatasetSplit | null;
  curationStatus?: DatasetCurationStatus | null;
  includeMetadata?: boolean | null;
  includeSourcePointers?: boolean | null;
  idempotencyKey: string;
}

export interface CreateScorerInput {
  name: string;
  kind: ScorerKind;
  definition: JSONValue;
  judgeModelRef?: string | null;
}

export interface EvaluationTargetRefInput {
  kind: EvaluationTargetKind;
  targetId?: string | null;
  targetSnapshotId?: string | null;
  targetRef?: string | null;
  displayName: string;
  metadata?: JSONValue;
}

export interface CreateEvaluationDefinitionInput {
  projectId: string;
  name: string;
  datasetId: string;
  datasetVersionPolicy: EvaluationDatasetVersionPolicy;
  pinnedDatasetVersionId?: string | null;
  splitSelector: DatasetSplitSelectorInput;
  targetRef: EvaluationTargetRefInput;
  metricSettings: MetricSettingInput[];
  runPolicy?: EvalRunPolicyInput | null;
  retentionProfile?: RetentionProfile | null;
  idempotencyKey: string;
}

export interface UpdateEvaluationDefinitionInput {
  id: string;
  name: string;
  splitSelector?: DatasetSplitSelectorInput | null;
  targetRef?: EvaluationTargetRefInput | null;
  metricSettings?: MetricSettingInput[] | null;
  runPolicy?: EvalRunPolicyInput | null;
  retentionProfile?: RetentionProfile | null;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface StartEvaluationRunInput {
  evaluationDefinitionId?: string | null;
  projectId: string;
  kind?: EvaluationRunKind | null;
  datasetId: string;
  datasetVersionId: string;
  selectedItemRevisionIds?: string[] | null;
  splitSelector: DatasetSplitSelectorInput;
  targetRef?: EvaluationTargetRefInput | null;
  targetSnapshotId?: string | null;
  metricSettings?: MetricSettingInput[] | null;
  runPolicy?: EvalRunPolicyInput | null;
  retentionProfile?: RetentionProfile | null;
  retentionRole?: RetentionRole | null;
  idempotencyKey: string;
}

export interface EvaluationRunControlInput {
  evaluationRunId: string;
  idempotencyKey: string;
}

export interface CreateEvaluationComparisonInput {
  projectId: string;
  baselineRunId: string;
  candidateRunId: string;
  metricIds?: string[] | null;
  idempotencyKey: string;
}

export interface CreateExperimentInput {
  name: string;
  datasetId: string;
  datasetVersion: number;
  splitSelector?: DatasetSplitSelectorInput | null;
  scorerIds: string[];
  solverRef: EvalSolverRefInput;
  baselineRef?: EvalBaselineRefInput | null;
  promptVersionRefs?: string[] | null;
  skillSnapshotRefs?: string[] | null;
  toolSnapshotRefs?: string[] | null;
  providerProfileRefs?: string[] | null;
  tags?: string[] | null;
}

export interface StartExperimentRunInput {
  experimentId: string;
  solverRef?: EvalSolverRefInput | null;
  splitSelector?: DatasetSplitSelectorInput | null;
  runPolicy?: EvalRunPolicyInput | null;
}

export interface StartOptimizationRunInput {
  projectId: string;
  baselineTargetSnapshotId: string;
  objective: OptimizationObjectiveInput;
  trainingEvaluationDefinitionId?: string | null;
  trainingSplitSelector?: DatasetSplitSelectorInput | null;
  validationEvaluationDefinitionId?: string | null;
  validationSplitSelector?: DatasetSplitSelectorInput | null;
  testEvaluationDefinitionId?: string | null;
  quickShotPolicy?: QuickShotPolicyInput | null;
  runPolicy?: EvalRunPolicyInput | null;
  idempotencyKey: string;
}

export interface OptimizationObjectiveInput {
  primaryMetricId: string;
  secondaryMetricIds?: string[] | null;
  constraints?: JSONValue;
  tradeoffMetricIds?: string[] | null;
  rankingPolicy?: JSONValue;
  tieBreakers?: string[] | null;
  minimumEvidence?: JSONValue;
}

export interface QuickShotPolicyInput {
  sourceDatasetVersionId: string;
  split: DatasetSplit;
  selectionStrategy: QuickShotSelectionStrategy;
  selectedItemRevisionIds?: string[] | null;
  seed?: number | null;
  minimumSampleSize?: number | null;
  metricSettingsSnapshot: MetricSettingInput[];
  runPolicySnapshot?: EvalRunPolicyInput | null;
}

export interface EvalSolverRefInput {
  kind: EvalSolverKind;
  name: string;
  promptVersionId?: string | null;
  promptVersion?: number | null;
  agentRef?: string | null;
  workflowRef?: string | null;
  skillSnapshotRef?: string | null;
  toolSnapshotRef?: string | null;
  modelAlias?: string | null;
  providerProfileId?: string | null;
}

export interface EvalBaselineRefInput {
  kind: EvalBaselineKind;
  experimentRunId?: string | null;
  promptVersionId?: string | null;
  promptVersion?: number | null;
  solverRef?: EvalSolverRefInput | null;
}

export interface OptimizationConfigInput {
  bootstrapFewshot?: BootstrapFewshotConfigInput | null;
  criticMutateJudgePick?: CriticMutateJudgePickConfigInput | null;
}

export interface BootstrapFewshotConfigInput {
  candidateCount: number;
  maxExamplesPerCandidate: number;
  selectionScorerIds: string[];
  seed: number;
  diversityStrategy?: BootstrapFewshotDiversityStrategy | null;
}

export interface CriticMutateJudgePickConfigInput {
  candidateCount: number;
  mutationInstructions: string;
  judgeScorerIds: string[];
  seed: number;
  maxRounds: number;
  keepTopK?: number | null;
}

export interface EvalRunPolicyInput {
  maxParallelRequests?: number | null;
  tokenBudget?: EvalTokenBudgetInput | null;
  costBudget?: EvalCostBudgetInput | null;
  rateLimit?: EvalRateLimitInput | null;
  retry?: EvalRetryPolicyInput | null;
  timeout?: EvalTimeoutPolicyInput | null;
  failureBudget?: EvalFailureBudgetInput | null;
  backpressure?: EvalBackpressurePolicyInput | null;
  checkpoint?: EvalCheckpointPolicyInput | null;
  quarantine?: EvalQuarantinePolicyInput | null;
  workspaceQuota?: EvalWorkspaceQuotaInput | null;
  cleanupRetry?: EvalCleanupRetryPolicyInput | null;
}

export interface EvalTokenBudgetInput {
  maxRunTokens?: number | null;
  maxItemInputTokens?: number | null;
  maxItemOutputTokens?: number | null;
  maxJudgeTokens?: number | null;
  behavior?: EvalLimitBehavior | null;
}

export interface EvalCostBudgetInput {
  maxRunUsd?: number | null;
  maxDailyProjectUsd?: number | null;
  behavior?: EvalLimitBehavior | null;
}

export interface EvalRateLimitInput {
  maxRequestsPerMinute?: number | null;
  maxTokensPerMinute?: number | null;
  providerBurst?: number | null;
  projectBurst?: number | null;
}

export interface EvalRetryPolicyInput {
  maxAttempts?: number | null;
  baseDelayMs?: number | null;
  maxDelayMs?: number | null;
  jitter?: boolean | null;
  retryBudget?: number | null;
  retryableCodes?: string[] | null;
}

export interface EvalTimeoutPolicyInput {
  itemTimeoutMs?: number | null;
  metricTimeoutMs?: number | null;
  adapterCallTimeoutMs?: number | null;
  runTimeoutMs?: number | null;
  cleanupTimeoutMs?: number | null;
}

export interface EvalFailureBudgetInput {
  maxModelFailures?: number | null;
  maxTechnicalErrors?: number | null;
  maxItemQualityFailures?: number | null;
  maxMetricConfigFailures?: number | null;
}

export interface EvalBackpressurePolicyInput {
  behavior?: EvalBackpressureBehavior | null;
  queueDepthThreshold?: number | null;
  storageLagMsThreshold?: number | null;
  providerRateLimitBehavior?: EvalBackpressureBehavior | null;
}

export interface EvalCheckpointPolicyInput {
  cadence?: EvalCheckpointCadence | null;
  batchSize?: number | null;
  persistSandboxRefs?: boolean | null;
}

export interface EvalQuarantinePolicyInput {
  enabled?: boolean | null;
  maxConsecutiveItemFailures?: number | null;
  quarantineOversizedItems?: boolean | null;
  quarantineInvalidJson?: boolean | null;
  quarantineMissingEvidence?: boolean | null;
}

export interface EvalWorkspaceQuotaInput {
  maxWorkspaceBytes?: number | null;
  maxSingleFileBytes?: number | null;
  maxFileCount?: number | null;
  maxCheckpointPayloadBytes?: number | null;
  maxSnapshotBytes?: number | null;
  maxWorkspaceAgeMs?: number | null;
  maxActiveWorkspaces?: number | null;
  maxPausedWorkspaces?: number | null;
  maxConcurrentResumes?: number | null;
}

export interface EvalCleanupRetryPolicyInput {
  maxAttempts?: number | null;
  baseDelayMs?: number | null;
  maxDelayMs?: number | null;
  jitter?: boolean | null;
  orphanAfterMs?: number | null;
  retryableCleanupCodes?: string[] | null;
}

export interface PromotePromptVersionInput {
  promptVersionId: string;
  tag: string;
}

export interface PromoteTargetSnapshotInput {
  projectId: string;
  targetRef: string;
  baselineTargetSnapshotId: string;
  candidateTargetSnapshotId: string;
  evidenceEvaluationRunIds: string[];
  comparisonId: string;
  notes?: string | null;
  idempotencyKey: string;
}

export interface TargetDiffInput {
  projectId: string;
  baselineSnapshotId: string;
  candidateSnapshotId: string;
}

export interface AiEvalSourceRefInput {
  kind: AiEvalSourceRefKind;
  traceId?: string | null;
  spanId?: string | null;
  evaluationRunId?: string | null;
  evaluationItemRunId?: string | null;
  importJobId?: string | null;
  candidateId?: string | null;
  metadata?: JSONValue;
}

export interface AiEvalSourceRef {
  kind: AiEvalSourceRefKind;
  traceId?: string | null;
  spanId?: string | null;
  evaluationRunId?: string | null;
  evaluationItemRunId?: string | null;
  importJobId?: string | null;
  candidateId?: string | null;
  metadata: JSONValue;
}

export interface DatasetAnonymizationProvenanceInput {
  policyId: string;
  policyVersion: number;
  transformedAt?: DateTime | null;
  consistencyScope: string;
  transformedFields: DatasetAnonymizedFieldInput[];
}

export interface DatasetAnonymizedFieldInput {
  path: string;
  entityType: string;
  strategy: string;
}

export interface ResolveAnnotationInput {
  annotationQueueItemId: string;
  datasetItemId?: string | null;
  status: AnnotationStatus;
}

export interface LiveExperimentRunInput {
  experimentRunId: string;
}

export interface LiveEvaluationRunInput {
  evaluationRunId: string;
}

export interface DatasetSplitSelectorInput {
  splits: DatasetSplit[];
  curationStatuses?: DatasetCurationStatus[] | null;
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
  runPolicyDefaults?: EvalRunPolicyInput | null;
  datasetPipeline?: DatasetPipelineSettingsInput | null;
  datasetDefaults: DatasetDefaultsInput;
  expectedVersion: number;
}

export interface UpdateProjectAiProviderSettingsInput {
  projectId: string;
  providerProfiles: AiProviderProfileInput[];
  modelAliases: AiModelAliasInput[];
  expectedVersion: number;
}

export interface UpdateCompanyAiProviderSettingsInput {
  companyId: string;
  providerProfile: AiProviderProfileInput;
  chatModelAlias: AiModelAliasInput;
  expectedVersion: number;
}

export interface AiProviderProfileInput {
  id?: string | null;
  label: string;
  providerKind: AiProviderKind;
  baseUrl?: string | null;
  credentialRef?: string | null;
  credentialValue?: string | null;
  models: JSONValue;
  parameters?: JSONValue | null;
  timeoutMs?: number | null;
  maxConcurrency?: number | null;
  disabled?: boolean | null;
}

export interface AiModelAliasInput {
  id?: string | null;
  name: string;
  providerProfileId: string;
  model: string;
  purpose: AiModelPurpose;
  parameters?: AiProviderParametersInput | null;
}

export interface AiProviderParametersInput {
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  reasoningEffort?: string | null;
  extras?: JSONValue;
}

export interface AiChatHistoryInput {
  companyId: string;
  projectId?: string | null;
  includeArchived?: boolean | null;
  first?: number | null;
  after?: string | null;
}

export interface CreateAiChatConversationInput {
  companyId: string;
  projectId: string;
  title?: string | null;
  firstUserMessage: string;
}

export interface ApproveAiChatActionInput {
  actionProposalId: string;
  idempotencyKey: string;
  approved: boolean;
  reason?: string | null;
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
  metricIds: string[];
  sampleRate: number;
  maxDailyRuns?: number | null;
  contentAllowance?: EvalContentClass[] | null;
  maxLatencyClass?: EvalLatencyClass | null;
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
  maxConcurrentEvaluationItems: number;
  maxConcurrentOptimizationCandidates: number;
}

export interface DatasetPipelineSettingsInput {
  candidateSuggestionsEnabled?: boolean | null;
  requireReviewBeforeCommit?: boolean | null;
  anonymizationMode?: DatasetAnonymizationMode | null;
  anonymizationPolicyId?: string | null;
  anonymizationPolicyVersion?: number | null;
  anonymizationConsistencyScope?: DatasetAnonymizationConsistencyScope | null;
  preserveLocale?: boolean | null;
  preserveTemporalDistance?: boolean | null;
  blockedEntityTypes?: string[] | null;
}

export interface DatasetDefaultsInput {
  splitAllocation: JSONValue;
  smallDatasetReadyThreshold?: number | null;
  requireReadyForTest?: boolean | null;
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
  targetShape: DatasetTargetShape;
  contentTreatment: DatasetContentTreatment;
  anonymization?: DatasetAnonymizationProvenance | null;
  quarantineStatus: DatasetItemQuarantineStatus;
  removedAt?: DateTime | null;
  duplicateOfItemId?: string | null;
  leakageWarnings: string[];
}

export interface DatasetAnonymizationProvenance {
  policyId: string;
  policyVersion: number;
  transformedAt: DateTime;
  consistencyScope: string;
  transformedFields: DatasetAnonymizedField[];
}

export interface DatasetAnonymizedField {
  path: string;
  entityType: string;
  strategy: string;
}

export interface DatasetCandidate {
  id: string;
  datasetId?: string | null;
  status: DatasetCandidateStatus;
  sourceKind: DatasetCandidateSourceKind;
  source: JSONValue;
  targetShape: DatasetTargetShape;
  input?: JSONValue;
  expected?: JSONValue;
  metadata: JSONValue;
  split: DatasetSplit;
  reviewStatus: DatasetReviewStatus;
  contentTreatment: DatasetContentTreatment;
  anonymization?: DatasetAnonymizationProvenance | null;
  reason: string;
  clusterId?: string | null;
  warnings: string[];
  createdAt: DateTime;
  updatedAt: DateTime;
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
  observedOutput?: JSONValue;
  reason: string;
  metadata: JSONValue;
  split: DatasetSplit;
  curationStatus: DatasetCurationStatus;
  sourceRefs: AiEvalSourceRef[];
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
  runMode?: EvalRunMode | null;
  resultKind?: EvalResultKind | null;
  metrics?: JSONValue;
  breakdown?: JSONValue;
  visualization?: EvalResultVisualization | null;
  evidence?: JSONValue;
  problem?: JSONValue;
  judgeRunRef?: string | null;
  producedAt: DateTime;
}

export interface EvalResultVisualization {
  kind: EvalResultVisualizationKind;
  title?: string | null;
  data: JSONValue;
}

export interface Experiment {
  id: string;
  name: string;
  datasetId: string;
  datasetVersion: number;
  splitSelector: DatasetSplitSelector;
  scorerIds: string[];
  baselineRef?: EvalBaselineRef | null;
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
  solverRef: EvalSolverRef;
  manifest?: ExperimentManifest | null;
  baselineRunId?: string | null;
  status: ExperimentRunStatus;
  runPolicy: EvalRunPolicy;
  startedAt: DateTime;
  endedAt?: DateTime | null;
  summary: ExperimentRunSummary;
  itemRuns?: DatasetItemRunSearchResult;
}

export interface MetricResultPayload {
  kind: MetricPayloadKind;
  value?: JSONValue;
  confusionMatrix?: JSONValue;
  fieldBreakdown?: JSONValue;
  distribution?: JSONValue;
  summary?: string | null;
}

export interface MetricProblem {
  code: MetricProblemCode;
  message: string;
  path?: string | null;
  severity: string;
  metadata: JSONValue;
}

export interface MetricResult {
  id: string;
  evaluationRunId: string;
  evaluationItemRunId?: string | null;
  metricId: string;
  metricVersion: string;
  scope: MetricResultScope;
  subjectId: string;
  payload: MetricResultPayload;
  unit: MetricUnit;
  direction: MetricDirection;
  problem?: MetricProblem | null;
  producedAt: DateTime;
}

export interface MetricAggregate {
  metricId: string;
  metricVersion: string;
  scope: MetricResultScope;
  subjectId: string;
  payload: MetricResultPayload;
  unit: MetricUnit;
  direction: MetricDirection;
  support: number;
  problemCount: number;
}

export interface DatasetSplitSelector {
  splits: DatasetSplit[];
  curationStatuses?: DatasetCurationStatus[];
}

export interface EvaluationTargetRef {
  kind: EvaluationTargetKind;
  targetId?: string | null;
  targetSnapshotId?: string | null;
  targetRef?: string | null;
  displayName: string;
  metadata: JSONValue;
}

export interface EvaluationDefinition {
  id: string;
  projectId: string;
  name: string;
  datasetId: string;
  datasetVersionPolicy: EvaluationDatasetVersionPolicy;
  pinnedDatasetVersionId?: string | null;
  splitSelector: DatasetSplitSelector;
  targetRef: EvaluationTargetRef;
  metricSettings: MetricSettingInput[];
  runPolicy: EvalRunPolicy;
  retentionProfile: RetentionProfile;
  createdAt: DateTime;
  createdBy: string;
  updatedAt: DateTime;
  updatedBy: string;
  version: number;
}

export interface EvaluationRunSummary {
  itemCounts: JSONValue;
  metricAggregates: MetricAggregate[];
  problemCounts: JSONValue;
  budgetUsage: JSONValue;
  latency?: JSONValue;
}

export interface EvaluationRun {
  id: string;
  projectId: string;
  evaluationDefinitionId?: string | null;
  kind: EvaluationRunKind;
  status: EvaluationRunStatus;
  datasetId: string;
  datasetVersionId: string;
  datasetDigest: string;
  selectedItemRevisionIds: string[];
  splitSelector: DatasetSplitSelector;
  targetSnapshotId: string;
  metricSettingsSnapshot: MetricSettingInput[];
  runPolicySnapshot: EvalRunPolicy;
  retentionProfile: RetentionProfile;
  retentionRole: RetentionRole;
  startedAt?: DateTime | null;
  endedAt?: DateTime | null;
  summary: EvaluationRunSummary;
  problem?: MetricProblem | null;
  itemRuns?: EvaluationItemRunSearchResult;
  metricResults: MetricResult[];
  metricAggregates: MetricAggregate[];
}

export interface TargetSnapshot {
  id: string;
  kind: EvaluationTargetKind;
  name: string;
  version: string;
  digest: string;
  createdAt: DateTime;
  createdBy: string;
  source: TargetSnapshotSource;
  parts: JSONValue[];
  metadata: JSONValue;
  reproducibility: TargetReproducibility;
}

export interface TargetDiff {
  baselineTargetSnapshotId: string;
  candidateTargetSnapshotId: string;
  changedParts: JSONValue[];
  summary: string;
}

export interface EvaluationItemRun {
  id: string;
  evaluationRunId: string;
  datasetItemId: string;
  datasetItemRevisionId: string;
  targetSnapshotId: string;
  status: EvaluationItemRunStatus;
  actualOutput?: JSONValue;
  actualOutputType?: DatasetValueType | null;
  traceId?: string | null;
  rootSpanId?: string | null;
  metricResultIds: string[];
  metricResults: MetricResult[];
  problems: MetricProblem[];
  trajectorySummary?: string | null;
  summaryEvidenceRefs: AiEvalSourceRef[];
  importantSteps: JSONValue[];
  conversationRef?: string | null;
  summaryDigest?: string | null;
  summaryGeneratedAt?: DateTime | null;
  retentionRole: RetentionRole;
  startedAt?: DateTime | null;
  endedAt?: DateTime | null;
}

export interface EvaluationComparison {
  id: string;
  projectId: string;
  baselineRunId: string;
  candidateRunId: string;
  metricResults: MetricResult[];
  metricAggregates: MetricAggregate[];
  targetDiff?: TargetDiff | null;
  summary: string;
  createdAt: DateTime;
}

export interface OptimizationRun {
  id: string;
  projectId: string;
  status: EvaluationRunStatus;
  baselineTargetSnapshotId: string;
  objective: OptimizationObjectiveInput;
  trainingEvaluationDefinitionId?: string | null;
  trainingSplitSelector?: DatasetSplitSelector | null;
  validationEvaluationDefinitionId?: string | null;
  validationSplitSelector?: DatasetSplitSelector | null;
  testEvaluationDefinitionId?: string | null;
  candidateTargetSnapshotIds: string[];
  causedEvaluationRunIds: string[];
  quickShotPolicy?: JSONValue;
  comparisonIds: string[];
  selectedCandidateSnapshotId?: string | null;
  promotionRecordId?: string | null;
  budgetSnapshot: JSONValue;
  createdAt: DateTime;
  startedAt?: DateTime | null;
  endedAt?: DateTime | null;
}

export interface PromotionRecord {
  id: string;
  projectId: string;
  targetRef: string;
  baselineTargetSnapshotId: string;
  candidateTargetSnapshotId: string;
  evidenceEvaluationRunIds: string[];
  comparisonId: string;
  summary: string;
  promotedBy: string;
  promotedAt: DateTime;
  notes?: string | null;
}

export interface DatasetSplitSelector {
  splits: DatasetSplit[];
  curationStatuses?: DatasetCurationStatus[];
  reviewedOnly?: boolean;
  includeSynthetic?: boolean;
}

export interface VersionedRef {
  id: string;
  version: number;
}

export interface EvalSolverRef {
  kind: EvalSolverKind;
  name: string;
  promptVersion?: VersionedRef | null;
  agentRef?: string | null;
  workflowRef?: string | null;
  skillSnapshotRef?: string | null;
  toolSnapshotRef?: string | null;
  modelAlias?: string | null;
  providerProfileId?: string | null;
}

export interface EvalBaselineRef {
  kind: EvalBaselineKind;
  experimentRunId?: string | null;
  promptVersion?: VersionedRef | null;
  solverRef?: EvalSolverRef | null;
}

export interface OptimizationConfig {
  optimizerKind: OptimizerKind;
  bootstrapFewshot?: BootstrapFewshotConfig | null;
  criticMutateJudgePick?: CriticMutateJudgePickConfig | null;
}

export interface BootstrapFewshotConfig {
  candidateCount: number;
  maxExamplesPerCandidate: number;
  selectionScorerIds: string[];
  seed: number;
  diversityStrategy: BootstrapFewshotDiversityStrategy;
}

export interface CriticMutateJudgePickConfig {
  candidateCount: number;
  mutationInstructions: string;
  judgeScorerIds: string[];
  seed: number;
  maxRounds: number;
  keepTopK?: number | null;
}

export interface ExperimentRunSummary {
  itemCounts: EvalItemCounts;
  scoreSummaries: EvalScoreSummary[];
  problemCounts: EvalProblemCounts;
  budgetUsage: EvalBudgetUsage;
  latency?: EvalLatencySummary | null;
  regressions: EvalRegressionSummary[];
}

export interface EvalItemCounts {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  needsReview: number;
  quarantined: number;
}

export interface EvalScoreSummary {
  scorerId: string;
  scorerVersion: number;
  resultKind?: string | null;
  passRate: number;
  meanScore: number;
  p50?: number | null;
  p95?: number | null;
  support: number;
  visualization?: EvalResultVisualization | null;
}

export interface EvalProblemCounts {
  modelQuality: number;
  itemQuality: number;
  scorerConfig: number;
  infrastructure: number;
}

export interface EvalBudgetUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
}

export interface EvalLatencySummary {
  p50Ms?: number | null;
  p95Ms?: number | null;
  maxMs?: number | null;
}

export interface EvalRegressionSummary {
  kind: string;
  count: number;
  blocker?: boolean | null;
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
  baselineRef?: EvalBaselineRef | null;
  solverRef: EvalSolverRef;
  optimizationConfig?: OptimizationConfig | null;
  promptVersionRefs: string[];
  skillSnapshotRefs: string[];
  toolSnapshotRefs: string[];
  providerProfileRefs: string[];
  budget: JSONValue;
  concurrency: JSONValue;
  runPolicy: EvalRunPolicy;
  createdAt: DateTime;
}

export interface DatasetItemRun {
  id: string;
  experimentRunId: string;
  datasetItemId: string;
  status: DatasetItemRunStatus;
  harnessRunId?: string | null;
  output: JSONValue;
  latencyMs: number;
  tokenTotals?: TokenTotals | null;
  problem?: JSONValue;
  evalResults: EvalResult[];
}

export interface EvalRunPolicy {
  maxParallelRequests: number;
  tokenBudget?: EvalTokenBudget | null;
  costBudget?: EvalCostBudget | null;
  rateLimit?: EvalRateLimit | null;
  retry?: EvalRetryPolicy | null;
  timeout?: EvalTimeoutPolicy | null;
  failureBudget?: EvalFailureBudget | null;
  backpressure?: EvalBackpressurePolicy | null;
  checkpoint?: EvalCheckpointPolicy | null;
  quarantine?: EvalQuarantinePolicy | null;
  workspaceQuota?: EvalWorkspaceQuota | null;
  cleanupRetry?: EvalCleanupRetryPolicy | null;
}

export interface EvalTokenBudget {
  maxRunTokens?: number | null;
  maxItemInputTokens?: number | null;
  maxItemOutputTokens?: number | null;
  maxJudgeTokens?: number | null;
  behavior?: EvalLimitBehavior | null;
}

export interface EvalCostBudget {
  maxRunUsd?: number | null;
  maxDailyProjectUsd?: number | null;
  behavior?: EvalLimitBehavior | null;
}

export interface EvalRateLimit {
  maxRequestsPerMinute?: number | null;
  maxTokensPerMinute?: number | null;
  providerBurst?: number | null;
  projectBurst?: number | null;
}

export interface EvalRetryPolicy {
  maxAttempts?: number | null;
  baseDelayMs?: number | null;
  maxDelayMs?: number | null;
  jitter?: boolean | null;
  retryBudget?: number | null;
  retryableCodes: string[];
}

export interface EvalTimeoutPolicy {
  itemTimeoutMs?: number | null;
  scorerTimeoutMs?: number | null;
  adapterCallTimeoutMs?: number | null;
  runTimeoutMs?: number | null;
  cleanupTimeoutMs?: number | null;
}

export interface EvalFailureBudget {
  maxModelFailures?: number | null;
  maxTechnicalErrors?: number | null;
  maxItemQualityFailures?: number | null;
  maxScorerConfigFailures?: number | null;
}

export interface EvalBackpressurePolicy {
  behavior?: EvalBackpressureBehavior | null;
  queueDepthThreshold?: number | null;
  storageLagMsThreshold?: number | null;
  providerRateLimitBehavior?: EvalBackpressureBehavior | null;
}

export interface EvalCheckpointPolicy {
  cadence?: EvalCheckpointCadence | null;
  batchSize?: number | null;
  persistSandboxRefs?: boolean | null;
}

export interface EvalQuarantinePolicy {
  enabled?: boolean | null;
  maxConsecutiveItemFailures?: number | null;
  quarantineOversizedItems?: boolean | null;
  quarantineInvalidJson?: boolean | null;
  quarantineMissingEvidence?: boolean | null;
}

export interface EvalWorkspaceQuota {
  maxWorkspaceBytes?: number | null;
  maxSingleFileBytes?: number | null;
  maxFileCount?: number | null;
  maxCheckpointPayloadBytes?: number | null;
  maxSnapshotBytes?: number | null;
  maxWorkspaceAgeMs?: number | null;
  maxActiveWorkspaces?: number | null;
  maxPausedWorkspaces?: number | null;
  maxConcurrentResumes?: number | null;
}

export interface EvalCleanupRetryPolicy {
  maxAttempts?: number | null;
  baseDelayMs?: number | null;
  maxDelayMs?: number | null;
  jitter?: boolean | null;
  orphanAfterMs?: number | null;
  retryableCleanupCodes: string[];
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
  runPolicyDefaults: EvalRunPolicy;
  datasetPipeline: DatasetPipelineSettings;
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
  metricIds: string[];
  sampleRate: number;
  maxDailyRuns?: number | null;
  contentAllowance: EvalContentClass[];
  maxLatencyClass: EvalLatencyClass;
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
  maxConcurrentEvaluationItems: number;
  maxConcurrentOptimizationCandidates: number;
}

export interface DatasetDefaults {
  splitAllocation: JSONValue;
  smallDatasetReadyThreshold: number;
  requireReadyForTest: boolean;
}

export interface DatasetPipelineSettings {
  candidateSuggestionsEnabled: boolean;
  requireReviewBeforeCommit: boolean;
  anonymizationMode: DatasetAnonymizationMode;
  anonymizationPolicyId?: string | null;
  anonymizationPolicyVersion?: number | null;
  anonymizationConsistencyScope: DatasetAnonymizationConsistencyScope;
  preserveLocale: boolean;
  preserveTemporalDistance: boolean;
  blockedEntityTypes: string[];
}

export interface ProjectAiSettingsEffective {
  warnings: string[];
  deterministicOnly: boolean;
  missingProviderProfiles: string[];
  disabledProviderProfiles: string[];
  budgetExhausted: boolean;
}

export interface ProjectAiProviderSettings {
  projectId: string;
  providerProfiles: AiProviderProfile[];
  modelAliases: AiModelAlias[];
  effective: AiProviderSettingsEffective;
  version: number;
  updatedAt: DateTime;
  updatedByUserId: string;
}

export interface CompanyAiProviderSettings {
  companyId: string;
  providerProfile?: AiProviderProfile | null;
  chatModelAlias?: AiModelAlias | null;
  effective: AiProviderSettingsEffective;
  version: number;
  updatedAt: DateTime;
  updatedByUserId: string;
}

export interface AiProviderProfile {
  id: string;
  ownerScope: string;
  ownerId: string;
  label: string;
  providerKind: AiProviderKind;
  baseUrl?: string | null;
  credentialRef: string;
  models: JSONValue;
  parameters: JSONValue;
  timeoutMs: number;
  maxConcurrency?: number | null;
  disabledAt?: DateTime | null;
}

export interface AiModelAlias {
  id: string;
  name: string;
  providerProfileId: string;
  model: string;
  purpose: AiModelPurpose;
  parameters: AiProviderParameters;
}

export interface AiProviderParameters {
  temperature?: number | null;
  topP?: number | null;
  maxOutputTokens?: number | null;
  reasoningEffort?: string | null;
  extras: JSONValue;
}

export interface AiProviderSettingsEffective {
  warnings: string[];
  missingProviderProfiles: string[];
  disabledProviderProfiles: string[];
  missingChatProvider: boolean;
}

export interface AiChatHistory {
  companyId: string;
  userId: string;
  projectGroups: AiChatProjectGroup[];
  pageInfo: PageInfo;
}

export interface AiChatProjectGroup {
  projectId: string;
  projectName: string;
  conversations: AiChatConversation[];
}

export interface AiChatConversation {
  id: string;
  companyId: string;
  projectId: string;
  userId: string;
  title: string;
  status: AiChatConversationStatus;
  messages: AiChatMessage[];
  latestRun?: AiChatRun | null;
  compaction?: AiChatCompaction | null;
  createdAt: DateTime;
  updatedAt: DateTime;
  lastMessageAt: DateTime;
  version: number;
}

export interface AiChatMessage {
  id: string;
  conversationId: string;
  role: AiChatMessageRole;
  parts: AiChatMessagePart[];
  createdAt: DateTime;
}

export interface AiChatMessagePart {
  type: AiChatMessagePartType;
  text?: string | null;
  json?: JSONValue;
  artifactId?: string | null;
  renderer?: string | null;
  actionProposalId?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  label?: string | null;
  status?: string | null;
  problem?: JSONValue;
}

export interface AiChatRun {
  id: string;
  conversationId: string;
  projectId: string;
  userId: string;
  status: AiChatRunStatus;
  providerKind: string;
  providerProfileId?: string | null;
  model: string;
  traceId?: string | null;
  toolCallCount: number;
  sandboxScriptCount: number;
  artifactCount: number;
  inputTokenCount?: number | null;
  outputTokenCount?: number | null;
  estimatedCostUsd?: number | null;
  artifacts: AiChatArtifact[];
  actionProposals: AiChatActionProposal[];
  startedAt: DateTime;
  completedAt?: DateTime | null;
  problem?: JSONValue;
}

export interface AiChatArtifact {
  id: string;
  conversationId: string;
  runId: string;
  kind: AiChatArtifactKind;
  label: string;
  mediaType: string;
  sizeBytes: number;
  renderSpec?: JSONValue;
  fileRef?: string | null;
  createdAt: DateTime;
}

export interface AiChatActionProposal {
  id: string;
  runId: string;
  conversationId: string;
  title: string;
  description: string;
  risk: AiChatActionRisk;
  status: AiChatActionStatus;
  actionKind: string;
  graphqlMutation?: string | null;
  inputPreview: JSONValue;
  requiresApproval: boolean;
  result?: JSONValue;
  requestedAt: DateTime;
  decidedAt?: DateTime | null;
  decidedByUserId?: string | null;
  expiresAt: DateTime;
  version: number;
}

export interface AiChatCompaction {
  id: string;
  conversationId: string;
  sourceMessageCount: number;
  summary: string;
  retainedMessageIds: string[];
  artifactSummaries: string[];
  pendingActionIds: string[];
  createdAt: DateTime;
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
export interface DatasetCandidateSearchResult {
  items: DatasetCandidate[];
  nextCursor?: string | null;
}
export interface DatasetCandidatesData {
  items: DatasetCandidate[];
  nextCursor?: string | null;
}
export interface DatasetCandidatesResponse {
  requestId: string;
  ok: boolean;
  data?: DatasetCandidatesData | null;
  error?: BridgeError | null;
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
  nextCursor?: string | null;
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
  alert?: DashboardAlertWidget | null;
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

export interface DashboardAlertWidget {
  ruleIds: string[];
  states: AlertState[];
  severities: AlertSeverity[];
  signals: AlertSignal[];
  timeWindow: string;
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

export interface AlertSummaryInput {
  ruleIds?: string[] | null;
  states?: AlertState[] | null;
  severities?: AlertSeverity[] | null;
  signals?: AlertSignal[] | null;
  timeWindow?: string | null;
  limit?: number | null;
}

export interface AlertStateCount {
  state: AlertState;
  count: number;
}

export interface AlertSeverityCount {
  severity: AlertSeverity;
  count: number;
}

export interface AlertSignalCount {
  signal: AlertSignal;
  count: number;
}

export interface AlertSummary {
  totalCount: number;
  byState: AlertStateCount[];
  bySeverity: AlertSeverityCount[];
  bySignal: AlertSignalCount[];
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

export interface AlertSummaryQueryData {
  alertSummary: AlertSummary;
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

export interface EvaluationDefinitionsQueryData {
  evaluationDefinitions: EvaluationDefinitionSearchResult;
}

export interface EvaluationDefinitionQueryData {
  evaluationDefinition?: EvaluationDefinition | null;
}

export interface EvaluationRunsQueryData {
  evaluationRuns: EvaluationRunSearchResult;
}

export interface EvaluationRunQueryData {
  evaluationRun?: EvaluationRun | null;
}

export interface EvaluationResultsQueryData {
  evaluationResults: MetricResultSearchResult;
}

export interface EvaluationComparisonsQueryData {
  evaluationComparisons: EvaluationComparisonSearchResult;
}

export interface EvaluationComparisonQueryData {
  evaluationComparison?: EvaluationComparison | null;
}

export interface OptimizationRunsQueryData {
  optimizationRuns: OptimizationRunSearchResult;
}

export interface OptimizationRunQueryData {
  optimizationRun?: OptimizationRun | null;
}

export interface TargetSnapshotQueryData {
  targetSnapshot?: TargetSnapshot | null;
}

export interface TargetDiffQueryData {
  targetDiff: TargetDiff;
}

export interface AnnotationQueueQueryData {
  annotationQueue: AnnotationQueueResult;
}

export interface ProjectAiSettingsQueryData {
  projectAiSettings: ProjectAiSettings;
}

export interface ProjectAiProviderSettingsQueryData {
  projectAiProviderSettings: ProjectAiProviderSettings;
}

export interface CompanyAiProviderSettingsQueryData {
  companyAiProviderSettings: CompanyAiProviderSettings;
}

export interface AiChatHistoryQueryData {
  aiChatHistory: AiChatHistory;
}

export interface AiChatConversationQueryData {
  aiChatConversation?: AiChatConversation | null;
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
  startOptimizationRun: OptimizationRun;
}

export interface PromotePromptVersionMutationData {
  promotePromptVersion: PromptVersion;
}

export interface CreateEvaluationDefinitionMutationData {
  createEvaluationDefinition: EvaluationDefinition;
}

export interface UpdateEvaluationDefinitionMutationData {
  updateEvaluationDefinition: EvaluationDefinition;
}

export interface StartEvaluationRunMutationData {
  startEvaluationRun: EvaluationRun;
}

export interface PauseEvaluationRunMutationData {
  pauseEvaluationRun: EvaluationRun;
}

export interface ResumeEvaluationRunMutationData {
  resumeEvaluationRun: EvaluationRun;
}

export interface CancelEvaluationRunMutationData {
  cancelEvaluationRun: EvaluationRun;
}

export interface CreateEvaluationComparisonMutationData {
  createEvaluationComparison: EvaluationComparison;
}

export interface PromoteTargetSnapshotMutationData {
  promoteTargetSnapshot: PromotionRecord;
}

export interface ResolveAnnotationMutationData {
  resolveAnnotation: AnnotationQueueItem;
}

export interface UpdateProjectAiSettingsMutationData {
  updateProjectAiSettings: ProjectAiSettings;
}

export interface UpdateProjectAiProviderSettingsMutationData {
  updateProjectAiProviderSettings: ProjectAiProviderSettings;
}

export interface UpdateCompanyAiProviderSettingsMutationData {
  updateCompanyAiProviderSettings: CompanyAiProviderSettings;
}

export interface CreateAiChatConversationMutationData {
  createAiChatConversation: AiChatConversation;
}

export interface ArchiveAiChatConversationMutationData {
  archiveAiChatConversation: AiChatConversation;
}

export interface DeleteAiChatConversationMutationData {
  deleteAiChatConversation: boolean;
}

export interface ApproveAiChatActionMutationData {
  approveAiChatAction: AiChatActionProposal;
}

export interface LiveExperimentRunSubscriptionData {
  liveExperimentRun: ExperimentRunEvent;
}

export interface EvaluationDefinitionSearchResult {
  items: EvaluationDefinition[];
  nextCursor?: string | null;
}

export interface EvaluationRunSearchResult {
  items: EvaluationRun[];
  nextCursor?: string | null;
}

export interface EvaluationItemRunSearchResult {
  items: EvaluationItemRun[];
  nextCursor?: string | null;
}

export interface MetricResultSearchResult {
  items: MetricResult[];
  nextCursor?: string | null;
}

export interface EvaluationComparisonSearchResult {
  items: EvaluationComparison[];
  nextCursor?: string | null;
}

export interface OptimizationRunSearchResult {
  items: OptimizationRun[];
  nextCursor?: string | null;
}

export interface EvaluationRunEvent {
  type: EvaluationRunEventType;
  seq: number;
  receivedAt: DateTime;
  run?: EvaluationRun | null;
  itemRun?: EvaluationItemRun | null;
}

export interface LiveEvaluationRunSubscriptionData {
  liveEvaluationRun: EvaluationRunEvent;
}
