package ai

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestExtractProjectionsAppliesDispatchPrecedenceAndWarnings(t *testing.T) {
	startedAt := time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(250 * time.Millisecond)
	status := contracts.TraceStatusOK
	span := contracts.Span{
		ID:         "span-1",
		TraceID:    "trace-1",
		Name:       "ambiguous ai span",
		StartedAt:  startedAt,
		EndedAt:    endedAt,
		DurationMs: 250,
		Status:     &status,
		Attributes: contracts.Attributes{
			"gen_ai.operation.name":     "chat",
			"openinference.span.kind":   "LLM",
			"gen_ai.request.model":      "gpt-4.1-mini",
			"llm.model_name":            "claude-3-haiku",
			"gen_ai.system":             "openai",
			"llm.provider":              "anthropic",
			"gen_ai.usage.input_tokens": int64(7),
		},
	}

	commands := ExtractProjections([]contracts.Span{span}, envelope(), fixedCommandID)

	if len(commands) != 1 {
		t.Fatalf("commands = %d, want 1", len(commands))
	}
	command := commands[0]
	if command.Kind != contracts.AiProjectionKindLLMCall {
		t.Fatalf("kind = %q, want llm_call", command.Kind)
	}
	if got := stringValue(command.Projection, "subKind"); got != "chat" {
		t.Fatalf("subKind = %q, want chat", got)
	}
	if got := stringValue(command.Projection, "requestModel"); got != "gpt-4.1-mini" {
		t.Fatalf("requestModel = %q, want OTel value", got)
	}
	if got := stringValue(command.Projection, "provider"); got != "openai" {
		t.Fatalf("provider = %q, want OTel legacy value", got)
	}
	if command.SourceFlavor == nil || *command.SourceFlavor != "both" {
		t.Fatalf("sourceFlavor = %#v, want both", command.SourceFlavor)
	}
	joined := strings.Join(command.NormalizationWarnings, "\n")
	if !strings.Contains(joined, "requestModel") || !strings.Contains(joined, "provider") {
		t.Fatalf("normalization warnings = %#v, want conflicts for requestModel and provider", command.NormalizationWarnings)
	}
	if got := command.Projection["sourceFlavor"]; got != "both" {
		t.Fatalf("projection sourceFlavor = %#v, want both", got)
	}

	toolRetrieverSpan := span
	toolRetrieverSpan.ID = "span-tool"
	toolRetrieverSpan.Attributes = contracts.Attributes{
		"gen_ai.operation.name":   "execute_tool",
		"openinference.span.kind": "RETRIEVER",
		"gen_ai.tool.name":        "search",
	}
	commands = ExtractProjections([]contracts.Span{toolRetrieverSpan}, envelope(), fixedCommandID)
	if commands[0].Kind != contracts.AiProjectionKindToolCall {
		t.Fatalf("kind = %q, want tool_call because execute_tool dispatch precedes RETRIEVER", commands[0].Kind)
	}
}

func TestExtractProjectionsReportsSourceFlavors(t *testing.T) {
	spans := []contracts.Span{
		{ID: "gen", TraceID: "trace", StartedAt: time.Unix(1, 0).UTC(), EndedAt: time.Unix(2, 0).UTC(), DurationMs: 1000, Attributes: contracts.Attributes{"gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "search"}},
		{ID: "oi", TraceID: "trace", StartedAt: time.Unix(1, 0).UTC(), EndedAt: time.Unix(2, 0).UTC(), DurationMs: 1000, Attributes: contracts.Attributes{"openinference.span.kind": "RETRIEVER", "retrieval.documents.0.document.content": "retrieved text"}},
	}

	commands := ExtractProjections(spans, envelope(), fixedCommandID)

	if len(commands) != 2 {
		t.Fatalf("commands = %d, want 2", len(commands))
	}
	if commands[0].SourceFlavor == nil || *commands[0].SourceFlavor != "gen_ai" {
		t.Fatalf("first sourceFlavor = %#v, want gen_ai", commands[0].SourceFlavor)
	}
	if commands[1].SourceFlavor == nil || *commands[1].SourceFlavor != "openinference" {
		t.Fatalf("second sourceFlavor = %#v, want openinference", commands[1].SourceFlavor)
	}
}

func TestExtractProjectionsStoresDigestsAndPointersWithoutCopiedContent(t *testing.T) {
	secretPrompt := "classify customer message with password hunter2"
	secretCompletion := "customer is upset about invoice 123"
	secretToolArgs := `{"query":"customer private note"}`
	span := contracts.Span{
		ID:         "span-llm",
		TraceID:    "trace-secret",
		StartedAt:  time.Unix(10, 0).UTC(),
		EndedAt:    time.Unix(11, 0).UTC(),
		DurationMs: 1000,
		Attributes: contracts.Attributes{
			"gen_ai.operation.name": "chat",
			"gen_ai.prompt":         secretPrompt,
			"gen_ai.completion":     secretCompletion,
			"gen_ai.tool.args":      secretToolArgs,
		},
		Events: []contracts.SpanEvent{{
			Name:      "gen_ai.content.prompt",
			Timestamp: time.Unix(10, 1).UTC(),
			Attributes: contracts.Attributes{
				"content": secretPrompt,
			},
		}},
	}

	commands := ExtractProjections([]contracts.Span{span}, envelope(), fixedCommandID)

	if len(commands) != 1 {
		t.Fatalf("commands = %d, want 1", len(commands))
	}
	serialized := mustJSON(t, commands[0].Projection)
	for _, forbidden := range []string{secretPrompt, secretCompletion, secretToolArgs, "hunter2", "invoice 123", "private note"} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("projection copied forbidden content %q: %s", forbidden, serialized)
		}
	}
	if !strings.Contains(serialized, "sha256:") {
		t.Fatalf("projection = %s, want content digest", serialized)
	}
	if !strings.Contains(serialized, "event:0:content") {
		t.Fatalf("projection = %s, want source event pointer", serialized)
	}
}

func TestExtractProjectionsCoversAgentEmbeddingToolAndRetrievalBranches(t *testing.T) {
	parentSpanID := "parent-1"
	spans := []contracts.Span{
		{
			ID:           "agent",
			TraceID:      "trace-ai",
			Name:         "fallback agent",
			StartedAt:    time.Unix(10, 0).UTC(),
			EndedAt:      time.Unix(11, 0).UTC(),
			DurationMs:   1000,
			ParentSpanID: &parentSpanID,
			Attributes: contracts.Attributes{
				"gen_ai.operation.name":        "invoke_agent",
				"gen_ai.agent.id":              "agent-1",
				"gen_ai.agent.version":         "v1",
				"gen_ai.input":                 "private input",
				"gen_ai.output":                "private output",
				"llm.token_count.prompt":       uint16(3),
				"llm.token_count.completion":   "4",
				"gen_ai.usage.total_tokens":    float64(7),
				"cloudgrid.internal.unrelated": "ignored",
			},
		},
		{
			ID:        "embedding",
			TraceID:   "trace-ai",
			StartedAt: time.Unix(12, 0).UTC(),
			Attributes: contracts.Attributes{
				"gen_ai.operation.name": "embeddings",
				"gen_ai.request.model":  "text-embedding-3-small",
			},
		},
		{
			ID:        "tool",
			TraceID:   "trace-ai",
			Name:      "fallback-tool",
			StartedAt: time.Unix(13, 0).UTC(),
			Attributes: contracts.Attributes{
				"openinference.span.kind": "TOOL",
				"tool.call.id":            "call-1",
				"tool.parameters":         "secret params",
				"tool.result":             "secret result",
			},
		},
		{
			ID:        "retrieval",
			TraceID:   "trace-ai",
			StartedAt: time.Unix(14, 0).UTC(),
			Attributes: contracts.Attributes{
				"openinference.span.kind":                  "RETRIEVER",
				"retrieval.topK":                           int32(5),
				"retrieval.embedding.model":                "embedding-model",
				"retrieval.documents.0.document.content":   "doc 0",
				"retrieval.documents.1.document.text":      "doc 1",
				"retrieval.documents.ignored.document.url": "",
			},
		},
	}

	commands := ExtractProjections(spans, envelope(), nil)

	if len(commands) != 4 {
		t.Fatalf("commands = %#v, want four AI projections", commands)
	}
	if commands[0].CommandID != "ai-projection:trace-ai:agent" {
		t.Fatalf("default command id = %q", commands[0].CommandID)
	}
	agent := commands[0].Projection
	agentIdentity := agent["agent"].(map[string]any)
	if agent["durationMs"] != float64(1000) || agent["parentSpanId"] != parentSpanID || agentIdentity["name"] != "fallback agent" || agentIdentity["id"] != "agent-1" {
		t.Fatalf("agent projection = %#v", agent)
	}
	tokens := agent["tokenTotals"].(map[string]any)
	if tokens["input"] != 3 || tokens["output"] != 4 || tokens["total"] != 7 {
		t.Fatalf("token totals = %#v", tokens)
	}
	if agent["inputDigest"] == "" || agent["outputDigest"] == "" {
		t.Fatalf("agent content digests = %#v", agent)
	}

	embedding := commands[1].Projection
	if commands[1].Kind != contracts.AiProjectionKindLLMCall || embedding["subKind"] != "embedding" || embedding["requestModel"] != "text-embedding-3-small" {
		t.Fatalf("embedding projection = %#v", commands[1])
	}

	tool := commands[2].Projection
	if tool["toolName"] != "fallback-tool" || tool["toolCallId"] != "call-1" || tool["parametersDigest"] == "" || tool["resultDigest"] == "" || tool["synthetic"] != false {
		t.Fatalf("tool projection = %#v", tool)
	}

	retrieval := commands[3].Projection
	if retrieval["documentCount"] != 2 || retrieval["topK"] != 5 || retrieval["embeddingModel"] != "embedding-model" {
		t.Fatalf("retrieval projection = %#v", retrieval)
	}
	if len(retrieval["documentDigests"].([]string)) != 2 || len(retrieval["documentSources"].([]string)) != 2 {
		t.Fatalf("retrieval document references = %#v", retrieval)
	}
}

func TestExtractProjectionsDoesNotMutateSourceAttributes(t *testing.T) {
	attrs := contracts.Attributes{
		"openinference.span.kind": "LLM",
		"llm.model_name":          "model",
	}
	originalAttrs := cloneAttributes(attrs)
	spans := []contracts.Span{{
		ID:         "span-1",
		TraceID:    "trace-1",
		StartedAt:  time.Unix(1, 0).UTC(),
		Attributes: attrs,
	}}

	commands := ExtractProjections(spans, envelope(), fixedCommandID)

	if len(commands) != 1 {
		t.Fatalf("commands = %d, want 1", len(commands))
	}
	if commands[0].SourceFlavor == nil || *commands[0].SourceFlavor != "openinference" {
		t.Fatalf("sourceFlavor = %#v, want openinference", commands[0].SourceFlavor)
	}
	if _, ok := spans[0].Attributes["cloudgrid.ai.semconv.flavor"]; ok {
		t.Fatalf("input span attributes were annotated: %#v", spans[0].Attributes)
	}
	if !reflect.DeepEqual(spans[0].Attributes, originalAttrs) {
		t.Fatalf("input span attributes changed from %#v to %#v", originalAttrs, spans[0].Attributes)
	}
}

func TestAIExtractionHelpersCoverScalarAndClassificationFallbacks(t *testing.T) {
	if _, _, ok := classify(nil); ok {
		t.Fatal("classify(nil) should not identify an AI projection")
	}
	if sourceFlavor(contracts.Attributes{"unrelated": "value"}) != "neither" {
		t.Fatal("sourceFlavor did not return neither for non-AI attributes")
	}
	if stringAttribute(contracts.Attributes{"name": fmt.Stringer(testStringer(" value "))}, "name") != "value" {
		t.Fatal("stringAttribute did not trim fmt.Stringer value")
	}
	for _, value := range []any{int8(1), int16(2), int32(3), int64(4), uint(5), uint8(6), uint16(7), uint32(8), uint64(9), float64(10), "11"} {
		if got, ok := intAttribute(contracts.Attributes{"value": value}, "value"); !ok || got == 0 {
			t.Fatalf("intAttribute(%T) = %d, %v", value, got, ok)
		}
	}
	if _, ok := intAttribute(contracts.Attributes{"value": "not-int"}, "value"); ok {
		t.Fatal("intAttribute accepted invalid integer string")
	}
	if firstNonEmptyString(contracts.Attributes{"a": " ", "b": "value"}, "a", "b") != "value" {
		t.Fatal("firstNonEmptyString did not skip blank values")
	}
	if projectionID(contracts.AiProjectionKindToolCall, "trace", "span") != "tool_call:trace:span" {
		t.Fatal("projectionID changed")
	}
}

type testStringer string

func (value testStringer) String() string {
	return string(value)
}

func envelope() contracts.BridgeEnvelope {
	return contracts.BridgeEnvelope{RequestID: "req-ai", IssuedAt: time.Unix(100, 0).UTC()}
}

func fixedCommandID(_ contracts.Span) string {
	return "cmd-ai"
}

func stringValue(values map[string]any, key string) string {
	value, _ := values[key].(string)
	return value
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}
	return string(data)
}
