//go:build surrealdb

package surrealdb

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestPersisterMetricAndAIErrorBranches(t *testing.T) {
	p := Persister{}
	if _, err := p.MetricsCommandExists(context.Background(), validMetricsPersistCommand()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("MetricsCommandExists() error = %v, want ERR-006", err)
	}
	if err := p.PersistMetrics(context.Background(), validMetricsPersistCommand(), "telemetry.ingest.metrics", fixedWriterTime()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("PersistMetrics() error = %v, want ERR-006", err)
	}
	if _, err := p.AIProjectionCommandExists(context.Background(), validAIProjectionPersistCommand()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("AIProjectionCommandExists() error = %v, want ERR-006", err)
	}
	if _, err := p.PersistAIProjection(context.Background(), validAIProjectionPersistCommand(), "telemetry.ingest.ai_projections", fixedWriterTime()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("PersistAIProjection() error = %v, want ERR-006", err)
	}
	if _, err := p.PersistEvalMutation(context.Background(), "eval.dataset.create", validEvalRequest(map[string]any{"name": "dataset"}), fixedWriterTime()); err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("PersistEvalMutation() error = %v, want ERR-006", err)
	}

	p = Persister{DB: &fakeDB{}}
	blankMetrics := validMetricsPersistCommand()
	blankMetrics.CommandID = " "
	if _, err := p.MetricsCommandExists(context.Background(), blankMetrics); err == nil || !strings.Contains(err.Error(), "commandId is required") {
		t.Fatalf("MetricsCommandExists(blank) error = %v, want validation", err)
	}
	blankProjection := validAIProjectionPersistCommand()
	blankProjection.CommandID = " "
	if _, err := p.AIProjectionCommandExists(context.Background(), blankProjection); err == nil || !strings.Contains(err.Error(), "commandId is required") {
		t.Fatalf("AIProjectionCommandExists(blank) error = %v, want validation", err)
	}
}

func TestPersisterEvalDatasetAppendReturnsFreshDatasetRow(t *testing.T) {
	db := &fakeDBWithRows{rows: []map[string]any{{
		"id":          "dataset-1",
		"name":        "golden",
		"version":     3,
		"createdAt":   "2026-05-08T08:00:00Z",
		"itemCount":   2,
		"description": "fresh row",
	}}}
	p := Persister{DB: db}
	response, err := p.PersistEvalMutation(context.Background(), "eval.dataset.items.append", validEvalRequest(map[string]any{
		"datasetId": "dataset-1",
		"version":   3,
		"items": []any{map[string]any{
			"input":    map[string]any{"question": "q"},
			"expected": map[string]any{"answer": "a"},
		}},
	}), fixedWriterTime())
	if err != nil {
		t.Fatalf("PersistEvalMutation() error = %v", err)
	}
	if response["id"] != "dataset-1" || response["description"] != "fresh row" {
		t.Fatalf("response = %#v, want fresh dataset row", response)
	}
	if !strings.Contains(db.rowsSQL, "FROM type::record('ai_dataset', $dataset_id)") {
		t.Fatalf("rows query = %q, want dataset refresh", db.rowsSQL)
	}

	db.rowsErr = errors.New("readback failed")
	if _, err := p.PersistEvalMutation(context.Background(), "eval.dataset.items.append", validEvalRequest(map[string]any{
		"datasetId": "dataset-1",
		"version":   3,
		"items":     []any{map[string]any{"input": map[string]any{}, "expected": map[string]any{}}},
	}), fixedWriterTime()); err == nil || !strings.Contains(err.Error(), "readback failed") {
		t.Fatalf("PersistEvalMutation(readback error) error = %v, want readback failed", err)
	}
}

func TestBuildEvalMutationPersistQueryBranches(t *testing.T) {
	tests := []struct {
		name    string
		subject string
		input   map[string]any
		table   string
		assert  func(*testing.T, map[string]any)
	}{
		{
			name:    "dataset append defaults",
			subject: "eval.dataset.items.append",
			input: map[string]any{
				"datasetId": "dataset-1",
				"version":   int64(2),
				"items": []string{
					"not an object",
				},
			},
			table: "ai_dataset_item",
		},
		{
			name:    "dataset promote defaults version and review status",
			subject: "eval.dataset.item.promote",
			input: map[string]any{
				"datasetId":     "dataset-1",
				"sourceTraceId": "trace-1",
				"sourceSpanId":  "span-1",
				"input":         map[string]any{"question": "q"},
			},
			table: "ai_dataset_item",
			assert: func(t *testing.T, data map[string]any) {
				t.Helper()
				if data["version"] != 1 || data["reviewStatus"] != "reviewed" || data["synthetic"] != false {
					t.Fatalf("promote data = %#v", data)
				}
			},
		},
		{
			name:    "scorer create with judge model",
			subject: "eval.scorer.create",
			input: map[string]any{
				"name":          "judge",
				"kind":          "llm",
				"definition":    map[string]any{"rubric": "strict"},
				"judgeModelRef": "openai:gpt",
			},
			table: "ai_scorer",
		},
		{
			name:    "experiment create",
			subject: "eval.experiment.create",
			input: map[string]any{
				"name":           "experiment",
				"datasetId":      "dataset-1",
				"datasetVersion": 1.0,
				"scorerIds":      []any{"scorer-1"},
				"tags":           []string{"nightly"},
			},
			table: "ai_experiment",
		},
		{
			name:    "experiment run result",
			subject: "eval.results.persist",
			input: map[string]any{
				"results": []any{map[string]any{
					"id":           "run-1",
					"experimentId": "experiment-1",
					"status":       "completed",
				}},
			},
			table: "ai_experiment_run",
		},
		{
			name:    "prompt version promote",
			subject: "eval.prompt_version.promote",
			input: map[string]any{
				"promptVersionId": "prompt-1",
				"tag":             "prod",
				"notes":           map[string]any{"reason": "better"},
			},
			table: "ai_prompt_version",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, _, data, err := BuildEvalMutationPersistQuery(test.subject, validEvalRequest(test.input), fixedWriterTime())
			if test.name == "dataset append defaults" {
				if err == nil || !strings.Contains(err.Error(), "dataset item append input is invalid") {
					t.Fatalf("BuildEvalMutationPersistQuery() error = %v, want append validation", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
			}
			if test.assert != nil {
				test.assert(t, data)
			}
		})
	}
}

func TestMetricRecordHelperBranches(t *testing.T) {
	target := TelemetryTarget{TenantID: "tenant_1", CompanyID: "company_1", ProjectID: "project_1"}
	monotonic := true
	temporality := contracts.AggregationTemporalityCumulative
	description := "request count"
	descriptor := metricDescriptorRecord(contracts.MetricDescriptor{
		Name:                   "http.requests",
		Kind:                   contracts.MetricKindSum,
		Unit:                   "1",
		Description:            &description,
		AggregationTemporality: &temporality,
		Monotonic:              &monotonic,
		AttributeKeys:          []string{"route"},
		FirstSeenAt:            fixedWriterTime(),
		LastSeenAt:             fixedWriterTime(),
	}, target)
	if descriptor["description"] != description || descriptor["monotonic"] != true || descriptor["aggregationTemporality"] != string(temporality) {
		t.Fatalf("descriptor record = %#v", descriptor)
	}

	point := contracts.MetricPoint{
		MetricName:     "latency.ms",
		Kind:           contracts.MetricKindHistogram,
		Timestamp:      fixedWriterTime(),
		StartTimestamp: timePtr(fixedWriterTime().Add(-time.Minute)),
		Count:          floatPtr(2),
		Sum:            floatPtr(10),
		Min:            floatPtr(4),
		Max:            floatPtr(6),
		QuantileValues: []contracts.QuantileValue{{Quantile: 0.9, Value: 9}},
		BucketCounts:   []float64{1, 1},
		ExplicitBounds: []float64{5},
		Attributes:     contracts.Attributes{"route": "/"},
		Exemplars:      []contracts.MetricExemplar{{Timestamp: fixedWriterTime(), Value: 5, TraceID: stringPtr("trace-1"), SpanID: stringPtr("span-1")}},
		ServiceName:    stringPtr("api"),
		ScopeName:      stringPtr("otel"),
	}
	record := metricPointRecord(point, target)
	for _, key := range []string{"startTimestamp", "count", "sum", "min", "max", "serviceName", "scopeName"} {
		if _, ok := record[key]; !ok {
			t.Fatalf("metric point missing %q: %#v", key, record)
		}
	}
	if id := metricPointRecordID(contracts.MetricPoint{MetricName: "latency ms", Timestamp: fixedWriterTime(), Attributes: contracts.Attributes{"route": "/"}}); !strings.HasPrefix(id, "latency-ms_") {
		t.Fatalf("metricPointRecordID() = %q", id)
	}
	if got := canonicalMetricAttributeValue(make(chan int)); got == "" {
		t.Fatal("canonicalMetricAttributeValue(unmarshalable) returned empty fallback")
	}
	if got := floatArrayRecord([]float64{1, 2}); len(got) != 2 || got[0] != 1 {
		t.Fatalf("floatArrayRecord() = %#v", got)
	}
}

func TestAIProjectionPersistQueryKindsAndValidation(t *testing.T) {
	for kind, table := range map[contracts.AiProjectionKind]string{
		contracts.AiProjectionKindLLMCall:        "ai_llm_call",
		contracts.AiProjectionKindToolCall:       "ai_tool_call",
		contracts.AiProjectionKindRetrievalEvent: "ai_retrieval_event",
	} {
		command := validAIProjectionPersistCommand()
		command.Kind = kind
		command.Projection = map[string]any{"id": string(kind) + "-1", "startedAt": fixedWriterTime().Format(time.RFC3339)}
		sql, vars, ids, err := BuildAIProjectionPersistQuery(command, "telemetry.ingest.ai_projections", fixedWriterTime())
		if err != nil {
			t.Fatalf("BuildAIProjectionPersistQuery(%s) error = %v", kind, err)
		}
		if !strings.Contains(sql, table) || len(ids) != 1 || ids[0] != string(kind)+"-1" {
			t.Fatalf("kind %s sql=%q ids=%#v", kind, sql, ids)
		}
		record := vars["projection_record"].(map[string]any)
		if record["kind"] != string(kind) || record["traceId"] != "trace-1" || record["spanId"] != "span-1" {
			t.Fatalf("projection record = %#v", record)
		}
	}

	command := validAIProjectionPersistCommand()
	command.Projection = map[string]any{"id": " "}
	if _, _, _, err := BuildAIProjectionPersistQuery(command, "telemetry.ingest.ai_projections", fixedWriterTime()); err == nil || !strings.Contains(err.Error(), "projection id is required") {
		t.Fatalf("BuildAIProjectionPersistQuery(blank projection id) error = %v", err)
	}
}

type fakeDBWithRows struct {
	fakeDB
	rows    []map[string]any
	rowsSQL string
	rowsErr error
}

func (db *fakeDBWithRows) QueryRowsInTarget(_ context.Context, target TelemetryTarget, sql string, vars map[string]any) ([]map[string]any, error) {
	db.target = target
	db.rowsSQL = sql
	db.vars = vars
	if db.rowsErr != nil {
		return nil, db.rowsErr
	}
	return db.rows, nil
}

func validEvalRequest(input map[string]any) contracts.EvalMutationRequest {
	return contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-eval-1", IssuedAt: fixedWriterTime()},
		Input:          input,
	}
}

func fixedWriterTime() time.Time {
	return time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)
}

func timePtr(value time.Time) *time.Time {
	return &value
}

var _ = json.Valid
