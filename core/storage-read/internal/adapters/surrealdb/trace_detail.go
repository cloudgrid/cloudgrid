//go:build surrealdb

package surrealdb

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const defaultRelatedLogLimit = 50

var stackFrameLocationPattern = regexp.MustCompile(`(?:^|[ (])([^()\s]+?):([0-9]+)(?::([0-9]+))?\)?$`)

func buildTraceDetailData(trace contracts.Trace, spans []contracts.Span, logs []contracts.LogEvent, query *contracts.TraceDetailQuery) contracts.TraceDetailData {
	spanIDs := map[string]bool{}
	children := map[string][]int{}
	for index := range spans {
		spanIDs[spans[index].ID] = true
	}
	for index := range spans {
		if spans[index].ParentSpanID != nil && spanIDs[*spans[index].ParentSpanID] {
			children[*spans[index].ParentSpanID] = append(children[*spans[index].ParentSpanID], index)
		}
	}

	rootIDs, orphanIDs, warnings := deriveRootsAndOrphans(trace, spans, spanIDs)
	criticalIDs := deriveCriticalPathSpanIDs(spans, rootIDs, children)
	criticalSet := stringSet(criticalIDs)

	enriched := make([]contracts.Span, len(spans))
	for index := range spans {
		enriched[index] = spans[index]
		enrichSpan(&enriched[index], spans, spanIDs, children, criticalSet)
	}

	structure := contracts.TraceStructure{
		RootSpanIDs:         rootIDs,
		OrphanSpanIDs:       orphanIDs,
		CriticalPathSpanIDs: criticalIDs,
		MaxDepth:            maxSpanDepth(enriched),
		ServiceBreakdown:    serviceBreakdown(trace, enriched),
	}

	matches := spanMatches(enriched, query, criticalSet)
	matchSet := map[string]bool{}
	for _, match := range matches {
		matchSet[match.SpanID] = true
	}

	var selected *contracts.Span
	for index := range enriched {
		if query != nil && query.SelectedSpanID != nil && enriched[index].ID == *query.SelectedSpanID {
			selected = &enriched[index]
			break
		}
	}

	visibleSpans := enriched
	if query != nil && query.ShowMatchesOnly != nil && *query.ShowMatchesOnly {
		visibleSpans = make([]contracts.Span, 0, len(matches))
		for _, span := range enriched {
			if matchSet[span.ID] {
				visibleSpans = append(visibleSpans, span)
			}
		}
	}

	return contracts.TraceDetailData{
		Trace:        trace,
		Structure:    structure,
		Spans:        visibleSpans,
		SelectedSpan: selected,
		SpanMatches:  matches,
		Logs:         logs,
		RelatedLogs:  relatedLogs(logs, query, matchSet),
		Warnings:     warnings,
	}
}

func deriveRootsAndOrphans(trace contracts.Trace, spans []contracts.Span, spanIDs map[string]bool) ([]string, []string, []contracts.TraceWarning) {
	rootIDs := []string{}
	orphanIDs := []string{}
	warnings := []contracts.TraceWarning{}
	for _, span := range spans {
		switch {
		case span.ParentSpanID == nil:
			rootIDs = append(rootIDs, span.ID)
		case !spanIDs[*span.ParentSpanID]:
			orphanIDs = append(orphanIDs, span.ID)
			spanID := span.ID
			warnings = append(warnings, contracts.TraceWarning{Code: "missingParent", Message: fmt.Sprintf("Span %s references a missing parent span", span.ID), SpanID: &spanID})
		}
		if span.EndedAt.Before(span.StartedAt) {
			spanID := span.ID
			warnings = append(warnings, contracts.TraceWarning{Code: "clockSkew", Message: fmt.Sprintf("Span %s ends before it starts", span.ID), SpanID: &spanID})
		}
	}
	if len(rootIDs) == 0 {
		warnings = append(warnings, contracts.TraceWarning{Code: "missingRoot", Message: "Trace has no root span"})
	}
	if trace.RootSpanID != nil && !spanIDs[*trace.RootSpanID] {
		warnings = append(warnings, contracts.TraceWarning{Code: "missingRoot", Message: "Trace root span is missing"})
	}
	if len(spans) >= 200 {
		warnings = append(warnings, contracts.TraceWarning{Code: "largeTracePreview", Message: "Trace contains a large number of spans"})
	}
	sort.Strings(rootIDs)
	sort.Strings(orphanIDs)
	return rootIDs, orphanIDs, warnings
}

func enrichSpan(span *contracts.Span, all []contracts.Span, spanIDs map[string]bool, children map[string][]int, criticalSet map[string]bool) {
	span.Depth = spanDepth(*span, all, spanIDs)
	span.ChildCount = len(children[span.ID])
	span.HasError = span.Status != nil && *span.Status == contracts.TraceStatusError
	span.IsCriticalPath = criticalSet[span.ID]
	span.IsOrphan = span.ParentSpanID != nil && !spanIDs[*span.ParentSpanID]
	span.IsServiceEntry = span.ParentSpanID == nil || span.IsOrphan || parentServiceDiffers(*span, all)
	span.Exceptions = extractExceptions(*span)
	span.ExceptionCount = len(span.Exceptions)
	for index := range span.Links {
		if span.Links[index].Direction == nil {
			direction := contracts.SpanLinkDirectionUnknown
			span.Links[index].Direction = &direction
		}
	}
}

func spanDepth(span contracts.Span, all []contracts.Span, spanIDs map[string]bool) int {
	depth := 0
	seen := map[string]bool{span.ID: true}
	parentID := span.ParentSpanID
	for parentID != nil && spanIDs[*parentID] && !seen[*parentID] {
		seen[*parentID] = true
		depth++
		parent := findSpan(all, *parentID)
		if parent == nil {
			break
		}
		parentID = parent.ParentSpanID
	}
	return depth
}

func parentServiceDiffers(span contracts.Span, all []contracts.Span) bool {
	if span.ParentSpanID == nil {
		return true
	}
	parent := findSpan(all, *span.ParentSpanID)
	if parent == nil {
		return true
	}
	return stringValue(span.ServiceName) != stringValue(parent.ServiceName)
}

func findSpan(spans []contracts.Span, spanID string) *contracts.Span {
	for index := range spans {
		if spans[index].ID == spanID {
			return &spans[index]
		}
	}
	return nil
}

func deriveCriticalPathSpanIDs(spans []contracts.Span, rootIDs []string, children map[string][]int) []string {
	best := []string{}
	for _, rootID := range rootIDs {
		path := longestPathFrom(rootID, spans, children)
		if pathDuration(path, spans) > pathDuration(best, spans) || len(best) == 0 {
			best = path
		}
	}
	return best
}

func longestPathFrom(spanID string, spans []contracts.Span, children map[string][]int) []string {
	best := []string{spanID}
	for _, childIndex := range children[spanID] {
		path := append([]string{spanID}, longestPathFrom(spans[childIndex].ID, spans, children)...)
		if pathDuration(path, spans) > pathDuration(best, spans) {
			best = path
		}
	}
	return best
}

func pathDuration(path []string, spans []contracts.Span) float64 {
	total := 0.0
	for _, spanID := range path {
		if span := findSpan(spans, spanID); span != nil {
			total += span.DurationMs
		}
	}
	return total
}

func extractExceptions(span contracts.Span) []contracts.SpanException {
	exceptions := []contracts.SpanException{}
	for _, event := range span.Events {
		if event.Name != "exception" && event.Attributes["exception.type"] == nil && event.Attributes["exception.message"] == nil {
			continue
		}
		exceptions = append(exceptions, contracts.SpanException{
			Timestamp:  event.Timestamp,
			Type:       optionalString(event.Attributes["exception.type"]),
			Message:    optionalString(event.Attributes["exception.message"]),
			Stacktrace: optionalString(event.Attributes["exception.stacktrace"]),
			Escaped:    optionalBool(event.Attributes["exception.escaped"]),
			Attributes: event.Attributes,
			Frames:     parseStackFrames(optionalString(event.Attributes["exception.stacktrace"])),
		})
	}
	return exceptions
}

func parseStackFrames(stacktrace *string) []contracts.StackTraceFrame {
	if stacktrace == nil || strings.TrimSpace(*stacktrace) == "" {
		return []contracts.StackTraceFrame{}
	}
	lines := strings.Split(*stacktrace, "\n")
	frames := make([]contracts.StackTraceFrame, 0, len(lines))
	for _, line := range lines {
		raw := strings.TrimSpace(line)
		if raw == "" {
			continue
		}
		frame := contracts.StackTraceFrame{Raw: raw}
		parseFrameLocation(raw, &frame)
		parseFrameFunction(raw, &frame)
		frames = append(frames, frame)
	}
	return frames
}

func parseFrameLocation(raw string, frame *contracts.StackTraceFrame) {
	matches := stackFrameLocationPattern.FindStringSubmatch(raw)
	if len(matches) == 0 {
		return
	}
	fileName := matches[1]
	lineNumber, err := strconv.Atoi(matches[2])
	if err == nil {
		frame.LineNumber = &lineNumber
	}
	if matches[3] != "" {
		columnNumber, err := strconv.Atoi(matches[3])
		if err == nil {
			frame.ColumnNumber = &columnNumber
		}
	}
	frame.FileName = &fileName
	language := inferFrameLanguage(fileName)
	if language != "" {
		frame.Language = &language
	}
}

func parseFrameFunction(raw string, frame *contracts.StackTraceFrame) {
	trimmed := strings.TrimPrefix(raw, "at ")
	if index := strings.Index(trimmed, " ("); index > 0 {
		functionName := strings.TrimSpace(trimmed[:index])
		frame.FunctionName = &functionName
		return
	}
	fields := strings.Fields(trimmed)
	if len(fields) > 0 && !strings.Contains(fields[0], "/") && !strings.Contains(fields[0], ":") {
		functionName := fields[0]
		frame.FunctionName = &functionName
	}
}

func inferFrameLanguage(fileName string) string {
	switch {
	case strings.HasSuffix(fileName, ".go"):
		return "go"
	case strings.HasSuffix(fileName, ".js"), strings.HasSuffix(fileName, ".mjs"), strings.HasSuffix(fileName, ".cjs"):
		return "javascript"
	case strings.HasSuffix(fileName, ".ts"), strings.HasSuffix(fileName, ".tsx"):
		return "typescript"
	case strings.HasSuffix(fileName, ".py"):
		return "python"
	default:
		return ""
	}
}

func spanMatches(spans []contracts.Span, query *contracts.TraceDetailQuery, criticalSet map[string]bool) []contracts.SpanMatch {
	matches := []contracts.SpanMatch{}
	hasExplicitCriteria := hasExplicitSpanCriteria(query)
	for _, span := range spans {
		fields := []string{}
		reason := ""
		if query != nil && query.SelectedSpanID != nil && span.ID == *query.SelectedSpanID {
			reason = "selected"
			fields = append(fields, "id")
		}
		if query != nil && spanMatchesQuery(span, *query, &fields) && reason == "" {
			reason = "search"
		}
		if query != nil && spanMatchesFilters(span, *query, &fields) && reason == "" {
			reason = "filter"
		}
		if !hasExplicitCriteria && span.HasError && reason == "" {
			reason = "error"
			fields = append(fields, "status")
		}
		if !hasExplicitCriteria && criticalSet[span.ID] && reason == "" {
			reason = "criticalPath"
			fields = append(fields, "durationMs")
		}
		if reason != "" {
			matches = append(matches, contracts.SpanMatch{SpanID: span.ID, Reason: reason, Fields: uniqueStrings(fields)})
		}
	}
	return matches
}

func hasExplicitSpanCriteria(query *contracts.TraceDetailQuery) bool {
	if query == nil {
		return false
	}
	return query.SelectedSpanID != nil ||
		query.SpanQuery != nil ||
		query.SpanService != nil ||
		query.SpanName != nil ||
		query.SpanStatus != nil ||
		query.MinSpanDurationMs != nil ||
		query.MaxSpanDurationMs != nil ||
		len(query.Attributes) > 0
}

func spanMatchesQuery(span contracts.Span, query contracts.TraceDetailQuery, fields *[]string) bool {
	if query.SpanQuery == nil || strings.TrimSpace(*query.SpanQuery) == "" {
		return false
	}
	needle := strings.ToLower(strings.TrimSpace(*query.SpanQuery))
	matched := false
	if strings.Contains(strings.ToLower(span.Name), needle) {
		*fields = append(*fields, "name")
		matched = true
	}
	if span.ServiceName != nil && strings.Contains(strings.ToLower(*span.ServiceName), needle) {
		*fields = append(*fields, "serviceName")
		matched = true
	}
	for key, value := range span.Attributes {
		if strings.Contains(strings.ToLower(key), needle) || strings.Contains(strings.ToLower(fmt.Sprint(value)), needle) {
			*fields = append(*fields, "attributes."+key)
			matched = true
		}
	}
	for _, event := range span.Events {
		if strings.Contains(strings.ToLower(event.Name), needle) {
			*fields = append(*fields, "events.name")
			matched = true
		}
		for key, value := range event.Attributes {
			if strings.Contains(strings.ToLower(key), needle) || strings.Contains(strings.ToLower(fmt.Sprint(value)), needle) {
				*fields = append(*fields, "events.attributes."+key)
				matched = true
			}
		}
	}
	for _, link := range span.Links {
		if strings.Contains(strings.ToLower(link.TraceID), needle) || strings.Contains(strings.ToLower(link.SpanID), needle) {
			*fields = append(*fields, "links")
			matched = true
		}
	}
	for _, exception := range span.Exceptions {
		if stringPointerContains(exception.Type, needle) ||
			stringPointerContains(exception.Message, needle) ||
			stringPointerContains(exception.Stacktrace, needle) {
			*fields = append(*fields, "exceptions")
			matched = true
		}
	}
	return matched
}

func spanMatchesFilters(span contracts.Span, query contracts.TraceDetailQuery, fields *[]string) bool {
	matched := false
	if query.SpanService != nil {
		if span.ServiceName == nil || *span.ServiceName != *query.SpanService {
			return false
		}
		*fields = append(*fields, "serviceName")
		matched = true
	}
	if query.SpanName != nil {
		if span.Name != *query.SpanName {
			return false
		}
		*fields = append(*fields, "name")
		matched = true
	}
	if query.SpanStatus != nil {
		if span.Status == nil || *span.Status != *query.SpanStatus {
			return false
		}
		*fields = append(*fields, "status")
		matched = true
	}
	if query.MinSpanDurationMs != nil {
		if span.DurationMs < *query.MinSpanDurationMs {
			return false
		}
		*fields = append(*fields, "durationMs")
		matched = true
	}
	if query.MaxSpanDurationMs != nil {
		if span.DurationMs > *query.MaxSpanDurationMs {
			return false
		}
		*fields = append(*fields, "durationMs")
		matched = true
	}
	for _, filter := range query.Attributes {
		if !attributeMatches(span.Attributes, filter) {
			return false
		}
		*fields = append(*fields, "attributes."+filter.Key)
		matched = true
	}
	return matched
}

func attributeMatches(attributes contracts.Attributes, filter contracts.AttributeFilter) bool {
	value, exists := attributes[filter.Key]
	switch filter.Operator {
	case contracts.AttributeFilterOperatorExists:
		return exists
	case contracts.AttributeFilterOperatorEQ:
		return exists && fmt.Sprint(value) == fmt.Sprint(filter.Value)
	case contracts.AttributeFilterOperatorNEQ:
		return !exists || fmt.Sprint(value) != fmt.Sprint(filter.Value)
	case contracts.AttributeFilterOperatorContains:
		return exists && strings.Contains(strings.ToLower(fmt.Sprint(value)), strings.ToLower(fmt.Sprint(filter.Value)))
	default:
		return false
	}
}

func relatedLogs(logs []contracts.LogEvent, query *contracts.TraceDetailQuery, matchSet map[string]bool) []contracts.LogEvent {
	limit := defaultRelatedLogLimit
	if query != nil && query.RelatedLogLimit != nil && *query.RelatedLogLimit > 0 && *query.RelatedLogLimit <= maxPageLimit {
		limit = *query.RelatedLogLimit
	}
	selectedSpanID := ""
	if query != nil && query.SelectedSpanID != nil {
		selectedSpanID = *query.SelectedSpanID
	}
	filtered := make([]contracts.LogEvent, 0, len(logs))
	for _, log := range logs {
		if selectedSpanID != "" && (log.SpanID == nil || *log.SpanID != selectedSpanID) {
			continue
		}
		if selectedSpanID == "" && len(matchSet) > 0 && log.SpanID != nil && !matchSet[*log.SpanID] {
			continue
		}
		if query != nil && query.LogSearch != nil && strings.TrimSpace(*query.LogSearch) != "" && !logMatchesSearch(log, *query.LogSearch) {
			continue
		}
		filtered = append(filtered, log)
	}
	sort.SliceStable(filtered, func(left, right int) bool {
		leftRank := logRelationRank(filtered[left], selectedSpanID)
		rightRank := logRelationRank(filtered[right], selectedSpanID)
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		if !filtered[left].Timestamp.Equal(filtered[right].Timestamp) {
			return filtered[left].Timestamp.Before(filtered[right].Timestamp)
		}
		return filtered[left].ID < filtered[right].ID
	})
	if len(filtered) > limit {
		return filtered[:limit]
	}
	return filtered
}

func logRelationRank(log contracts.LogEvent, selectedSpanID string) int {
	if selectedSpanID != "" && log.SpanID != nil && *log.SpanID == selectedSpanID {
		return 0
	}
	if log.SpanID != nil {
		return 1
	}
	if log.TraceID != nil {
		return 2
	}
	return 3
}

func logMatchesSearch(log contracts.LogEvent, search string) bool {
	needle := strings.ToLower(strings.TrimSpace(search))
	if strings.Contains(strings.ToLower(fmt.Sprint(log.Body)), needle) {
		return true
	}
	for key, value := range log.Attributes {
		if strings.Contains(strings.ToLower(key), needle) || strings.Contains(strings.ToLower(fmt.Sprint(value)), needle) {
			return true
		}
	}
	return false
}

func serviceBreakdown(trace contracts.Trace, spans []contracts.Span) []contracts.ServiceTraceBreakdown {
	byService := map[string]*contracts.ServiceTraceBreakdown{}
	for _, span := range spans {
		service := stringValue(span.ServiceName)
		if service == "" {
			service = "unknown"
		}
		breakdown := byService[service]
		if breakdown == nil {
			breakdown = &contracts.ServiceTraceBreakdown{ServiceName: service}
			byService[service] = breakdown
		}
		breakdown.SpanCount++
		if span.HasError {
			breakdown.ErrorSpanCount++
		}
		breakdown.DurationMs += span.DurationMs
	}
	traceDuration := 0.0
	if trace.DurationMs != nil {
		traceDuration = *trace.DurationMs
	}
	values := make([]contracts.ServiceTraceBreakdown, 0, len(byService))
	for _, breakdown := range byService {
		if traceDuration > 0 {
			breakdown.PercentOfTraceDuration = breakdown.DurationMs / traceDuration * 100
		}
		values = append(values, *breakdown)
	}
	sort.Slice(values, func(left, right int) bool {
		return values[left].ServiceName < values[right].ServiceName
	})
	return values
}

func maxSpanDepth(spans []contracts.Span) int {
	maxDepth := 0
	for _, span := range spans {
		if span.Depth > maxDepth {
			maxDepth = span.Depth
		}
	}
	return maxDepth
}

func stringSet(values []string) map[string]bool {
	set := map[string]bool{}
	for _, value := range values {
		set[value] = true
	}
	return set
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func optionalString(value any) *string {
	if value == nil {
		return nil
	}
	text := fmt.Sprint(value)
	return &text
}

func optionalBool(value any) *bool {
	switch typed := value.(type) {
	case bool:
		return &typed
	default:
		return nil
	}
}

func stringPointerContains(value *string, needle string) bool {
	return value != nil && strings.Contains(strings.ToLower(*value), needle)
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
