package ingest

import (
	"archive/zip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestPrepareDatasetImportParsesJSONLPreviewWithoutAppending(t *testing.T) {
	root := stageUploadForTest(t, "upload-jsonl", "items.jsonl", []byte("{\"prompt\":\"hi\",\"answer\":\"hello\"}\n"))
	request := datasetImportPrepareRequest("upload-jsonl", "jsonl")

	job, err := PrepareDatasetImport(context.Background(), root, request, fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport() error = %v", err)
	}

	if job["status"] != "preview_ready" || job["validRows"] != 1 || job["errorRows"] != 0 {
		t.Fatalf("job = %#v, want one valid preview row", job)
	}
	rows := job["previewRows"].([]map[string]any)
	item := rows[0]["item"].(map[string]any)
	input := item["input"].(map[string]any)
	expected := item["expected"].(map[string]any)
	if input["prompt"] != "hi" || expected["answer"] != "hello" {
		t.Fatalf("preview item = %#v, want mapped prompt and answer", item)
	}
}

func TestPrepareDatasetImportMapsCSVNestedFields(t *testing.T) {
	root := stageUploadForTest(t, "upload-csv", "items.csv", []byte("prompt,expected,topic\nhi,hello,greeting\n"))
	request := datasetImportPrepareRequest("upload-csv", "csv")
	request.Input["mapping"] = map[string]any{
		"input": []any{
			map[string]any{"targetPath": "messages.0.content", "source": map[string]any{"column": "prompt"}},
		},
		"expected": []any{
			map[string]any{"targetPath": "answer", "source": map[string]any{"column": "expected"}},
		},
		"metadata": []any{
			map[string]any{"targetPath": "topic", "source": map[string]any{"column": "topic"}},
		},
	}

	job, err := PrepareDatasetImport(context.Background(), root, request, fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport() error = %v", err)
	}

	rows := job["previewRows"].([]map[string]any)
	item := rows[0]["item"].(map[string]any)
	input := item["input"].(map[string]any)
	messages := input["messages"].([]any)
	message := messages[0].(map[string]any)
	metadata := item["metadata"].(map[string]any)
	if message["content"] != "hi" || metadata["topic"] != "greeting" {
		t.Fatalf("preview item = %#v, want nested CSV mappings", item)
	}
}

func TestPrepareDatasetImportParsesJSONArrayAndAppliesDefaults(t *testing.T) {
	root := stageUploadForTest(t, "upload-json-array", "items.json", []byte(`[
		{"case":{"prompt":"hi"},"answer":"hello","trace":"trace-1"},
		{"case":{"prompt":"bye"},"answer":"goodbye","trace":"trace-2"}
	]`))
	writeUploadManifestForTest(t, root, "upload-json-array", "items.json", "json_array")
	request := datasetImportPrepareRequest("upload-json-array", "json_array")
	request.Input["mapping"] = map[string]any{
		"input": []any{
			map[string]any{"targetPath": "messages.0.role", "source": map[string]any{"constant": "user"}},
			map[string]any{"targetPath": "messages.0.content", "source": map[string]any{"jsonPath": "$.case.prompt"}},
		},
		"expected": []any{
			map[string]any{"targetPath": "answer", "source": map[string]any{"jsonPath": "$.answer"}},
		},
		"metadata": []any{
			map[string]any{"targetPath": "source", "source": map[string]any{"defaultValue": "manual"}},
		},
		"sourceTraceId": map[string]any{"jsonPath": "$.trace"},
	}
	request.Input["defaults"] = map[string]any{
		"split":              "validation",
		"curationStatus":     "ready",
		"metadata":           map[string]any{"suite": "release"},
		"allowPartialCommit": true,
	}

	job, err := PrepareDatasetImport(context.Background(), root, request, fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport() error = %v", err)
	}

	if job["totalRows"] != 2 || job["validRows"] != 2 || job["errorRows"] != 0 {
		t.Fatalf("job counts = %#v, want two valid rows", job)
	}
	rows := job["previewRows"].([]map[string]any)
	item := rows[0]["item"].(map[string]any)
	input := item["input"].(map[string]any)
	message := input["messages"].([]any)[0].(map[string]any)
	metadata := item["metadata"].(map[string]any)
	if message["role"] != "user" || message["content"] != "hi" {
		t.Fatalf("input = %#v, want nested message mapping", input)
	}
	if item["split"] != "validation" || item["curationStatus"] != "ready" {
		t.Fatalf("item defaults = %#v", item)
	}
	if metadata["suite"] != "release" || metadata["source"] != "manual" || item["sourceTraceId"] != "trace-1" {
		t.Fatalf("metadata/source = %#v", item)
	}
}

func TestDatasetImportAppendRequestsBuildsStableAppendMutations(t *testing.T) {
	root := stageUploadForTest(t, "upload-append", "items.jsonl", []byte("{\"prompt\":\"hi\",\"answer\":\"hello\"}\n{\"answer\":\"missing input\"}\n"))
	prepare := datasetImportPrepareRequest("upload-append", "jsonl")
	job, err := PrepareDatasetImport(context.Background(), root, prepare, fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport() error = %v", err)
	}

	requests, err := DatasetImportAppendRequests(context.Background(), root, contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-append", IssuedAt: fixedClock()},
		Input: map[string]any{
			"importId":               job["id"],
			"expectedDatasetVersion": 3,
			"mode":                   "valid_rows_only",
		},
	}, fixedClock)
	if err != nil {
		t.Fatalf("DatasetImportAppendRequests() error = %v", err)
	}

	if len(requests) != 1 {
		t.Fatalf("append requests = %#v, want one valid row only", requests)
	}
	input := requests[0].Input
	if input["datasetId"] != "dataset-1" || input["version"] != 4 {
		t.Fatalf("append input = %#v, want dataset version 4", input)
	}
	items := input["items"].([]any)
	item := items[0].(map[string]any)
	if item["id"] == "" || item["split"] != "training" || item["curationStatus"] != "needs_review" {
		t.Fatalf("append item = %#v, want stable defaults", item)
	}
	if !strings.HasPrefix(requests[0].RequestID, "req-append-row-") {
		t.Fatalf("request id = %q, want row-specific stable id", requests[0].RequestID)
	}
}

func TestPrepareDatasetImportParsesZipBundleInStableOrder(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o755); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(root, "uploads", "upload-bundle.bin")
	createZipForTest(t, zipPath, map[string]string{
		"b.csv":        "prompt,answer\ncsv,ok\n",
		"a/items.json": `[{"prompt":"json","answer":"ok"}]`,
		"c.jsonl":      "{\"prompt\":\"jsonl\",\"answer\":\"ok\"}\n",
	})
	writeUploadManifestForTest(t, root, "upload-bundle", "items.zip", "zip")

	job, err := PrepareDatasetImport(context.Background(), root, datasetImportPrepareRequest("upload-bundle", "zip"), fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport(zip) error = %v", err)
	}

	files := job["sourceFiles"].([]importSourceFile)
	if len(files) != 3 || files[0].Path != "a/items.json" || files[1].Path != "b.csv" || files[2].Path != "c.jsonl" {
		t.Fatalf("source files = %#v, want stable archive order", files)
	}
	if job["validRows"] != 3 || job["totalRows"] != 3 {
		t.Fatalf("job = %#v, want three valid rows", job)
	}
}

func TestPrepareDatasetImportRejectsExpiredAndMismatchedUploads(t *testing.T) {
	t.Run("expired upload", func(t *testing.T) {
		root := stageUploadForTest(t, "upload-expired", "items.jsonl", []byte("{\"prompt\":\"hi\"}\n"))
		writeUploadManifestWithExpiryForTest(t, root, "upload-expired", "items.jsonl", "jsonl", fixedClock().Add(-time.Second))

		_, err := PrepareDatasetImport(context.Background(), root, datasetImportPrepareRequest("upload-expired", "jsonl"), fixedClock)

		if err == nil || !strings.Contains(err.Error(), "upload is expired") {
			t.Fatalf("error = %v, want expired upload validation", err)
		}
	})

	t.Run("format mismatch", func(t *testing.T) {
		root := stageUploadForTest(t, "upload-mismatch", "items.jsonl", []byte("{\"prompt\":\"hi\"}\n"))

		_, err := PrepareDatasetImport(context.Background(), root, datasetImportPrepareRequest("upload-mismatch", "csv"), fixedClock)

		if err == nil || !strings.Contains(err.Error(), "upload format does not match") {
			t.Fatalf("error = %v, want format mismatch validation", err)
		}
	})
}

func TestPrepareDatasetImportRejectsUnsafeZipEntry(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o755); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(root, "uploads", "upload-zip.bin")
	createZipForTest(t, zipPath, map[string]string{"../escape.jsonl": "{}\n"})
	writeUploadManifestForTest(t, root, "upload-zip", "items.zip", "zip")

	request := datasetImportPrepareRequest("upload-zip", "zip")
	_, err := PrepareDatasetImport(context.Background(), root, request, fixedClock)
	if err == nil {
		t.Fatal("PrepareDatasetImport() returned nil error for unsafe zip")
	}
	if got := err.Error(); got == "" || got[:7] != "ERR-001" {
		t.Fatalf("error = %v, want ERR-001 validation failure", err)
	}
}

func TestPrepareDatasetImportRejectsUnsafeZipVariants(t *testing.T) {
	tests := []struct {
		name  string
		entry string
	}{
		{name: "hidden file", entry: ".DS_Store"},
		{name: "system directory", entry: "__MACOSX/items.jsonl"},
		{name: "nested archive", entry: "nested.zip"},
		{name: "unsupported file", entry: "notes.txt"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o755); err != nil {
				t.Fatal(err)
			}
			zipPath := filepath.Join(root, "uploads", "upload-zip.bin")
			createZipForTest(t, zipPath, map[string]string{tt.entry: "content"})
			writeUploadManifestForTest(t, root, "upload-zip", "items.zip", "zip")

			_, err := PrepareDatasetImport(context.Background(), root, datasetImportPrepareRequest("upload-zip", "zip"), fixedClock)

			if err == nil || !strings.HasPrefix(err.Error(), "ERR-001") {
				t.Fatalf("error = %v, want validation failure", err)
			}
		})
	}
}

func TestCommitDatasetImportBlocksInvalidRowsUnlessPartialCommitAllowed(t *testing.T) {
	root := stageUploadForTest(t, "upload-invalid", "items.jsonl", []byte("{\"answer\":\"missing input\"}\n{\"prompt\":\"hi\",\"answer\":\"hello\"}\n"))
	prepare := datasetImportPrepareRequest("upload-invalid", "jsonl")
	job, err := PrepareDatasetImport(context.Background(), root, prepare, fixedClock)
	if err != nil {
		t.Fatalf("PrepareDatasetImport() error = %v", err)
	}

	_, err = CommitDatasetImport(context.Background(), root, contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-commit", IssuedAt: fixedClock()},
		Input: map[string]any{
			"importId":               job["id"],
			"expectedDatasetVersion": 1.0,
			"mode":                   "reject_if_any_error",
		},
	}, fixedClock)
	if err == nil {
		t.Fatal("CommitDatasetImport() returned nil error for invalid rows without partial commit")
	}

	commit, err := CommitDatasetImport(context.Background(), root, contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-commit-partial", IssuedAt: fixedClock()},
		Input: map[string]any{
			"importId":               job["id"],
			"expectedDatasetVersion": 1.0,
			"mode":                   "valid_rows_only",
		},
	}, fixedClock)
	if err != nil {
		t.Fatalf("CommitDatasetImport(partial) error = %v", err)
	}
	if commit["status"] != "committed" || commit["committedDatasetVersion"] != 2 || commit["validRows"] != 1 {
		t.Fatalf("commit = %#v, want committed one valid row", commit)
	}
}

func datasetImportPrepareRequest(uploadID string, format string) contracts.EvalMutationRequest {
	return contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-prepare", IssuedAt: fixedClock()},
		Input: map[string]any{
			"datasetId":    "dataset-1",
			"uploadId":     uploadID,
			"format":       format,
			"previewLimit": 100.0,
			"mapping": map[string]any{
				"input": []any{
					map[string]any{"targetPath": "prompt", "source": map[string]any{"jsonPath": "$.prompt", "column": "prompt"}},
				},
				"expected": []any{
					map[string]any{"targetPath": "answer", "source": map[string]any{"jsonPath": "$.answer", "column": "answer"}},
				},
			},
			"defaults": map[string]any{
				"split":              "training",
				"curationStatus":     "needs_review",
				"metadata":           map[string]any{},
				"allowPartialCommit": true,
			},
		},
	}
}

func stageUploadForTest(t *testing.T, uploadID string, filename string, data []byte) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "uploads"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "uploads", uploadID+".bin"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	writeUploadManifestForTest(t, root, uploadID, filename, detectedFormatForTest(filename))
	return root
}

func writeUploadManifestForTest(t *testing.T, root string, uploadID string, filename string, format string) {
	t.Helper()
	writeUploadManifestWithExpiryForTest(t, root, uploadID, filename, format, fixedClock().Add(24*time.Hour))
}

func writeUploadManifestWithExpiryForTest(t *testing.T, root string, uploadID string, filename string, format string, expiresAt time.Time) {
	t.Helper()
	manifest := map[string]any{
		"uploadId":       uploadID,
		"projectId":      "project-1",
		"ownerUserId":    "user-1",
		"filename":       filename,
		"sizeBytes":      1,
		"sha256":         "sha",
		"detectedFormat": format,
		"createdAt":      fixedClock().Format(time.RFC3339),
		"expiresAt":      expiresAt.Format(time.RFC3339),
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "uploads", uploadID+".json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func createZipForTest(t *testing.T, path string, files map[string]string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	writer := zip.NewWriter(file)
	defer writer.Close()
	for name, content := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
}

func detectedFormatForTest(filename string) string {
	switch filepath.Ext(filename) {
	case ".csv":
		return "csv"
	case ".zip":
		return "zip"
	default:
		return "jsonl"
	}
}
