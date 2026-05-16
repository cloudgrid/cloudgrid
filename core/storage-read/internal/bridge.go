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

func bridgeError(id string, code string, message string, retryable bool) error {
	return codedBridgeError{
		error: fmt.Errorf("%s %s: %s", id, code, message),
		bridge: contracts.BridgeError{
			ID:        id,
			Code:      code,
			Message:   message,
			Retryable: retryable,
		},
	}
}

func validationError(reason string) error {
	return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s", reason)
}

func bridgeErrorFromError(err error) contracts.BridgeError {
	var coded codedBridgeError
	if errors.As(err, &coded) {
		return coded.bridge
	}

	message := err.Error()
	switch {
	case strings.HasPrefix(message, "ERR-003"):
		return contracts.BridgeError{ID: "ERR-003", Code: "INVALID_CURSOR", Message: "Invalid pagination cursor", Retryable: false}
	case strings.HasPrefix(message, "ERR-001"):
		return contracts.BridgeError{ID: "ERR-001", Code: "VALIDATION_FAILED", Message: message, Retryable: false}
	case strings.HasPrefix(message, "ERR-004"):
		return contracts.BridgeError{ID: "ERR-004", Code: "TRACE_NOT_FOUND", Message: "Trace was not found", Retryable: false}
	default:
		return contracts.BridgeError{ID: "ERR-006", Code: "STORAGE_UNAVAILABLE", Message: "Storage is unavailable", Retryable: true}
	}
}
