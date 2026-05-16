package ai

import (
	"encoding/json"
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
