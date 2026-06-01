//go:build surrealdb

package surrealdb

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	aiEvalEvidencePreviewLimitBytes = 2000
	aiEvalImportantStepLimit        = 20
)

type aiEvalTraceEvidence struct {
	ImportantSteps      []any
	TrajectorySummary   string
	SummaryEvidenceRefs []any
}

type aiEvalEvidenceCandidate struct {
	step     map[string]any
	priority int
	started  time.Time
}

func buildAiEvalTraceEvidence(spans []contracts.Span, rootSpanID string) aiEvalTraceEvidence {
	candidates := make([]aiEvalEvidenceCandidate, 0, len(spans))
	for _, span := range spans {
		candidate, ok := aiEvalEvidenceCandidateFromSpan(span, rootSpanID)
		if ok {
			candidates = append(candidates, candidate)
		}
	}
	sort.SliceStable(candidates, func(left, right int) bool {
		if candidates[left].priority != candidates[right].priority {
			return candidates[left].priority < candidates[right].priority
		}
		if !candidates[left].started.Equal(candidates[right].started) {
			return candidates[left].started.Before(candidates[right].started)
		}
		return aiEvalStringValue(candidates[left].step, "name", "") < aiEvalStringValue(candidates[right].step, "name", "")
	})
	if len(candidates) > aiEvalImportantStepLimit {
		candidates = candidates[:aiEvalImportantStepLimit]
	}

	steps := make([]any, 0, len(candidates))
	refs := make([]any, 0, len(candidates))
	for _, candidate := range candidates {
		steps = append(steps, candidate.step)
		if ref, ok := candidate.step["spanRef"].(map[string]any); ok {
			refs = append(refs, ref)
		}
	}
	return aiEvalTraceEvidence{
		ImportantSteps:      steps,
		TrajectorySummary:   aiEvalTrajectorySummary(steps),
		SummaryEvidenceRefs: refs,
	}
}

func aiEvalEvidenceCandidateFromSpan(span contracts.Span, rootSpanID string) (aiEvalEvidenceCandidate, bool) {
	attrs := map[string]any(span.Attributes)
	kind, name, priority, recognized := aiEvalStepKindNameAndPriority(span, attrs, rootSpanID)
	if !recognized {
		return aiEvalEvidenceCandidate{}, false
	}

	step := map[string]any{
		"kind":    kind,
		"name":    aiEvalBoundedPreview(name),
		"status":  aiEvalSpanStatus(span, attrs),
		"spanRef": aiEvalSpanSourceRef(span),
	}
	if input := aiEvalInputPreview(span, attrs); input != "" {
		step["inputPreview"] = input
	}
	if output := aiEvalOutputPreview(span, attrs); output != "" {
		step["outputPreview"] = output
	}
	return aiEvalEvidenceCandidate{step: step, priority: priority, started: span.StartedAt}, true
}

func aiEvalStepKindNameAndPriority(span contracts.Span, attrs map[string]any, rootSpanID string) (string, string, int, bool) {
	operation := strings.ToLower(aiEvalFirstAttrString(attrs, "gen_ai.operation.name"))
	openInferenceKind := strings.ToUpper(aiEvalFirstAttrString(attrs, "openinference.span.kind"))
	switch {
	case operation == "chat" || operation == "text_completion" || operation == "generate_content" || operation == "embeddings" || openInferenceKind == "LLM" || openInferenceKind == "EMBEDDING":
		return "model_call", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "gen_ai.request.model", "gen_ai.response.model", "gen_ai.model.name", "llm.model_name"), span.Name), 10, true
	case operation == "execute_tool":
		return "tool_call", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "gen_ai.tool.name", "tool.name", "mcp.method.name"), span.Name), 20, true
	case aiEvalIsMCPSpan(attrs):
		return "tool_call", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "gen_ai.tool.name", "mcp.method.name", "gen_ai.prompt.name"), span.Name), 25, true
	case openInferenceKind == "TOOL":
		return "tool_call", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "tool.name"), span.Name), 30, true
	case openInferenceKind == "RETRIEVER":
		return "retrieval", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "retrieval.source", "retrieval.name"), span.Name), 35, true
	case operation == "invoke_agent" || openInferenceKind == "AGENT":
		return "workflow_step", aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "gen_ai.agent.name", "agent.name"), span.Name), 40, true
	case aiEvalIsDirectChildOfRoot(span, rootSpanID) && aiEvalIsStandardFailureSpan(span, attrs):
		return "workflow_step", aiEvalStandardSpanName(span, attrs), 80, true
	default:
		return "", "", 0, false
	}
}

func aiEvalIsMCPSpan(attrs map[string]any) bool {
	return aiEvalFirstAttrString(attrs, "mcp.method.name", "gen_ai.tool.name", "gen_ai.prompt.name") != ""
}

func aiEvalIsDirectChildOfRoot(span contracts.Span, rootSpanID string) bool {
	rootSpanID = strings.TrimSpace(rootSpanID)
	if rootSpanID == "" {
		return span.ParentSpanID == nil
	}
	return span.ParentSpanID != nil && *span.ParentSpanID == rootSpanID
}

func aiEvalIsStandardFailureSpan(span contracts.Span, attrs map[string]any) bool {
	if !aiEvalSpanFailed(span, attrs) {
		return false
	}
	return aiEvalFirstAttrString(attrs,
		"http.request.method", "http.method",
		"rpc.system", "rpc.method",
		"db.system", "db.operation.name", "db.operation", "db.statement",
		"messaging.system", "messaging.operation.name", "messaging.operation",
		"file.path", "file.name", "file.operation",
		"exception.type", "error.type",
	) != "" || len(aiEvalExceptionEvents(span)) > 0
}

func aiEvalStandardSpanName(span contracts.Span, attrs map[string]any) string {
	switch {
	case aiEvalFirstAttrString(attrs, "http.request.method", "http.method") != "":
		return strings.TrimSpace("HTTP " + aiEvalFirstAttrString(attrs, "http.request.method", "http.method") + " " + aiEvalFirstAttrString(attrs, "http.route", "url.path", "http.target", "url.full"))
	case aiEvalFirstAttrString(attrs, "db.system", "db.operation.name", "db.operation", "db.statement") != "":
		return strings.TrimSpace("DB " + aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "db.operation.name", "db.operation"), aiEvalFirstAttrString(attrs, "db.collection.name", "db.sql.table", "db.system"), span.Name))
	case aiEvalFirstAttrString(attrs, "rpc.system", "rpc.method") != "":
		return strings.TrimSpace("RPC " + aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "rpc.method"), span.Name))
	case aiEvalFirstAttrString(attrs, "messaging.system", "messaging.operation.name", "messaging.operation") != "":
		return strings.TrimSpace("Messaging " + aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "messaging.operation.name", "messaging.operation"), span.Name))
	case aiEvalFirstAttrString(attrs, "file.path", "file.name", "file.operation") != "":
		return strings.TrimSpace("File " + aiEvalFirstNonEmpty(aiEvalFirstAttrString(attrs, "file.operation"), span.Name))
	case len(aiEvalExceptionEvents(span)) > 0 || aiEvalFirstAttrString(attrs, "exception.type", "error.type") != "":
		return aiEvalFirstNonEmpty(aiEvalFirstExceptionAttrString(span, "exception.type", "error.type"), aiEvalFirstAttrString(attrs, "exception.type", "error.type"), span.Name)
	default:
		return span.Name
	}
}

func aiEvalSpanStatus(span contracts.Span, attrs map[string]any) string {
	if aiEvalSpanFailed(span, attrs) {
		return "error"
	}
	if span.Status != nil && string(*span.Status) != "" {
		return string(*span.Status)
	}
	return "ok"
}

func aiEvalSpanFailed(span contracts.Span, attrs map[string]any) bool {
	if span.Status != nil && strings.EqualFold(string(*span.Status), "error") {
		return true
	}
	if aiEvalFirstAttrString(attrs, "error.type", "exception.type") != "" {
		return true
	}
	return len(aiEvalExceptionEvents(span)) > 0
}

func aiEvalInputPreview(span contracts.Span, attrs map[string]any) string {
	return aiEvalPreviewFromCandidates(attrs, span.Events,
		"gen_ai.prompt", "gen_ai.input.messages", "input.value", "input.mime_type",
		"tool.parameters", "tool.input", "db.statement", "http.request.body",
	)
}

func aiEvalOutputPreview(span contracts.Span, attrs map[string]any) string {
	value := aiEvalPreviewFromCandidates(attrs, span.Events,
		"gen_ai.completion", "gen_ai.output.messages", "output.value",
		"tool.result", "tool.output", "http.response.body",
	)
	if value != "" {
		return value
	}
	for _, event := range aiEvalExceptionEvents(span) {
		if message := aiEvalFirstAttrString(map[string]any(event.Attributes), "exception.message", "exception.type"); message != "" {
			return aiEvalBoundedPreview(message)
		}
	}
	return aiEvalBoundedPreview(aiEvalFirstAttrString(attrs, "error.type", "exception.message", "exception.type"))
}

func aiEvalPreviewFromCandidates(attrs map[string]any, events []contracts.SpanEvent, keys ...string) string {
	for _, key := range keys {
		if value, ok := attrs[key]; ok {
			if preview := aiEvalBoundedPreview(value); preview != "" {
				return preview
			}
		}
	}
	for _, event := range events {
		eventAttrs := map[string]any(event.Attributes)
		for _, key := range keys {
			if value, ok := eventAttrs[key]; ok {
				if preview := aiEvalBoundedPreview(value); preview != "" {
					return preview
				}
			}
		}
		if strings.HasPrefix(event.Name, "gen_ai.") || event.Name == "exception" {
			if preview := aiEvalBoundedPreview(map[string]any(event.Attributes)); preview != "" {
				return preview
			}
		}
	}
	return ""
}

func aiEvalSpanSourceRef(span contracts.Span) map[string]any {
	return map[string]any{
		"kind":     "span",
		"traceId":  span.TraceID,
		"spanId":   span.ID,
		"metadata": map[string]any{},
	}
}

func aiEvalTrajectorySummary(steps []any) string {
	if len(steps) == 0 {
		return ""
	}
	parts := make([]string, 0, len(steps))
	for _, raw := range steps {
		step, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s %s %s", aiEvalStringValue(step, "kind", "step"), aiEvalStringValue(step, "name", "unknown"), aiEvalStringValue(step, "status", "ok")))
	}
	return aiEvalBoundedPreview(fmt.Sprintf("%d important steps: %s.", len(parts), strings.Join(parts, "; ")))
}

func aiEvalExceptionEvents(span contracts.Span) []contracts.SpanEvent {
	events := []contracts.SpanEvent{}
	for _, event := range span.Events {
		if event.Name == "exception" || event.Attributes["exception.type"] != nil || event.Attributes["exception.message"] != nil {
			events = append(events, event)
		}
	}
	return events
}

func aiEvalFirstAttrString(attrs map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := attrs[key]; ok {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func aiEvalFirstExceptionAttrString(span contracts.Span, keys ...string) string {
	for _, event := range aiEvalExceptionEvents(span) {
		if value := aiEvalFirstAttrString(map[string]any(event.Attributes), keys...); value != "" {
			return value
		}
	}
	return ""
}

func aiEvalFirstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return "unknown"
}

func aiEvalBoundedPreview(value any) string {
	if value == nil {
		return ""
	}
	redacted := aiEvalRedactValue(value)
	var text string
	switch typed := redacted.(type) {
	case string:
		text = typed
	default:
		data, err := json.Marshal(typed)
		if err != nil {
			text = fmt.Sprint(typed)
		} else {
			text = string(data)
		}
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	return aiEvalTruncateUTF8(text, aiEvalEvidencePreviewLimitBytes)
}

func aiEvalRedactValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		redacted := make(map[string]any, len(typed))
		for key, item := range typed {
			if aiEvalSensitiveKey(key) {
				redacted[key] = "[redacted]"
				continue
			}
			redacted[key] = aiEvalRedactValue(item)
		}
		return redacted
	case contracts.Attributes:
		return aiEvalRedactValue(map[string]any(typed))
	case []any:
		redacted := make([]any, 0, len(typed))
		for _, item := range typed {
			redacted = append(redacted, aiEvalRedactValue(item))
		}
		return redacted
	case []string:
		redacted := make([]any, 0, len(typed))
		for _, item := range typed {
			redacted = append(redacted, aiEvalRedactString(item))
		}
		return redacted
	case string:
		return aiEvalRedactString(typed)
	default:
		return typed
	}
}

func aiEvalSensitiveKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	return strings.Contains(key, "secret") ||
		strings.Contains(key, "password") ||
		strings.Contains(key, "token") ||
		strings.Contains(key, "authorization") ||
		strings.Contains(key, "credential") ||
		strings.Contains(key, "api_key") ||
		strings.Contains(key, "apikey") ||
		strings.Contains(key, "cookie")
}

func aiEvalRedactString(value string) string {
	lines := strings.Fields(value)
	for index, token := range lines {
		lower := strings.ToLower(token)
		if strings.Contains(lower, "secret=") || strings.Contains(lower, "password=") || strings.Contains(lower, "token=") || strings.Contains(lower, "api_key=") || strings.Contains(lower, "authorization=") {
			lines[index] = "[redacted]"
		}
	}
	if len(lines) == 0 {
		return value
	}
	return strings.Join(lines, " ")
}

func aiEvalTruncateUTF8(value string, limit int) string {
	if limit <= 0 || len(value) <= limit {
		return value
	}
	cut := value[:limit]
	for !utf8.ValidString(cut) && len(cut) > 0 {
		cut = cut[:len(cut)-1]
	}
	return cut
}
