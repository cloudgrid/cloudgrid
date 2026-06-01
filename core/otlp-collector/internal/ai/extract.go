package ai

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type CommandIDFunc func(contracts.Span) string

type contentReference struct {
	Source string `json:"source"`
	Digest string `json:"digest"`
}

func ExtractProjections(spans []contracts.Span, envelope contracts.BridgeEnvelope, commandID CommandIDFunc) []contracts.PersistAiProjectionCommand {
	if commandID == nil {
		commandID = defaultCommandID
	}
	commands := make([]contracts.PersistAiProjectionCommand, 0, len(spans))
	for _, span := range spans {
		kind, subKind, ok := classify(span.Attributes)
		if !ok {
			continue
		}
		flavor := sourceFlavor(span.Attributes)
		projection, warnings := projectionForSpan(span, kind, subKind, flavor)
		commandWarnings := append([]string(nil), warnings...)
		commands = append(commands, contracts.PersistAiProjectionCommand{
			BridgeEnvelope:        envelope,
			CommandID:             commandID(span),
			TraceID:               span.TraceID,
			SpanID:                span.ID,
			Kind:                  kind,
			Projection:            projection,
			SourceFlavor:          &flavor,
			NormalizationWarnings: commandWarnings,
		})
	}
	return commands
}

func classify(attrs contracts.Attributes) (contracts.AiProjectionKind, string, bool) {
	genOp := strings.TrimSpace(stringAttribute(attrs, "gen_ai.operation.name"))
	oiKind := strings.ToUpper(strings.TrimSpace(stringAttribute(attrs, "openinference.span.kind")))
	switch {
	case genOp == "invoke_agent" || oiKind == "AGENT":
		return contracts.AiProjectionKindAgentRun, "", true
	case genOp == "chat" || genOp == "text_completion" || genOp == "generate_content" || oiKind == "LLM":
		subKind := genOp
		if subKind == "" {
			subKind = "chat"
		}
		return contracts.AiProjectionKindLLMCall, subKind, true
	case genOp == "embeddings" || oiKind == "EMBEDDING":
		return contracts.AiProjectionKindLLMCall, "embedding", true
	case genOp == "execute_tool" || oiKind == "TOOL":
		return contracts.AiProjectionKindToolCall, "", true
	case oiKind == "RETRIEVER":
		return contracts.AiProjectionKindRetrievalEvent, "", true
	default:
		return "", "", false
	}
}

func sourceFlavor(attrs contracts.Attributes) string {
	hasGenAI := hasPrefixedAttribute(attrs, "gen_ai.")
	hasOpenInference := hasPrefixedAttribute(attrs, "openinference.") || hasPrefixedAttribute(attrs, "llm.") || hasPrefixedAttribute(attrs, "retrieval.")
	switch {
	case hasGenAI && hasOpenInference:
		return "both"
	case hasGenAI:
		return "gen_ai"
	case hasOpenInference:
		return "openinference"
	default:
		return "neither"
	}
}

func projectionForSpan(span contracts.Span, kind contracts.AiProjectionKind, subKind string, flavor string) (map[string]any, []string) {
	projection := map[string]any{
		"id":           projectionID(kind, span.TraceID, span.ID),
		"traceId":      span.TraceID,
		"spanId":       span.ID,
		"startedAt":    span.StartedAt.UTC().Format(time.RFC3339Nano),
		"sourceFlavor": flavor,
	}
	warnings := []string{}
	if !span.EndedAt.IsZero() {
		projection["endedAt"] = span.EndedAt.UTC().Format(time.RFC3339Nano)
	}
	if span.DurationMs >= 0 {
		switch kind {
		case contracts.AiProjectionKindAgentRun:
			projection["durationMs"] = span.DurationMs
		default:
			projection["latencyMs"] = span.DurationMs
		}
	}
	if span.Status != nil {
		projection["status"] = string(*span.Status)
	}
	if span.ParentSpanID != nil && *span.ParentSpanID != "" {
		projection["parentSpanId"] = *span.ParentSpanID
	}

	switch kind {
	case contracts.AiProjectionKindAgentRun:
		projection["rootSpanId"] = span.ID
		projection["agent"] = agentIdentity(span.Attributes, span.Name)
		addTokenTotals(projection, span.Attributes)
	case contracts.AiProjectionKindLLMCall:
		if subKind != "" {
			projection["subKind"] = subKind
		}
		setCanonicalString(projection, &warnings, "provider", span.Attributes, []string{"gen_ai.system"}, []string{"llm.provider"}, nil)
		setCanonicalString(projection, &warnings, "requestModel", span.Attributes, []string{"gen_ai.request.model", "gen_ai.model"}, []string{"llm.model_name"}, nil)
		setCanonicalString(projection, &warnings, "responseModel", span.Attributes, []string{"gen_ai.response.model"}, []string{"llm.invocation_parameters.model"}, nil)
		addTokenTotals(projection, span.Attributes)
		messageRefs := messageEventIDs(span)
		if len(messageRefs) > 0 {
			projection["messageEventIds"] = messageRefs
		}
	case contracts.AiProjectionKindToolCall:
		toolName := firstNonEmptyString(span.Attributes, "gen_ai.tool.name", "tool.name")
		if toolName == "" {
			toolName = span.Name
		}
		projection["toolName"] = toolName
		if toolCallID := firstNonEmptyString(span.Attributes, "gen_ai.tool.call.id", "tool.call.id"); toolCallID != "" {
			projection["toolCallId"] = toolCallID
		}
		projection["synthetic"] = false
	case contracts.AiProjectionKindRetrievalEvent:
		documentRefs := contentReferences(span, []string{"retrieval.documents."})
		projection["documentCount"] = len(documentRefs)
		if topK, ok := intAttribute(span.Attributes, "retrieval.top_k", "retrieval.topK"); ok {
			projection["topK"] = topK
		}
		if model := firstNonEmptyString(span.Attributes, "embedding.model", "retrieval.embedding.model", "gen_ai.request.model"); model != "" {
			projection["embeddingModel"] = model
		}
		if len(documentRefs) > 0 {
			projection["documentDigests"] = digests(documentRefs)
			projection["documentSources"] = sources(documentRefs)
		}
	}

	contentRefs := contentReferences(span, nil)
	if len(contentRefs) > 0 {
		projection["contentDigests"] = digests(contentRefs)
		projection["contentSources"] = sources(contentRefs)
	}
	if kind == contracts.AiProjectionKindAgentRun {
		if digest := firstDigestFor(contentRefs, "input"); digest != "" {
			projection["inputDigest"] = digest
		}
		if digest := firstDigestFor(contentRefs, "output"); digest != "" {
			projection["outputDigest"] = digest
		}
	}
	if kind == contracts.AiProjectionKindToolCall {
		if digest := firstDigestFor(contentRefs, "parameter", "arg", "input"); digest != "" {
			projection["parametersDigest"] = digest
		}
		if digest := firstDigestFor(contentRefs, "result", "output"); digest != "" {
			projection["resultDigest"] = digest
		}
	}
	if len(warnings) > 0 {
		projection["normalizationWarnings"] = append([]string(nil), warnings...)
	}
	return projection, warnings
}

func setCanonicalString(projection map[string]any, warnings *[]string, field string, attrs contracts.Attributes, genKeys []string, oiKeys []string, providerKeys []string) {
	genValue := firstNonEmptyString(attrs, genKeys...)
	oiValue := firstNonEmptyString(attrs, oiKeys...)
	providerValue := firstNonEmptyString(attrs, providerKeys...)
	value := genValue
	if value == "" {
		value = oiValue
	}
	if value == "" {
		value = providerValue
	}
	if value == "" {
		return
	}
	projection[field] = value
	if genValue != "" && oiValue != "" && genValue != oiValue {
		*warnings = append(*warnings, fmt.Sprintf("%s conflict: preferred OTel GenAI value over OpenInference value", field))
	}
}

func addTokenTotals(projection map[string]any, attrs contracts.Attributes) {
	totals := map[string]any{}
	if value, ok := intAttribute(attrs, "gen_ai.usage.input_tokens", "llm.token_count.prompt"); ok {
		totals["input"] = value
	}
	if value, ok := intAttribute(attrs, "gen_ai.usage.output_tokens", "llm.token_count.completion"); ok {
		totals["output"] = value
	}
	if value, ok := intAttribute(attrs, "gen_ai.usage.total_tokens", "llm.token_count.total"); ok {
		totals["total"] = value
	}
	if len(totals) > 0 {
		projection["tokenTotals"] = totals
	}
}

func agentIdentity(attrs contracts.Attributes, spanName string) map[string]any {
	agent := map[string]any{}
	if id := firstNonEmptyString(attrs, "gen_ai.agent.id", "agent.id"); id != "" {
		agent["id"] = id
	}
	name := firstNonEmptyString(attrs, "gen_ai.agent.name", "agent.name")
	if name == "" {
		name = spanName
	}
	agent["name"] = name
	if version := firstNonEmptyString(attrs, "gen_ai.agent.version", "agent.version"); version != "" {
		agent["version"] = version
	}
	return agent
}

func contentReferences(span contracts.Span, requiredPrefixes []string) []contentReference {
	refs := []contentReference{}
	for _, key := range sortedKeys(span.Attributes) {
		if !isContentKey(key) || !matchesRequiredPrefix(key, requiredPrefixes) {
			continue
		}
		if text, ok := span.Attributes[key].(string); ok && text != "" {
			refs = append(refs, contentReference{Source: "attribute:" + key, Digest: digest(text)})
		}
	}
	for eventIndex, event := range span.Events {
		for _, key := range sortedKeys(event.Attributes) {
			if !isContentKey(key) || !matchesRequiredPrefix(key, requiredPrefixes) {
				continue
			}
			if text, ok := event.Attributes[key].(string); ok && text != "" {
				refs = append(refs, contentReference{Source: fmt.Sprintf("event:%d:%s", eventIndex, key), Digest: digest(text)})
			}
		}
	}
	return refs
}

func messageEventIDs(span contracts.Span) []string {
	ids := []string{}
	for index, event := range span.Events {
		if strings.Contains(strings.ToLower(event.Name), "message") || strings.Contains(strings.ToLower(event.Name), "content") {
			ids = append(ids, fmt.Sprintf("event:%d", index))
		}
	}
	return ids
}

func firstDigestFor(refs []contentReference, terms ...string) string {
	for _, ref := range refs {
		source := strings.ToLower(ref.Source)
		for _, term := range terms {
			if strings.Contains(source, strings.ToLower(term)) {
				return ref.Digest
			}
		}
	}
	return ""
}

func isContentKey(key string) bool {
	normalized := strings.ToLower(key)
	contentTerms := []string{"prompt", "completion", "content", "message", "input", "output", "parameter", "parameters", "args", "arguments", "result", "document.text", "document.content", "reasoning"}
	for _, term := range contentTerms {
		if strings.Contains(normalized, term) {
			return true
		}
	}
	return false
}

func matchesRequiredPrefix(key string, prefixes []string) bool {
	if len(prefixes) == 0 {
		return true
	}
	for _, prefix := range prefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func digests(refs []contentReference) []string {
	values := make([]string, 0, len(refs))
	for _, ref := range refs {
		values = append(values, ref.Digest)
	}
	return values
}

func sources(refs []contentReference) []string {
	values := make([]string, 0, len(refs))
	for _, ref := range refs {
		values = append(values, ref.Source)
	}
	return values
}

func projectionID(kind contracts.AiProjectionKind, traceID string, spanID string) string {
	return string(kind) + ":" + traceID + ":" + spanID
}

func defaultCommandID(span contracts.Span) string {
	return "ai-projection:" + span.TraceID + ":" + span.ID
}

func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func firstNonEmptyString(attrs contracts.Attributes, keys ...string) string {
	for _, key := range keys {
		if value := stringAttribute(attrs, key); value != "" {
			return value
		}
	}
	return ""
}

func stringAttribute(attrs contracts.Attributes, key string) string {
	if attrs == nil {
		return ""
	}
	switch value := attrs[key].(type) {
	case string:
		return strings.TrimSpace(value)
	case fmt.Stringer:
		return strings.TrimSpace(value.String())
	default:
		return ""
	}
}

func intAttribute(attrs contracts.Attributes, keys ...string) (int, bool) {
	for _, key := range keys {
		switch value := attrs[key].(type) {
		case int:
			return value, true
		case int8:
			return int(value), true
		case int16:
			return int(value), true
		case int32:
			return int(value), true
		case int64:
			return int(value), true
		case uint:
			return int(value), true
		case uint8:
			return int(value), true
		case uint16:
			return int(value), true
		case uint32:
			return int(value), true
		case uint64:
			return int(value), true
		case float64:
			return int(value), true
		case string:
			parsed, err := strconv.Atoi(strings.TrimSpace(value))
			if err == nil {
				return parsed, true
			}
		}
	}
	return 0, false
}

func hasPrefixedAttribute(attrs contracts.Attributes, prefix string) bool {
	for key := range attrs {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func sortedKeys(attrs contracts.Attributes) []string {
	keys := make([]string, 0, len(attrs))
	for key := range attrs {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func cloneAttributes(attrs contracts.Attributes) contracts.Attributes {
	cloned := make(contracts.Attributes, len(attrs))
	for key, value := range attrs {
		cloned[key] = value
	}
	return cloned
}
