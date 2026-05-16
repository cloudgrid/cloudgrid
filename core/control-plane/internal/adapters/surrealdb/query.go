package surrealdb

import (
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type QueryStatement struct {
	SQL    string
	Params map[string]any
}

func BuildSchemaStatements() []string {
	return []string{
		"DEFINE TABLE organization SCHEMAFULL;",
		"DEFINE FIELD name ON organization TYPE string;",
		"DEFINE FIELD slug ON organization TYPE string;",
		"DEFINE FIELD createdAt ON organization TYPE datetime;",
		"DEFINE FIELD updatedAt ON organization TYPE datetime;",
		"DEFINE INDEX organization_slug ON organization FIELDS slug UNIQUE;",
		"DEFINE TABLE user SCHEMAFULL;",
		"DEFINE FIELD displayName ON user TYPE option<string>;",
		"DEFINE FIELD email ON user TYPE option<string>;",
		"DEFINE FIELD createdAt ON user TYPE datetime;",
		"DEFINE FIELD updatedAt ON user TYPE datetime;",
		"DEFINE TABLE project SCHEMAFULL;",
		"DEFINE FIELD organizationId ON project TYPE string;",
		"DEFINE FIELD name ON project TYPE string;",
		"DEFINE FIELD slug ON project TYPE string;",
		"DEFINE FIELD status ON project TYPE string;",
		"DEFINE FIELD changedAt ON project TYPE datetime;",
		"DEFINE FIELD createdAt ON project TYPE datetime;",
		"DEFINE FIELD updatedAt ON project TYPE datetime;",
		"DEFINE INDEX project_organization_slug ON project FIELDS organizationId, slug UNIQUE;",
		"DEFINE INDEX project_organization_status ON project FIELDS organizationId, status;",
		"DEFINE TABLE membership TYPE RELATION IN user OUT organization SCHEMAFULL;",
		"DEFINE FIELD role ON membership TYPE string;",
		"DEFINE FIELD createdAt ON membership TYPE datetime;",
		"DEFINE FIELD updatedAt ON membership TYPE datetime;",
		"DEFINE INDEX membership_organization_role ON membership FIELDS out, role;",
		"DEFINE TABLE organization_invitation SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD organizationId ON organization_invitation TYPE string;",
		"DEFINE FIELD email ON organization_invitation TYPE string;",
		"DEFINE FIELD role ON organization_invitation TYPE string;",
		"DEFINE FIELD status ON organization_invitation TYPE string;",
		"DEFINE FIELD invitedByUserId ON organization_invitation TYPE string;",
		"DEFINE FIELD acceptedByUserId ON organization_invitation TYPE option<string>;",
		"DEFINE FIELD createdAt ON organization_invitation TYPE datetime;",
		"DEFINE FIELD updatedAt ON organization_invitation TYPE datetime;",
		"DEFINE FIELD acceptedAt ON organization_invitation TYPE option<datetime>;",
		"DEFINE FIELD revokedAt ON organization_invitation TYPE option<datetime>;",
		"DEFINE FIELD expiresAt ON organization_invitation TYPE option<datetime>;",
		"DEFINE INDEX organization_invitation_org_status ON organization_invitation FIELDS organizationId, status;",
		"DEFINE INDEX organization_invitation_email_status ON organization_invitation FIELDS organizationId, email, status;",
		"DEFINE TABLE owns_project TYPE RELATION IN organization OUT project SCHEMAFULL;",
		"DEFINE FIELD createdAt ON owns_project TYPE datetime;",
		"DEFINE TABLE ingest_credential SCHEMAFULL;",
		"DEFINE FIELD projectId ON ingest_credential TYPE string;",
		"DEFINE FIELD secretHash ON ingest_credential TYPE string;",
		"DEFINE FIELD displayName ON ingest_credential TYPE option<string>;",
		"DEFINE FIELD disabledAt ON ingest_credential TYPE option<datetime>;",
		"DEFINE FIELD lastUsedAt ON ingest_credential TYPE option<datetime>;",
		"DEFINE FIELD createdAt ON ingest_credential TYPE datetime;",
		"DEFINE INDEX ingest_credential_project ON ingest_credential FIELDS projectId;",
		"DEFINE TABLE dashboard SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON dashboard TYPE string;",
		"DEFINE FIELD organizationId ON dashboard TYPE string;",
		"DEFINE FIELD slug ON dashboard TYPE string;",
		"DEFINE FIELD name ON dashboard TYPE string;",
		"DEFINE FIELD description ON dashboard TYPE option<string>;",
		"DEFINE FIELD tags ON dashboard TYPE array<string>;",
		"DEFINE FIELD version ON dashboard TYPE int;",
		"DEFINE FIELD visibility ON dashboard TYPE string;",
		"DEFINE FIELD defaultTimeWindow ON dashboard TYPE string;",
		"DEFINE FIELD ownerUserId ON dashboard TYPE option<string>;",
		"DEFINE FIELD widgets ON dashboard TYPE array<object>;",
		"DEFINE FIELD searchText ON dashboard TYPE string;",
		"DEFINE FIELD createdAt ON dashboard TYPE datetime;",
		"DEFINE FIELD updatedAt ON dashboard TYPE datetime;",
		"DEFINE FIELD createdBy ON dashboard TYPE option<string>;",
		"DEFINE FIELD updatedBy ON dashboard TYPE option<string>;",
		"DEFINE INDEX dashboard_project ON dashboard FIELDS projectId;",
		"DEFINE INDEX dashboard_project_visibility ON dashboard FIELDS projectId, visibility;",
		"DEFINE INDEX dashboard_project_visibility_owner_slug ON dashboard FIELDS projectId, visibility, ownerUserId, slug UNIQUE;",
		"DEFINE INDEX dashboard_project_search ON dashboard FIELDS projectId, searchText;",
		"DEFINE INDEX dashboard_project_updated ON dashboard FIELDS projectId, updatedAt;",
		"DEFINE TABLE dashboard_pin TYPE RELATION IN user OUT dashboard SCHEMAFULL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON dashboard_pin TYPE string;",
		"DEFINE FIELD position ON dashboard_pin TYPE int;",
		"DEFINE FIELD createdAt ON dashboard_pin TYPE datetime;",
		"DEFINE FIELD updatedAt ON dashboard_pin TYPE datetime;",
		"DEFINE INDEX dashboard_pin_user_project_position ON dashboard_pin FIELDS in, projectId, position;",
		"DEFINE INDEX dashboard_pin_user_dashboard_project ON dashboard_pin FIELDS in, out, projectId UNIQUE;",
		"DEFINE TABLE project_membership SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON project_membership TYPE string;",
		"DEFINE FIELD userId ON project_membership TYPE string;",
		"DEFINE FIELD role ON project_membership TYPE string;",
		"DEFINE FIELD createdAt ON project_membership TYPE datetime;",
		"DEFINE FIELD createdByUserId ON project_membership TYPE string;",
		"DEFINE FIELD updatedAt ON project_membership TYPE datetime;",
		"DEFINE FIELD updatedByUserId ON project_membership TYPE string;",
		"DEFINE INDEX project_membership_project_user ON project_membership FIELDS projectId, userId UNIQUE;",
		"DEFINE INDEX project_membership_user ON project_membership FIELDS userId;",
		"DEFINE TABLE retention_policy SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON retention_policy TYPE string;",
		"DEFINE FIELD rules ON retention_policy TYPE array<object>;",
		"DEFINE FIELD updatedAt ON retention_policy TYPE datetime;",
		"DEFINE FIELD updatedByUserId ON retention_policy TYPE string;",
		"DEFINE FIELD version ON retention_policy TYPE int;",
		"DEFINE INDEX retention_policy_project ON retention_policy FIELDS projectId UNIQUE;",
		"DEFINE TABLE alert_rule SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON alert_rule TYPE string;",
		"DEFINE FIELD name ON alert_rule TYPE string;",
		"DEFINE FIELD enabled ON alert_rule TYPE bool;",
		"DEFINE FIELD kind ON alert_rule TYPE string;",
		"DEFINE FIELD severity ON alert_rule TYPE string;",
		"DEFINE FIELD query ON alert_rule TYPE object;",
		"DEFINE FIELD condition ON alert_rule TYPE object;",
		"DEFINE FIELD evaluationWindowSeconds ON alert_rule TYPE int;",
		"DEFINE FIELD pendingForSeconds ON alert_rule TYPE int;",
		"DEFINE FIELD cooldownSeconds ON alert_rule TYPE int;",
		"DEFINE FIELD notificationAdapterIds ON alert_rule TYPE array<string>;",
		"DEFINE FIELD createdAt ON alert_rule TYPE datetime;",
		"DEFINE FIELD updatedAt ON alert_rule TYPE datetime;",
		"DEFINE FIELD updatedByUserId ON alert_rule TYPE string;",
		"DEFINE FIELD version ON alert_rule TYPE int;",
		"DEFINE INDEX alert_rule_project ON alert_rule FIELDS projectId;",
		"DEFINE TABLE alert_silence SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON alert_silence TYPE string;",
		"DEFINE FIELD ruleId ON alert_silence TYPE string;",
		"DEFINE FIELD reason ON alert_silence TYPE string;",
		"DEFINE FIELD startsAt ON alert_silence TYPE datetime;",
		"DEFINE FIELD endsAt ON alert_silence TYPE datetime;",
		"DEFINE FIELD createdAt ON alert_silence TYPE datetime;",
		"DEFINE FIELD createdByUserId ON alert_silence TYPE string;",
		"DEFINE INDEX alert_silence_project_rule ON alert_silence FIELDS projectId, ruleId;",
		"DEFINE TABLE alert_event SCHEMAFULL TYPE NORMAL PERMISSIONS NONE;",
		"DEFINE FIELD projectId ON alert_event TYPE string;",
		"DEFINE FIELD ruleId ON alert_event TYPE string;",
		"DEFINE FIELD instanceId ON alert_event TYPE string;",
		"DEFINE FIELD state ON alert_event TYPE string;",
		"DEFINE FIELD severity ON alert_event TYPE string;",
		"DEFINE FIELD summary ON alert_event TYPE string;",
		"DEFINE FIELD deduplicationKey ON alert_event TYPE string;",
		"DEFINE FIELD startedAt ON alert_event TYPE datetime;",
		"DEFINE FIELD endedAt ON alert_event TYPE option<datetime>;",
		"DEFINE FIELD createdAt ON alert_event TYPE datetime;",
		"DEFINE FIELD evidenceTraceId ON alert_event TYPE option<string>;",
		"DEFINE FIELD evidenceSpanId ON alert_event TYPE option<string>;",
		"DEFINE FIELD evidenceLogId ON alert_event TYPE option<string>;",
		"DEFINE FIELD evidenceMetricName ON alert_event TYPE option<string>;",
		"DEFINE INDEX alert_event_project_rule_created ON alert_event FIELDS projectId, ruleId, createdAt;",
		"DEFINE TABLE project_status_event SCHEMAFULL;",
		"DEFINE FIELD companyId ON project_status_event TYPE string;",
		"DEFINE FIELD projectId ON project_status_event TYPE string;",
		"DEFINE FIELD status ON project_status_event TYPE string;",
		"DEFINE FIELD changedAt ON project_status_event TYPE datetime;",
		"DEFINE INDEX project_status_event_project_changed ON project_status_event FIELDS companyId, projectId, changedAt;",
	}
}

func BuildProjectListQuery(organizationID string, status *contracts.ProjectStatus) (QueryStatement, error) {
	params := map[string]any{}
	conditions := []string{}
	if strings.TrimSpace(organizationID) != "" {
		conditions = append(conditions, "organizationId = $organizationId")
		params["organizationId"] = strings.TrimSpace(organizationID)
	}
	if status != nil {
		conditions = append(conditions, "status = $status")
		params["status"] = string(*status)
	}
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT id, organizationId, name, slug, status, changedAt, createdAt, updatedAt",
			"FROM project",
			whereClause(conditions),
			"ORDER BY name ASC, id ASC;",
		}, " "),
		Params: params,
	}, nil
}

func BuildOrganizationForUserQuery(userID string) QueryStatement {
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT out.id AS id, out.name AS name, out.slug AS slug, role",
			"FROM membership",
			"WHERE in = type::thing('user', $userId)",
			"ORDER BY out.name ASC;",
		}, " "),
		Params: map[string]any{"userId": strings.TrimSpace(userID)},
	}
}

func BuildMembershipAdminCountQuery(organizationID string, excludedUserID string) QueryStatement {
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT count() AS count",
			"FROM membership",
			"WHERE out = type::thing('organization', $organizationId)",
			"AND role = 'admin'",
			"AND in != type::thing('user', $excludedUserId)",
			"GROUP ALL;",
		}, " "),
		Params: map[string]any{
			"organizationId": strings.TrimSpace(organizationID),
			"excludedUserId": strings.TrimSpace(excludedUserID),
		},
	}
}

func BuildProjectStatusSnapshotQuery(companyID string, projectID string) QueryStatement {
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT organizationId AS companyId, id AS projectId, status, changedAt",
			"FROM project",
			"WHERE organizationId = $companyId AND id = $projectId",
			"LIMIT 1;",
		}, " "),
		Params: map[string]any{
			"companyId": strings.TrimSpace(companyID),
			"projectId": strings.TrimSpace(projectID),
		},
	}
}

func whereClause(conditions []string) string {
	if len(conditions) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(conditions, " AND ")
}
