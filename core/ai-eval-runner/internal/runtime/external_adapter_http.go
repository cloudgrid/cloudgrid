package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
)

const externalAdapterBodyLimit = 1 << 20

type ExternalHTTPAdapter struct {
	Client  *http.Client
	Timeout time.Duration
}

func (adapter ExternalHTTPAdapter) RunEvaluationItem(ctx context.Context, request ports.ExternalAdapterRunRequest) (ports.ExternalAdapterRunResult, error) {
	baseURL, _ := request.TargetRef["adapterUrl"].(string)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return ports.ExternalAdapterRunResult{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: external adapter URL is required")
	}
	payload := map[string]any{
		"requestId":             request.RequestID,
		"idempotencyKey":        request.IdempotencyKey,
		"evaluationRunId":       request.EvaluationRunID,
		"datasetItemRevisionId": request.ItemRevisionID,
		"input":                 request.Input,
		"targetRef":             request.TargetRef,
	}
	response, err := adapter.do(ctx, http.MethodPost, baseURL+"/eval-runs", request, payload)
	if err != nil {
		return ports.ExternalAdapterRunResult{}, err
	}
	if status, _ := response["status"].(string); status == "running" {
		runRef, _ := response["runRef"].(string)
		if runRef == "" {
			return ports.ExternalAdapterRunResult{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: async adapter response missing runRef")
		}
		return adapter.poll(ctx, baseURL, runRef, request)
	}
	return externalAdapterResult(response)
}

func (adapter ExternalHTTPAdapter) poll(ctx context.Context, baseURL string, runRef string, request ports.ExternalAdapterRunRequest) (ports.ExternalAdapterRunResult, error) {
	deadline := time.Now().Add(adapter.timeout())
	for {
		if time.Now().After(deadline) {
			return ports.ExternalAdapterRunResult{}, context.DeadlineExceeded
		}
		response, err := adapter.do(ctx, http.MethodGet, baseURL+"/eval-runs/"+runRef, request, nil)
		if err != nil {
			return ports.ExternalAdapterRunResult{}, err
		}
		status, _ := response["status"].(string)
		switch status {
		case "completed":
			return externalAdapterResult(response)
		case "failed", "cancelled":
			message, _ := response["message"].(string)
			if message == "" {
				message = "external adapter " + status
			}
			return ports.ExternalAdapterRunResult{}, errors.New(message)
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func (adapter ExternalHTTPAdapter) do(ctx context.Context, method string, url string, evalRequest ports.ExternalAdapterRunRequest, payload any) (map[string]any, error) {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		if len(data) > externalAdapterBodyLimit {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: external adapter request exceeds 1 MiB")
		}
		body = bytes.NewReader(data)
	}
	request, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("x-cloudgrid-request-id", evalRequest.RequestID)
	request.Header.Set("x-cloudgrid-idempotency-key", evalRequest.IdempotencyKey)
	if traceparent := evalRequest.TraceContext["traceparent"]; traceparent != "" {
		request.Header.Set("traceparent", traceparent)
	}
	if tracestate := evalRequest.TraceContext["tracestate"]; tracestate != "" {
		request.Header.Set("tracestate", tracestate)
	}
	client := adapter.Client
	if client == nil {
		client = &http.Client{Timeout: adapter.timeout()}
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("external adapter returned status %d", response.StatusCode)
	}
	limited := io.LimitReader(response.Body, externalAdapterBodyLimit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if len(data) > externalAdapterBodyLimit {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: external adapter response exceeds 1 MiB")
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func (adapter ExternalHTTPAdapter) timeout() time.Duration {
	if adapter.Timeout > 0 {
		return adapter.Timeout
	}
	return 30 * time.Second
}

func externalAdapterResult(response map[string]any) (ports.ExternalAdapterRunResult, error) {
	status, _ := response["status"].(string)
	if status != "" && status != "completed" {
		return ports.ExternalAdapterRunResult{}, fmt.Errorf("external adapter %s", status)
	}
	return ports.ExternalAdapterRunResult{
		ActualOutput:     response["actualOutput"],
		ActualOutputType: stringValue(response, "actualOutputType"),
		TraceID:          stringValue(response, "traceId"),
		RootSpanID:       stringValue(response, "rootSpanId"),
		ConversationRef:  stringValue(response, "conversationRef"),
		ImportantSteps:   mapArrayValue(response, "importantSteps"),
		Summary:          stringValue(response, "trajectorySummary"),
		Problems:         mapArrayValue(response, "problems"),
		LatencyMs:        float64Value(response, "latencyMs"),
	}, nil
}

func float64Value(values map[string]any, key string) float64 {
	switch value := values[key].(type) {
	case float64:
		return value
	case json.Number:
		parsed, _ := value.Float64()
		return parsed
	default:
		return 0
	}
}
