package health

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLivenessReportsOK(t *testing.T) {
	state := NewState("test-service", nil)
	recorder := httptest.NewRecorder()

	state.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/livez", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("liveness status = %d, want 200", recorder.Code)
	}
	var body response
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal liveness body: %v", err)
	}
	if body.Status != "ok" || body.Service != "test-service" {
		t.Fatalf("liveness body = %#v", body)
	}
}

func TestReadinessReportsDegradedUntilReady(t *testing.T) {
	state := NewState("test-service", nil)
	response := httptest.NewRecorder()

	state.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("readiness status = %d, want 503", response.Code)
	}
}

func TestReadinessReportsDefaultOKCheckWhenReady(t *testing.T) {
	state := NewState("test-service", nil)
	state.SetReady(true)
	recorder := httptest.NewRecorder()

	state.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("readiness status = %d, want 200", recorder.Code)
	}
	var body response
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal readiness body: %v", err)
	}
	if body.Status != "ok" || body.Checks["runtime"].Status != "ok" {
		t.Fatalf("readiness body = %#v", body)
	}
}

func TestReadinessReportsCheckerFailure(t *testing.T) {
	state := NewState("test-service", func(_ context.Context) map[string]Check {
		return map[string]Check{
			"nats": Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable"),
		}
	})
	state.SetReady(true)
	response := httptest.NewRecorder()

	state.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("readiness status = %d, want 503", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"MESSAGE_BRIDGE_UNAVAILABLE"`) {
		t.Fatalf("readiness body did not include problem code: %s", response.Body.String())
	}
}

func TestUnavailableProblemSlugsKnownAndFallbackCodes(t *testing.T) {
	tests := []struct {
		code string
		slug string
	}{
		{code: "MESSAGE_BRIDGE_UNAVAILABLE", slug: "message-bridge-unavailable"},
		{code: "STORAGE_UNAVAILABLE", slug: "storage-unavailable"},
		{code: "RUNTIME_COMPOSITION_FAILED", slug: "runtime-composition-failed"},
	}

	for _, test := range tests {
		t.Run(test.code, func(t *testing.T) {
			check := Unavailable("ERR-010", test.code, "not ready")
			if check.Error == nil {
				t.Fatal("Unavailable().Error = nil")
			}
			if !strings.HasSuffix(check.Error.Error.Type, "/"+test.slug) {
				t.Fatalf("problem type = %q, want slug %q", check.Error.Error.Type, test.slug)
			}
			if !check.Error.Error.Retryable || check.Error.Error.Status != http.StatusServiceUnavailable {
				t.Fatalf("problem details = %#v", check.Error.Error)
			}
		})
	}
}
