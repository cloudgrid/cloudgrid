package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal"
	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestControlSurrealDBConfigUsesSharedDefaults(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_NAMESPACE", "")
	t.Setenv("CLOUDGRID_SURREALDB_DATABASE", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	config := controlSurrealDBConfig()
	if config.URL != defaultSurrealDBURL {
		t.Fatalf("URL = %q, want %q", config.URL, defaultSurrealDBURL)
	}
	if config.Namespace != defaultSurrealDBNamespace {
		t.Fatalf("Namespace = %q, want %q", config.Namespace, defaultSurrealDBNamespace)
	}
	if config.Database != defaultSurrealDBDatabase {
		t.Fatalf("Database = %q, want %q", config.Database, defaultSurrealDBDatabase)
	}
	if config.Username != defaultSurrealDBUsername {
		t.Fatalf("Username = %q, want %q", config.Username, defaultSurrealDBUsername)
	}
	if config.Password != defaultSurrealDBPassword {
		t.Fatalf("Password = %q, want %q", config.Password, defaultSurrealDBPassword)
	}
}

func TestResolveControlPlaneSelfObservabilityConfigUsesLocalDefaults(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "system-token",
	}
	config, err := resolveControlPlaneSelfObservabilityConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("resolveControlPlaneSelfObservabilityConfig returned error: %v", err)
	}
	if !config.Enabled || !config.TracesEnabled || !config.LogsEnabled {
		t.Fatalf("config signals = enabled:%v traces:%v logs:%v, want all enabled", config.Enabled, config.TracesEnabled, config.LogsEnabled)
	}
	if config.CompanyID != internal.LocalCompanyID || config.ProjectID != internal.LocalSelfObservabilityProjectID {
		t.Fatalf("local IDs = %q/%q, want local/cloudgrid-system", config.CompanyID, config.ProjectID)
	}
	if config.OTLPEndpoint != "http://localhost:4318" || config.ExportIntervalSeconds != 10 {
		t.Fatalf("endpoint/interval = %q/%d, want local defaults", config.OTLPEndpoint, config.ExportIntervalSeconds)
	}
	if config.OTLPBearerToken != "system-token" {
		t.Fatalf("OTLPBearerToken = %q, want configured token", config.OTLPBearerToken)
	}
}

func TestResolveControlPlaneSelfObservabilityConfigRejectsLocalEnabledWithoutBearerToken(t *testing.T) {
	_, err := resolveControlPlaneSelfObservabilityConfig(func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN") {
		t.Fatalf("resolveControlPlaneSelfObservabilityConfig error = %v, want bearer token validation", err)
	}
}

func TestResolveInvitationEmailConfigUsesLocalDisabledDefaults(t *testing.T) {
	config, err := resolveInvitationEmailConfig(func(string) string { return "" })
	if err != nil {
		t.Fatalf("resolveInvitationEmailConfig returned error: %v", err)
	}
	if config.Mode != internal.InvitationEmailModeDisabled || config.RequireDelivery {
		t.Fatalf("invitation email config = %#v, want disabled without required delivery", config)
	}
}

func TestResolveInvitationEmailConfigRequiresSMTPInDeployedSSO(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE": "deployed",
		"CLOUDGRID_AUTH_MODE":       "sso",
	}
	_, err := resolveInvitationEmailConfig(func(name string) string { return env[name] })
	if err == nil || !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), "CLOUDGRID_PUBLIC_URL") {
		t.Fatalf("error = %v, want ERR-009 missing SMTP config", err)
	}
}

func TestResolveInvitationEmailConfigAcceptsDeployedSMTP(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                     "deployed",
		"CLOUDGRID_AUTH_MODE":                           "sso",
		"CLOUDGRID_PUBLIC_URL":                          "https://cloudgrid.example.test",
		"CLOUDGRID_INVITATION_EMAIL_FROM":               "CloudGrid <noreply@example.test>",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_HOST":          "smtp.example.test",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_PORT":          "587",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_TLS":           "starttls",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS":    "2000",
		"CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS":       "3",
		"CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS": "30",
		"CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY":   "true",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_USERNAME":      "smtp-user",
		"CLOUDGRID_INVITATION_EMAIL_SMTP_PASSWORD":      "smtp-password",
		"CLOUDGRID_INVITATION_EMAIL_REPLY_TO":           "support@example.test",
	}
	config, err := resolveInvitationEmailConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("resolveInvitationEmailConfig returned error: %v", err)
	}
	if config.Mode != internal.InvitationEmailModeSMTP || !config.RequireDelivery || config.SMTPTimeout != 2*time.Second || config.MaxAttempts != 3 || config.RetryBase != 30*time.Second {
		t.Fatalf("config = %#v, want deployed SMTP values", config)
	}
}

func TestResolveControlPlaneSelfObservabilityConfigDisablesSignalsWhenDisabled(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                   "local",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":        "false",
		"CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED": "true",
		"CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED":   "true",
	}
	config, err := resolveControlPlaneSelfObservabilityConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("resolveControlPlaneSelfObservabilityConfig returned error: %v", err)
	}
	if config.Enabled || config.TracesEnabled || config.LogsEnabled {
		t.Fatalf("config signals = enabled:%v traces:%v logs:%v, want all disabled", config.Enabled, config.TracesEnabled, config.LogsEnabled)
	}
}

func TestResolveControlPlaneSelfObservabilityConfigRejectsStrictBooleanAndIntervalValues(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
	}{
		{
			name: "numeric enabled",
			env: map[string]string{
				"CLOUDGRID_SELF_OBSERVABILITY_ENABLED": "1",
			},
		},
		{
			name: "numeric traces",
			env: map[string]string{
				"CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED": "0",
			},
		},
		{
			name: "too small interval",
			env: map[string]string{
				"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS": "0",
			},
		},
		{
			name: "too large interval",
			env: map[string]string{
				"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS": "301",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := resolveControlPlaneSelfObservabilityConfig(func(name string) string { return tt.env[name] })
			if err == nil || !strings.Contains(err.Error(), "ERR-009") {
				t.Fatalf("error = %v, want ERR-009", err)
			}
		})
	}
}

func TestLogErrorMapsConfigInvalidWithoutLeakingNATSErrorDetails(t *testing.T) {
	var output bytes.Buffer
	logger := newLogger(&output)

	logError(logger, "message_bridge_unavailable", errors.New("dial tcp 127.0.0.1:4222: secret detail"), "ERR-013")
	logError(logger, "self_observability_config_invalid", configInvalidError("bad boolean"), "ERR-009")

	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("log lines = %q, want two JSON log lines", output.String())
	}
	var natsLog map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &natsLog); err != nil {
		t.Fatalf("decode nats log: %v", err)
	}
	if natsLog["message"] != "message bridge is unavailable" || natsLog["error_code"] != "MESSAGE_BRIDGE_UNAVAILABLE" {
		t.Fatalf("nats log = %#v, want sanitized message bridge error", natsLog)
	}
	var configLog map[string]any
	if err := json.Unmarshal([]byte(lines[1]), &configLog); err != nil {
		t.Fatalf("decode config log: %v", err)
	}
	if configLog["error_id"] != "ERR-009" || configLog["error_code"] != "CONFIG_INVALID" {
		t.Fatalf("config log = %#v, want ERR-009 CONFIG_INVALID", configLog)
	}
}

func TestSelfObservabilityValidationSkipsDeployedModeWhenDisabledByDefault(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "")

	store := &selfObservabilityStore{}
	if err := validateSelfObservabilityProjectConfig(context.Background(), store); err != nil {
		t.Fatalf("validateSelfObservabilityProjectConfig returned error: %v", err)
	}
	if store.projectLookups != 0 {
		t.Fatalf("project lookups = %d, want 0 when deployed self-observability is disabled", store.projectLookups)
	}
}

func TestSelfObservabilityValidationRequiresDeployedCompanyProjectEndpointAndToken(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "true")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", "")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", "")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", "")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", "")

	err := validateSelfObservabilityProjectConfig(context.Background(), &selfObservabilityStore{})
	if err == nil || !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("validation error = %v, want ERR-009", err)
	}
}

func TestSelfObservabilityValidationRejectsNonBooleanEnabledFlag(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "1")

	err := validateSelfObservabilityProjectConfig(context.Background(), &selfObservabilityStore{})
	if err == nil || !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), "true or false") {
		t.Fatalf("validation error = %v, want ERR-009 boolean validation", err)
	}
}

func TestSelfObservabilityValidationRejectsDeployedProjectCompanyMismatch(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "true")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", "company-1")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", "cloudgrid-system")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", "https://otlp.example.test")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", "token")

	store := &selfObservabilityStore{project: ports.ProjectRecord{
		ID:             "cloudgrid-system",
		OrganizationID: "company-2",
		Status:         contracts.ProjectStatusActive,
	}}
	err := validateSelfObservabilityProjectConfig(context.Background(), store)
	if err == nil || !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("validation error = %v, want ERR-009", err)
	}
}

func TestSelfObservabilityValidationAcceptsMatchingDeployedProject(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "true")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", "company-1")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", "cloudgrid-system")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", "https://otlp.example.test")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", "token")

	store := &selfObservabilityStore{project: ports.ProjectRecord{
		ID:             "cloudgrid-system",
		OrganizationID: "company-1",
		Status:         contracts.ProjectStatusActive,
	}}
	if err := validateSelfObservabilityProjectConfig(context.Background(), store); err != nil {
		t.Fatalf("validateSelfObservabilityProjectConfig returned error: %v", err)
	}
}

func TestControlPlaneSelfObservabilitySignalExporterPostsTracesAndLogs(t *testing.T) {
	requests := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer service-token" {
			t.Fatalf("authorization = %q, want bearer", r.Header.Get("Authorization"))
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                      "local",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":           "true",
		"CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED":    "true",
		"CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED":      "true",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID":        "cloudgrid-system",
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID":        "local",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":     server.URL,
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "service-token",
	}
	exporter, err := controlPlaneSelfObservabilitySignalExporter(func(name string) string { return env[name] }, newLogger(testingWriter{t}))
	if err != nil {
		t.Fatalf("controlPlaneSelfObservabilitySignalExporter() error = %v", err)
	}
	exporter.RecordSpan(internal.SelfObservabilitySpan{Name: "nats control.projects.get", StartTime: time.Unix(1, 0), EndTime: time.Unix(1, 1)})
	exporter.RecordLog(internal.SelfObservabilityLog{Body: "control plane NATS handler failed", Timestamp: time.Unix(1, 2), Attributes: map[string]string{"event": "nats_handler_failed"}})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if !payloadHasResourceAttribute(requests["/v1/traces"], "service.name", "cloudgrid.control_plane") ||
		!payloadHasResourceAttribute(requests["/v1/logs"], "service.name", "cloudgrid.control_plane") {
		t.Fatalf("payloads missing control-plane resource attrs: %#v", requests)
	}
}

type selfObservabilityStore struct {
	project        ports.ProjectRecord
	found          bool
	projectLookups int
}

func (store *selfObservabilityStore) GetProject(_ context.Context, projectID string) (ports.ProjectRecord, bool, error) {
	store.projectLookups++
	return store.project, store.found || store.project.ID == projectID, nil
}

type testingWriter struct {
	t *testing.T
}

func (writer testingWriter) Write(payload []byte) (int, error) {
	return len(payload), nil
}

func payloadHasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, topKey := range []string{"resourceSpans", "resourceLogs"} {
		resources, _ := payload[topKey].([]any)
		for _, item := range resources {
			resourceItem, _ := item.(map[string]any)
			resource, _ := resourceItem["resource"].(map[string]any)
			attributes, _ := resource["attributes"].([]any)
			for _, attributeItem := range attributes {
				attribute, _ := attributeItem.(map[string]any)
				valueMap, _ := attribute["value"].(map[string]any)
				if attribute["key"] == key && valueMap["stringValue"] == value {
					return true
				}
			}
		}
	}
	return false
}
