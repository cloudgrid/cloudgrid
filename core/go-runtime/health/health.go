package health

import (
	"context"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"
)

type Checker func(context.Context) map[string]Check

type Options struct {
	Timeout time.Duration
}

type State struct {
	service string
	ready   atomic.Bool
	checker Checker
	timeout time.Duration
}

type Check struct {
	Status string         `json:"status"`
	Error  *ErrorEnvelope `json:"error,omitempty"`
}

type ErrorEnvelope struct {
	Error ProblemDetails `json:"error"`
}

type ProblemDetails struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Status    int    `json:"status"`
	Detail    string `json:"detail"`
	ID        string `json:"id"`
	Code      string `json:"code"`
	Retryable bool   `json:"retryable"`
}

type response struct {
	Status  string           `json:"status"`
	Service string           `json:"service"`
	Checks  map[string]Check `json:"checks,omitempty"`
}

func NewState(service string, checker Checker) *State {
	return NewStateWithOptions(service, checker, Options{})
}

func NewStateWithOptions(service string, checker Checker, options Options) *State {
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = time.Second
	}
	return &State{service: service, checker: checker, timeout: timeout}
}

func (s *State) SetReady(ready bool) {
	s.ready.Store(ready)
}

func (s *State) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/livez", s.handleLiveness)
	mux.HandleFunc("/readyz", s.handleReadiness)
	return mux
}

func (s *State) handleLiveness(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, response{
		Status:  "ok",
		Service: s.service,
	})
}

func (s *State) handleReadiness(w http.ResponseWriter, r *http.Request) {
	checks := map[string]Check{}
	if !s.ready.Load() {
		checks["draining"] = Unavailable("ERR-010", "RUNTIME_COMPOSITION_FAILED", "service is not ready")
		writeJSON(w, http.StatusServiceUnavailable, response{
			Status:  "degraded",
			Service: s.service,
			Checks:  checks,
		})
		return
	}

	if s.checker != nil {
		ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
		defer cancel()
		for name, check := range s.runChecker(ctx) {
			checks[name] = check
		}
	}
	if len(checks) == 0 {
		checks["runtime"] = OK()
	}

	status := "ok"
	statusCode := http.StatusOK
	for _, check := range checks {
		if check.Status != "ok" {
			status = "degraded"
			statusCode = http.StatusServiceUnavailable
			break
		}
	}

	writeJSON(w, statusCode, response{
		Status:  status,
		Service: s.service,
		Checks:  checks,
	})
}

func (s *State) runChecker(ctx context.Context) map[string]Check {
	result := make(chan map[string]Check, 1)
	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				result <- map[string]Check{
					"health_checker": Unavailable("ERR-010", "RUNTIME_COMPOSITION_FAILED", "health checker panicked"),
				}
			}
		}()
		result <- s.checker(ctx)
	}()
	select {
	case checks := <-result:
		return checks
	case <-ctx.Done():
		return map[string]Check{
			"health_checker": Unavailable("ERR-010", "RUNTIME_COMPOSITION_FAILED", "health checker timed out"),
		}
	}
}

func OK() Check {
	return Check{Status: "ok"}
}

func Unavailable(id string, code string, detail string) Check {
	return Check{
		Status: "unavailable",
		Error: &ErrorEnvelope{
			Error: ProblemDetails{
				Type:      "https://cloudgrid.dev/problems/" + problemSlug(code),
				Title:     code,
				Status:    http.StatusServiceUnavailable,
				Detail:    detail,
				ID:        id,
				Code:      code,
				Retryable: true,
			},
		},
	}
}

func writeJSON(w http.ResponseWriter, status int, payload response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func problemSlug(code string) string {
	switch code {
	case "MESSAGE_BRIDGE_UNAVAILABLE":
		return "message-bridge-unavailable"
	case "STORAGE_UNAVAILABLE":
		return "storage-unavailable"
	default:
		return "runtime-composition-failed"
	}
}
