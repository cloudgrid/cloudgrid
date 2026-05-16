package internal

import (
	"errors"
	"fmt"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type codedBridgeError struct {
	error
	bridge contracts.BridgeError
}

func validationError(reason string) error {
	return codedError("ERR-001", "VALIDATION_FAILED", fmt.Sprintf("ERR-001 VALIDATION_FAILED: %s", reason), false)
}

func forbiddenError(reason string) error {
	return codedError("ERR-016", "FORBIDDEN", "The principal is not allowed to access this telemetry", false, reason)
}

func notFoundError(kind string) error {
	return codedError("ERR-004", "TRACE_NOT_FOUND", fmt.Sprintf("%s was not found", kind), false)
}

func storageError() error {
	return codedError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
}

func codedError(id string, code string, message string, retryable bool, details ...string) error {
	bridge := contracts.BridgeError{
		ID:        id,
		Code:      code,
		Message:   message,
		Retryable: retryable,
	}
	if len(details) > 0 && strings.TrimSpace(details[0]) != "" {
		bridge.Details = map[string]any{"reason": details[0]}
	}
	return codedBridgeError{
		error:  fmt.Errorf("%s %s: %s", id, code, message),
		bridge: bridge,
	}
}

func BridgeErrorFromError(err error) contracts.BridgeError {
	var coded codedBridgeError
	if errors.As(err, &coded) {
		return coded.bridge
	}
	if err == nil {
		return contracts.BridgeError{}
	}
	message := err.Error()
	switch {
	case strings.HasPrefix(message, "ERR-001"):
		return contracts.BridgeError{ID: "ERR-001", Code: "VALIDATION_FAILED", Message: message, Retryable: false}
	case strings.HasPrefix(message, "ERR-016"):
		return contracts.BridgeError{ID: "ERR-016", Code: "FORBIDDEN", Message: "The principal is not allowed to access this telemetry", Retryable: false}
	case strings.HasPrefix(message, "ERR-018"):
		return contracts.BridgeError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "Alert rule configuration is invalid", Retryable: false}
	default:
		return contracts.BridgeError{ID: "ERR-006", Code: "STORAGE_UNAVAILABLE", Message: "Storage is unavailable", Retryable: true}
	}
}
