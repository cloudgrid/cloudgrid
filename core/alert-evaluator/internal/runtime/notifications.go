package runtime

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type HTTPDoer interface {
	Do(request *http.Request) (*http.Response, error)
}

type AlertEmailTransport interface {
	SendAlertEmail(ctx context.Context, message AlertEmailMessage) error
}

type NotificationConfig struct {
	Adapters []string
	Email    *EmailNotificationConfig
	Webhooks map[string]WebhookConfig
}

type EmailNotificationConfig struct {
	From       string
	Recipients []string
	Transport  AlertEmailTransport
}

type WebhookConfig struct {
	URL           string
	SigningSecret string
	Timeout       time.Duration
	Client        HTTPDoer
}

type AlertEmailMessage struct {
	From    string
	To      string
	Subject string
	Body    string
}

type NotificationDispatcher struct {
	adapters map[string]notificationAdapter
}

type notificationAdapter interface {
	Dispatch(ctx context.Context, request evaluator.NotificationRequest) evaluator.DeliveryStatus
}

func NewNotificationDispatcher(config NotificationConfig) (*NotificationDispatcher, error) {
	adapterIDs := normalizedProjectIDs(config.Adapters)
	if len(adapterIDs) == 0 {
		adapterIDs = []string{"in_app"}
	}
	dispatcher := &NotificationDispatcher{adapters: map[string]notificationAdapter{}}
	for _, adapterID := range adapterIDs {
		switch adapterID {
		case "in_app":
			dispatcher.adapters[adapterID] = inAppNotificationAdapter{}
		case "email":
			if config.Email == nil {
				return nil, fmt.Errorf("ERR-009 CONFIG_INVALID: email notification adapter is missing SMTP recipient configuration")
			}
			dispatcher.adapters[adapterID] = emailNotificationAdapter{config: *config.Email}
		default:
			webhook, ok := config.Webhooks[adapterID]
			if !ok {
				return nil, fmt.Errorf("ERR-009 CONFIG_INVALID: webhook notification adapter %q is not configured", adapterID)
			}
			adapter, err := newWebhookNotificationAdapter(adapterID, webhook)
			if err != nil {
				return nil, err
			}
			dispatcher.adapters[adapterID] = adapter
		}
	}
	return dispatcher, nil
}

func (dispatcher *NotificationDispatcher) Dispatch(ctx context.Context, request evaluator.NotificationRequest) (evaluator.NotificationResult, error) {
	adapterIDs := normalizedProjectIDs(request.AdapterIDs)
	if len(adapterIDs) == 0 {
		adapterIDs = []string{"in_app"}
	}
	status := evaluator.DeliveryDelivered
	for _, adapterID := range adapterIDs {
		adapter, ok := dispatcher.adapters[adapterID]
		if !ok {
			return evaluator.NotificationResult{Status: evaluator.DeliveryFailedTerminal}, nil
		}
		next := adapter.Dispatch(ctx, request)
		if next == evaluator.DeliveryFailedTerminal {
			return evaluator.NotificationResult{Status: evaluator.DeliveryFailedTerminal}, nil
		}
		if next == evaluator.DeliveryFailedRetryable {
			status = evaluator.DeliveryFailedRetryable
		}
	}
	return evaluator.NotificationResult{Status: status}, nil
}

func (dispatcher *NotificationDispatcher) AdapterIDs() []string {
	ids := make([]string, 0, len(dispatcher.adapters))
	for id := range dispatcher.adapters {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

type inAppNotificationAdapter struct{}

func (inAppNotificationAdapter) Dispatch(context.Context, evaluator.NotificationRequest) evaluator.DeliveryStatus {
	return evaluator.DeliveryDelivered
}

type emailNotificationAdapter struct {
	config EmailNotificationConfig
}

func (adapter emailNotificationAdapter) Dispatch(ctx context.Context, request evaluator.NotificationRequest) evaluator.DeliveryStatus {
	if adapter.config.Transport == nil {
		return evaluator.DeliveryFailedRetryable
	}
	if _, err := mail.ParseAddress(strings.TrimSpace(adapter.config.From)); err != nil {
		return evaluator.DeliveryFailedTerminal
	}
	recipients := make([]string, 0, len(adapter.config.Recipients))
	for _, recipient := range adapter.config.Recipients {
		address, err := mail.ParseAddress(strings.TrimSpace(recipient))
		if err != nil {
			return evaluator.DeliveryFailedTerminal
		}
		recipients = append(recipients, address.Address)
	}
	if len(recipients) == 0 {
		return evaluator.DeliveryFailedTerminal
	}
	for _, recipient := range recipients {
		if err := adapter.config.Transport.SendAlertEmail(ctx, AlertEmailMessage{
			From:    adapter.config.From,
			To:      recipient,
			Subject: "CloudGrid alert " + request.Event.RuleID,
			Body:    renderAlertEmailBody(request),
		}); err != nil {
			return evaluator.DeliveryFailedRetryable
		}
	}
	return evaluator.DeliveryDelivered
}

type webhookNotificationAdapter struct {
	id            string
	url           string
	signingSecret string
	timeout       time.Duration
	client        HTTPDoer
}

func newWebhookNotificationAdapter(id string, config WebhookConfig) (webhookNotificationAdapter, error) {
	parsed, err := url.Parse(strings.TrimSpace(config.URL))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return webhookNotificationAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: webhook notification adapter %q requires an HTTPS URL: %s", id, redactWebhookURL(config.URL))
	}
	if strings.TrimSpace(config.SigningSecret) == "" {
		return webhookNotificationAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: webhook notification adapter %q requires a signing secret", id)
	}
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	if timeout < time.Second || timeout > 30*time.Second {
		return webhookNotificationAdapter{}, fmt.Errorf("ERR-009 CONFIG_INVALID: CLOUDGRID_ALERT_WEBHOOK_TIMEOUT_SECONDS must be between 1 and 30")
	}
	client := config.Client
	if client == nil {
		client = &http.Client{Timeout: timeout}
	}
	return webhookNotificationAdapter{id: id, url: parsed.String(), signingSecret: config.SigningSecret, timeout: timeout, client: client}, nil
}

func (adapter webhookNotificationAdapter) Dispatch(ctx context.Context, request evaluator.NotificationRequest) evaluator.DeliveryStatus {
	body, err := json.Marshal(canonicalWebhookPayload(request))
	if err != nil {
		return evaluator.DeliveryFailedTerminal
	}
	ctx, cancel := context.WithTimeout(ctx, adapter.timeout)
	defer cancel()
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, adapter.url, bytes.NewReader(body))
	if err != nil {
		return evaluator.DeliveryFailedTerminal
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("X-CloudGrid-Signature", webhookSignature(adapter.signingSecret, body))
	response, err := adapter.client.Do(httpRequest)
	if err != nil {
		_ = redactWebhookError(adapter.url, adapter.signingSecret, err)
		return evaluator.DeliveryFailedRetryable
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)
	if response.StatusCode >= 200 && response.StatusCode <= 299 {
		return evaluator.DeliveryDelivered
	}
	if response.StatusCode == http.StatusRequestTimeout || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
		return evaluator.DeliveryFailedRetryable
	}
	return evaluator.DeliveryFailedTerminal
}

type webhookPayload struct {
	ID                 string                  `json:"id"`
	ProjectID          string                  `json:"projectId"`
	RuleID             string                  `json:"ruleId"`
	InstanceID         string                  `json:"instanceId"`
	State              contracts.AlertState    `json:"state"`
	Severity           contracts.AlertSeverity `json:"severity"`
	Summary            string                  `json:"summary"`
	DeduplicationKey   string                  `json:"deduplicationKey"`
	StartedAt          time.Time               `json:"startedAt"`
	EndedAt            *time.Time              `json:"endedAt,omitempty"`
	CreatedAt          time.Time               `json:"createdAt"`
	EvidenceTraceID    *string                 `json:"evidenceTraceId,omitempty"`
	EvidenceSpanID     *string                 `json:"evidenceSpanId,omitempty"`
	EvidenceLogID      *string                 `json:"evidenceLogId,omitempty"`
	EvidenceMetricName *string                 `json:"evidenceMetricName,omitempty"`
}

func canonicalWebhookPayload(request evaluator.NotificationRequest) webhookPayload {
	event := request.Event
	summary := request.SafeSummary
	if strings.TrimSpace(summary) == "" {
		summary = event.Summary
	}
	return webhookPayload{
		ID:                 event.ID,
		ProjectID:          event.ProjectID,
		RuleID:             event.RuleID,
		InstanceID:         event.InstanceID,
		State:              event.State,
		Severity:           event.Severity,
		Summary:            summary,
		DeduplicationKey:   event.DeduplicationKey,
		StartedAt:          event.StartedAt,
		EndedAt:            event.EndedAt,
		CreatedAt:          event.CreatedAt,
		EvidenceTraceID:    event.EvidenceTraceID,
		EvidenceSpanID:     event.EvidenceSpanID,
		EvidenceLogID:      event.EvidenceLogID,
		EvidenceMetricName: event.EvidenceMetricName,
	}
}

func renderAlertEmailBody(request evaluator.NotificationRequest) string {
	event := request.Event
	summary := request.SafeSummary
	if strings.TrimSpace(summary) == "" {
		summary = event.Summary
	}
	return strings.Join([]string{
		"CloudGrid alert",
		"Project: " + event.ProjectID,
		"Rule: " + event.RuleID,
		"State: " + string(event.State),
		"Severity: " + string(event.Severity),
		"Summary: " + summary,
		"Deduplication key: " + event.DeduplicationKey,
	}, "\n")
}

func webhookSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func redactWebhookURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "<invalid-url>"
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func redactWebhookError(rawURL string, secret string, err error) error {
	if err == nil {
		return nil
	}
	message := strings.ReplaceAll(err.Error(), secret, "[redacted]")
	if rawURL != "" {
		message = strings.ReplaceAll(message, rawURL, redactWebhookURL(rawURL))
	}
	return fmt.Errorf("%s", message)
}
