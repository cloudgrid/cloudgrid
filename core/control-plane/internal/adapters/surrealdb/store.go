package surrealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/surrealdb/surrealdb.go/pkg/models"
)

type Store struct {
	client *Client
}

func NewStore(client *Client) *Store {
	return &Store{client: client}
}

func (store *Store) GetUser(ctx context.Context, userID string) (ports.UserRecord, bool, error) {
	return queryRecord[ports.UserRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('user', $id) LIMIT 1;", map[string]any{"id": userID})
}

func (store *Store) PutUser(ctx context.Context, user ports.UserRecord) error {
	return store.put(ctx, "user", user.ID, user)
}

func (store *Store) GetOrganization(ctx context.Context, organizationID string) (ports.OrganizationRecord, bool, error) {
	return queryRecord[ports.OrganizationRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('organization', $id) LIMIT 1;", map[string]any{"id": organizationID})
}

func (store *Store) PutOrganization(ctx context.Context, organization ports.OrganizationRecord) error {
	return store.put(ctx, "organization", organization.ID, organization)
}

func (store *Store) ListOrganizations(ctx context.Context) ([]ports.OrganizationRecord, error) {
	return queryRows[ports.OrganizationRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM organization ORDER BY ID ASC;", Params: nil})
}

func (store *Store) GetMembership(ctx context.Context, organizationID string, userID string) (ports.MembershipRecord, bool, error) {
	return queryRecord[ports.MembershipRecord](ctx, store.client, "SELECT record::id(in) AS userId, record::id(out) AS organizationId, role, createdAt, updatedAt FROM membership WHERE in = type::record('user', $userId) AND out = type::record('organization', $organizationId) LIMIT 1;", map[string]any{"organizationId": organizationID, "userId": userID})
}

func (store *Store) PutMembership(ctx context.Context, membership ports.MembershipRecord) error {
	return store.relate(ctx, "user", membership.UserID, "membership", "organization", membership.OrganizationID, membership)
}

func (store *Store) DeleteMembership(ctx context.Context, organizationID string, userID string) error {
	return store.client.exec(ctx, "DELETE membership WHERE in = type::record('user', $userId) AND out = type::record('organization', $organizationId);", map[string]any{"organizationId": organizationID, "userId": userID})
}

func (store *Store) ListMemberships(ctx context.Context, organizationID string) ([]ports.MembershipRecord, error) {
	return queryRows[ports.MembershipRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(in) AS userId, record::id(out) AS organizationId, role, createdAt, updatedAt FROM membership WHERE out = type::record('organization', $organizationId) ORDER BY userId ASC;", Params: map[string]any{"organizationId": organizationID}})
}

func (store *Store) ListMembershipsForUser(ctx context.Context, userID string) ([]ports.MembershipRecord, error) {
	return queryRows[ports.MembershipRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(in) AS userId, record::id(out) AS organizationId, role, createdAt, updatedAt FROM membership WHERE in = type::record('user', $userId) ORDER BY organizationId ASC;", Params: map[string]any{"userId": userID}})
}

func (store *Store) GetInvitation(ctx context.Context, invitationID string) (ports.InvitationRecord, bool, error) {
	return queryRecord[ports.InvitationRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('organization_invitation', $id) LIMIT 1;", map[string]any{"id": invitationID})
}

func (store *Store) PutInvitation(ctx context.Context, invitation ports.InvitationRecord) error {
	return store.put(ctx, "organization_invitation", invitation.ID, invitation)
}

func (store *Store) PutInvitationAndEmailDelivery(ctx context.Context, invitation ports.InvitationRecord, delivery *ports.EmailDeliveryRecord) error {
	if delivery == nil {
		return store.PutInvitation(ctx, invitation)
	}
	invitationPayload, err := recordMap(invitation, "ID")
	if err != nil {
		return err
	}
	deliveryPayload, err := recordMap(*delivery, "ID")
	if err != nil {
		return err
	}
	return store.client.exec(ctx, strings.Join([]string{
		"BEGIN TRANSACTION;",
		"UPSERT type::record('organization_invitation', $invitationId) CONTENT $invitation;",
		"UPSERT type::record('email_delivery', $deliveryId) CONTENT $delivery;",
		"COMMIT TRANSACTION;",
	}, " "), map[string]any{
		"invitationId": recordKey("organization_invitation", invitation.ID),
		"deliveryId":   recordKey("email_delivery", delivery.ID),
		"invitation":   invitationPayload,
		"delivery":     deliveryPayload,
	})
}

func (store *Store) ListInvitations(ctx context.Context, organizationID string) ([]ports.InvitationRecord, error) {
	return queryRows[ports.InvitationRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM organization_invitation WHERE organizationId = $organizationId ORDER BY createdAt ASC, ID ASC;", Params: map[string]any{"organizationId": organizationID}})
}

func (store *Store) GetPendingInvitationByEmail(ctx context.Context, organizationID string, email string) (ports.InvitationRecord, bool, error) {
	return queryRecord[ports.InvitationRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM organization_invitation WHERE organizationId = $organizationId AND email = $email AND status = $status LIMIT 1;", map[string]any{"organizationId": organizationID, "email": email, "status": string(contracts.OrganizationInvitationStatusPending)})
}

func (store *Store) PutEmailDelivery(ctx context.Context, delivery ports.EmailDeliveryRecord) error {
	return store.put(ctx, "email_delivery", delivery.ID, delivery)
}

func (store *Store) ListDueEmailDeliveries(ctx context.Context, now time.Time, limit int) ([]ports.EmailDeliveryRecord, error) {
	if limit <= 0 {
		limit = 25
	}
	return queryRows[ports.EmailDeliveryRecord](ctx, store.client, QueryStatement{
		SQL: strings.Join([]string{
			"SELECT record::id(id) AS ID, * FROM email_delivery",
			"WHERE status IN $statuses",
			"AND (nextAttemptAt = NONE OR nextAttemptAt <= $now)",
			"ORDER BY nextAttemptAt ASC, createdAt ASC, ID ASC",
			"LIMIT $limit;",
		}, " "),
		Params: map[string]any{
			"statuses": []string{
				string(ports.EmailDeliveryStatusPending),
				string(ports.EmailDeliveryStatusFailedRetryable),
			},
			"now":   now,
			"limit": limit,
		},
	})
}

func (store *Store) GetProject(ctx context.Context, projectID string) (ports.ProjectRecord, bool, error) {
	return queryRecord[ports.ProjectRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('project', $id) LIMIT 1;", map[string]any{"id": projectID})
}

func (store *Store) PutProject(ctx context.Context, project ports.ProjectRecord) error {
	return store.put(ctx, "project", project.ID, project)
}

func (store *Store) ListProjects(ctx context.Context, organizationID *string, status *contracts.ProjectStatus) ([]ports.ProjectRecord, error) {
	stmt, err := BuildProjectListQuery(pointerString(organizationID), status)
	if err != nil {
		return nil, err
	}
	return queryRows[ports.ProjectRecord](ctx, store.client, stmt)
}

func (store *Store) GetIngestCredential(ctx context.Context, credentialID string) (ports.IngestCredentialRecord, bool, error) {
	return queryRecord[ports.IngestCredentialRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('ingest_credential', $id) LIMIT 1;", map[string]any{"id": credentialID})
}

func (store *Store) PutIngestCredential(ctx context.Context, credential ports.IngestCredentialRecord) error {
	return store.put(ctx, "ingest_credential", credential.ID, credential)
}

func (store *Store) ListIngestCredentials(ctx context.Context, projectID string) ([]ports.IngestCredentialRecord, error) {
	return queryRows[ports.IngestCredentialRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM ingest_credential WHERE projectId = $projectId ORDER BY createdAt DESC, ID ASC;", Params: map[string]any{"projectId": projectID}})
}

func (store *Store) GetDashboard(ctx context.Context, dashboardID string) (ports.DashboardRecord, bool, error) {
	rows, err := queryRows[dashboardRow](ctx, store.client, QueryStatement{SQL: "SELECT * FROM type::record('dashboard', $id) LIMIT 1;", Params: map[string]any{"id": recordKey("dashboard", dashboardID)}})
	if err != nil || len(rows) == 0 {
		return ports.DashboardRecord{}, false, err
	}
	return rows[0].record()
}

func (store *Store) PutDashboard(ctx context.Context, dashboard ports.DashboardRecord) error {
	row, err := dashboardPayload(dashboard)
	if err != nil {
		return err
	}
	return store.put(ctx, "dashboard", dashboard.ID, row)
}

func (store *Store) DeleteDashboard(ctx context.Context, dashboardID string) error {
	if err := store.DeleteDashboardPinsForDashboard(ctx, dashboardID); err != nil {
		return err
	}
	return store.delete(ctx, "dashboard", dashboardID)
}

func (store *Store) ListDashboards(ctx context.Context, projectID string) ([]ports.DashboardRecord, error) {
	rows, err := queryRows[dashboardRow](ctx, store.client, QueryStatement{SQL: "SELECT * FROM dashboard WHERE projectId = $projectId ORDER BY name ASC, ID ASC;", Params: map[string]any{"projectId": projectID}})
	if err != nil {
		return nil, err
	}
	return dashboardRecords(rows)
}

func (store *Store) ListDashboardPins(ctx context.Context, userID string, projectID string) ([]ports.DashboardPinRecord, error) {
	pins, err := queryRows[ports.DashboardPinRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(in) AS userId, projectId, record::id(out) AS dashboardId, position, createdAt, updatedAt FROM dashboard_pin WHERE in = type::record('user', $userId) AND projectId = $projectId ORDER BY position ASC, dashboardId ASC;", Params: map[string]any{"userId": userID, "projectId": projectID}})
	if err != nil {
		return nil, err
	}
	for index := range pins {
		pins[index].DashboardID = publicDashboardID(pins[index].DashboardID)
	}
	return pins, nil
}

func (store *Store) PutDashboardPin(ctx context.Context, pin ports.DashboardPinRecord) error {
	return store.relate(ctx, "user", pin.UserID, "dashboard_pin", "dashboard", pin.DashboardID, pin)
}

func (store *Store) DeleteDashboardPin(ctx context.Context, userID string, projectID string, dashboardID string) error {
	return store.client.exec(ctx, "DELETE dashboard_pin WHERE in = type::record('user', $userId) AND out = type::record('dashboard', $dashboardId) AND projectId = $projectId;", map[string]any{"userId": userID, "projectId": projectID, "dashboardId": recordKey("dashboard", dashboardID)})
}

func (store *Store) DeleteDashboardPinsForDashboard(ctx context.Context, dashboardID string) error {
	return store.client.exec(ctx, "DELETE dashboard_pin WHERE out = type::record('dashboard', $dashboardId);", map[string]any{"dashboardId": recordKey("dashboard", dashboardID)})
}

func (store *Store) GetProjectMember(ctx context.Context, projectID string, userID string) (ports.ProjectMemberRecord, bool, error) {
	return queryRecord[ports.ProjectMemberRecord](ctx, store.client, "SELECT * FROM project_membership WHERE projectId = $projectId AND userId = $userId LIMIT 1;", map[string]any{"projectId": projectID, "userId": userID})
}

func (store *Store) PutProjectMember(ctx context.Context, member ports.ProjectMemberRecord) error {
	return store.put(ctx, "project_membership", compoundID(member.ProjectID, member.UserID), member)
}

func (store *Store) DeleteProjectMember(ctx context.Context, projectID string, userID string) error {
	return store.client.exec(ctx, "DELETE project_membership WHERE projectId = $projectId AND userId = $userId;", map[string]any{"projectId": projectID, "userId": userID})
}

func (store *Store) DeleteProjectMembershipsForUserInOrganization(ctx context.Context, organizationID string, userID string) error {
	return store.client.exec(ctx, "DELETE project_membership WHERE userId = $userId AND projectId IN (SELECT VALUE record::id(id) FROM project WHERE organizationId = $organizationId);", map[string]any{"organizationId": organizationID, "userId": userID})
}

func (store *Store) ListProjectMembers(ctx context.Context, projectID string) ([]ports.ProjectMemberRecord, error) {
	return queryRows[ports.ProjectMemberRecord](ctx, store.client, QueryStatement{SQL: "SELECT * FROM project_membership WHERE projectId = $projectId ORDER BY userId ASC;", Params: map[string]any{"projectId": projectID}})
}

func (store *Store) GetRetentionPolicy(ctx context.Context, projectID string) (ports.RetentionPolicyRecord, bool, error) {
	return queryRecord[ports.RetentionPolicyRecord](ctx, store.client, "SELECT * FROM retention_policy WHERE projectId = $projectId LIMIT 1;", map[string]any{"projectId": projectID})
}

func (store *Store) PutRetentionPolicy(ctx context.Context, policy ports.RetentionPolicyRecord) error {
	return store.put(ctx, "retention_policy", policy.ProjectID, policy)
}

func (store *Store) GetProjectAiSettings(ctx context.Context, projectID string) (ports.ProjectAiSettingsRecord, bool, error) {
	return queryRecord[ports.ProjectAiSettingsRecord](ctx, store.client, "SELECT * FROM project_ai_settings WHERE projectId = $projectId LIMIT 1;", map[string]any{"projectId": projectID})
}

func (store *Store) PutProjectAiSettings(ctx context.Context, settings ports.ProjectAiSettingsRecord) error {
	return store.put(ctx, "project_ai_settings", settings.ProjectID, settings)
}

func (store *Store) GetCompanyAiProviderSettings(ctx context.Context, companyID string) (ports.CompanyAiProviderSettingsRecord, bool, error) {
	return queryRecord[ports.CompanyAiProviderSettingsRecord](ctx, store.client, "SELECT * FROM company_ai_provider_settings WHERE companyId = $companyId LIMIT 1;", map[string]any{"companyId": companyID})
}

func (store *Store) PutCompanyAiProviderSettings(ctx context.Context, settings ports.CompanyAiProviderSettingsRecord) error {
	return store.put(ctx, "company_ai_provider_settings", settings.CompanyID, settings)
}

func (store *Store) GetAiProviderSecret(ctx context.Context, secretID string) (ports.AiProviderSecretRecord, bool, error) {
	return queryRecord[ports.AiProviderSecretRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('ai_provider_secret', $id) LIMIT 1;", map[string]any{"id": recordKey("ai_provider_secret", secretID)})
}

func (store *Store) PutAiProviderSecret(ctx context.Context, secret ports.AiProviderSecretRecord) error {
	return store.put(ctx, "ai_provider_secret", secret.ID, secret)
}

func (store *Store) GetAiChatConversation(ctx context.Context, conversationID string) (ports.AiChatConversationRecord, bool, error) {
	return queryRecord[ports.AiChatConversationRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('ai_chat_conversation', $id) LIMIT 1;", map[string]any{"id": recordKey("ai_chat_conversation", conversationID)})
}

func (store *Store) ListAiChatConversations(ctx context.Context, companyID string, userID string, projectID *string, includeArchived bool, limit int) ([]ports.AiChatConversationRecord, error) {
	conditions := []string{"companyId = $companyId", "userId = $userId"}
	params := map[string]any{"companyId": companyID, "userId": userID, "limit": limit}
	if projectID != nil {
		conditions = append(conditions, "projectId = $projectId")
		params["projectId"] = *projectID
	}
	if !includeArchived {
		conditions = append(conditions, "status != 'archived'")
	}
	return queryRows[ports.AiChatConversationRecord](ctx, store.client, QueryStatement{
		SQL:    "SELECT record::id(id) AS ID, * FROM ai_chat_conversation WHERE " + strings.Join(conditions, " AND ") + " ORDER BY lastMessageAt DESC, ID ASC LIMIT $limit;",
		Params: params,
	})
}

func (store *Store) PutAiChatConversation(ctx context.Context, conversation ports.AiChatConversationRecord) error {
	return store.put(ctx, "ai_chat_conversation", conversation.ID, conversation)
}

func (store *Store) DeleteAiChatConversation(ctx context.Context, conversationID string) error {
	params := map[string]any{"conversationId": conversationID, "conversationRecord": recordKey("ai_chat_conversation", conversationID)}
	return store.client.exec(ctx, strings.Join([]string{
		"DELETE FROM ai_chat_message WHERE conversationId = $conversationId;",
		"DELETE FROM ai_chat_run WHERE conversationId = $conversationId;",
		"DELETE FROM ai_chat_action WHERE conversationId = $conversationId;",
		"DELETE FROM ai_chat_compaction WHERE conversationId = $conversationId;",
		"DELETE type::record('ai_chat_conversation', $conversationRecord);",
	}, " "), params)
}

func (store *Store) PutAiChatMessage(ctx context.Context, message ports.AiChatMessageRecord) error {
	return store.put(ctx, "ai_chat_message", message.ID, message)
}

func (store *Store) ListAiChatMessages(ctx context.Context, conversationID string, limit int) ([]ports.AiChatMessageRecord, error) {
	return queryRows[ports.AiChatMessageRecord](ctx, store.client, QueryStatement{
		SQL:    "SELECT record::id(id) AS ID, * FROM ai_chat_message WHERE conversationId = $conversationId ORDER BY createdAt ASC, ID ASC LIMIT $limit;",
		Params: map[string]any{"conversationId": conversationID, "limit": limit},
	})
}

func (store *Store) GetAiChatRun(ctx context.Context, runID string) (ports.AiChatRunRecord, bool, error) {
	return queryRecord[ports.AiChatRunRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('ai_chat_run', $id) LIMIT 1;", map[string]any{"id": recordKey("ai_chat_run", runID)})
}

func (store *Store) GetAiChatRunByIdempotency(ctx context.Context, conversationID string, userMessageClientID string, idempotencyKey string) (ports.AiChatRunRecord, bool, error) {
	return queryRecord[ports.AiChatRunRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM ai_chat_run WHERE conversationId = $conversationId AND userMessageClientId = $userMessageClientId AND idempotencyKey = $idempotencyKey ORDER BY startedAt DESC LIMIT 1;", map[string]any{"conversationId": conversationID, "userMessageClientId": userMessageClientID, "idempotencyKey": idempotencyKey})
}

func (store *Store) ListActiveAiChatRunsForConversation(ctx context.Context, conversationID string) ([]ports.AiChatRunRecord, error) {
	return queryRows[ports.AiChatRunRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM ai_chat_run WHERE conversationId = $conversationId AND status IN ['queued', 'streaming', 'awaiting_approval'] ORDER BY startedAt ASC;", Params: map[string]any{"conversationId": conversationID}})
}

func (store *Store) PutAiChatRun(ctx context.Context, run ports.AiChatRunRecord) error {
	return store.put(ctx, "ai_chat_run", run.ID, run)
}

func (store *Store) GetAiChatAction(ctx context.Context, actionID string) (ports.AiChatActionRecord, bool, error) {
	return queryRecord[ports.AiChatActionRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('ai_chat_action', $id) LIMIT 1;", map[string]any{"id": recordKey("ai_chat_action", actionID)})
}

func (store *Store) PutAiChatAction(ctx context.Context, action ports.AiChatActionRecord) error {
	return store.put(ctx, "ai_chat_action", action.ID, action)
}

func (store *Store) PutAiChatCompaction(ctx context.Context, compaction ports.AiChatCompactionRecord) error {
	return store.put(ctx, "ai_chat_compaction", compaction.ID, compaction)
}

func (store *Store) GetAlertRule(ctx context.Context, id string) (ports.AlertRuleRecord, bool, error) {
	return queryRecord[ports.AlertRuleRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('alert_rule', $id) LIMIT 1;", map[string]any{"id": id})
}

func (store *Store) PutAlertRule(ctx context.Context, rule ports.AlertRuleRecord) error {
	return store.put(ctx, "alert_rule", rule.ID, rule)
}

func (store *Store) DeleteAlertRule(ctx context.Context, id string) error {
	return store.delete(ctx, "alert_rule", id)
}

func (store *Store) ListAlertRules(ctx context.Context, projectID string) ([]ports.AlertRuleRecord, error) {
	return queryRows[ports.AlertRuleRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM alert_rule WHERE projectId = $projectId ORDER BY name ASC, ID ASC;", Params: map[string]any{"projectId": projectID}})
}

func (store *Store) GetAlertSilence(ctx context.Context, id string) (ports.AlertSilenceRecord, bool, error) {
	return queryRecord[ports.AlertSilenceRecord](ctx, store.client, "SELECT record::id(id) AS ID, * FROM type::record('alert_silence', $id) LIMIT 1;", map[string]any{"id": id})
}

func (store *Store) PutAlertSilence(ctx context.Context, silence ports.AlertSilenceRecord) error {
	return store.put(ctx, "alert_silence", silence.ID, silence)
}

func (store *Store) DeleteAlertSilence(ctx context.Context, id string) error {
	return store.delete(ctx, "alert_silence", id)
}

func (store *Store) ListAlertSilences(ctx context.Context, projectID string, ruleID *string) ([]ports.AlertSilenceRecord, error) {
	conditions := []string{"projectId = $projectId"}
	params := map[string]any{"projectId": projectID}
	if ruleID != nil {
		conditions = append(conditions, "ruleId = $ruleId")
		params["ruleId"] = *ruleID
	}
	return queryRows[ports.AlertSilenceRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM alert_silence WHERE " + strings.Join(conditions, " AND ") + " ORDER BY startsAt ASC, ID ASC;", Params: params})
}

func (store *Store) PutAlertEvent(ctx context.Context, event ports.AlertEventRecord) error {
	return store.put(ctx, "alert_event", event.ID, event)
}

func (store *Store) ListAlertEvents(ctx context.Context, projectID string, ruleID *string, first int, after *string) ([]ports.AlertEventRecord, bool, *string, error) {
	if first < 1 {
		first = 50
	}
	params := map[string]any{"projectId": projectID, "limit": first + 1}
	conditions := []string{"projectId = $projectId"}
	if ruleID != nil {
		conditions = append(conditions, "ruleId = $ruleId")
		params["ruleId"] = *ruleID
	}
	if after != nil && strings.TrimSpace(*after) != "" {
		conditions = append(conditions, "record::id(id) > $after")
		params["after"] = *after
	}
	rows, err := queryRows[ports.AlertEventRecord](ctx, store.client, QueryStatement{SQL: "SELECT record::id(id) AS ID, * FROM alert_event WHERE " + strings.Join(conditions, " AND ") + " ORDER BY createdAt DESC, ID ASC LIMIT $limit;", Params: params})
	if err != nil {
		return nil, false, nil, err
	}
	hasNext := len(rows) > first
	if hasNext {
		rows = rows[:first]
	}
	var cursor *string
	if hasNext && len(rows) > 0 {
		cursor = &rows[len(rows)-1].ID
	}
	return rows, hasNext, cursor, nil
}

func (store *Store) put(ctx context.Context, table string, id string, record any) error {
	payload, err := recordMap(record, "ID")
	if err != nil {
		return err
	}
	return store.client.exec(ctx, "UPSERT type::record($table, $id) CONTENT $record;", map[string]any{"table": table, "id": recordKey(table, id), "record": payload})
}

func (store *Store) delete(ctx context.Context, table string, id string) error {
	return store.client.exec(ctx, "DELETE type::record($table, $id);", map[string]any{"table": table, "id": recordKey(table, id)})
}

func (store *Store) relate(ctx context.Context, inTable string, inID string, relation string, outTable string, outID string, record any) error {
	if err := store.client.exec(ctx, "DELETE type::table($relation) WHERE in = type::record($inTable, $inId) AND out = type::record($outTable, $outId);", map[string]any{"relation": relation, "inTable": inTable, "inId": recordKey(inTable, inID), "outTable": outTable, "outId": recordKey(outTable, outID)}); err != nil {
		return err
	}
	omit := []string{"ID"}
	switch relation {
	case "membership":
		omit = append(omit, "UserID", "OrganizationID")
	case "dashboard_pin":
		omit = append(omit, "UserID", "DashboardID")
	}
	payload, err := recordMap(record, omit...)
	if err != nil {
		return err
	}
	return store.client.exec(ctx, "RELATE (type::record($inTable, $inId))->(type::table($relation))->(type::record($outTable, $outId)) CONTENT $record;", map[string]any{"relation": relation, "inTable": inTable, "inId": recordKey(inTable, inID), "outTable": outTable, "outId": recordKey(outTable, outID), "record": payload})
}

func queryRecord[T any](ctx context.Context, client *Client, sql string, params map[string]any) (T, bool, error) {
	rows, err := queryRows[T](ctx, client, QueryStatement{SQL: sql, Params: params})
	var zero T
	if err != nil || len(rows) == 0 {
		return zero, false, err
	}
	return rows[0], true, nil
}

type dashboardRow struct {
	ID                models.RecordID  `json:"id"`
	ProjectID         string           `json:"projectId"`
	OrganizationID    string           `json:"organizationId"`
	Slug              string           `json:"slug"`
	Name              string           `json:"name"`
	Description       *string          `json:"description"`
	Tags              []string         `json:"tags"`
	Version           int              `json:"version"`
	Visibility        string           `json:"visibility"`
	DefaultTimeWindow string           `json:"defaultTimeWindow"`
	OwnerUserID       *string          `json:"ownerUserId"`
	Widgets           []map[string]any `json:"widgets"`
	CreatedAt         time.Time        `json:"createdAt"`
	UpdatedAt         time.Time        `json:"updatedAt"`
	CreatedBy         *string          `json:"createdBy"`
	UpdatedBy         *string          `json:"updatedBy"`
}

type dashboardPayloadRecord = ports.DashboardRecord

type dashboardPayloadShape struct {
	ProjectID         string                    `json:"projectId"`
	OrganizationID    string                    `json:"organizationId"`
	Slug              string                    `json:"slug"`
	Name              string                    `json:"name"`
	Description       *string                   `json:"description"`
	Tags              []string                  `json:"tags"`
	Version           int                       `json:"version"`
	Visibility        ports.DashboardVisibility `json:"visibility"`
	DefaultTimeWindow string                    `json:"defaultTimeWindow"`
	OwnerUserID       *string                   `json:"ownerUserId"`
	Widgets           []map[string]any          `json:"widgets"`
	SearchText        string                    `json:"searchText"`
	CreatedAt         any                       `json:"createdAt"`
	UpdatedAt         any                       `json:"updatedAt"`
	CreatedBy         *string                   `json:"createdBy"`
	UpdatedBy         *string                   `json:"updatedBy"`
}

func dashboardPayload(dashboard ports.DashboardRecord) (dashboardPayloadShape, error) {
	widgets := []map[string]any{}
	if len(dashboard.Widgets) > 0 {
		if err := json.Unmarshal(dashboard.Widgets, &widgets); err != nil {
			return dashboardPayloadShape{}, err
		}
	}
	return dashboardPayloadShape{
		ProjectID:         dashboard.ProjectID,
		OrganizationID:    dashboard.OrganizationID,
		Slug:              dashboard.Slug,
		Name:              dashboard.Name,
		Description:       dashboard.Description,
		Tags:              dashboard.Tags,
		Version:           dashboard.Version,
		Visibility:        dashboard.Visibility,
		DefaultTimeWindow: dashboard.DefaultTimeWindow,
		OwnerUserID:       dashboard.OwnerUserID,
		Widgets:           widgets,
		SearchText:        strings.ToLower(strings.Join(append([]string{dashboard.Name, dashboard.Slug, pointerString(dashboard.Description)}, dashboard.Tags...), " ")),
		CreatedAt:         dashboard.CreatedAt,
		UpdatedAt:         dashboard.UpdatedAt,
		CreatedBy:         dashboard.CreatedBy,
		UpdatedBy:         dashboard.UpdatedBy,
	}, nil
}

func (row dashboardRow) record() (ports.DashboardRecord, bool, error) {
	widgets := []byte("[]")
	if row.Widgets != nil {
		encoded, err := json.Marshal(row.Widgets)
		if err != nil {
			return ports.DashboardRecord{}, false, err
		}
		widgets = encoded
	}
	return ports.DashboardRecord{
		ID:                publicDashboardID(recordID(row.ID)),
		ProjectID:         row.ProjectID,
		OrganizationID:    row.OrganizationID,
		Slug:              row.Slug,
		Name:              row.Name,
		Description:       row.Description,
		Tags:              row.Tags,
		Version:           row.Version,
		Visibility:        ports.DashboardVisibility(row.Visibility),
		DefaultTimeWindow: row.DefaultTimeWindow,
		OwnerUserID:       row.OwnerUserID,
		Widgets:           widgets,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
		CreatedBy:         row.CreatedBy,
		UpdatedBy:         row.UpdatedBy,
	}, true, nil
}

func dashboardRecords(rows []dashboardRow) ([]ports.DashboardRecord, error) {
	records := make([]ports.DashboardRecord, 0, len(rows))
	for _, row := range rows {
		record, _, err := row.record()
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].Name == records[j].Name {
			return records[i].ID < records[j].ID
		}
		return records[i].Name < records[j].Name
	})
	return records, nil
}

func recordID(id models.RecordID) string {
	if value, ok := id.ID.(string); ok {
		return value
	}
	return fmt.Sprint(id.ID)
}

func recordKey(table string, id string) string {
	return strings.TrimPrefix(strings.TrimSpace(id), table+":")
}

func publicDashboardID(id string) string {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" || strings.HasPrefix(trimmed, "dashboard:") || strings.HasPrefix(trimmed, "builtin-") {
		return trimmed
	}
	return "dashboard:" + trimmed
}

func pointerString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func compoundID(left string, right string) string {
	return strings.NewReplacer("/", "_", ":", "_", " ", "_").Replace(left + "_" + right)
}

func recordMap(record any, omitFields ...string) (map[string]any, error) {
	value := reflect.ValueOf(record)
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil, fmt.Errorf("nil record")
		}
		value = value.Elem()
	}
	if value.Kind() == reflect.Map {
		result := map[string]any{}
		iter := value.MapRange()
		for iter.Next() {
			key, ok := iter.Key().Interface().(string)
			if !ok {
				return nil, fmt.Errorf("record map key must be string")
			}
			normalized := normalizeValue(iter.Value())
			if normalized == nil {
				continue
			}
			result[key] = normalized
		}
		return result, nil
	}
	if value.Kind() != reflect.Struct {
		return nil, fmt.Errorf("record must be a struct or map")
	}
	omit := map[string]struct{}{}
	for _, field := range omitFields {
		omit[field] = struct{}{}
	}
	output := map[string]any{}
	recordType := value.Type()
	for index := 0; index < value.NumField(); index++ {
		field := recordType.Field(index)
		if field.PkgPath != "" {
			continue
		}
		if _, skip := omit[field.Name]; skip {
			continue
		}
		normalized := normalizeValue(value.Field(index))
		if normalized == nil {
			continue
		}
		output[surrealFieldName(field.Name)] = normalized
	}
	return output, nil
}

func normalizeValue(value reflect.Value) any {
	if !value.IsValid() {
		return nil
	}
	if value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return nil
		}
		return normalizeValue(value.Elem())
	}
	if value.Type().PkgPath() == "time" && value.Type().Name() == "Time" {
		return value.Interface()
	}
	switch value.Kind() {
	case reflect.Struct:
		mapped, err := recordMap(value.Interface())
		if err != nil {
			return value.Interface()
		}
		return mapped
	case reflect.Slice, reflect.Array:
		items := make([]any, 0, value.Len())
		for index := 0; index < value.Len(); index++ {
			items = append(items, normalizeValue(value.Index(index)))
		}
		return items
	case reflect.Map:
		if value.Type().Key().Kind() != reflect.String {
			return value.Interface()
		}
		output := map[string]any{}
		iter := value.MapRange()
		for iter.Next() {
			normalized := normalizeValue(iter.Value())
			if normalized == nil {
				continue
			}
			output[iter.Key().String()] = normalized
		}
		return output
	default:
		return value.Interface()
	}
}

func surrealFieldName(name string) string {
	name = strings.ReplaceAll(name, "ID", "Id")
	name = strings.ReplaceAll(name, "USD", "Usd")
	if name == "" {
		return ""
	}
	return strings.ToLower(name[:1]) + name[1:]
}
