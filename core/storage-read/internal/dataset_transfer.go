package internal

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	SubjectEvalDatasetExportStart = "eval.dataset.export.start"
	SubjectEvalDatasetTransferGet = "eval.dataset.transfer.get"
	datasetTransferTTL            = 24 * time.Hour
)

func StartDatasetExport(ctx context.Context, root string, request contracts.EvalMutationRequest, items []map[string]any, now func() time.Time) (map[string]any, error) {
	_ = ctx
	if strings.TrimSpace(request.RequestID) == "" || request.IssuedAt.IsZero() {
		return nil, validationError("requestId and issuedAt are required")
	}
	datasetID := stringInputValue(request.Input, "datasetId")
	datasetVersionID := stringInputValue(request.Input, "datasetVersionId")
	format := stringInputValue(request.Input, "format")
	if datasetID == "" {
		return nil, validationError("datasetId is required")
	}
	if format != "jsonl" && format != "json_array" && format != "csv" {
		return nil, validationError("format is unsupported")
	}
	canonical := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if datasetVersionID == "" {
			datasetVersionID = stringInputValue(item, "datasetVersionId")
		}
		canonical = append(canonical, canonicalDatasetItem(item))
	}
	if datasetVersionID == "" {
		datasetVersionID = fmt.Sprintf("%s:version:%d", datasetID, maxTransferInt(1, intInputValue(request.Input, "datasetVersion")))
	}
	artifact, extension, err := encodeDatasetExport(format, canonical)
	if err != nil {
		return nil, err
	}
	exportID := stableTransferID("export", request.RequestID, datasetID, format)
	filename := exportID + "-data" + extension
	exportDir := filepath.Join(root, "exports")
	if err := os.MkdirAll(exportDir, 0o755); err != nil {
		return nil, bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
	}
	if err := os.WriteFile(filepath.Join(exportDir, filename), artifact, 0o600); err != nil {
		return nil, bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
	}
	sum := sha256.Sum256(artifact)
	createdAt := now().UTC()
	job := map[string]any{
		"id":               exportID,
		"exportId":         exportID,
		"datasetId":        datasetID,
		"datasetVersionId": datasetVersionID,
		"datasetVersion":   maxTransferInt(1, intInputValue(request.Input, "datasetVersion")),
		"status":           "ready",
		"format":           format,
		"rowCount":         len(canonical),
		"sizeBytes":        len(artifact),
		"sha256":           hex.EncodeToString(sum[:]),
		"downloadUrl":      "/api/ai-eval/dataset-exports/" + exportID + "/download",
		"filename":         filename,
		"createdAt":        createdAt.Format(time.RFC3339),
		"expiresAt":        createdAt.Add(datasetTransferTTL).Format(time.RFC3339),
	}
	if err := writeTransferJSON(filepath.Join(exportDir, exportID+".json"), job); err != nil {
		return nil, bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
	}
	return job, nil
}

func GetDatasetTransfer(ctx context.Context, root string, input map[string]any) (map[string]any, error) {
	_ = ctx
	id := stringInputValue(input, "id")
	kind := stringInputValue(input, "kind")
	if id == "" {
		return nil, validationError("id is required")
	}
	var dir string
	switch kind {
	case "import":
		dir = "imports"
	case "export":
		dir = "exports"
	default:
		return nil, validationError("kind is invalid")
	}
	data, err := os.ReadFile(filepath.Join(root, dir, id+".json"))
	if err != nil {
		return nil, nil
	}
	var job map[string]any
	if err := json.Unmarshal(data, &job); err != nil {
		return nil, validationError("transfer job is invalid")
	}
	return job, nil
}

func encodeDatasetExport(format string, rows []map[string]any) ([]byte, string, error) {
	switch format {
	case "jsonl":
		var buffer bytes.Buffer
		encoder := json.NewEncoder(&buffer)
		for _, row := range rows {
			if err := encoder.Encode(row); err != nil {
				return nil, "", bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
			}
		}
		return buffer.Bytes(), ".jsonl", nil
	case "json_array":
		data, err := json.Marshal(rows)
		if err != nil {
			return nil, "", bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
		}
		return data, ".json", nil
	case "csv":
		var buffer bytes.Buffer
		writer := csv.NewWriter(&buffer)
		header := []string{"input", "expected", "observedOutput", "reason", "metadata", "sourceRefs", "split", "curationStatus", "contentTreatment"}
		if err := writer.Write(header); err != nil {
			return nil, "", bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
		}
		for _, row := range rows {
			record := make([]string, 0, len(header))
			for _, key := range header {
				record = append(record, csvValue(row[key]))
			}
			if err := writer.Write(record); err != nil {
				return nil, "", bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
			}
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			return nil, "", bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
		}
		return buffer.Bytes(), ".csv", nil
	default:
		return nil, "", validationError("format is unsupported")
	}
}

func canonicalDatasetItem(item map[string]any) map[string]any {
	return map[string]any{
		"input":            transferValueOrDefault(item["input"], map[string]any{}),
		"expected":         nullableValue(item["expected"]),
		"observedOutput":   nullableValue(item["observedOutput"]),
		"reason":           transferValueOrDefault(item["reason"], ""),
		"metadata":         transferValueOrDefault(item["metadata"], map[string]any{}),
		"sourceRefs":       transferValueOrDefault(item["sourceRefs"], []any{}),
		"split":            normalizedExportSplit(item["split"]),
		"curationStatus":   normalizedExportCurationStatus(item),
		"contentTreatment": transferValueOrDefault(item["contentTreatment"], map[string]any{}),
	}
}

func normalizedExportSplit(value any) string {
	switch strings.TrimSpace(fmt.Sprint(value)) {
	case "training", "validation", "test":
		return strings.TrimSpace(fmt.Sprint(value))
	default:
		return "validation"
	}
}

func normalizedExportCurationStatus(item map[string]any) string {
	switch strings.TrimSpace(fmt.Sprint(item["curationStatus"])) {
	case "draft", "needs_expected", "needs_review", "ready", "rejected":
		return strings.TrimSpace(fmt.Sprint(item["curationStatus"]))
	}
	switch strings.TrimSpace(fmt.Sprint(item["reviewStatus"])) {
	case "reviewed", "ready", "approved":
		return "ready"
	case "rejected":
		return "rejected"
	case "unreviewed", "pending", "needs_review":
		return "needs_review"
	default:
		return "needs_review"
	}
}

func csvValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	default:
		data, err := json.Marshal(typed)
		if err != nil {
			return ""
		}
		return string(data)
	}
}

func transferRoot() string {
	if value := strings.TrimSpace(os.Getenv("CLOUDGRID_DATASET_TRANSFER_DIR")); value != "" {
		return value
	}
	return ".cloudgrid/dataset-transfer"
}

func TransferRootForAdapter() string {
	return transferRoot()
}

func stringInputValue(input map[string]any, key string) string {
	value, ok := input[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func intInputValue(input map[string]any, key string) int {
	switch value := input[key].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}

func transferValueOrDefault(value any, fallback any) any {
	if value == nil {
		return fallback
	}
	return value
}

func nullableValue(value any) any {
	if value == "" {
		return nil
	}
	return value
}

func stableTransferID(prefix string, parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(append([]string{prefix}, parts...), "\x00")))
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(sum[:])[:16])
}

func maxTransferInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func writeTransferJSON(path string, value map[string]any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
