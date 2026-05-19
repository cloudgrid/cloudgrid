package runtime

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestWebhookNotificationAdapterSignsCanonicalJSONAndMapsStatuses(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	event := contracts.AlertEvent{ID: "event-1", ProjectID: "project-a", RuleID: "rule-1", InstanceID: "rule-1", State: contracts.AlertStateFiring, Severity: contracts.AlertSeverityCritical, Summary: "safe summary", DeduplicationKey: "project-a:rule-1", StartedAt: now, CreatedAt: now}
	client := &captureHTTPClient{statusCode: http.StatusAccepted}
	dispatcher, err := NewNotificationDispatcher(NotificationConfig{
		Adapters: []string{"pagerduty"},
		Webhooks: map[string]WebhookConfig{
			"pagerduty": {URL: "https://hooks.example.test/alert?token=redacted", SigningSecret: "super-secret", Client: client},
		},
	})
	if err != nil {
		t.Fatalf("NewNotificationDispatcher returned error: %v", err)
	}

	result, err := dispatcher.Dispatch(context.Background(), evaluator.NotificationRequest{Event: event, AdapterIDs: []string{"pagerduty"}, SafeSummary: event.Summary, DeduplicationKey: event.DeduplicationKey})
	if err != nil {
		t.Fatalf("Dispatch returned error: %v", err)
	}
	if result.Status != evaluator.DeliveryDelivered {
		t.Fatalf("status = %s, want delivered", result.Status)
	}
	if client.request.URL.String() != "https://hooks.example.test/alert?token=redacted" {
		t.Fatalf("webhook URL = %q", client.request.URL.String())
	}
	if client.request.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("content type = %q, want application/json", client.request.Header.Get("Content-Type"))
	}
	expectedSignature := webhookTestSignature("super-secret", client.body)
	if client.request.Header.Get("X-CloudGrid-Signature") != expectedSignature {
		t.Fatalf("signature = %q, want %q", client.request.Header.Get("X-CloudGrid-Signature"), expectedSignature)
	}
	if strings.Contains(string(client.body), "super-secret") || strings.Contains(string(client.body), "raw") {
		t.Fatalf("webhook body leaked secret or raw telemetry: %s", string(client.body))
	}
}

func TestWebhookNotificationAdapterRejectsNonHTTPSURLAndRedactsSecrets(t *testing.T) {
	_, err := NewNotificationDispatcher(NotificationConfig{
		Adapters: []string{"pagerduty"},
		Webhooks: map[string]WebhookConfig{
			"pagerduty": {URL: "http://hooks.example.test/alert?token=secret-token", SigningSecret: "super-secret"},
		},
	})
	if err == nil {
		t.Fatal("NewNotificationDispatcher returned nil error, want HTTPS validation failure")
	}
	if strings.Contains(err.Error(), "secret-token") || strings.Contains(err.Error(), "super-secret") {
		t.Fatalf("error leaked secret material: %v", err)
	}
}

func TestWebhookNotificationAdapterMapsRetryableAndTerminalStatuses(t *testing.T) {
	event := contracts.AlertEvent{ID: "event-1", ProjectID: "project-a", RuleID: "rule-1", InstanceID: "rule-1", State: contracts.AlertStateFiring, Severity: contracts.AlertSeverityCritical, Summary: "safe summary", DeduplicationKey: "project-a:rule-1", StartedAt: time.Now().UTC(), CreatedAt: time.Now().UTC()}
	for _, tc := range []struct {
		name string
		code int
		want evaluator.DeliveryStatus
	}{
		{name: "rate limit", code: http.StatusTooManyRequests, want: evaluator.DeliveryFailedRetryable},
		{name: "server error", code: http.StatusBadGateway, want: evaluator.DeliveryFailedRetryable},
		{name: "bad request", code: http.StatusBadRequest, want: evaluator.DeliveryFailedTerminal},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dispatcher, err := NewNotificationDispatcher(NotificationConfig{
				Adapters: []string{"pagerduty"},
				Webhooks: map[string]WebhookConfig{
					"pagerduty": {URL: "https://hooks.example.test/alert", SigningSecret: "super-secret", Client: &captureHTTPClient{statusCode: tc.code}},
				},
			})
			if err != nil {
				t.Fatalf("NewNotificationDispatcher returned error: %v", err)
			}
			result, err := dispatcher.Dispatch(context.Background(), evaluator.NotificationRequest{Event: event, AdapterIDs: []string{"pagerduty"}})
			if err != nil {
				t.Fatalf("Dispatch returned error: %v", err)
			}
			if result.Status != tc.want {
				t.Fatalf("status = %s, want %s", result.Status, tc.want)
			}
		})
	}
}

func TestEmailNotificationAdapterMapsInvalidRecipientsAndSMTPFailures(t *testing.T) {
	event := contracts.AlertEvent{ID: "event-1", ProjectID: "project-a", RuleID: "rule-1", InstanceID: "rule-1", State: contracts.AlertStateFiring, Severity: contracts.AlertSeverityWarning, Summary: "safe summary", DeduplicationKey: "project-a:rule-1", StartedAt: time.Now().UTC(), CreatedAt: time.Now().UTC()}

	invalid, err := NewNotificationDispatcher(NotificationConfig{
		Adapters: []string{"email"},
		Email:    &EmailNotificationConfig{From: "alerts@example.test", Recipients: []string{"not-an-address"}, Transport: captureEmailTransport{}},
	})
	if err != nil {
		t.Fatalf("NewNotificationDispatcher invalid recipient config returned error: %v", err)
	}
	result, err := invalid.Dispatch(context.Background(), evaluator.NotificationRequest{Event: event, AdapterIDs: []string{"email"}})
	if err != nil {
		t.Fatalf("Dispatch invalid recipient returned error: %v", err)
	}
	if result.Status != evaluator.DeliveryFailedTerminal {
		t.Fatalf("invalid recipient status = %s, want terminal", result.Status)
	}

	transient, err := NewNotificationDispatcher(NotificationConfig{
		Adapters: []string{"email"},
		Email:    &EmailNotificationConfig{From: "alerts@example.test", Recipients: []string{"oncall@example.test"}, Transport: captureEmailTransport{err: assertError("temporary SMTP failure")}},
	})
	if err != nil {
		t.Fatalf("NewNotificationDispatcher transient config returned error: %v", err)
	}
	result, err = transient.Dispatch(context.Background(), evaluator.NotificationRequest{Event: event, AdapterIDs: []string{"email"}})
	if err != nil {
		t.Fatalf("Dispatch transient returned error: %v", err)
	}
	if result.Status != evaluator.DeliveryFailedRetryable {
		t.Fatalf("transient status = %s, want retryable", result.Status)
	}
}

type captureHTTPClient struct {
	statusCode int
	request    *http.Request
	body       []byte
}

func (client *captureHTTPClient) Do(request *http.Request) (*http.Response, error) {
	client.request = request
	if request.Body != nil {
		client.body, _ = io.ReadAll(request.Body)
	}
	return &http.Response{StatusCode: client.statusCode, Body: io.NopCloser(bytes.NewReader(nil))}, nil
}

type captureEmailTransport struct {
	err error
}

func (transport captureEmailTransport) SendAlertEmail(_ context.Context, message AlertEmailMessage) error {
	if strings.Contains(message.Body, "raw") {
		return assertError("raw payload leaked")
	}
	return transport.err
}

func webhookTestSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

type assertError string

func (err assertError) Error() string {
	return string(err)
}
