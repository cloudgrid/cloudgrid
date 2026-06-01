//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
	sdk "github.com/surrealdb/surrealdb.go"
)

func TestBuildAiEvalTraceEvidenceRecognizesStandardAISpans(t *testing.T) {
	base := time.Date(2026, 5, 31, 10, 0, 0, 0, time.UTC)
	spans := []contracts.Span{
		aiEvalEvidenceSpan("genai-llm", "trace-1", "root", base, contracts.Attributes{
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model":  "gpt-4o",
			"gen_ai.prompt":         map[string]any{"text": "summarize this", "api_key": "secret"},
			"gen_ai.completion":     "done",
		}),
		aiEvalEvidenceSpan("mcp-tool", "trace-1", "root", base.Add(time.Millisecond), contracts.Attributes{
			"mcp.method.name":  "tools/call",
			"gen_ai.tool.name": "crm.lookup",
			"tool.result":      "customer found",
		}),
		aiEvalEvidenceSpan("oi-tool", "trace-1", "root", base.Add(2*time.Millisecond), contracts.Attributes{
			"openinference.span.kind": "TOOL",
			"tool.name":               "ticket.create",
		}),
		aiEvalEvidenceSpan("oi-retriever", "trace-1", "root", base.Add(3*time.Millisecond), contracts.Attributes{
			"openinference.span.kind": "RETRIEVER",
			"retrieval.source":        "kb",
		}),
	}

	evidence := buildAiEvalTraceEvidence(spans, "root")
	if len(evidence.ImportantSteps) != 4 {
		t.Fatalf("important steps = %#v, want 4 recognized steps", evidence.ImportantSteps)
	}
	assertEvidenceStep(t, evidence.ImportantSteps[0], "model_call", "gpt-4o")
	assertEvidenceStep(t, evidence.ImportantSteps[1], "tool_call", "crm.lookup")
	assertEvidenceStep(t, evidence.ImportantSteps[2], "tool_call", "ticket.create")
	assertEvidenceStep(t, evidence.ImportantSteps[3], "retrieval", "kb")

	first := evidence.ImportantSteps[0].(map[string]any)
	if strings.Contains(fmt.Sprint(first["inputPreview"]), "secret") || !strings.Contains(fmt.Sprint(first["inputPreview"]), "[redacted]") {
		t.Fatalf("inputPreview = %#v, want redacted bounded content", first["inputPreview"])
	}
	if len(evidence.SummaryEvidenceRefs) != 4 || strings.Contains(evidence.TrajectorySummary, "secret") {
		t.Fatalf("evidence summary/refs = %#v %#v", evidence.TrajectorySummary, evidence.SummaryEvidenceRefs)
	}
}

func TestBuildAiEvalTraceEvidenceIncludesDirectStandardFailuresOnly(t *testing.T) {
	base := time.Date(2026, 5, 31, 10, 0, 0, 0, time.UTC)
	spans := []contracts.Span{
		aiEvalEvidenceErrorSpan("http", "trace-1", "root", base, contracts.Attributes{
			"http.request.method": "POST",
			"http.route":          "/checkout",
			"error.type":          "500",
		}),
		aiEvalEvidenceErrorSpan("db", "trace-1", "root", base.Add(time.Millisecond), contracts.Attributes{
			"db.system":         "postgresql",
			"db.operation.name": "SELECT",
			"db.statement":      "SELECT * FROM users WHERE token=super-secret-token",
		}),
		{
			ID:           "exception",
			TraceID:      "trace-1",
			ParentSpanID: ptrString("root"),
			Name:         "handler",
			StartedAt:    base.Add(2 * time.Millisecond),
			EndedAt:      base.Add(3 * time.Millisecond),
			Status:       aiEvalTraceStatus(contracts.TraceStatusError),
			Attributes:   contracts.Attributes{},
			Events: []contracts.SpanEvent{{
				Name:       "exception",
				Timestamp:  base.Add(2500 * time.Microsecond),
				Attributes: contracts.Attributes{"exception.type": "ValueError", "exception.message": "bad input"},
			}},
		},
		aiEvalEvidenceErrorSpan("nested-http", "trace-1", "child", base.Add(3*time.Millisecond), contracts.Attributes{
			"http.request.method": "GET",
			"http.route":          "/nested",
			"error.type":          "500",
		}),
		aiEvalEvidenceSpan("unknown", "trace-1", "root", base.Add(4*time.Millisecond), contracts.Attributes{"custom.kind": "business"}),
	}

	evidence := buildAiEvalTraceEvidence(spans, "root")
	if len(evidence.ImportantSteps) != 3 {
		t.Fatalf("important steps = %#v, want direct HTTP, DB, and exception failures only", evidence.ImportantSteps)
	}
	assertEvidenceStep(t, evidence.ImportantSteps[0], "workflow_step", "HTTP POST /checkout")
	assertEvidenceStep(t, evidence.ImportantSteps[1], "workflow_step", "DB SELECT")
	assertEvidenceStep(t, evidence.ImportantSteps[2], "workflow_step", "ValueError")
	if strings.Contains(fmt.Sprint(evidence.ImportantSteps), "super-secret-token") {
		t.Fatalf("important steps leaked secret content: %#v", evidence.ImportantSteps)
	}
}

func TestBuildAiEvalTraceEvidenceIgnoresUnrecognizedSpansAndBoundsPreviews(t *testing.T) {
	long := strings.Repeat("a", aiEvalEvidencePreviewLimitBytes+100)
	spans := []contracts.Span{
		aiEvalEvidenceSpan("unknown", "trace-1", "root", time.Now(), contracts.Attributes{"custom": "value"}),
		aiEvalEvidenceSpan("llm", "trace-1", "root", time.Now().Add(time.Millisecond), contracts.Attributes{
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model":  "model",
			"output.value":          long,
		}),
	}

	evidence := buildAiEvalTraceEvidence(spans, "root")
	if len(evidence.ImportantSteps) != 1 {
		t.Fatalf("important steps = %#v, want only recognized model step", evidence.ImportantSteps)
	}
	step := evidence.ImportantSteps[0].(map[string]any)
	output := fmt.Sprint(step["outputPreview"])
	if len(output) != aiEvalEvidencePreviewLimitBytes {
		t.Fatalf("output preview length = %d, want %d", len(output), aiEvalEvidencePreviewLimitBytes)
	}
	if strings.Contains(fmt.Sprint(evidence.ImportantSteps), "custom") {
		t.Fatalf("unrecognized span leaked into optimizer evidence: %#v", evidence.ImportantSteps)
	}
}

func TestStoreEvaluationItemRunSearchDerivesTraceEvidence(t *testing.T) {
	base := time.Date(2026, 5, 31, 10, 0, 0, 0, time.UTC)
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, stmt QueryStatement, out any) error {
		switch rows := out.(type) {
		case *[]map[string]any:
			if !strings.Contains(stmt.SQL, "FROM ai_evaluation_item_run") {
				return fmt.Errorf("unexpected map query %s", stmt.SQL)
			}
			*rows = []map[string]any{{
				"id":                    "item-run-1",
				"evaluationRunId":       "run-1",
				"datasetItemId":         "item-1",
				"datasetItemRevisionId": "revision-1",
				"targetSnapshotId":      "snapshot-1",
				"status":                "completed",
				"traceId":               "trace-1",
				"rootSpanId":            "root",
			}}
		case *[]contracts.Span:
			if !strings.Contains(stmt.SQL, "FROM span") || stmt.Params["traceId"] != "trace-1" {
				return fmt.Errorf("unexpected span query %#v %s", stmt.Params, stmt.SQL)
			}
			*rows = []contracts.Span{
				aiEvalEvidenceSpan("llm", "trace-1", "root", base, contracts.Attributes{
					"gen_ai.operation.name": "chat",
					"gen_ai.request.model":  "gpt-4o-mini",
				}),
			}
		default:
			return fmt.Errorf("unexpected output %T", out)
		}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{}
	data, err := store.QueryAiEval(context.Background(), storage.SubjectEvalEvaluationRunSearch, map[string]any{"evaluationRunId": "run-1", "itemRuns": true}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(item runs) error = %v", err)
	}
	items := data["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v, want one item run", items)
	}
	steps := items[0]["importantSteps"].([]any)
	if len(steps) != 1 {
		t.Fatalf("importantSteps = %#v, want derived model step", steps)
	}
	if items[0]["trajectorySummary"] == "" || len(items[0]["summaryEvidenceRefs"].([]any)) != 1 {
		t.Fatalf("item evidence = %#v, want summary and refs", items[0])
	}
}

func aiEvalEvidenceSpan(id string, traceID string, parentSpanID string, startedAt time.Time, attrs contracts.Attributes) contracts.Span {
	return contracts.Span{
		ID:           id,
		TraceID:      traceID,
		ParentSpanID: ptrString(parentSpanID),
		Name:         id,
		StartedAt:    startedAt,
		EndedAt:      startedAt.Add(time.Millisecond),
		Attributes:   attrs,
		Events:       []contracts.SpanEvent{},
	}
}

func aiEvalEvidenceErrorSpan(id string, traceID string, parentSpanID string, startedAt time.Time, attrs contracts.Attributes) contracts.Span {
	span := aiEvalEvidenceSpan(id, traceID, parentSpanID, startedAt, attrs)
	span.Status = aiEvalTraceStatus(contracts.TraceStatusError)
	return span
}

func aiEvalTraceStatus(status contracts.TraceStatus) *contracts.TraceStatus {
	return &status
}

func assertEvidenceStep(t *testing.T, raw any, kind string, name string) {
	t.Helper()
	step, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("step = %#v, want map", raw)
	}
	if step["kind"] != kind || step["name"] != name {
		t.Fatalf("step = %#v, want kind=%s name=%s", step, kind, name)
	}
	ref, ok := step["spanRef"].(map[string]any)
	if !ok || ref["kind"] != "span" || ref["traceId"] == "" || ref["spanId"] == "" {
		t.Fatalf("spanRef = %#v, want bounded span source ref", step["spanRef"])
	}
}
