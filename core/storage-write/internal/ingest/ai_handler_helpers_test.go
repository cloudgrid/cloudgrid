package ingest

import (
	"errors"
	"testing"
)

func TestAIHandlerHelperBranches(t *testing.T) {
	if got := bridgeErrorFromError(nil); got.ID != storageErrorID || !got.Retryable {
		t.Fatalf("bridgeErrorFromError(nil) = %#v", got)
	}
	if got := bridgeErrorFromError(errors.New("ERR-001 VALIDATION_FAILED: bad input")); got.ID != validationErrorID || got.Retryable {
		t.Fatalf("bridgeErrorFromError(validation) = %#v", got)
	}
	if err := requireNonBlank(map[string]any{"name": " value "}, "name"); err != nil {
		t.Fatalf("requireNonBlank() error = %v", err)
	}
	if err := requireObject(map[string]any{"input": map[string]any{"x": true}}, "input"); err != nil {
		t.Fatalf("requireObject() error = %v", err)
	}
	if got := stableID("item", " Dataset ", "Row_1"); got != "item-dataset-row-1" {
		t.Fatalf("stableID() = %q", got)
	}
	input := map[string]any{
		"text":    42,
		"count":   int64(3),
		"object":  map[string]any{"ok": true},
		"strings": []string{"a", "b"},
		"items":   []any{map[string]any{"id": "first"}},
	}
	if stringValue(input, "text") != "42" || optionalStringValue(input, "missing") != nil {
		t.Fatalf("string helpers returned unexpected values")
	}
	if intValue(input, "count") != 3 {
		t.Fatalf("intValue() = %d", intValue(input, "count"))
	}
	if len(objectValue(input, "object")) != 1 || len(objectValueWithDefault(input, "missing")) != 0 {
		t.Fatalf("object helpers returned unexpected values")
	}
	if got := arrayValue(input, "strings"); len(got) != 2 || got[0] != "a" {
		t.Fatalf("arrayValue() = %#v", got)
	}
	if got := firstMap(arrayValue(input, "items")); got["id"] != "first" {
		t.Fatalf("firstMap() = %#v", got)
	}
	if stringValueWithDefault(map[string]any{}, "missing", "fallback") != "fallback" {
		t.Fatal("stringValueWithDefault did not return fallback")
	}
}
