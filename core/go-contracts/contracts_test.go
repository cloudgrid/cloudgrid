package contracts

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestTraceSearchRequestJSONShape(t *testing.T) {
	issuedAt := time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC)
	limit := 50
	request := TraceSearchRequest{
		BridgeEnvelope: BridgeEnvelope{RequestID: "req-1", IssuedAt: issuedAt},
		Query:          TraceSearchQuery{Limit: &limit},
	}

	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}

	if decoded["requestId"] != "req-1" {
		t.Fatalf("requestId = %v, want req-1", decoded["requestId"])
	}
	if _, ok := decoded["query"].(map[string]any); !ok {
		t.Fatalf("query is missing or not an object: %#v", decoded["query"])
	}
}

func TestTraceSummaryJSONShapeIncludesOperationName(t *testing.T) {
	operationName := "POST /checkout"
	summary := TraceSummary{
		Trace: Trace{
			ID:         "trace-1",
			StartedAt:  time.Date(2026, 5, 8, 12, 0, 0, 0, time.UTC),
			Attributes: Attributes{},
		},
		OperationName:  &operationName,
		SpanCount:      1,
		ErrorSpanCount: 0,
		LogCount:       0,
		ServiceCount:   1,
	}

	encoded, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("marshal trace summary: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal trace summary: %v", err)
	}
	if decoded["operationName"] != operationName {
		t.Fatalf("operationName = %#v, want %s", decoded["operationName"], operationName)
	}
}

func TestAlertRuleListRequestJSONShapeIncludesSearchInput(t *testing.T) {
	search := "checkout"
	severity := AlertSeverityWarning
	signal := AlertSignalTrace
	enabled := true
	sortMode := AlertRuleSortUpdatedAtDesc
	request := AlertRuleListRequest{
		BridgeEnvelope: BridgeEnvelope{RequestID: "req-alert-rules"},
		ProjectID:      "project-1",
		Input: &AlertRuleSearchInput{
			Search:   &search,
			Severity: &severity,
			Signal:   &signal,
			Enabled:  &enabled,
			Sort:     &sortMode,
		},
	}

	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal alert rule list request: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal alert rule list request: %v", err)
	}
	input, ok := decoded["input"].(map[string]any)
	if !ok {
		t.Fatalf("input is missing or not an object: %#v", decoded["input"])
	}
	if input["search"] != search || input["severity"] != string(severity) || input["signal"] != string(signal) || input["enabled"] != enabled || input["sort"] != string(sortMode) {
		t.Fatalf("input = %#v, want alert rule search filters", input)
	}
}

func TestDashboardSaveRequestJSONShape(t *testing.T) {
	issuedAt := time.Date(2026, 5, 14, 12, 0, 0, 0, time.UTC)
	version := 2
	id := "dashboard:default_latency"
	request := DashboardSaveRequest{
		BridgeEnvelope: BridgeEnvelope{RequestID: "req-dashboard", IssuedAt: issuedAt},
		Input: DashboardSaveInput{
			ID:                &id,
			Version:           &version,
			Name:              "Latency",
			DefaultTimeWindow: ptr("PT1H"),
			Widgets: []DashboardWidgetInput{{
				ID:     "p95",
				Title:  "P95 latency",
				Kind:   DashboardWidgetKindMetricTimeseries,
				Layout: DashboardWidgetLayoutInput{X: 0, Y: 0, W: 6, H: 4},
				Metric: &DashboardMetricWidgetInput{
					MetricName:    "http.server.duration",
					Aggregation:   MetricAggregationP95,
					Visualization: MetricChartTypeLine,
				},
			}},
		},
	}

	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal dashboard save request: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal dashboard save request: %v", err)
	}
	input, ok := decoded["input"].(map[string]any)
	if !ok {
		t.Fatalf("input is missing or not an object: %#v", decoded["input"])
	}
	if input["version"] != float64(2) {
		t.Fatalf("version = %#v, want 2", input["version"])
	}
	if input["defaultTimeWindow"] != "PT1H" {
		t.Fatalf("defaultTimeWindow = %#v, want PT1H", input["defaultTimeWindow"])
	}
}

func TestProjectTelemetryOverviewJSONShapeIncludesMetricCount(t *testing.T) {
	project := Project{
		ID:             "project-1",
		OrganizationID: "org-1",
		Name:           "Default",
		Slug:           "default",
		Status:         ProjectStatusActive,
		Telemetry: ProjectTelemetryOverview{
			TraceCount:   1,
			LogCount:     2,
			MetricCount:  3,
			ServiceCount: 4,
		},
	}

	encoded, err := json.Marshal(project)
	if err != nil {
		t.Fatalf("marshal project: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal project: %v", err)
	}
	telemetry, ok := decoded["telemetry"].(map[string]any)
	if !ok {
		t.Fatalf("telemetry is missing or not an object: %#v", decoded["telemetry"])
	}
	if telemetry["metricCount"] != float64(3) {
		t.Fatalf("metricCount = %#v, want 3", telemetry["metricCount"])
	}
}

func TestProjectTelemetryOverviewRequestJSONShape(t *testing.T) {
	issuedAt := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	tenantID := "tenant-1"
	request := ProjectTelemetryOverviewRequest{
		BridgeEnvelope: BridgeEnvelope{RequestID: "req-project-overview", IssuedAt: issuedAt},
		Projects: []ProjectTelemetryOverviewTarget{{
			TenantID:  &tenantID,
			CompanyID: "company-1",
			ProjectID: "project-1",
		}},
	}

	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal request: %v", err)
	}
	projects, ok := decoded["projects"].([]any)
	if !ok || len(projects) != 1 {
		t.Fatalf("projects = %#v, want one target", decoded["projects"])
	}
	target, ok := projects[0].(map[string]any)
	if !ok || target["companyId"] != "company-1" || target["projectId"] != "project-1" {
		t.Fatalf("target = %#v, want company/project IDs", projects[0])
	}
}

func TestDatasetCandidatesPrepareRequestJSONShapeMatchesAsyncAPI(t *testing.T) {
	fieldTags := jsonFieldTagsForStruct(t, reflect.TypeOf(DatasetCandidatesPrepareRequest{}))
	expectedTags := []string{
		"projectId",
		"datasetId",
		"datasetIds",
		"autoMatchDatasets",
		"sources",
		"traceSelection",
		"previewLimit",
		"split",
		"curationStatus",
		"contentTreatment",
		"anonymizationPolicyId",
		"anonymizationPolicyVersion",
		"idempotencyKey",
	}
	if !reflect.DeepEqual(fieldTags, expectedTags) {
		t.Fatalf("DatasetCandidatesPrepareRequest json tags = %#v, want %#v", fieldTags, expectedTags)
	}
	sourceFieldTags := jsonFieldTagsForStruct(t, reflect.TypeOf(DatasetCandidateSource{}))
	expectedSourceTags := []string{
		"sourceKind",
		"traceId",
		"spanId",
		"metricResultId",
		"evaluationItemRunId",
		"productionMeasurementId",
		"coverageGapId",
		"healthIssueId",
		"clusterId",
	}
	if !reflect.DeepEqual(sourceFieldTags, expectedSourceTags) {
		t.Fatalf("DatasetCandidateSource json tags = %#v, want %#v", sourceFieldTags, expectedSourceTags)
	}
	traceSelectionFieldTags := jsonFieldTagsForStruct(t, reflect.TypeOf(DatasetTraceCandidateSelection{}))
	expectedTraceSelectionTags := []string{"mode", "traceRefs", "spanRefs", "search"}
	if !reflect.DeepEqual(traceSelectionFieldTags, expectedTraceSelectionTags) {
		t.Fatalf("DatasetTraceCandidateSelection json tags = %#v, want %#v", traceSelectionFieldTags, expectedTraceSelectionTags)
	}

	datasetID := "dataset-primary"
	autoMatch := false
	previewLimit := 25
	split := DatasetSplitTraining
	curationStatus := DatasetCurationStatusNeedsReview
	contentTreatment := DatasetContentTreatmentRealisticAnonymized
	traceSelectionMode := DatasetTraceSelectionModeSelected
	request := DatasetCandidatesPrepareRequest{
		BridgeEnvelope:    BridgeEnvelope{RequestID: "req-candidates"},
		ProjectID:         "project-1",
		DatasetID:         &datasetID,
		DatasetIDs:        []string{"dataset-a", "dataset-b"},
		AutoMatchDatasets: &autoMatch,
		Sources: []DatasetCandidateSource{{
			SourceKind:              DatasetCandidateSourceKindProductionMeasurement,
			ProductionMeasurementID: ptr("measurement-1"),
		}},
		TraceSelection: &DatasetTraceCandidateSelection{
			Mode:      &traceSelectionMode,
			TraceRefs: []DatasetTraceRef{{TraceID: "trace-1"}},
			SpanRefs:  []DatasetSpanRef{{TraceID: "trace-1", SpanID: "span-1"}},
			Search:    map[string]any{"service": "checkout"},
		},
		PreviewLimit:               &previewLimit,
		Split:                      &split,
		CurationStatus:             &curationStatus,
		ContentTreatment:           &contentTreatment,
		AnonymizationPolicyID:      ptr("policy-1"),
		AnonymizationPolicyVersion: ptr(3),
		IdempotencyKey:             "idem-1",
	}

	encoded, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal dataset candidate prepare request: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal dataset candidate prepare request: %v", err)
	}
	if _, ok := decoded["targetShape"]; ok {
		t.Fatalf("targetShape must not be serialized in DatasetCandidatesPrepareRequest: %#v", decoded)
	}
	if _, ok := decoded["reviewStatus"]; ok {
		t.Fatalf("reviewStatus must not be serialized in DatasetCandidatesPrepareRequest: %#v", decoded)
	}
	if decoded["autoMatchDatasets"] != false {
		t.Fatalf("autoMatchDatasets = %#v, want false", decoded["autoMatchDatasets"])
	}
	if decoded["previewLimit"] != float64(25) {
		t.Fatalf("previewLimit = %#v, want 25", decoded["previewLimit"])
	}
	if decoded["split"] != string(DatasetSplitTraining) {
		t.Fatalf("split = %#v, want %s", decoded["split"], DatasetSplitTraining)
	}
	if decoded["curationStatus"] != string(DatasetCurationStatusNeedsReview) {
		t.Fatalf("curationStatus = %#v, want %s", decoded["curationStatus"], DatasetCurationStatusNeedsReview)
	}

	sources, ok := decoded["sources"].([]any)
	if !ok || len(sources) != 1 {
		t.Fatalf("sources = %#v, want one source", decoded["sources"])
	}
	source, ok := sources[0].(map[string]any)
	if !ok || source["sourceKind"] != string(DatasetCandidateSourceKindProductionMeasurement) || source["productionMeasurementId"] != "measurement-1" {
		t.Fatalf("source = %#v, want production measurement source", sources[0])
	}

	traceSelection, ok := decoded["traceSelection"].(map[string]any)
	if !ok || traceSelection["mode"] != string(DatasetTraceSelectionModeSelected) {
		t.Fatalf("traceSelection = %#v, want selected mode", decoded["traceSelection"])
	}
}

func jsonFieldTagsForStruct(t *testing.T, typ reflect.Type) []string {
	t.Helper()
	tags := make([]string, 0, typ.NumField())
	for index := 0; index < typ.NumField(); index++ {
		field := typ.Field(index)
		tag := field.Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name, _, _ := strings.Cut(tag, ",")
		tags = append(tags, name)
	}
	return tags
}

func ptr[T any](value T) *T {
	return &value
}
