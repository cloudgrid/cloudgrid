package collector

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestNewLoggerSuppressesDebugByDefaultAndAllowsRuntimeDebug(t *testing.T) {
	var out bytes.Buffer
	NewLogger(&out).Debug("hot path",
		"service", serviceName,
		"event", "http_request_completed",
		"request_id", "req-1",
	)
	if out.Len() != 0 {
		t.Fatalf("default logger emitted debug entry: %s", out.String())
	}

	t.Setenv("CLOUDGRID_LOG_LEVEL", "debug")
	NewLogger(&out).Debug("hot path",
		"service", serviceName,
		"event", "http_request_completed",
		"request_id", "req-1",
	)
	var entry map[string]any
	if err := json.Unmarshal(out.Bytes(), &entry); err != nil {
		t.Fatalf("decode log entry: %v", err)
	}
	if entry["level"] != "debug" {
		t.Fatalf("level = %#v, want debug", entry["level"])
	}
}
