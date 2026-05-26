package surrealdb

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/surrealdb/surrealdb.go/pkg/models"
)

type capturedQuery struct {
	sql    string
	params map[string]any
}

func testRecordID(table string, id string) models.RecordID {
	return models.RecordID{Table: table, ID: id}
}

func TestControlPlaneStoreReadMethodsBuildBoundedQueries(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	projectID := "project-1"
	ruleID := "rule-1"
	after := "event-1"
	calls := []capturedQuery{}
	client := &Client{
		queryRowsOverride: func(_ context.Context, stmt QueryStatement) (any, error) {
			calls = append(calls, capturedQuery{sql: stmt.SQL, params: stmt.Params})
			switch {
			case strings.Contains(stmt.SQL, "FROM organization "):
				return []ports.OrganizationRecord{{ID: "org-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM membership "):
				return []ports.MembershipRecord{{OrganizationID: "org-1", UserID: "user-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM organization_invitation "):
				return []ports.InvitationRecord{{ID: "invite-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM email_delivery "):
				return []ports.EmailDeliveryRecord{{ID: "delivery-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM project "):
				return []ports.ProjectRecord{{ID: "project-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM ingest_credential "):
				return []ports.IngestCredentialRecord{{ID: "credential-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM dashboard "):
				return []dashboardRow{{ID: testRecordID("dashboard", "latency"), ProjectID: "project-1", OrganizationID: "org-1", Slug: "latency", Name: "Latency", Visibility: string(ports.DashboardVisibilityProject), DefaultTimeWindow: "1h"}}, nil
			case strings.Contains(stmt.SQL, "FROM dashboard_pin "):
				return []ports.DashboardPinRecord{{UserID: "user-1", DashboardID: "latency", ProjectID: "project-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM project_membership "):
				return []ports.ProjectMemberRecord{{ProjectID: "project-1", UserID: "user-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM ai_chat_conversation "):
				return []ports.AiChatConversationRecord{{ID: "conversation-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM ai_chat_message "):
				return []ports.AiChatMessageRecord{{ID: "message-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM ai_chat_run "):
				return []ports.AiChatRunRecord{{ID: "run-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM alert_rule "):
				return []ports.AlertRuleRecord{{ID: "rule-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM alert_silence "):
				return []ports.AlertSilenceRecord{{ID: "silence-1"}}, nil
			case strings.Contains(stmt.SQL, "FROM alert_event "):
				return []ports.AlertEventRecord{{ID: "event-1"}, {ID: "event-2"}}, nil
			default:
				t.Fatalf("unexpected query SQL: %s", stmt.SQL)
				return nil, nil
			}
		},
	}
	store := NewStore(client)

	if _, err := store.ListOrganizations(ctx); err != nil {
		t.Fatalf("ListOrganizations returned error: %v", err)
	}
	if _, err := store.ListMemberships(ctx, "org-1"); err != nil {
		t.Fatalf("ListMemberships returned error: %v", err)
	}
	if _, err := store.ListMembershipsForUser(ctx, "user-1"); err != nil {
		t.Fatalf("ListMembershipsForUser returned error: %v", err)
	}
	if _, err := store.ListInvitations(ctx, "org-1"); err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if _, err := store.ListDueEmailDeliveries(ctx, now, 0); err != nil {
		t.Fatalf("ListDueEmailDeliveries returned error: %v", err)
	}
	status := contracts.ProjectStatusActive
	if _, err := store.ListProjects(ctx, &projectID, &status); err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if _, err := store.ListIngestCredentials(ctx, projectID); err != nil {
		t.Fatalf("ListIngestCredentials returned error: %v", err)
	}
	if _, err := store.ListDashboards(ctx, projectID); err != nil {
		t.Fatalf("ListDashboards returned error: %v", err)
	}
	pins, err := store.ListDashboardPins(ctx, "user-1", projectID)
	if err != nil {
		t.Fatalf("ListDashboardPins returned error: %v", err)
	}
	if pins[0].DashboardID != "dashboard:latency" {
		t.Fatalf("dashboard pin ID = %q, want public dashboard prefix", pins[0].DashboardID)
	}
	if _, err := store.ListProjectMembers(ctx, projectID); err != nil {
		t.Fatalf("ListProjectMembers returned error: %v", err)
	}
	if _, err := store.ListAiChatConversations(ctx, "org-1", "user-1", &projectID, false, 25); err != nil {
		t.Fatalf("ListAiChatConversations returned error: %v", err)
	}
	if _, err := store.ListAiChatMessages(ctx, "conversation-1", 50); err != nil {
		t.Fatalf("ListAiChatMessages returned error: %v", err)
	}
	if _, err := store.ListActiveAiChatRunsForConversation(ctx, "conversation-1"); err != nil {
		t.Fatalf("ListActiveAiChatRunsForConversation returned error: %v", err)
	}
	if _, err := store.ListAlertRules(ctx, projectID); err != nil {
		t.Fatalf("ListAlertRules returned error: %v", err)
	}
	if _, err := store.ListAlertSilences(ctx, projectID, &ruleID); err != nil {
		t.Fatalf("ListAlertSilences returned error: %v", err)
	}
	events, hasNext, cursor, err := store.ListAlertEvents(ctx, projectID, &ruleID, 1, &after)
	if err != nil {
		t.Fatalf("ListAlertEvents returned error: %v", err)
	}
	if len(events) != 1 || !hasNext || cursor == nil || *cursor != "event-1" {
		t.Fatalf("alert event page = len:%d hasNext:%v cursor:%v", len(events), hasNext, cursor)
	}

	joined := strings.Builder{}
	for _, call := range calls {
		joined.WriteString(call.sql)
		joined.WriteByte('\n')
	}
	if strings.Contains(joined.String(), "type::thing") || strings.Contains(joined.String(), "id.id") {
		t.Fatalf("queries used stale SurrealDB syntax:\n%s", joined.String())
	}
	if got := calls[4].params["limit"]; got != 25 {
		t.Fatalf("default due email limit = %#v, want 25", got)
	}
}

func TestControlPlaneStorePointReadsPropagateRowsAndNotFound(t *testing.T) {
	ctx := context.Background()
	calls := []capturedQuery{}
	client := &Client{
		queryRowsOverride: func(_ context.Context, stmt QueryStatement) (any, error) {
			calls = append(calls, capturedQuery{sql: stmt.SQL, params: stmt.Params})
			switch {
			case strings.Contains(stmt.SQL, "WHERE in = type::record('user'"):
				return []ports.MembershipRecord{}, nil
			case strings.Contains(stmt.SQL, "type::record('user'"):
				return []ports.UserRecord{{ID: "user-1"}}, nil
			case strings.Contains(stmt.SQL, "type::record('organization'"):
				return []ports.OrganizationRecord{{ID: "org-1"}}, nil
			case strings.Contains(stmt.SQL, "type::record('project'"):
				return []ports.ProjectRecord{{ID: "project-1"}}, nil
			case strings.Contains(stmt.SQL, "type::record('organization_invitation'"):
				return []ports.InvitationRecord{{ID: "invite-1"}}, nil
			case strings.Contains(stmt.SQL, "type::record('ingest_credential'"):
				return []ports.IngestCredentialRecord{{ID: "credential-1"}}, nil
			case strings.Contains(stmt.SQL, "type::record('dashboard'"):
				return []dashboardRow{{ID: testRecordID("dashboard", "latency"), ProjectID: "project-1", OrganizationID: "org-1", Slug: "latency", Name: "Latency", Visibility: string(ports.DashboardVisibilityProject), DefaultTimeWindow: "1h"}}, nil
			case strings.Contains(stmt.SQL, "project_membership"):
				return []ports.ProjectMemberRecord{{ProjectID: "project-1", UserID: "user-1"}}, nil
			case strings.Contains(stmt.SQL, "retention_policy"):
				return []ports.RetentionPolicyRecord{{ProjectID: "project-1"}}, nil
			case strings.Contains(stmt.SQL, "project_ai_settings"):
				return []ports.ProjectAiSettingsRecord{{ProjectID: "project-1"}}, nil
			case strings.Contains(stmt.SQL, "company_ai_provider_settings"):
				return []ports.CompanyAiProviderSettingsRecord{{CompanyID: "org-1"}}, nil
			case strings.Contains(stmt.SQL, "ai_provider_secret"):
				return []ports.AiProviderSecretRecord{{ID: "secret-1"}}, nil
			case strings.Contains(stmt.SQL, "ai_chat_conversation"):
				return []ports.AiChatConversationRecord{{ID: "conversation-1"}}, nil
			case strings.Contains(stmt.SQL, "ai_chat_run WHERE conversationId"):
				return []ports.AiChatRunRecord{{ID: "run-idempotent"}}, nil
			case strings.Contains(stmt.SQL, "type::record('ai_chat_run'"):
				return []ports.AiChatRunRecord{{ID: "run-1"}}, nil
			case strings.Contains(stmt.SQL, "ai_chat_action"):
				return []ports.AiChatActionRecord{{ID: "action-1"}}, nil
			case strings.Contains(stmt.SQL, "alert_rule"):
				return []ports.AlertRuleRecord{{ID: "rule-1"}}, nil
			case strings.Contains(stmt.SQL, "alert_silence"):
				return []ports.AlertSilenceRecord{{ID: "silence-1"}}, nil
			default:
				t.Fatalf("unexpected point-read SQL: %s", stmt.SQL)
				return nil, nil
			}
		},
	}
	store := NewStore(client)

	if _, ok, err := store.GetUser(ctx, "user-1"); err != nil || !ok {
		t.Fatalf("GetUser ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetOrganization(ctx, "org-1"); err != nil || !ok {
		t.Fatalf("GetOrganization ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetMembership(ctx, "org-1", "missing-user"); err != nil || ok {
		t.Fatalf("GetMembership ok=%v err=%v, want not found", ok, err)
	}
	if _, ok, err := store.GetProject(ctx, "project-1"); err != nil || !ok {
		t.Fatalf("GetProject ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetInvitation(ctx, "invite-1"); err != nil || !ok {
		t.Fatalf("GetInvitation ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetIngestCredential(ctx, "credential-1"); err != nil || !ok {
		t.Fatalf("GetIngestCredential ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetDashboard(ctx, "dashboard:latency"); err != nil || !ok {
		t.Fatalf("GetDashboard ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetProjectMember(ctx, "project-1", "user-1"); err != nil || !ok {
		t.Fatalf("GetProjectMember ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetRetentionPolicy(ctx, "project-1"); err != nil || !ok {
		t.Fatalf("GetRetentionPolicy ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetProjectAiSettings(ctx, "project-1"); err != nil || !ok {
		t.Fatalf("GetProjectAiSettings ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetCompanyAiProviderSettings(ctx, "org-1"); err != nil || !ok {
		t.Fatalf("GetCompanyAiProviderSettings ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAiProviderSecret(ctx, "secret-1"); err != nil || !ok {
		t.Fatalf("GetAiProviderSecret ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAiChatConversation(ctx, "conversation-1"); err != nil || !ok {
		t.Fatalf("GetAiChatConversation ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAiChatRun(ctx, "run-1"); err != nil || !ok {
		t.Fatalf("GetAiChatRun ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAiChatRunByIdempotency(ctx, "conversation-1", "client-1", "key-1"); err != nil || !ok {
		t.Fatalf("GetAiChatRunByIdempotency ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAiChatAction(ctx, "action-1"); err != nil || !ok {
		t.Fatalf("GetAiChatAction ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAlertRule(ctx, "rule-1"); err != nil || !ok {
		t.Fatalf("GetAlertRule ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.GetAlertSilence(ctx, "silence-1"); err != nil || !ok {
		t.Fatalf("GetAlertSilence ok=%v err=%v", ok, err)
	}

	if len(calls) == 0 {
		t.Fatal("expected captured point-read queries")
	}
}

func TestControlPlaneStoreWritesUseParameterizedRecordOperations(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC)
	calls := []capturedQuery{}
	client := &Client{
		execOverride: func(_ context.Context, sql string, params map[string]any) error {
			calls = append(calls, capturedQuery{sql: sql, params: params})
			return nil
		},
	}
	store := NewStore(client)

	if err := store.PutUser(ctx, ports.UserRecord{ID: "user-1", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutUser returned error: %v", err)
	}
	if err := store.PutOrganization(ctx, ports.OrganizationRecord{ID: "org-1", Name: "Org", Slug: "org", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutOrganization returned error: %v", err)
	}
	if err := store.PutMembership(ctx, ports.MembershipRecord{OrganizationID: "org-1", UserID: "user-1", Role: "admin", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutMembership returned error: %v", err)
	}
	if err := store.DeleteMembership(ctx, "org-1", "user-1"); err != nil {
		t.Fatalf("DeleteMembership returned error: %v", err)
	}
	if err := store.PutInvitationAndEmailDelivery(ctx, ports.InvitationRecord{ID: "invite-1", OrganizationID: "org-1", Email: "ada@example.test", CreatedAt: now, UpdatedAt: now}, &ports.EmailDeliveryRecord{ID: "delivery-1", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutInvitationAndEmailDelivery returned error: %v", err)
	}
	if err := store.PutInvitation(ctx, ports.InvitationRecord{ID: "invite-2", OrganizationID: "org-1", Email: "grace@example.test", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutInvitation returned error: %v", err)
	}
	if err := store.PutEmailDelivery(ctx, ports.EmailDeliveryRecord{ID: "delivery-2", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutEmailDelivery returned error: %v", err)
	}
	if err := store.PutProject(ctx, ports.ProjectRecord{ID: "project-1", OrganizationID: "org-1", Name: "Project", Slug: "project", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutProject returned error: %v", err)
	}
	if err := store.PutIngestCredential(ctx, ports.IngestCredentialRecord{ID: "credential-1", ProjectID: "project-1", SecretHash: "hash", CreatedAt: now, CreatedByUser: "user-1"}); err != nil {
		t.Fatalf("PutIngestCredential returned error: %v", err)
	}
	if err := store.PutDashboard(ctx, ports.DashboardRecord{ID: "dashboard:latency", ProjectID: "project-1", OrganizationID: "org-1", Slug: "latency", Name: "Latency", Visibility: ports.DashboardVisibilityProject, DefaultTimeWindow: "1h", Widgets: []byte(`[]`), CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutDashboard returned error: %v", err)
	}
	if err := store.DeleteDashboard(ctx, "dashboard:latency"); err != nil {
		t.Fatalf("DeleteDashboard returned error: %v", err)
	}
	if err := store.PutDashboardPin(ctx, ports.DashboardPinRecord{UserID: "user-1", DashboardID: "dashboard:latency", ProjectID: "project-1", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutDashboardPin returned error: %v", err)
	}
	if err := store.DeleteDashboardPin(ctx, "user-1", "project-1", "dashboard:latency"); err != nil {
		t.Fatalf("DeleteDashboardPin returned error: %v", err)
	}
	if err := store.DeleteDashboardPinsForDashboard(ctx, "dashboard:latency"); err != nil {
		t.Fatalf("DeleteDashboardPinsForDashboard returned error: %v", err)
	}
	if err := store.DeleteAiChatConversation(ctx, "conversation-1"); err != nil {
		t.Fatalf("DeleteAiChatConversation returned error: %v", err)
	}
	if err := store.PutProjectMember(ctx, ports.ProjectMemberRecord{ProjectID: "project-1", UserID: "user-1", Role: contracts.ProjectRoleViewer, CreatedAt: now, CreatedByUserID: "admin-1", UpdatedAt: now, UpdatedByUserID: "admin-1"}); err != nil {
		t.Fatalf("PutProjectMember returned error: %v", err)
	}
	if err := store.DeleteProjectMember(ctx, "project-1", "user-1"); err != nil {
		t.Fatalf("DeleteProjectMember returned error: %v", err)
	}
	if err := store.DeleteProjectMembershipsForUserInOrganization(ctx, "org-1", "user-1"); err != nil {
		t.Fatalf("DeleteProjectMembershipsForUserInOrganization returned error: %v", err)
	}
	if err := store.PutRetentionPolicy(ctx, ports.RetentionPolicyRecord{ProjectID: "project-1", UpdatedAt: now, UpdatedByUserID: "admin-1", Version: 1}); err != nil {
		t.Fatalf("PutRetentionPolicy returned error: %v", err)
	}
	if err := store.PutProjectAiSettings(ctx, ports.ProjectAiSettingsRecord{ProjectID: "project-1", UpdatedAt: now, UpdatedByUserID: "admin-1", Version: 1}); err != nil {
		t.Fatalf("PutProjectAiSettings returned error: %v", err)
	}
	if err := store.PutCompanyAiProviderSettings(ctx, ports.CompanyAiProviderSettingsRecord{CompanyID: "org-1", UpdatedAt: now, UpdatedByUserID: "admin-1", Version: 1}); err != nil {
		t.Fatalf("PutCompanyAiProviderSettings returned error: %v", err)
	}
	if err := store.PutAiProviderSecret(ctx, ports.AiProviderSecretRecord{ID: "secret-1", CompanyID: "org-1", ProviderID: "openai", CreatedAt: now, UpdatedAt: now, UpdatedByUserID: "admin-1"}); err != nil {
		t.Fatalf("PutAiProviderSecret returned error: %v", err)
	}
	if err := store.PutAiChatConversation(ctx, ports.AiChatConversationRecord{ID: "conversation-1", CompanyID: "org-1", ProjectID: "project-1", UserID: "user-1", Title: "Chat", CreatedAt: now, UpdatedAt: now, LastMessageAt: now}); err != nil {
		t.Fatalf("PutAiChatConversation returned error: %v", err)
	}
	if err := store.PutAiChatMessage(ctx, ports.AiChatMessageRecord{ID: "message-1", ConversationID: "conversation-1", RunID: "run-1", Role: "user", CreatedAt: now}); err != nil {
		t.Fatalf("PutAiChatMessage returned error: %v", err)
	}
	if err := store.PutAiChatRun(ctx, ports.AiChatRunRecord{ID: "run-1", ConversationID: "conversation-1", ProjectID: "project-1", UserID: "user-1", UserMessageClientID: "client-1", IdempotencyKey: "key-1", StartedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutAiChatRun returned error: %v", err)
	}
	if err := store.PutAiChatAction(ctx, ports.AiChatActionRecord{ID: "action-1", ConversationID: "conversation-1", RunID: "run-1", ProjectID: "project-1", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutAiChatAction returned error: %v", err)
	}
	if err := store.PutAiChatCompaction(ctx, ports.AiChatCompactionRecord{ID: "compaction-1", ConversationID: "conversation-1", CreatedAt: now}); err != nil {
		t.Fatalf("PutAiChatCompaction returned error: %v", err)
	}
	if err := store.PutAlertRule(ctx, ports.AlertRuleRecord{ID: "rule-1", ProjectID: "project-1", Name: "Rule", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatalf("PutAlertRule returned error: %v", err)
	}
	if err := store.PutAlertSilence(ctx, ports.AlertSilenceRecord{ID: "silence-1", ProjectID: "project-1", RuleID: "rule-1", CreatedAt: now}); err != nil {
		t.Fatalf("PutAlertSilence returned error: %v", err)
	}
	if err := store.PutAlertEvent(ctx, ports.AlertEventRecord{ID: "event-1", ProjectID: "project-1", RuleID: "rule-1", CreatedAt: now}); err != nil {
		t.Fatalf("PutAlertEvent returned error: %v", err)
	}
	if err := store.DeleteAlertRule(ctx, "rule-1"); err != nil {
		t.Fatalf("DeleteAlertRule returned error: %v", err)
	}
	if err := store.DeleteAlertSilence(ctx, "silence-1"); err != nil {
		t.Fatalf("DeleteAlertSilence returned error: %v", err)
	}

	joined := strings.Builder{}
	for _, call := range calls {
		joined.WriteString(call.sql)
		joined.WriteByte('\n')
	}
	sql := joined.String()
	for _, want := range []string{"UPSERT type::record($table, $id)", "RELATE (type::record($inTable, $inId))", "DELETE type::record($table, $id)"} {
		if !strings.Contains(sql, want) {
			t.Fatalf("captured SQL missing %q in:\n%s", want, sql)
		}
	}
	if calls[0].params["id"] != "user-1" {
		t.Fatalf("PutUser id param = %#v, want user-1", calls[0].params["id"])
	}
}

func TestControlPlaneClientHelpersAndStoreErrorBranches(t *testing.T) {
	if (Config{Username: "user", Password: "pass"}).HasCredentials() != true {
		t.Fatal("HasCredentials returned false for username/password")
	}
	if (Config{Username: "user"}).HasCredentials() {
		t.Fatal("HasCredentials returned true without password")
	}
	if got := SDKEndpointURL(" http://localhost:8000/rpc "); got != "ws://localhost:8000/rpc" {
		t.Fatalf("SDKEndpointURL(http) = %q", got)
	}
	if got := SDKEndpointURL("https://surreal.example/rpc"); got != "wss://surreal.example/rpc" {
		t.Fatalf("SDKEndpointURL(https) = %q", got)
	}
	if !IsControlPlaneNamespace("cloudgrid_control", "control") || IsControlPlaneNamespace("telemetry", "dev") {
		t.Fatal("IsControlPlaneNamespace did not classify control-plane namespace")
	}

	client := &Client{
		execOverride: func(context.Context, string, map[string]any) error {
			return errors.New("provider failure")
		},
		queryRowsOverride: func(context.Context, QueryStatement) (any, error) {
			return nil, errors.New("provider failure")
		},
		queryOneOverride: func(context.Context, string, map[string]any) (any, error) {
			return DatabaseInfo{}, errors.New("provider failure")
		},
	}
	if err := client.ApplySchema(context.Background()); err == nil {
		t.Fatal("ApplySchema error = nil, want provider failure")
	}
	if err := client.CheckReadiness(context.Background()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("CheckReadiness error = %v, want storage unavailable", err)
	}
	if _, err := queryRows[ports.UserRecord](context.Background(), client, QueryStatement{SQL: "SELECT * FROM user"}); err == nil {
		t.Fatal("queryRows error = nil, want provider failure")
	}
	var zero struct{}
	if _, err := queryRows[ports.UserRecord](context.Background(), &Client{queryRowsOverride: func(context.Context, QueryStatement) (any, error) { return zero, nil }}, QueryStatement{}); err == nil {
		t.Fatal("queryRows type mismatch error = nil")
	}
}
