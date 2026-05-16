package collector

import (
	"fmt"
	"net/http"
)

type errorResponse struct {
	Error problemDetails `json:"error"`
}

type problemDetails struct {
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Status    int            `json:"status"`
	Detail    string         `json:"detail"`
	Instance  string         `json:"instance,omitempty"`
	ID        string         `json:"id"`
	Code      string         `json:"code"`
	Retryable bool           `json:"retryable"`
	Details   map[string]any `json:"details,omitempty"`
}

func unsupportedMediaTypeProblem(contentType string) problemDetails {
	return problem("ERR-002", "UNSUPPORTED_MEDIA_TYPE", http.StatusUnsupportedMediaType, false, fmt.Sprintf("Unsupported media type: %s", contentType), map[string]any{
		"contentType": contentType,
	})
}

func methodNotAllowedProblem(method string, path string) problemDetails {
	return problem("ERR-005", "METHOD_NOT_ALLOWED", http.StatusMethodNotAllowed, false, fmt.Sprintf("Method %s is not allowed for %s", method, path), nil)
}

func validationProblem(reason string) problemDetails {
	return problem("ERR-001", "VALIDATION_FAILED", http.StatusBadRequest, false, fmt.Sprintf("Request validation failed: %s", reason), map[string]any{
		"reason": reason,
	})
}

func requestTooLargeProblem(limit int64) problemDetails {
	return problem("ERR-001", "VALIDATION_FAILED", http.StatusRequestEntityTooLarge, false, "Request validation failed: request body exceeds configured limit", map[string]any{
		"maxRequestBytes": limit,
	})
}

func decodeProblem(reason string) problemDetails {
	return problem("ERR-008", "OTLP_DECODE_FAILED", http.StatusBadRequest, false, fmt.Sprintf("OTLP payload could not be decoded: %s", reason), map[string]any{
		"reason": reason,
	})
}

func messageBridgeProblem() problemDetails {
	return problem("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", http.StatusServiceUnavailable, true, "Message bridge is unavailable", nil)
}

func unauthenticatedProblem() problemDetails {
	return problem("ERR-015", "UNAUTHENTICATED", http.StatusUnauthorized, false, "Authentication is required", nil)
}

func forbiddenProblem() problemDetails {
	return problem("ERR-016", "FORBIDDEN", http.StatusForbidden, false, "The principal is not allowed to access this telemetry", nil)
}

func problem(id string, code string, status int, retryable bool, detail string, details map[string]any) problemDetails {
	return problemDetails{
		Type:      "https://cloudgrid.dev/problems/" + id,
		Title:     code,
		Status:    status,
		Detail:    detail,
		ID:        id,
		Code:      code,
		Retryable: retryable,
		Details:   details,
	}
}
