package internal

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestDashboardValidationBranchMatrix(t *testing.T) {
	blank := " "
	minW := 7
	minH := 5
	badDurationMin := 30.0
	badDurationMax := 10.0

	cases := []struct {
		name  string
		input DashboardSaveInput
	}{
		{
			name: "blank default time window",
			input: DashboardSaveInput{
				Name:              "Blank Window",
				DefaultTimeWindow: &blank,
				Widgets:           []DashboardWidgetInput{validDashboardMetricWidget()},
			},
		},
		{
			name: "duplicate widget ids",
			input: DashboardSaveInput{
				Name: "Duplicate Widgets",
				Widgets: []DashboardWidgetInput{
					validDashboardMetricWidget(),
					{
						ID:     "w-latency",
						Title:  "Logs",
						Kind:   DashboardWidgetKindLogTable,
						Layout: DashboardWidgetLayoutInput{X: 6, Y: 0, W: 6, H: 4},
						Logs:   &DashboardLogWidgetInput{},
					},
				},
			},
		},
		{
			name: "minimum width larger than layout",
			input: DashboardSaveInput{
				Name: "Bad Min Width",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-minw",
					Title:  "Latency",
					Kind:   DashboardWidgetKindMetricTimeseries,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4, MinW: &minW},
					Metric: validDashboardMetricWidget().Metric,
				}},
			},
		},
		{
			name: "minimum height larger than layout",
			input: DashboardSaveInput{
				Name: "Bad Min Height",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-minh",
					Title:  "Latency",
					Kind:   DashboardWidgetKindMetricTimeseries,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4, MinH: &minH},
					Metric: validDashboardMetricWidget().Metric,
				}},
			},
		},
		{
			name: "invalid widget kind",
			input: DashboardSaveInput{
				Name: "Bad Kind",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-kind",
					Title:  "Latency",
					Kind:   DashboardWidgetKind("unknown"),
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
				}},
			},
		},
		{
			name: "log limit",
			input: DashboardSaveInput{
				Name: "Bad Log Limit",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-logs",
					Title:  "Logs",
					Kind:   DashboardWidgetKindLogTable,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
					Logs:   &DashboardLogWidgetInput{Limit: ptr(201)},
				}},
			},
		},
		{
			name: "trace duration bounds",
			input: DashboardSaveInput{
				Name: "Bad Trace Bounds",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-traces",
					Title:  "Traces",
					Kind:   DashboardWidgetKindTraceTable,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
					Traces: &DashboardTraceWidgetInput{MinDurationMs: &badDurationMin, MaxDurationMs: &badDurationMax},
				}},
			},
		},
		{
			name: "live trace duration bounds",
			input: DashboardSaveInput{
				Name: "Bad Live Bounds",
				Widgets: []DashboardWidgetInput{{
					ID:         "w-live",
					Title:      "Live",
					Kind:       DashboardWidgetKindLiveTraceTable,
					Layout:     DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
					LiveTraces: &DashboardLiveTraceWidgetInput{MinDurationMs: &badDurationMin, MaxDurationMs: &badDurationMax},
				}},
			},
		},
		{
			name: "alert state",
			input: DashboardSaveInput{
				Name: "Bad Alert",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-alert",
					Title:  "Alerts",
					Kind:   DashboardWidgetKindAlertStatus,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
					Alert:  &DashboardAlertWidgetInput{States: []contracts.AlertState{contracts.AlertState("unknown")}},
				}},
			},
		},
		{
			name: "threshold severity",
			input: DashboardSaveInput{
				Name: "Bad Threshold",
				Widgets: []DashboardWidgetInput{{
					ID:     "w-threshold",
					Title:  "Latency",
					Kind:   DashboardWidgetKindMetricTimeseries,
					Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
					Metric: &DashboardMetricWidgetInput{
						MetricName:    "http.server.request.duration",
						Aggregation:   contracts.MetricAggregationP95,
						Visualization: contracts.MetricChartTypeLine,
						Thresholds:    []DashboardThresholdInput{{Value: 100, Severity: DashboardThresholdSeverity("critical")}},
					},
				}},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateDashboardInput(tc.input); !isValidation(err) {
				t.Fatalf("validateDashboardInput error = %v, want validation", err)
			}
		})
	}
}

func TestDashboardSaveNormalizesTableAndAlertWidgets(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	projectID := LocalProjectID
	admin := localEnvelope("req-dashboard-normalize", "admin-1", &projectID)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	saved, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Tables and alerts",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets: []DashboardWidgetInput{
				{ID: "w-logs", Title: "Logs", Kind: DashboardWidgetKindLogTable, Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4}, Logs: &DashboardLogWidgetInput{}},
				{ID: "w-traces", Title: "Traces", Kind: DashboardWidgetKindTraceTable, Layout: DashboardWidgetLayoutInput{X: 6, Y: 0, W: 6, H: 4}, Traces: &DashboardTraceWidgetInput{}},
				{ID: "w-live", Title: "Live", Kind: DashboardWidgetKindLiveTraceTable, Layout: DashboardWidgetLayoutInput{X: 0, Y: 4, W: 6, H: 4}, LiveTraces: &DashboardLiveTraceWidgetInput{}},
				{ID: "w-alert", Title: "Alerts", Kind: DashboardWidgetKindAlertHistory, Layout: DashboardWidgetLayoutInput{X: 6, Y: 4, W: 6, H: 4}, Alert: &DashboardAlertWidgetInput{}},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveDashboard returned error: %v", err)
	}
	if saved.Widgets[0].Logs.Sort == nil || *saved.Widgets[0].Logs.Sort != contracts.LogSortTimestampDesc || *saved.Widgets[0].Logs.Limit != 50 {
		t.Fatalf("log widget = %#v, want default sort and limit", saved.Widgets[0].Logs)
	}
	if saved.Widgets[1].Traces.Sort == nil || *saved.Widgets[1].Traces.Sort != contracts.TraceSortStartedAtDesc || *saved.Widgets[1].Traces.Limit != 50 {
		t.Fatalf("trace widget = %#v, want default sort and limit", saved.Widgets[1].Traces)
	}
	if saved.Widgets[2].LiveTraces.Limit == nil || *saved.Widgets[2].LiveTraces.Limit != 50 {
		t.Fatalf("live trace widget = %#v, want default limit", saved.Widgets[2].LiveTraces)
	}
	if saved.Widgets[3].Alert.TimeWindow == nil || *saved.Widgets[3].Alert.TimeWindow != "PT1H" || *saved.Widgets[3].Alert.Limit != 20 {
		t.Fatalf("alert widget = %#v, want default window and limit", saved.Widgets[3].Alert)
	}
}

func TestAiProviderSettingsValidationAndSecretResolveBranches(t *testing.T) {
	store := newTestStore()
	service := NewServiceWithOptions(store, fixedNow, ServiceOptions{SecretStore: newTestSecretStore()})
	ctx := context.Background()
	admin := localEnvelope("req-ai-provider-branches", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	if _, err := service.UpdateCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProviderProfile: map[string]any{
			"id":              "company-chat",
			"providerKind":    "openai",
			"baseUrl":         "https://api.example.test",
			"credentialValue": "sk-company",
		},
		ChatModelAlias:  map[string]any{"providerProfileId": "company-chat", "model": "gpt-5-mini"},
		ExpectedVersion: 1,
	}); !isValidation(err) {
		t.Fatalf("UpdateCompanyAiProviderSettings openai baseUrl error = %v, want validation", err)
	}

	if _, err := service.UpdateProjectAiProviderSettings(ctx, contracts.ProjectAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		ProviderProfiles: []map[string]any{
			{"id": "provider-1", "providerKind": "openai", "credentialValue": "sk-one"},
			{"id": "provider-1", "providerKind": "openai", "credentialValue": "sk-two"},
		},
		ExpectedVersion: 1,
	}); !isValidation(err) {
		t.Fatalf("UpdateProjectAiProviderSettings duplicate profiles error = %v, want validation", err)
	}

	if _, err := service.ResolveAiProviderSecret(ctx, contracts.AiProviderSecretResolveRequest{
		BridgeEnvelope: admin,
		CredentialRef:  "env:OPENAI_API_KEY",
	}); !isValidation(err) {
		t.Fatalf("ResolveAiProviderSecret env ref error = %v, want validation", err)
	}
	if _, err := service.ResolveAiProviderSecret(ctx, contracts.AiProviderSecretResolveRequest{
		BridgeEnvelope: admin,
		CredentialRef:  "managed:team/local/provider-1",
	}); !isValidation(err) {
		t.Fatalf("ResolveAiProviderSecret bad scope error = %v, want validation", err)
	}
	if _, err := service.ResolveAiProviderSecret(ctx, contracts.AiProviderSecretResolveRequest{
		BridgeEnvelope: admin,
		CredentialRef:  "managed:company/local/missing",
	}); !isValidation(err) {
		t.Fatalf("ResolveAiProviderSecret missing secret error = %v, want validation", err)
	}

}

func TestPureHelperBranchMatrix(t *testing.T) {
	if !sameOptionalString(nil, nil) {
		t.Fatal("sameOptionalString(nil,nil) = false")
	}
	left := "left"
	right := "right"
	if sameOptionalString(&left, &right) {
		t.Fatal("sameOptionalString(left,right) = true")
	}
	if !hasDashboardTag([]string{" BuiltIn ", "latency"}, "builtin") {
		t.Fatal("hasDashboardTag did not normalize case and spaces")
	}
	if optionalString(nil) != "" || optionalString(&left) != "left" {
		t.Fatal("optionalString returned unexpected value")
	}
	if got := stringSliceFromAny([]any{" a ", 12, "", "b"}); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("stringSliceFromAny() = %#v", got)
	}

	known := map[string]struct{}{"a": {}, "b": {}}
	ref := "a"
	value := 2.0
	operator := contracts.DashboardMetricFormulaBinaryOperatorAdd
	ratio := contracts.DashboardMetricFormulaFunctionRatio
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref}, known, 1); err != nil {
		t.Fatalf("valid ref formula error = %v", err)
	}
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindNumber, Value: &value}, known, 1); err != nil {
		t.Fatalf("valid number formula error = %v", err)
	}
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{
		Kind:     contracts.DashboardMetricFormulaExpressionKindBinary,
		Operator: &operator,
		Left:     &DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref},
		Right:    &DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindNumber, Value: &value},
	}, known, 1); err != nil {
		t.Fatalf("valid binary formula error = %v", err)
	}
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{
		Kind:      contracts.DashboardMetricFormulaExpressionKindFunction,
		Function:  &ratio,
		Arguments: []DashboardMetricFormulaExpressionInput{{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref}, {Kind: contracts.DashboardMetricFormulaExpressionKindNumber, Value: &value}},
	}, known, 1); err != nil {
		t.Fatalf("valid ratio formula error = %v", err)
	}
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{
		Kind:      contracts.DashboardMetricFormulaExpressionKindFunction,
		Function:  &ratio,
		Arguments: []DashboardMetricFormulaExpressionInput{{Kind: contracts.DashboardMetricFormulaExpressionKindRef, RefID: &ref}},
	}, known, 1); !isValidation(err) {
		t.Fatalf("invalid ratio formula error = %v, want validation", err)
	}
	if err := validateDashboardMetricFormulaExpression(DashboardMetricFormulaExpressionInput{Kind: contracts.DashboardMetricFormulaExpressionKindUnary}, known, 1); !isValidation(err) {
		t.Fatalf("unary formula error = %v, want validation", err)
	}

	if err := validateDashboardAlertWidget(DashboardAlertWidgetInput{
		RuleIDs:    []string{"rule-1"},
		States:     []contracts.AlertState{contracts.AlertStateOK},
		Severities: []contracts.AlertSeverity{contracts.AlertSeverityCritical},
		Signals:    []contracts.AlertSignal{contracts.AlertSignalMetric},
		Limit:      ptr(10),
		TimeWindow: ptr("PT1H"),
	}); err != nil {
		t.Fatalf("valid alert widget error = %v", err)
	}
	if err := validateDashboardThreshold(DashboardThresholdInput{Severity: DashboardThresholdSeverityWarning}); err != nil {
		t.Fatalf("valid threshold error = %v", err)
	}
	if err := validateRetentionRules(validRetentionRules()); err != nil {
		t.Fatalf("valid retention rules error = %v", err)
	}
	if err := validateRetentionRules([]contracts.RetentionRuleInput{{DataClass: contracts.RetentionDataClassTraces, Mode: contracts.RetentionModeRetain}}); !isForbidden(err) {
		t.Fatalf("incomplete retention rules error = %v, want forbidden", err)
	}
	if err := validateProjectRole(contracts.ProjectRoleEditor); err != nil {
		t.Fatalf("valid project role error = %v", err)
	}
	if err := validateProjectStatus(contracts.ProjectStatusReadOnly); err != nil {
		t.Fatalf("valid project status error = %v", err)
	}
	if !isLocalPersonalProject(LocalProjectID, LocalCompanyID, localUserID) {
		t.Fatal("local personal project was not recognized")
	}

	alertRule := ports.AlertRuleRecord{
		ProjectID:               LocalProjectID,
		Name:                    "Latency",
		Kind:                    contracts.AlertRuleKindTraceLatency,
		Severity:                contracts.AlertSeverityCritical,
		Query:                   map[string]any{"service": "api"},
		Condition:               map[string]any{"operator": "GT", "threshold": 1000},
		EvaluationWindowSeconds: 60,
		PendingForSeconds:       0,
		CooldownSeconds:         30,
	}
	if err := validateAlertRuleRecord(alertRule); err != nil {
		t.Fatalf("valid alert rule error = %v", err)
	}
	alertRule.Kind = contracts.AlertRuleKindMetricAbsence
	alertRule.Condition = map[string]any{"maxAllowedCount": 0}
	if err := validateAlertRuleRecord(alertRule); err != nil {
		t.Fatalf("valid absence alert rule error = %v", err)
	}
	alertRule.Kind = contracts.AlertRuleKindLogMatch
	alertRule.Condition = map[string]any{"minCount": 1}
	if err := validateAlertRuleRecord(alertRule); err != nil {
		t.Fatalf("valid match alert rule error = %v", err)
	}
	alertRule.Condition = map[string]any{"minCount": 1.5}
	if err := validateAlertRuleRecord(alertRule); !isAlertRuleInvalid(err) {
		t.Fatalf("invalid match alert rule error = %v, want alert rule invalid", err)
	}
	if err := validateAlertEvent(contracts.AlertEvent{
		ID:               "event-1",
		ProjectID:        LocalProjectID,
		RuleID:           "rule-1",
		InstanceID:       "instance-1",
		State:            contracts.AlertStateFiring,
		Severity:         contracts.AlertSeverityCritical,
		Summary:          "Latency is high",
		DeduplicationKey: "latency/api",
	}); err != nil {
		t.Fatalf("valid alert event error = %v", err)
	}
	if !containsSecretKey("Authorization", "Bearer secret") ||
		!containsSecretKey("", map[string]any{"nested": map[string]any{"x-api-key": "secret"}}) ||
		!containsSecretKey("", []any{map[string]any{"password": "secret"}}) {
		t.Fatal("containsSecretKey missed secret-looking data")
	}
	if containsSecretKey("service.name", "api") {
		t.Fatal("containsSecretKey flagged safe service data")
	}

	now := fixedNow()
	message := contractAiChatMessage(ports.AiChatMessageRecord{
		ID:             "message-1",
		ConversationID: "conversation-1",
		Role:           "assistant",
		Parts:          []map[string]any{{"type": "text", "text": "hello"}},
		CreatedAt:      now,
	})
	if message["id"] != "message-1" || len(message["parts"].([]any)) != 1 {
		t.Fatalf("contractAiChatMessage = %#v", message)
	}
	action := contractAiChatAction(ports.AiChatActionRecord{
		ID:               "action-1",
		ConversationID:   "conversation-1",
		RunID:            "run-1",
		ProjectID:        LocalProjectID,
		Risk:             contracts.AiChatActionRiskLow,
		Status:           contracts.AiChatActionStatusProposed,
		ActionKind:       "create_dashboard",
		InputPreview:     map[string]any{"name": "Latency"},
		RequiresApproval: true,
		CreatedAt:        now,
		UpdatedAt:        now,
	})
	if action["risk"] != string(contracts.AiChatActionRiskLow) || action["requiresApproval"] != true {
		t.Fatalf("contractAiChatAction = %#v", action)
	}
	compaction := contractAiChatCompaction(ports.AiChatCompactionRecord{
		ID:                 "compaction-1",
		ConversationID:     "conversation-1",
		SourceMessageCount: 2,
		Summary:            "summary",
		RetainedMessageIDs: []string{"message-1"},
		ArtifactSummaries:  []string{"artifact"},
		PendingActionIDs:   []string{"action-1"},
		TokenCount:         100,
		CreatedAt:          now,
	})
	if compaction["summary"] != "summary" || compaction["tokenCount"] != 100 {
		t.Fatalf("contractAiChatCompaction = %#v", compaction)
	}
}

func validRetentionRules() []contracts.RetentionRuleInput {
	rules := make([]contracts.RetentionRuleInput, 0, len(retentionDataClasses()))
	for _, dataClass := range retentionDataClasses() {
		rules = append(rules, contracts.RetentionRuleInput{
			DataClass: dataClass,
			Mode:      contracts.RetentionModeRetain,
		})
	}
	return rules
}

func TestAiChatNotFoundAndStateErrorBranches(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	projectID := LocalProjectID
	admin := localEnvelope("req-ai-chat-branches", "admin-1", &projectID)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	if _, err := service.ArchiveAiChatConversation(ctx, contracts.AiChatConversationArchiveRequest{
		BridgeEnvelope:  admin,
		ConversationID:  "missing-chat",
		UserID:          "admin-1",
		ExpectedVersion: 1,
	}); !isNotFound(err) {
		t.Fatalf("ArchiveAiChatConversation missing error = %v, want not found", err)
	}
	if _, err := service.DeleteAiChatConversation(ctx, contracts.AiChatConversationDeleteRequest{
		BridgeEnvelope: admin,
		ConversationID: "missing-chat",
		UserID:         "admin-1",
	}); !isNotFound(err) {
		t.Fatalf("DeleteAiChatConversation missing error = %v, want not found", err)
	}
	if _, err := service.AppendAiChatMessage(ctx, contracts.AiChatMessageAppendRequest{
		BridgeEnvelope: admin,
		ConversationID: "missing-chat",
		RunID:          "run-1",
		Role:           "assistant",
		Parts:          []map[string]any{{"type": "text", "text": "hello"}},
	}); !isNotFound(err) {
		t.Fatalf("AppendAiChatMessage missing error = %v, want not found", err)
	}

	store.aiChatConversations["chat-1"] = ports.AiChatConversationRecord{
		ID:            "chat-1",
		CompanyID:     LocalCompanyID,
		ProjectID:     LocalProjectID,
		UserID:        "admin-1",
		Title:         "Chat",
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: fixedNow(),
		LastRunStatus: string(contracts.AiChatRunStatusIdle),
		CreatedAt:     fixedNow(),
		UpdatedAt:     fixedNow(),
		Version:       1,
	}
	store.aiChatRuns["run-active"] = ports.AiChatRunRecord{
		ID:                  "run-active",
		ConversationID:      "chat-1",
		ProjectID:           LocalProjectID,
		UserID:              "admin-1",
		UserMessageClientID: "msg-1",
		IdempotencyKey:      "key-1",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-5-mini",
		Status:              contracts.AiChatRunStatusStreaming,
		StartedAt:           fixedNow(),
		UpdatedAt:           fixedNow(),
	}
	if _, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      admin,
		ConversationID:      "chat-1",
		ProjectID:           LocalProjectID,
		UserID:              "admin-1",
		UserMessageClientID: "msg-2",
		IdempotencyKey:      "key-2",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-5-mini",
	}); !isAiChatLimit(err) {
		t.Fatalf("CreateAiChatRun active run error = %v, want AI_CHAT_LIMIT_EXCEEDED", err)
	}
}

func TestMembershipProjectInvitationAndBridgeErrorBranches(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-membership-branches", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	if _, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Name:           " ",
		Slug:           "branch",
	}); !isValidation(err) {
		t.Fatalf("CreateProject blank name error = %v, want validation", err)
	}
	if _, err := service.UpdateProject(ctx, contracts.ProjectUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Status:         ptr(contracts.ProjectStatus("paused")),
	}); !isValidation(err) {
		t.Fatalf("UpdateProject bad status error = %v, want validation", err)
	}
	if _, err := service.UpdateMember(ctx, contracts.MemberUpdateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-1",
		Role:           contracts.CompanyRole("owner"),
	}); !isValidation(err) {
		t.Fatalf("UpdateMember bad role error = %v, want validation", err)
	}
	if _, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "admin-1",
		Role:           contracts.ProjectRole("maintainer"),
	}); !isValidation(err) {
		t.Fatalf("UpdateProjectMember bad role error = %v, want validation", err)
	}
	if _, err := service.CreateProjectInvitation(ctx, contracts.ProjectInvitationCreateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Email:          "not-an-email",
		Role:           contracts.ProjectRoleViewer,
	}); !isValidation(err) {
		t.Fatalf("CreateProjectInvitation bad email error = %v, want validation", err)
	}

	if got := BridgeErrorFromError(nil); got.ID != "" || got.Code != "" {
		t.Fatalf("BridgeErrorFromError(nil) = %#v, want zero value", got)
	}
	if got := BridgeErrorFromError(notFoundError("AI Chat run")); got.ID != "ERR-004" || got.Code != "TRACE_NOT_FOUND" {
		t.Fatalf("BridgeErrorFromError(not found) = %#v, want ERR-004", got)
	}
	if got := BridgeErrorFromError(storageError()); got.ID != "ERR-006" || got.Code != "STORAGE_UNAVAILABLE" || !got.Retryable {
		t.Fatalf("BridgeErrorFromError(storage) = %#v, want retryable storage", got)
	}
	if got := BridgeErrorFromError(errors.New("ERR-018 ALERT_RULE_INVALID: bad rule")); got.ID != "ERR-018" || got.Code != "ALERT_RULE_INVALID" {
		t.Fatalf("BridgeErrorFromError(ERR-018 string) = %#v, want alert rule invalid", got)
	}
	if got := BridgeErrorFromError(errors.New("ERR-016 FORBIDDEN: no")); got.ID != "ERR-016" || got.Code != "FORBIDDEN" {
		t.Fatalf("BridgeErrorFromError(ERR-016 string) = %#v, want forbidden", got)
	}
}

func isNotFound(err error) bool {
	var coded codedBridgeError
	return errors.As(err, &coded) && coded.bridge.ID == "ERR-004"
}

func isAiChatLimit(err error) bool {
	var coded codedBridgeError
	return errors.As(err, &coded) && coded.bridge.Code == "AI_CHAT_LIMIT_EXCEEDED"
}

func TestBranchCoverageHelpersDoNotMatchPlainErrors(t *testing.T) {
	if isNotFound(errors.New("ERR-004 TRACE_NOT_FOUND")) || isAiChatLimit(errors.New("AI_CHAT_LIMIT_EXCEEDED")) {
		t.Fatalf("coded helper matched plain error")
	}
	if containsSecretLookingKey(map[string]any{"nested": []any{map[string]any{"api-token": "secret"}}}) != true {
		t.Fatalf("containsSecretLookingKey did not detect nested token key")
	}
	if containsSecretLookingKeyExceptCredentialValue(map[string]any{"credentialValue": "sk", "nested": map[string]any{"password": "x"}}) != true {
		t.Fatalf("containsSecretLookingKeyExceptCredentialValue did not inspect nested values")
	}
	if strings.TrimSpace(managedAiProviderSecretID("project", LocalCompanyID, LocalProjectID, "provider")) == "" {
		t.Fatalf("managedAiProviderSecretID returned blank")
	}
}
