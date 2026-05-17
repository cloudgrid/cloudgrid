export const DEPLOYMENT_MODES = ["local", "deployed"] as const;
export const AUTH_MODES = ["local", "sso"] as const;
export const AUTH_PROVIDERS = ["github", "google", "azure"] as const;
export const COMPANY_ROLES = ["admin", "user"] as const;
export const ORGANIZATION_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export const PROJECT_ROLES = ["viewer", "editor", "admin"] as const;
export const PROJECT_MEMBER_SOURCES = ["direct", "company_admin", "local_personal"] as const;
export const PROJECT_STATUSES = ["active", "read_only", "disabled"] as const;
export const RETENTION_DATA_CLASSES = [
  "TRACES",
  "LOGS",
  "METRICS",
  "AI_EVALS",
  "DATASETS",
  "SCORERS",
  "DASHBOARD_HISTORY",
  "INGEST_CREDENTIAL_AUDIT",
] as const;
export const RETENTION_MODES = ["retain", "delete", "soft_delete_then_delete"] as const;
export const ALERT_RULE_KINDS = [
  "METRIC_THRESHOLD",
  "METRIC_ABSENCE",
  "LOG_MATCH",
  "LOG_COUNT",
  "TRACE_MATCH",
  "TRACE_COUNT",
  "TRACE_LATENCY",
  "TRACE_ERROR",
] as const;
export const ALERT_SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
export const ALERT_STATES = ["OK", "PENDING", "FIRING", "RESOLVED", "SILENCED", "ERROR"] as const;

export const CONTROL_PLANE_SUBJECTS = [
  "control.viewer.get",
  "control.organizations.list",
  "control.organizations.get",
  "control.projects.list",
  "control.projects.get",
  "control.projects.create",
  "control.projects.update",
  "control.projects.select",
  "control.members.list",
  "control.members.update",
  "control.members.remove",
  "control.invitations.list",
  "control.invitations.create",
  "control.invitations.revoke",
  "control.ingest_credentials.list",
  "control.ingest_credentials.create",
  "control.ingest_credentials.revoke",
  "control.ai_settings.get",
  "control.ai_settings.update",
  "control.project_status.snapshot",
  "control.project_status.changed",
  "control.dashboards.list",
  "control.dashboards.save",
  "control.dashboards.delete",
  "control.dashboard_pins.set",
  "control.dashboard_pins.reorder",
  "control.project_members.list",
  "control.project_members.update",
  "control.project_members.remove",
  "control.retention.get",
  "control.retention.update",
  "control.alert_rules.list",
  "control.alert_rules.create",
  "control.alert_rules.update",
  "control.alert_rules.delete",
  "control.alert_silences.list",
  "control.alert_silences.create",
  "control.alert_silences.delete",
  "control.alert_history.list",
  "control.alert_history.record",
] as const;

export const STORAGE_MAINTENANCE_SUBJECTS = [
  "storage_maintenance.retention.execute_batch",
] as const;

export const ALERT_EVALUATOR_SUBJECTS = [
  "alert_evaluator.tick",
  "alert_evaluator.rules.evaluate",
  "alert_evaluator.notifications.dispatch",
] as const;

export const AI_EVAL_SUBJECTS = [
  "telemetry.ingest.ai_projections",
  "ai.persisted.projections",
  "eval.dataset.create",
  "eval.dataset.search",
  "eval.dataset.items.append",
  "eval.dataset.item.promote",
  "eval.dataset.import.prepare",
  "eval.dataset.import.commit",
  "eval.dataset.export.start",
  "eval.dataset.transfer.get",
  "eval.dataset.health",
  "eval.agent_runs.search",
  "eval.scorer.create",
  "eval.scorer.search",
  "eval.experiment.create",
  "eval.experiment.start",
  "eval.experiment.cancel",
  "eval.optimization.start",
  "eval.experiment.search",
  "eval.results.search",
  "eval.results.persist",
  "eval.online.policy_matches.resolve",
  "eval.live.start",
  "eval.live.stop",
  "eval.live.events.*.*",
  "eval.experiment.progress",
  "eval.manifest.resolve",
  "eval.quality.overview",
  "eval.prompt_version.promote",
  "annotation.queue.search",
  "annotation.item.update",
] as const;

export const CONTRACT_GENERATION_TARGETS = [
  "apps/packages/ui-contracts/src/generated.ts",
  "core/go-contracts/generated_contracts.go",
  "specs/03-contracts/messages/message-bridge.asyncapi.yaml",
] as const;

export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];
export type AuthMode = (typeof AUTH_MODES)[number];
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export type OrganizationInvitationStatus = (typeof ORGANIZATION_INVITATION_STATUSES)[number];
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type ProjectMemberSource = (typeof PROJECT_MEMBER_SOURCES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type RetentionDataClass = (typeof RETENTION_DATA_CLASSES)[number];
export type RetentionMode = (typeof RETENTION_MODES)[number];
export type AlertRuleKind = (typeof ALERT_RULE_KINDS)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type AlertState = (typeof ALERT_STATES)[number];
export type ControlPlaneSubject = (typeof CONTROL_PLANE_SUBJECTS)[number];
export type StorageMaintenanceSubject = (typeof STORAGE_MAINTENANCE_SUBJECTS)[number];
export type AlertEvaluatorSubject = (typeof ALERT_EVALUATOR_SUBJECTS)[number];
export type AiEvalSubject = (typeof AI_EVAL_SUBJECTS)[number];
