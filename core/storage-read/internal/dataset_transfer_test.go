package internal

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestStartDatasetExportWritesCanonicalFormats(t *testing.T) {
	items := []map[string]any{{
		"input":          map[string]any{"prompt": "hi"},
		"expected":       map[string]any{"answer": "hello"},
		"metadata":       map[string]any{"topic": "greeting"},
		"sourceTraceId":  "trace-1",
		"sourceSpanId":   "span-1",
		"split":          "dev",
		"reviewStatus":   "reviewed",
		"synthetic":      false,
		"hiddenInternal": "must-omit",
	}}

	for _, format := range []string{"jsonl", "json_array", "csv"} {
		t.Run(format, func(t *testing.T) {
			root := t.TempDir()
			job, err := StartDatasetExport(context.Background(), root, contracts.EvalMutationRequest{
				BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-export", IssuedAt: fixedTimeForTransferTest()},
				Input: map[string]any{
					"datasetId": "dataset-1",
					"format":    format,
				},
			}, items, fixedTimeForTransferTest)
			if err != nil {
				t.Fatalf("StartDatasetExport() error = %v", err)
			}
			if job["status"] != "ready" || job["downloadUrl"] != "/api/ai-eval/dataset-exports/"+job["id"].(string)+"/download" {
				t.Fatalf("job = %#v, want ready export with same-origin download URL", job)
			}
			artifact, err := os.ReadFile(filepath.Join(root, "exports", job["filename"].(string)))
			if err != nil {
				t.Fatal(err)
			}
			text := string(artifact)
			for _, want := range []string{"input", "expected", "metadata", "split", "curationStatus", "contentTreatment"} {
				if !strings.Contains(text, want) {
					t.Fatalf("%s artifact = %s, missing %q", format, text, want)
				}
			}
			if strings.Contains(text, "reviewStatus") || strings.Contains(text, "synthetic") || strings.Contains(text, "dev") {
				t.Fatalf("%s artifact = %s, leaked legacy dataset vocabulary", format, text)
			}
			if strings.Contains(text, "hiddenInternal") {
				t.Fatalf("%s artifact = %s, leaked non-canonical field", format, text)
			}
		})
	}
}

func TestGetDatasetTransferReadsImportAndExportJobs(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "imports"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "exports"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeJSONForTransferTest(t, filepath.Join(root, "imports", "import-1.json"), map[string]any{
		"id":        "import-1",
		"datasetId": "dataset-1",
		"status":    "preview_ready",
	})
	writeJSONForTransferTest(t, filepath.Join(root, "exports", "export-1.json"), map[string]any{
		"id":        "export-1",
		"datasetId": "dataset-1",
		"status":    "ready",
	})

	importJob, err := GetDatasetTransfer(context.Background(), root, map[string]any{"id": "import-1", "kind": "import"})
	if err != nil {
		t.Fatalf("GetDatasetTransfer(import) error = %v", err)
	}
	exportJob, err := GetDatasetTransfer(context.Background(), root, map[string]any{"id": "export-1", "kind": "export"})
	if err != nil {
		t.Fatalf("GetDatasetTransfer(export) error = %v", err)
	}
	if importJob["id"] != "import-1" || exportJob["id"] != "export-1" {
		t.Fatalf("jobs = %#v %#v, want import and export jobs", importJob, exportJob)
	}
}

func writeJSONForTransferTest(t *testing.T, path string, value map[string]any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func fixedTimeForTransferTest() time.Time {
	return time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC)
}
