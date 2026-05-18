package internal

import (
	"encoding/json"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestErrorResponseJSONSerializesRequestReplyErrorShape(t *testing.T) {
	payload, err := ErrorResponseJSON("req-error", contracts.BridgeError{
		ID:        "ERR-016",
		Code:      "FORBIDDEN",
		Message:   "The principal is not allowed to access this telemetry",
		Retryable: false,
	})
	if err != nil {
		t.Fatalf("ErrorResponseJSON returned error: %v", err)
	}

	var response struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if response.RequestID != "req-error" || response.OK {
		t.Fatalf("response envelope = %#v, want failed req-error", response)
	}
	if response.Error == nil || response.Error.ID != "ERR-016" || response.Error.Code != "FORBIDDEN" || response.Error.Retryable {
		t.Fatalf("response error = %#v, want non-retryable ERR-016", response.Error)
	}
}

func TestControlSubjectsUseWaveOneContractNames(t *testing.T) {
	subjects := ControlSubjects()
	if _, ok := subjects[SubjectMembersUpdate]; !ok {
		t.Fatalf("subjects missing %s", SubjectMembersUpdate)
	}
	if _, ok := subjects[SubjectMembersList]; !ok {
		t.Fatalf("subjects missing %s", SubjectMembersList)
	}
	if _, ok := subjects[SubjectMembersRemove]; !ok {
		t.Fatalf("subjects missing %s", SubjectMembersRemove)
	}
	if _, ok := subjects["control.memberships.update"]; ok {
		t.Fatalf("subjects must not include stale control.memberships.update")
	}
	if _, ok := subjects["control.memberships.remove"]; ok {
		t.Fatalf("subjects must not include stale control.memberships.remove")
	}
	for _, subject := range []string{
		SubjectInvitationsList,
		SubjectInvitationsCreate,
		SubjectInvitationsRevoke,
		SubjectDashboardsList,
		SubjectDashboardsSave,
		SubjectDashboardsDelete,
		SubjectDashboardPinsSet,
		SubjectDashboardPinsReorder,
		SubjectProjectAiSettingsGet,
		SubjectProjectAiSettingsUpdate,
		SubjectProjectMembersList,
		SubjectProjectMembersUpdate,
		SubjectProjectMembersRemove,
		SubjectRetentionGet,
		SubjectRetentionUpdate,
		SubjectAlertRulesList,
		SubjectAlertRulesCreate,
		SubjectAlertRulesUpdate,
		SubjectAlertRulesDelete,
		SubjectAlertSilencesList,
		SubjectAlertSilencesCreate,
		SubjectAlertSilencesDelete,
		SubjectAlertHistoryList,
		SubjectAlertHistoryRecord,
	} {
		if _, ok := subjects[subject]; !ok {
			t.Fatalf("subjects missing %s", subject)
		}
	}
	legacyDashboardPrefix := "control." + "metric" + "_views"
	for _, subject := range []string{
		legacyDashboardPrefix + ".list",
		legacyDashboardPrefix + ".save",
		legacyDashboardPrefix + ".delete",
	} {
		if _, ok := subjects[subject]; ok {
			t.Fatalf("subjects must not include stale dashboard subject %s", subject)
		}
	}
}

func TestMemberAndInvitationNATSHandlersReturnContractShapes(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	admin := localEnvelope("req-admin", "admin-1", nil)

	memberResponse := invokeJSONHandler(t, handleMembersList(service, nil), contracts.MemberListRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
	})
	if _, ok := memberResponse["data"].(map[string]any)["items"]; !ok {
		t.Fatalf("member list response missing data.items: %#v", memberResponse)
	}

	createResponse := invokeJSONHandler(t, handleInvitationsCreate(service, nil), contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          "ada@example.test",
	})
	invitation, ok := createResponse["data"].(map[string]any)["invitation"].(map[string]any)
	if !ok {
		t.Fatalf("invitation create response missing data.invitation: %#v", createResponse)
	}

	listResponse := invokeJSONHandler(t, handleInvitationsList(service, nil), contracts.InvitationListRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
	})
	if _, ok := listResponse["data"].(map[string]any)["items"]; !ok {
		t.Fatalf("invitation list response missing data.items: %#v", listResponse)
	}

	revokeResponse := invokeJSONHandler(t, handleInvitationsRevoke(service, nil), contracts.InvitationRevokeRequest{
		BridgeEnvelope: admin,
		InvitationID:   invitation["id"].(string),
	})
	if _, ok := revokeResponse["data"].(map[string]any)["invitation"]; !ok {
		t.Fatalf("invitation revoke response missing data.invitation: %#v", revokeResponse)
	}
}

func TestNATSHandlerRecordsSelfObservabilitySpanAndFailureLog(t *testing.T) {
	recorder := NewInMemorySelfObservabilityRecorder()
	handler := adaptBridgeHandlerWithSelfObservability(
		SubjectProjectsGet,
		handleProjectsGet(NewService(newTestStore(), fixedNow), nil),
		recorder,
	)
	request := contracts.ProjectGetRequest{
		BridgeEnvelope: localEnvelope("req-selfobs", "user-1", nil),
		ProjectID:      "missing-project",
	}
	payload, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	message := &captureBridgeMessage{data: payload}

	handler(message)

	if !recorder.HasSpan("nats control.projects.get") {
		t.Fatalf("spans = %#v, want NATS handler span", recorder.Spans())
	}
	if !recorder.HasLog("nats_handler_failed") {
		t.Fatalf("logs = %#v, want failed handler log", recorder.Logs())
	}
}

func TestNATSHandlerRecordsBoundedBridgeErrorAttributes(t *testing.T) {
	recorder := NewInMemorySelfObservabilityRecorder()
	handler := adaptBridgeHandlerWithSelfObservability(
		SubjectProjectsGet,
		func(message BridgeMessage) {
			payload, err := ErrorResponseJSON("req-selfobs", contracts.BridgeError{
				ID:        "ERR-004",
				Code:      "TRACE_NOT_FOUND",
				Message:   "project was not found",
				Retryable: false,
			})
			if err != nil {
				t.Fatalf("build error response: %v", err)
			}
			if err := message.Respond(payload); err != nil {
				t.Fatalf("respond: %v", err)
			}
		},
		recorder,
	)

	handler(&captureBridgeMessage{})

	logs := recorder.Logs()
	if len(logs) != 1 {
		t.Fatalf("logs = %#v, want one failure log", logs)
	}
	if logs[0].Attributes["cloudgrid.request_id"] != "req-selfobs" {
		t.Fatalf("request id attribute = %q, want req-selfobs", logs[0].Attributes["cloudgrid.request_id"])
	}
	if logs[0].Attributes["error_id"] != "ERR-004" || logs[0].Attributes["error_code"] != "TRACE_NOT_FOUND" {
		t.Fatalf("error attributes = %#v, want ERR-004 TRACE_NOT_FOUND", logs[0].Attributes)
	}
}

func TestPublishJSONSkipsPublisherWhenMessageCannotMarshal(t *testing.T) {
	publisher := &capturePublisher{}

	publishJSON(publisher, SubjectProjectStatusChanged, map[string]any{"invalid": make(chan struct{})})

	if publisher.calls != 0 {
		t.Fatalf("publish calls = %d, want 0 when JSON encoding fails", publisher.calls)
	}
}

func TestPublishJSONIgnoresPublisherErrorAfterEncodingContractPayload(t *testing.T) {
	publisher := &capturePublisher{err: assertError("publish failed")}
	change := contracts.ProjectStatusChangedNotification{
		CompanyID: "local",
		ProjectID: LocalProjectID,
		Status:    contracts.ProjectStatusActive,
		ChangedAt: time.Unix(1, 0),
	}

	publishJSON(publisher, SubjectProjectStatusChanged, change)

	if publisher.calls != 1 {
		t.Fatalf("publish calls = %d, want one publish attempt", publisher.calls)
	}
	if publisher.subject != SubjectProjectStatusChanged {
		t.Fatalf("subject = %q, want status changed subject", publisher.subject)
	}
	if !json.Valid(publisher.data) {
		t.Fatalf("published payload is not valid JSON: %q", string(publisher.data))
	}
}

func TestProjectMemberRetentionAndAlertNATSHandlersReturnContractShapes(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)

	memberResponse := invokeJSONHandler(t, handleProjectMembersList(service, nil), contracts.ProjectMemberListRequest{
		BridgeEnvelope: localEnvelope("req-members", "local-user", nil),
		ProjectID:      LocalProjectID,
	})
	if _, ok := memberResponse["data"].(map[string]any)["items"]; !ok {
		t.Fatalf("project member response missing data.items: %#v", memberResponse)
	}

	retentionResponse := invokeJSONHandler(t, handleRetentionGet(service, nil), contracts.RetentionGetRequest{
		BridgeEnvelope: localEnvelope("req-retention", "local-user", nil),
		ProjectID:      LocalProjectID,
	})
	if _, ok := retentionResponse["data"].(map[string]any)["policy"]; !ok {
		t.Fatalf("retention response missing data.policy: %#v", retentionResponse)
	}

	alertResponse := invokeJSONHandler(t, handleAlertRulesList(service, nil), contracts.AlertRuleListRequest{
		BridgeEnvelope: localEnvelope("req-alert-rules", "local-user", nil),
		ProjectID:      LocalProjectID,
	})
	if _, ok := alertResponse["data"].(map[string]any)["items"]; !ok {
		t.Fatalf("alert rules response missing data.items: %#v", alertResponse)
	}

	aiSettingsResponse := invokeJSONHandler(t, handleProjectAiSettingsGet(service, nil), contracts.ProjectAiSettingsGetRequest{
		BridgeEnvelope: localEnvelope("req-ai-settings", "local-user", nil),
		ProjectID:      LocalProjectID,
	})
	settings, ok := aiSettingsResponse["data"].(map[string]any)["settings"].(map[string]any)
	if !ok || settings["projectId"] != LocalProjectID || settings["version"].(float64) != 1 {
		t.Fatalf("AI settings response = %#v, want default settings", aiSettingsResponse)
	}
}

func TestViewerAndSelectProjectNATSResponsesContainGraphQLRequiredTelemetryFields(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	viewerRequest := contracts.ViewerGetRequest{BridgeEnvelope: localEnvelope("req-viewer", "local-user", nil)}
	viewerResponse := invokeJSONHandler(t, handleViewerGet(service, nil), viewerRequest)

	assertGraphQLProjectTelemetryShape(t, viewerResponse, []string{
		"data",
		"viewer",
		"organizations",
		"0",
		"projects",
		"0",
		"telemetry",
	})

	selectRequest := contracts.ProjectSelectRequest{
		BridgeEnvelope: localEnvelope("req-select", "local-user", nil),
		ProjectID:      LocalProjectID,
	}
	selectResponse := invokeJSONHandler(t, handleProjectsSelect(service, nil), selectRequest)
	assertGraphQLProjectTelemetryShape(t, selectResponse, []string{
		"data",
		"viewer",
		"selectedProject",
		"telemetry",
	})
	assertGraphQLProjectTelemetryShape(t, selectResponse, []string{
		"data",
		"viewer",
		"organizations",
		"0",
		"projects",
		"0",
		"telemetry",
	})
}

func invokeJSONHandler(t *testing.T, handler bridgeMessageHandler, request any) map[string]any {
	t.Helper()
	payload, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	message := &captureBridgeMessage{data: payload}
	handler(message)
	if len(message.response) == 0 {
		t.Fatal("handler did not respond")
	}
	var response map[string]any
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if response["ok"] != true {
		t.Fatalf("response ok = %#v, want true; response = %#v", response["ok"], response)
	}
	return response
}

func assertGraphQLProjectTelemetryShape(t *testing.T, response map[string]any, path []string) {
	t.Helper()
	value := any(response)
	for _, segment := range path {
		switch current := value.(type) {
		case map[string]any:
			next, ok := current[segment]
			if !ok {
				t.Fatalf("response missing path segment %q in %v; response = %#v", segment, path, response)
			}
			value = next
		case []any:
			if segment != "0" || len(current) == 0 {
				t.Fatalf("response path %v reached invalid array segment %q; response = %#v", path, segment, response)
			}
			value = current[0]
		default:
			t.Fatalf("response path %v reached non-container %#v; response = %#v", path, value, response)
		}
	}
	telemetry, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("telemetry at path %v is not an object: %#v", path, value)
	}
	for _, field := range []string{"traceCount", "logCount", "metricCount", "serviceCount"} {
		if _, ok := telemetry[field]; !ok {
			t.Fatalf("telemetry missing GraphQL-required field %q at path %v; telemetry = %#v", field, path, telemetry)
		}
	}
}

type captureBridgeMessage struct {
	data     []byte
	response []byte
	headers  map[string]string
}

type assertError string

func (err assertError) Error() string {
	return string(err)
}

type capturePublisher struct {
	calls   int
	subject string
	data    []byte
	err     error
}

func (publisher *capturePublisher) Publish(subject string, data []byte) error {
	publisher.calls++
	publisher.subject = subject
	publisher.data = append([]byte(nil), data...)
	return publisher.err
}

func (message *captureBridgeMessage) Data() []byte {
	return message.data
}

func (message *captureBridgeMessage) Respond(response []byte) error {
	message.response = append([]byte{}, response...)
	return nil
}

func (message *captureBridgeMessage) Header(name string) string {
	return message.headers[name]
}
