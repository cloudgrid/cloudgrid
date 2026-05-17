package ingest

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	EvalDatasetImportPrepareSubject = "eval.dataset.import.prepare"
	EvalDatasetImportCommitSubject  = "eval.dataset.import.commit"

	datasetTransferTTL = 24 * time.Hour
	maxPreviewRows     = 100
)

type uploadManifest struct {
	UploadID       string    `json:"uploadId"`
	ProjectID      string    `json:"projectId"`
	OwnerUserID    string    `json:"ownerUserId"`
	Filename       string    `json:"filename"`
	SizeBytes      int64     `json:"sizeBytes"`
	SHA256         string    `json:"sha256"`
	DetectedFormat string    `json:"detectedFormat"`
	CreatedAt      time.Time `json:"createdAt"`
	ExpiresAt      time.Time `json:"expiresAt"`
}

type importSourceFile struct {
	Path      string `json:"path"`
	Format    string `json:"format"`
	SizeBytes int64  `json:"sizeBytes"`
	RowCount  int    `json:"rowCount,omitempty"`
	SHA256    string `json:"sha256"`
}

type parsedRow struct {
	filePath  string
	rowNumber int
	row       map[string]any
}

type mappingRule struct {
	targetPath string
	source     map[string]any
}

func PrepareDatasetImport(ctx context.Context, root string, request contracts.EvalMutationRequest, now func() time.Time) (map[string]any, error) {
	_ = ctx
	if err := validateDatasetImportPrepareRequest(request); err != nil {
		return nil, err
	}
	uploadID := stringValue(request.Input, "uploadId")
	format := stringValue(request.Input, "format")
	manifest, data, err := readUpload(root, uploadID)
	if err != nil {
		return nil, err
	}
	if manifest.ExpiresAt.Before(now().UTC()) {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: upload is expired")
	}
	if manifest.DetectedFormat != "" && manifest.DetectedFormat != format {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: upload format does not match request format")
	}
	rows, files, err := parseImportRows(data, manifest.Filename, format)
	if err != nil {
		return nil, err
	}
	if len(rows) > 50000 {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: import row limit exceeded")
	}

	defaults := objectValueWithDefault(request.Input, "defaults")
	previewLimit := intValue(request.Input, "previewLimit")
	if previewLimit <= 0 || previewLimit > maxPreviewRows {
		previewLimit = maxPreviewRows
	}
	previewRows := make([]map[string]any, 0, minInt(previewLimit, len(rows)))
	validRows := 0
	errorRows := 0
	for _, row := range rows {
		item, issues := normalizeImportRow(row.row, objectValueWithDefault(request.Input, "mapping"), defaults, format)
		if len(issues) == 0 {
			validRows++
		} else {
			errorRows++
		}
		if len(previewRows) < previewLimit {
			preview := map[string]any{
				"rowNumber": row.rowNumber,
				"filePath":  row.filePath,
				"errors":    issues,
				"warnings":  []map[string]any{},
			}
			if len(issues) == 0 {
				preview["item"] = item
			}
			previewRows = append(previewRows, preview)
		}
	}
	createdAt := now().UTC()
	job := map[string]any{
		"id":          stableID("import", request.RequestID, uploadID),
		"datasetId":   stringValue(request.Input, "datasetId"),
		"uploadId":    uploadID,
		"status":      "preview_ready",
		"format":      format,
		"sourceFiles": files,
		"mapping":     request.Input["mapping"],
		"defaults":    defaults,
		"previewRows": previewRows,
		"totalRows":   len(rows),
		"validRows":   validRows,
		"errorRows":   errorRows,
		"warnings":    []string{},
		"createdAt":   createdAt.Format(time.RFC3339),
		"expiresAt":   createdAt.Add(datasetTransferTTL).Format(time.RFC3339),
	}
	if err := writeJSON(filepath.Join(root, "imports", job["id"].(string)+".json"), job); err != nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: %w", err)
	}
	return job, nil
}

func CommitDatasetImport(ctx context.Context, root string, request contracts.EvalMutationRequest, now func() time.Time) (map[string]any, error) {
	_ = ctx
	job, expectedVersion, err := validatedDatasetImportCommit(root, request, now)
	if err != nil {
		return nil, err
	}
	importID := stringValue(request.Input, "importId")
	job["status"] = "committed"
	job["committedDatasetVersion"] = expectedVersion + 1
	job["validRows"] = intValue(job, "validRows")
	job["errorRows"] = intValue(job, "errorRows")
	job["totalRows"] = intValue(job, "totalRows")
	job["committedAt"] = now().UTC().Format(time.RFC3339)
	if err := writeJSON(filepath.Join(root, "imports", importID+".json"), job); err != nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: %w", err)
	}
	return job, nil
}

func DatasetImportAppendRequests(ctx context.Context, root string, request contracts.EvalMutationRequest, now func() time.Time) ([]contracts.EvalMutationRequest, error) {
	_ = ctx
	job, expectedVersion, err := validatedDatasetImportCommit(root, request, now)
	if err != nil {
		return nil, err
	}
	uploadID := stringValue(job, "uploadId")
	if uploadID == "" {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: import preview is invalid")
	}
	manifest, data, err := readUpload(root, uploadID)
	if err != nil {
		return nil, err
	}
	format := stringValue(job, "format")
	rows, _, err := parseImportRows(data, manifest.Filename, format)
	if err != nil {
		return nil, err
	}
	datasetID := stringValue(job, "datasetId")
	mapping := objectValueWithDefault(job, "mapping")
	defaults := objectValueWithDefault(job, "defaults")
	version := expectedVersion + 1
	requests := make([]contracts.EvalMutationRequest, 0, intValue(job, "validRows"))
	for _, row := range rows {
		item, issues := normalizeImportRow(row.row, mapping, defaults, format)
		if len(issues) > 0 {
			continue
		}
		rowID := datasetImportRowID(stringValue(job, "id"), row.filePath, row.rowNumber)
		item["id"] = "dataset-item-" + rowID
		requests = append(requests, contracts.EvalMutationRequest{
			BridgeEnvelope: contracts.BridgeEnvelope{
				RequestID: request.RequestID + "-row-" + rowID,
				IssuedAt:  request.IssuedAt,
			},
			Input: map[string]any{
				"datasetId": datasetID,
				"version":   version,
				"items":     []any{item},
			},
		})
	}
	return requests, nil
}

func validatedDatasetImportCommit(root string, request contracts.EvalMutationRequest, now func() time.Time) (map[string]any, int, error) {
	if strings.TrimSpace(request.RequestID) == "" || request.IssuedAt.IsZero() {
		return nil, 0, fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId and issuedAt are required")
	}
	importID := stringValue(request.Input, "importId")
	if importID == "" {
		return nil, 0, fmt.Errorf("ERR-001 VALIDATION_FAILED: importId is required")
	}
	job, err := readJob(filepath.Join(root, "imports", importID+".json"))
	if err != nil {
		return nil, 0, err
	}
	expiresAt, _ := time.Parse(time.RFC3339, stringValue(job, "expiresAt"))
	if !expiresAt.IsZero() && expiresAt.Before(now().UTC()) {
		return nil, 0, fmt.Errorf("ERR-001 VALIDATION_FAILED: import preview is expired")
	}
	errorRows := intValue(job, "errorRows")
	mode := stringValueWithDefault(request.Input, "mode", "valid_rows_only")
	defaults := objectValueWithDefault(job, "defaults")
	partialAllowed := boolValue(defaults, "allowPartialCommit")
	if errorRows > 0 && (mode != "valid_rows_only" || !partialAllowed) {
		return nil, 0, fmt.Errorf("ERR-001 VALIDATION_FAILED: import has row errors")
	}
	expectedVersion := intValue(request.Input, "expectedDatasetVersion")
	if expectedVersion < 1 {
		return nil, 0, fmt.Errorf("ERR-001 VALIDATION_FAILED: expectedDatasetVersion must be at least 1")
	}
	return job, expectedVersion, nil
}

func datasetImportRowID(importID string, filePath string, rowNumber int) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d", importID, filePath, rowNumber)))
	return hex.EncodeToString(sum[:8])
}

func validateDatasetImportPrepareRequest(request contracts.EvalMutationRequest) error {
	if strings.TrimSpace(request.RequestID) == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if request.IssuedAt.IsZero() {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: issuedAt is required")
	}
	for _, field := range []string{"datasetId", "uploadId", "format"} {
		if err := requireNonBlank(request.Input, field); err != nil {
			return err
		}
	}
	mapping := objectValueWithDefault(request.Input, "mapping")
	if len(arrayValue(mapping, "input")) == 0 {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: mapping input target is required")
	}
	switch stringValue(request.Input, "format") {
	case "jsonl", "json_array", "csv", "zip":
		return nil
	default:
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: format is unsupported")
	}
}

func readUpload(root string, uploadID string) (uploadManifest, []byte, error) {
	var manifest uploadManifest
	manifestPath := filepath.Join(root, "uploads", uploadID+".json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return manifest, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: upload is missing")
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return manifest, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: upload manifest is invalid")
	}
	data, err := os.ReadFile(filepath.Join(root, "uploads", uploadID+".bin"))
	if err != nil {
		return manifest, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: upload bytes are missing")
	}
	return manifest, data, nil
}

func parseImportRows(data []byte, filename string, format string) ([]parsedRow, []importSourceFile, error) {
	switch format {
	case "jsonl":
		rows, err := parseJSONL(data, filename)
		return rows, []importSourceFile{sourceFile(filename, format, data, len(rows))}, err
	case "json_array":
		rows, err := parseJSONArray(data, filename)
		return rows, []importSourceFile{sourceFile(filename, format, data, len(rows))}, err
	case "csv":
		rows, err := parseCSV(data, filename)
		return rows, []importSourceFile{sourceFile(filename, format, data, len(rows))}, err
	case "zip":
		return parseZip(data)
	default:
		return nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: format is unsupported")
	}
}

func parseJSONL(data []byte, filename string) ([]parsedRow, error) {
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	rows := []parsedRow{}
	line := 0
	for scanner.Scan() {
		line++
		text := strings.TrimSpace(scanner.Text())
		if text == "" {
			continue
		}
		var value map[string]any
		if err := json.Unmarshal([]byte(text), &value); err != nil {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: JSONL line is not a JSON object")
		}
		if value == nil {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: JSONL line is not a JSON object")
		}
		rows = append(rows, parsedRow{filePath: filename, rowNumber: line, row: value})
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: JSONL cannot be read")
	}
	return rows, nil
}

func parseJSONArray(data []byte, filename string) ([]parsedRow, error) {
	var values []map[string]any
	if err := json.Unmarshal(data, &values); err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: JSON array is invalid")
	}
	rows := make([]parsedRow, 0, len(values))
	for index, value := range values {
		if value == nil {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: JSON array element is not an object")
		}
		rows = append(rows, parsedRow{filePath: filename, rowNumber: index + 1, row: value})
	}
	return rows, nil
}

func parseCSV(data []byte, filename string) ([]parsedRow, error) {
	reader := csv.NewReader(bytes.NewReader(data))
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: CSV has no header row")
	}
	seen := map[string]struct{}{}
	for _, name := range header {
		if _, exists := seen[name]; exists {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: CSV has duplicate header names")
		}
		seen[name] = struct{}{}
	}
	rows := []parsedRow{}
	rowNumber := 1
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: CSV row is invalid")
		}
		rowNumber++
		row := map[string]any{}
		for index, name := range header {
			if index < len(record) && record[index] != "" {
				row[name] = record[index]
			} else {
				row[name] = nil
			}
		}
		rows = append(rows, parsedRow{filePath: filename, rowNumber: rowNumber - 1, row: row})
	}
	return rows, nil
}

func parseZip(data []byte) ([]parsedRow, []importSourceFile, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP archive is invalid")
	}
	files := append([]*zip.File(nil), reader.File...)
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })
	rows := []parsedRow{}
	sourceFiles := []importSourceFile{}
	for _, file := range files {
		if file.FileInfo().IsDir() {
			continue
		}
		format, err := zipEntryFormat(file)
		if err != nil {
			return nil, nil, err
		}
		content, err := readZipEntry(file)
		if err != nil {
			return nil, nil, err
		}
		entryRows, _, err := parseImportRows(content, file.Name, format)
		if err != nil {
			return nil, nil, err
		}
		rows = append(rows, entryRows...)
		sourceFiles = append(sourceFiles, sourceFile(file.Name, format, content, len(entryRows)))
	}
	if len(sourceFiles) == 0 {
		return nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP contains no supported files")
	}
	return rows, sourceFiles, nil
}

func zipEntryFormat(file *zip.File) (string, error) {
	name := file.Name
	clean := path.Clean(name)
	mode := file.FileInfo().Mode()
	if strings.HasPrefix(name, "/") || strings.HasPrefix(clean, "../") || clean == ".." || strings.Contains(clean, "/../") {
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP entry path is unsafe")
	}
	if mode&os.ModeSymlink != 0 || mode.Perm()&0o111 != 0 {
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP entry is unsafe")
	}
	base := path.Base(clean)
	if strings.HasPrefix(base, ".") || strings.HasPrefix(clean, "__MACOSX/") {
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP contains hidden system files")
	}
	switch strings.ToLower(path.Ext(clean)) {
	case ".jsonl":
		return "jsonl", nil
	case ".json":
		return "json_array", nil
	case ".csv":
		return "csv", nil
	case ".zip":
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP contains nested archive")
	default:
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP contains unsupported file")
	}
}

func readZipEntry(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: ZIP entry cannot be opened")
	}
	defer reader.Close()
	return io.ReadAll(reader)
}

func normalizeImportRow(row map[string]any, mapping map[string]any, defaults map[string]any, format string) (map[string]any, []map[string]any) {
	item := map[string]any{
		"input":         map[string]any{},
		"expected":      nil,
		"metadata":      objectValueWithDefault(defaults, "metadata"),
		"sourceTraceId": nil,
		"sourceSpanId":  nil,
		"split":         stringValueWithDefault(defaults, "split", "dev"),
		"reviewStatus":  stringValueWithDefault(defaults, "reviewStatus", "unreviewed"),
		"synthetic":     boolValue(defaults, "synthetic"),
	}
	applyFieldMappings(item["input"].(map[string]any), row, fieldMappings(mapping, "input"), format)
	expected := map[string]any{}
	applyFieldMappings(expected, row, fieldMappings(mapping, "expected"), format)
	if len(expected) > 0 {
		item["expected"] = expected
	}
	applyFieldMappings(item["metadata"].(map[string]any), row, fieldMappings(mapping, "metadata"), format)
	for _, key := range []string{"sourceTraceId", "sourceSpanId", "split", "reviewStatus"} {
		if source, ok := mapping[key].(map[string]any); ok {
			if value, exists := sourceValue(row, source, format); exists {
				item[key] = value
			}
		}
	}
	issues := []map[string]any{}
	input, inputOK := item["input"].(map[string]any)
	if !inputOK || len(input) == 0 {
		issues = append(issues, issue("input_required", "Mapped input must be a non-empty object", "input"))
	}
	if _, ok := item["metadata"].(map[string]any); !ok {
		issues = append(issues, issue("metadata_invalid", "Mapped metadata must be an object", "metadata"))
	}
	if !validSplit(stringValue(item, "split")) {
		issues = append(issues, issue("split_invalid", "Mapped split is invalid", "split"))
	}
	if !validReviewStatus(stringValue(item, "reviewStatus")) {
		issues = append(issues, issue("review_status_invalid", "Mapped review status is invalid", "reviewStatus"))
	}
	return item, issues
}

func fieldMappings(mapping map[string]any, key string) []mappingRule {
	raw := arrayValue(mapping, key)
	rules := make([]mappingRule, 0, len(raw))
	for _, item := range raw {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		source, _ := object["source"].(map[string]any)
		rules = append(rules, mappingRule{targetPath: stringValue(object, "targetPath"), source: source})
	}
	return rules
}

func applyFieldMappings(target map[string]any, row map[string]any, rules []mappingRule, format string) {
	for _, rule := range rules {
		if rule.targetPath == "" {
			continue
		}
		if value, exists := sourceValue(row, rule.source, format); exists {
			setPath(target, strings.Split(rule.targetPath, "."), value)
		}
	}
}

func sourceValue(row map[string]any, source map[string]any, format string) (any, bool) {
	if value, exists := source["constant"]; exists {
		return value, true
	}
	var value any
	var exists bool
	if format == "csv" {
		value, exists = row[stringValue(source, "column")]
	} else {
		value, exists = jsonPathValue(row, stringValue(source, "jsonPath"))
	}
	if (!exists || value == nil) && source["defaultValue"] != nil {
		return source["defaultValue"], true
	}
	return value, exists && value != nil
}

func jsonPathValue(row map[string]any, expression string) (any, bool) {
	if expression == "" {
		return nil, false
	}
	if expression == "$" {
		return row, true
	}
	if !strings.HasPrefix(expression, "$.") {
		return nil, false
	}
	current := any(row)
	for _, part := range strings.Split(strings.TrimPrefix(expression, "$."), ".") {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		value, ok := object[part]
		if !ok {
			return nil, false
		}
		current = value
	}
	return current, true
}

func setPath(target map[string]any, parts []string, value any) {
	if len(parts) == 0 {
		return
	}
	if len(parts) == 1 {
		target[parts[0]] = value
		return
	}
	next := parts[1]
	if _, err := strconv.Atoi(next); err == nil {
		array, _ := target[parts[0]].([]any)
		index, _ := strconv.Atoi(next)
		for len(array) <= index {
			array = append(array, map[string]any{})
		}
		child, _ := array[index].(map[string]any)
		if child == nil {
			child = map[string]any{}
			array[index] = child
		}
		target[parts[0]] = array
		setPath(child, parts[2:], value)
		return
	}
	child, _ := target[parts[0]].(map[string]any)
	if child == nil {
		child = map[string]any{}
		target[parts[0]] = child
	}
	setPath(child, parts[1:], value)
}

func sourceFile(name string, format string, data []byte, rowCount int) importSourceFile {
	sum := sha256.Sum256(data)
	return importSourceFile{
		Path:      name,
		Format:    format,
		SizeBytes: int64(len(data)),
		RowCount:  rowCount,
		SHA256:    hex.EncodeToString(sum[:]),
	}
}

func readJob(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: import preview is expired")
	}
	var job map[string]any
	if err := json.Unmarshal(data, &job); err != nil {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: import preview is invalid")
	}
	return job, nil
}

func writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func issue(code string, message string, path string) map[string]any {
	return map[string]any{"code": code, "message": message, "path": path}
}

func validSplit(value string) bool {
	switch value {
	case "dev", "optimization", "validation", "regression", "holdout":
		return true
	default:
		return false
	}
}

func validReviewStatus(value string) bool {
	switch value {
	case "unreviewed", "reviewed", "rejected":
		return true
	default:
		return false
	}
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
