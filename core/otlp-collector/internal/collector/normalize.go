package collector

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

func NormalizeTraces(request *collectortracepb.ExportTraceServiceRequest, _ time.Time) ([]contracts.Span, []contracts.Trace, error) {
	spans := []contracts.Span{}
	for resourceIndex, resourceSpans := range request.GetResourceSpans() {
		resourceAttrs := attributes(resourceSpans.GetResource().GetAttributes())
		service := stringAttribute(resourceAttrs, "service.name")
		for scopeIndex, scopeSpans := range resourceSpans.GetScopeSpans() {
			scopeAttrs := attributes(scopeSpans.GetScope().GetAttributes())
			for spanIndex, otlpSpan := range scopeSpans.GetSpans() {
				span, err := normalizeSpan(otlpSpan, resourceAttrs, scopeAttrs, service)
				if err != nil {
					return nil, nil, fmt.Errorf("resourceSpans[%d].scopeSpans[%d].spans[%d]: %w", resourceIndex, scopeIndex, spanIndex, err)
				}
				spans = append(spans, span)
			}
		}
	}
	traces, err := deriveTraces(spans)
	if err != nil {
		return nil, nil, err
	}
	return spans, traces, nil
}

func NormalizeLogs(request *collectorlogspb.ExportLogsServiceRequest, receivedAt time.Time) ([]contracts.LogEvent, error) {
	logs := []contracts.LogEvent{}
	for resourceIndex, resourceLogs := range request.GetResourceLogs() {
		resourceAttrs := attributes(resourceLogs.GetResource().GetAttributes())
		service := stringAttribute(resourceAttrs, "service.name")
		for scopeIndex, scopeLogs := range resourceLogs.GetScopeLogs() {
			scopeAttrs := attributes(scopeLogs.GetScope().GetAttributes())
			for logIndex, otlpLog := range scopeLogs.GetLogRecords() {
				logEvent, err := normalizeLog(otlpLog, resourceAttrs, scopeAttrs, service, receivedAt)
				if err != nil {
					return nil, fmt.Errorf("resourceLogs[%d].scopeLogs[%d].logRecords[%d]: %w", resourceIndex, scopeIndex, logIndex, err)
				}
				logs = append(logs, logEvent)
			}
		}
	}
	return logs, nil
}

func NormalizeMetrics(request *collectormetricspb.ExportMetricsServiceRequest, receivedAt time.Time) ([]contracts.MetricDescriptor, []contracts.MetricPoint, error) {
	descriptorsByName := map[string]contracts.MetricDescriptor{}
	points := []contracts.MetricPoint{}
	for resourceIndex, resourceMetrics := range request.GetResourceMetrics() {
		resourceAttrs := attributes(resourceMetrics.GetResource().GetAttributes())
		service := stringAttribute(resourceAttrs, "service.name")
		for scopeIndex, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
			scopeAttrs := attributes(scopeMetrics.GetScope().GetAttributes())
			scopeName := optionalString(scopeMetrics.GetScope().GetName())
			for metricIndex, metric := range scopeMetrics.GetMetrics() {
				descriptor, metricPoints, err := normalizeMetric(metric, resourceAttrs, scopeAttrs, service, scopeName, receivedAt)
				if err != nil {
					return nil, nil, fmt.Errorf("resourceMetrics[%d].scopeMetrics[%d].metrics[%d]: %w", resourceIndex, scopeIndex, metricIndex, err)
				}
				current, ok := descriptorsByName[descriptor.Name]
				if !ok {
					descriptorsByName[descriptor.Name] = descriptor
				} else {
					current.AttributeKeys = sortedUniqueStrings(append(current.AttributeKeys, descriptor.AttributeKeys...))
					if descriptor.FirstSeenAt.Before(current.FirstSeenAt) {
						current.FirstSeenAt = descriptor.FirstSeenAt
					}
					if descriptor.LastSeenAt.After(current.LastSeenAt) {
						current.LastSeenAt = descriptor.LastSeenAt
					}
					descriptorsByName[descriptor.Name] = current
				}
				points = append(points, metricPoints...)
			}
		}
	}
	names := make([]string, 0, len(descriptorsByName))
	for name := range descriptorsByName {
		names = append(names, name)
	}
	sort.Strings(names)
	descriptors := make([]contracts.MetricDescriptor, 0, len(names))
	for _, name := range names {
		descriptors = append(descriptors, descriptorsByName[name])
	}
	return descriptors, points, nil
}

func normalizeMetric(metric *metricspb.Metric, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, scopeName *string, receivedAt time.Time) (contracts.MetricDescriptor, []contracts.MetricPoint, error) {
	if strings.TrimSpace(metric.GetName()) == "" {
		return contracts.MetricDescriptor{}, nil, fmt.Errorf("metric name is required")
	}
	base := contracts.MetricDescriptor{
		ID:          slugMetricName(metric.GetName()),
		Name:        metric.GetName(),
		Description: optionalString(metric.GetDescription()),
		Unit:        metric.GetUnit(),
		FirstSeenAt: receivedAt.UTC(),
		LastSeenAt:  receivedAt.UTC(),
	}
	switch data := metric.GetData().(type) {
	case *metricspb.Metric_Gauge:
		base.Kind = contracts.MetricKindGauge
		points, err := numberMetricPoints(metric, base.Kind, resourceAttrs, scopeAttrs, service, scopeName, data.Gauge.GetDataPoints())
		base.AttributeKeys = metricAttributeKeys(points)
		base.FirstSeenAt, base.LastSeenAt = metricTimeRange(points, receivedAt)
		return base, points, err
	case *metricspb.Metric_Sum:
		base.Kind = contracts.MetricKindSum
		temporality := aggregationTemporality(data.Sum.GetAggregationTemporality())
		base.AggregationTemporality = &temporality
		monotonic := data.Sum.GetIsMonotonic()
		base.Monotonic = &monotonic
		points, err := numberMetricPoints(metric, base.Kind, resourceAttrs, scopeAttrs, service, scopeName, data.Sum.GetDataPoints())
		base.AttributeKeys = metricAttributeKeys(points)
		base.FirstSeenAt, base.LastSeenAt = metricTimeRange(points, receivedAt)
		return base, points, err
	case *metricspb.Metric_Histogram:
		base.Kind = contracts.MetricKindHistogram
		temporality := aggregationTemporality(data.Histogram.GetAggregationTemporality())
		base.AggregationTemporality = &temporality
		points, err := histogramMetricPoints(metric, base.Kind, resourceAttrs, scopeAttrs, service, scopeName, data.Histogram.GetDataPoints())
		base.AttributeKeys = metricAttributeKeys(points)
		base.FirstSeenAt, base.LastSeenAt = metricTimeRange(points, receivedAt)
		return base, points, err
	case *metricspb.Metric_ExponentialHistogram:
		base.Kind = contracts.MetricKindExponentialHistogram
		temporality := aggregationTemporality(data.ExponentialHistogram.GetAggregationTemporality())
		base.AggregationTemporality = &temporality
		points, err := exponentialHistogramMetricPoints(metric, base.Kind, resourceAttrs, scopeAttrs, service, scopeName, data.ExponentialHistogram.GetDataPoints())
		base.AttributeKeys = metricAttributeKeys(points)
		base.FirstSeenAt, base.LastSeenAt = metricTimeRange(points, receivedAt)
		return base, points, err
	case *metricspb.Metric_Summary:
		base.Kind = contracts.MetricKindSummary
		points, err := summaryMetricPoints(metric, base.Kind, resourceAttrs, scopeAttrs, service, scopeName, data.Summary.GetDataPoints())
		base.AttributeKeys = metricAttributeKeys(points)
		base.FirstSeenAt, base.LastSeenAt = metricTimeRange(points, receivedAt)
		return base, points, err
	default:
		return contracts.MetricDescriptor{}, nil, fmt.Errorf("metric data kind is required")
	}
}

func numberMetricPoints(metric *metricspb.Metric, kind contracts.MetricKind, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, scopeName *string, points []*metricspb.NumberDataPoint) ([]contracts.MetricPoint, error) {
	out := make([]contracts.MetricPoint, 0, len(points))
	for pointIndex, point := range points {
		timestamp, err := requiredMetricTimestamp(point.GetTimeUnixNano())
		if err != nil {
			return nil, fmt.Errorf("dataPoints[%d]: %w", pointIndex, err)
		}
		attrs := mergeAttributes(resourceAttrs, scopeAttrs, attributes(point.GetAttributes()))
		value := numberDataPointValue(point)
		out = append(out, contracts.MetricPoint{
			ID:             deterministicMetricPointID(metric.GetName(), timestamp, attrs),
			MetricName:     metric.GetName(),
			ServiceName:    service,
			ScopeName:      scopeName,
			Kind:           kind,
			Timestamp:      timestamp,
			StartTimestamp: optionalUnixNano(point.GetStartTimeUnixNano()),
			Value:          &value,
			Attributes:     metricPointAttributes(attrs, point.GetFlags()),
			Exemplars:      exemplars(point.GetExemplars()),
		})
	}
	return out, nil
}

func histogramMetricPoints(metric *metricspb.Metric, kind contracts.MetricKind, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, scopeName *string, points []*metricspb.HistogramDataPoint) ([]contracts.MetricPoint, error) {
	out := make([]contracts.MetricPoint, 0, len(points))
	for pointIndex, point := range points {
		timestamp, err := requiredMetricTimestamp(point.GetTimeUnixNano())
		if err != nil {
			return nil, fmt.Errorf("dataPoints[%d]: %w", pointIndex, err)
		}
		attrs := mergeAttributes(resourceAttrs, scopeAttrs, attributes(point.GetAttributes()))
		count := float64(point.GetCount())
		out = append(out, contracts.MetricPoint{
			ID:             deterministicMetricPointID(metric.GetName(), timestamp, attrs),
			MetricName:     metric.GetName(),
			ServiceName:    service,
			ScopeName:      scopeName,
			Kind:           kind,
			Timestamp:      timestamp,
			StartTimestamp: optionalUnixNano(point.GetStartTimeUnixNano()),
			Count:          &count,
			Sum:            point.Sum,
			Min:            point.Min,
			Max:            point.Max,
			BucketCounts:   uintsToFloats(point.GetBucketCounts()),
			ExplicitBounds: append([]float64(nil), point.GetExplicitBounds()...),
			Attributes:     metricPointAttributes(attrs, point.GetFlags()),
			Exemplars:      exemplars(point.GetExemplars()),
		})
	}
	return out, nil
}

func exponentialHistogramMetricPoints(metric *metricspb.Metric, kind contracts.MetricKind, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, scopeName *string, points []*metricspb.ExponentialHistogramDataPoint) ([]contracts.MetricPoint, error) {
	out := make([]contracts.MetricPoint, 0, len(points))
	for pointIndex, point := range points {
		timestamp, err := requiredMetricTimestamp(point.GetTimeUnixNano())
		if err != nil {
			return nil, fmt.Errorf("dataPoints[%d]: %w", pointIndex, err)
		}
		attrs := mergeAttributes(resourceAttrs, scopeAttrs, attributes(point.GetAttributes()))
		count := float64(point.GetCount())
		out = append(out, contracts.MetricPoint{
			ID:             deterministicMetricPointID(metric.GetName(), timestamp, attrs),
			MetricName:     metric.GetName(),
			ServiceName:    service,
			ScopeName:      scopeName,
			Kind:           kind,
			Timestamp:      timestamp,
			StartTimestamp: optionalUnixNano(point.GetStartTimeUnixNano()),
			Count:          &count,
			Sum:            point.Sum,
			Min:            point.Min,
			Max:            point.Max,
			BucketCounts:   append(uintsToFloats(point.GetPositive().GetBucketCounts()), uintsToFloats(point.GetNegative().GetBucketCounts())...),
			Attributes:     metricPointAttributes(attrs, point.GetFlags()),
			Exemplars:      exemplars(point.GetExemplars()),
		})
	}
	return out, nil
}

func summaryMetricPoints(metric *metricspb.Metric, kind contracts.MetricKind, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, scopeName *string, points []*metricspb.SummaryDataPoint) ([]contracts.MetricPoint, error) {
	out := make([]contracts.MetricPoint, 0, len(points))
	for pointIndex, point := range points {
		timestamp, err := requiredMetricTimestamp(point.GetTimeUnixNano())
		if err != nil {
			return nil, fmt.Errorf("dataPoints[%d]: %w", pointIndex, err)
		}
		attrs := mergeAttributes(resourceAttrs, scopeAttrs, attributes(point.GetAttributes()))
		count := float64(point.GetCount())
		sum := point.GetSum()
		out = append(out, contracts.MetricPoint{
			ID:             deterministicMetricPointID(metric.GetName(), timestamp, attrs),
			MetricName:     metric.GetName(),
			ServiceName:    service,
			ScopeName:      scopeName,
			Kind:           kind,
			Timestamp:      timestamp,
			StartTimestamp: optionalUnixNano(point.GetStartTimeUnixNano()),
			Count:          &count,
			Sum:            &sum,
			QuantileValues: quantileValues(point.GetQuantileValues()),
			Attributes:     metricPointAttributes(attrs, point.GetFlags()),
			Exemplars:      []contracts.MetricExemplar{},
		})
	}
	return out, nil
}

func normalizeSpan(otlpSpan *tracepb.Span, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string) (contracts.Span, error) {
	traceID, err := requiredHexID(otlpSpan.GetTraceId(), 16, "traceId")
	if err != nil {
		return contracts.Span{}, err
	}
	spanID, err := requiredHexID(otlpSpan.GetSpanId(), 8, "spanId")
	if err != nil {
		return contracts.Span{}, err
	}
	if otlpSpan.GetStartTimeUnixNano() == 0 {
		return contracts.Span{}, fmt.Errorf("startTimeUnixNano is required")
	}
	if otlpSpan.GetEndTimeUnixNano() == 0 {
		return contracts.Span{}, fmt.Errorf("endTimeUnixNano is required")
	}
	startedAt := unixNano(otlpSpan.GetStartTimeUnixNano())
	endedAt := unixNano(otlpSpan.GetEndTimeUnixNano())
	if endedAt.Before(startedAt) {
		return contracts.Span{}, fmt.Errorf("endTimeUnixNano must be greater than or equal to startTimeUnixNano")
	}
	attributes := mergeAttributes(resourceAttrs, scopeAttrs, attributes(otlpSpan.GetAttributes()))
	parentSpanID := optionalHexID(otlpSpan.GetParentSpanId(), 8)
	status := statusFromOTLP(otlpSpan.GetStatus().GetCode())
	kind := spanKind(otlpSpan.GetKind())
	events := make([]contracts.SpanEvent, 0, len(otlpSpan.GetEvents()))
	for _, event := range otlpSpan.GetEvents() {
		if event.GetTimeUnixNano() == 0 {
			return contracts.Span{}, fmt.Errorf("span event %q missing timeUnixNano", event.GetName())
		}
		events = append(events, contracts.SpanEvent{
			Name:       event.GetName(),
			Timestamp:  unixNano(event.GetTimeUnixNano()),
			Attributes: attributesFromKeyValues(event.GetAttributes()),
		})
	}
	links := make([]contracts.SpanLink, 0, len(otlpSpan.GetLinks()))
	for linkIndex, link := range otlpSpan.GetLinks() {
		linkTraceID, err := requiredHexID(link.GetTraceId(), 16, "link traceId")
		if err != nil {
			return contracts.Span{}, fmt.Errorf("span link %d: %w", linkIndex, err)
		}
		linkSpanID, err := requiredHexID(link.GetSpanId(), 8, "link spanId")
		if err != nil {
			return contracts.Span{}, fmt.Errorf("span link %d: %w", linkIndex, err)
		}
		links = append(links, contracts.SpanLink{
			TraceID:    linkTraceID,
			SpanID:     linkSpanID,
			TraceState: optionalString(link.GetTraceState()),
			Attributes: attributesFromKeyValues(link.GetAttributes()),
		})
	}
	return contracts.Span{
		ID:           spanID,
		TraceID:      traceID,
		ParentSpanID: parentSpanID,
		Name:         otlpSpan.GetName(),
		Kind:         kind,
		ServiceName:  service,
		StartedAt:    startedAt,
		EndedAt:      endedAt,
		DurationMs:   float64(endedAt.Sub(startedAt)) / float64(time.Millisecond),
		Status:       &status,
		Attributes:   attributes,
		Events:       events,
		Links:        links,
	}, nil
}

func deriveTraces(spans []contracts.Span) ([]contracts.Trace, error) {
	grouped := map[string][]contracts.Span{}
	order := []string{}
	for _, span := range spans {
		if _, ok := grouped[span.TraceID]; !ok {
			order = append(order, span.TraceID)
		}
		grouped[span.TraceID] = append(grouped[span.TraceID], span)
	}
	traces := make([]contracts.Trace, 0, len(order))
	for _, traceID := range order {
		traceSpans := grouped[traceID]
		if len(traceSpans) == 0 {
			continue
		}
		startedAt := traceSpans[0].StartedAt
		endedAt := traceSpans[0].EndedAt
		status := contracts.TraceStatusUnset
		service := traceSpans[0].ServiceName
		root := rootSpan(traceSpans)
		for _, span := range traceSpans {
			if span.StartedAt.Before(startedAt) {
				startedAt = span.StartedAt
			}
			if span.EndedAt.After(endedAt) {
				endedAt = span.EndedAt
			}
			if span.Status != nil && *span.Status == contracts.TraceStatusError {
				status = contracts.TraceStatusError
			} else if status != contracts.TraceStatusError && span.Status != nil && *span.Status == contracts.TraceStatusOK {
				status = contracts.TraceStatusOK
			}
		}
		if root.ServiceName != nil {
			service = root.ServiceName
		}
		duration := float64(endedAt.Sub(startedAt)) / float64(time.Millisecond)
		rootID := root.ID
		traces = append(traces, contracts.Trace{
			ID:          traceID,
			ServiceName: service,
			StartedAt:   startedAt,
			EndedAt:     &endedAt,
			DurationMs:  &duration,
			RootSpanID:  &rootID,
			Status:      &status,
			Attributes:  cloneAttributes(root.Attributes),
		})
	}
	return traces, nil
}

func rootSpan(spans []contracts.Span) contracts.Span {
	roots := []contracts.Span{}
	for _, span := range spans {
		if span.ParentSpanID == nil || *span.ParentSpanID == "" {
			roots = append(roots, span)
		}
	}
	if len(roots) == 1 {
		return roots[0]
	}
	sorted := append([]contracts.Span(nil), spans...)
	sort.SliceStable(sorted, func(left int, right int) bool {
		return sorted[left].StartedAt.Before(sorted[right].StartedAt)
	})
	return sorted[0]
}

func normalizeLog(otlpLog *logspb.LogRecord, resourceAttrs contracts.Attributes, scopeAttrs contracts.Attributes, service *string, receivedAt time.Time) (contracts.LogEvent, error) {
	attrs := mergeAttributes(resourceAttrs, scopeAttrs, attributes(otlpLog.GetAttributes()))
	traceID, err := logTraceID(otlpLog, attrs)
	if err != nil {
		return contracts.LogEvent{}, err
	}
	spanID, err := logSpanID(otlpLog, attrs)
	if err != nil {
		return contracts.LogEvent{}, err
	}
	timestamp := receivedAt.UTC()
	if otlpLog.GetObservedTimeUnixNano() != 0 {
		timestamp = unixNano(otlpLog.GetObservedTimeUnixNano())
	}
	if otlpLog.GetTimeUnixNano() != 0 {
		timestamp = unixNano(otlpLog.GetTimeUnixNano())
	}
	var observed *time.Time
	if otlpLog.GetObservedTimeUnixNano() != 0 {
		observedAt := unixNano(otlpLog.GetObservedTimeUnixNano())
		observed = &observedAt
	}
	severityText := optionalString(otlpLog.GetSeverityText())
	severityNumber := optionalInt(int(otlpLog.GetSeverityNumber()))
	body := anyValue(otlpLog.GetBody())
	correlation := logCorrelation(traceID, spanID)
	id := deterministicLogID(timestamp, traceID, spanID, severityText, body, service)
	return contracts.LogEvent{
		ID:                id,
		TraceID:           traceID,
		SpanID:            spanID,
		ServiceName:       service,
		SeverityText:      severityText,
		SeverityNumber:    severityNumber,
		Body:              body,
		Timestamp:         timestamp,
		ObservedTimestamp: observed,
		Attributes:        attrs,
		Correlation:       &correlation,
	}, nil
}

func logTraceID(record *logspb.LogRecord, attrs contracts.Attributes) (*string, error) {
	if len(record.GetTraceId()) > 0 {
		id, err := requiredHexID(record.GetTraceId(), 16, "traceId")
		if err != nil {
			return nil, err
		}
		return &id, nil
	}
	return attributeID(attrs, "trace_id", "traceId"), nil
}

func logSpanID(record *logspb.LogRecord, attrs contracts.Attributes) (*string, error) {
	if len(record.GetSpanId()) > 0 {
		id, err := requiredHexID(record.GetSpanId(), 8, "spanId")
		if err != nil {
			return nil, err
		}
		return &id, nil
	}
	return attributeID(attrs, "span_id", "spanId"), nil
}

func attributeID(attrs contracts.Attributes, keys ...string) *string {
	for _, key := range keys {
		if value, ok := attrs[key].(string); ok && value != "" {
			normalized := strings.ToLower(value)
			return &normalized
		}
	}
	return nil
}

func requiredHexID(value []byte, expectedBytes int, field string) (string, error) {
	if len(value) != expectedBytes {
		return "", fmt.Errorf("%s must be %d bytes", field, expectedBytes)
	}
	return hex.EncodeToString(value), nil
}

func optionalHexID(value []byte, expectedBytes int) *string {
	if len(value) != expectedBytes {
		return nil
	}
	encoded := hex.EncodeToString(value)
	return &encoded
}

func unixNano(value uint64) time.Time {
	return time.Unix(0, int64(value)).UTC()
}

func attributes(values []*commonpb.KeyValue) contracts.Attributes {
	return attributesFromKeyValues(values)
}

func attributesFromKeyValues(values []*commonpb.KeyValue) contracts.Attributes {
	attrs := contracts.Attributes{}
	for _, keyValue := range values {
		attrs[keyValue.GetKey()] = anyValue(keyValue.GetValue())
	}
	return attrs
}

func mergeAttributes(groups ...contracts.Attributes) contracts.Attributes {
	merged := contracts.Attributes{}
	for _, group := range groups {
		for key, value := range group {
			merged[key] = value
		}
	}
	return merged
}

func cloneAttributes(attrs contracts.Attributes) contracts.Attributes {
	clone := contracts.Attributes{}
	for key, value := range attrs {
		clone[key] = value
	}
	return clone
}

func stringAttribute(attrs contracts.Attributes, key string) *string {
	value, ok := attrs[key].(string)
	if !ok || value == "" {
		return nil
	}
	return &value
}

func anyValue(value *commonpb.AnyValue) any {
	if value == nil {
		return nil
	}
	switch typed := value.GetValue().(type) {
	case *commonpb.AnyValue_StringValue:
		return typed.StringValue
	case *commonpb.AnyValue_BoolValue:
		return typed.BoolValue
	case *commonpb.AnyValue_IntValue:
		return typed.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return typed.DoubleValue
	case *commonpb.AnyValue_BytesValue:
		return hex.EncodeToString(typed.BytesValue)
	case *commonpb.AnyValue_ArrayValue:
		items := make([]any, 0, len(typed.ArrayValue.GetValues()))
		for _, item := range typed.ArrayValue.GetValues() {
			items = append(items, anyValue(item))
		}
		return items
	case *commonpb.AnyValue_KvlistValue:
		return attributesFromKeyValues(typed.KvlistValue.GetValues())
	default:
		return nil
	}
}

func statusFromOTLP(code tracepb.Status_StatusCode) contracts.TraceStatus {
	switch code {
	case tracepb.Status_STATUS_CODE_OK:
		return contracts.TraceStatusOK
	case tracepb.Status_STATUS_CODE_ERROR:
		return contracts.TraceStatusError
	default:
		return contracts.TraceStatusUnset
	}
}

func spanKind(kind tracepb.Span_SpanKind) *string {
	value := strings.TrimPrefix(kind.String(), "SPAN_KIND_")
	value = strings.ToLower(value)
	if value == "unspecified" {
		return nil
	}
	return &value
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func optionalInt(value int) *int {
	if value == 0 {
		return nil
	}
	return &value
}

func logCorrelation(traceID *string, spanID *string) contracts.LogCorrelation {
	switch {
	case spanID != nil && *spanID != "":
		return contracts.LogCorrelationSpan
	case traceID != nil && *traceID != "":
		return contracts.LogCorrelationTrace
	default:
		return contracts.LogCorrelationNone
	}
}

func deterministicLogID(timestamp time.Time, traceID *string, spanID *string, severityText *string, body any, service *string) string {
	bodyJSON, _ := json.Marshal(body)
	hash := sha256.New()
	writeHash(hash, timestamp.Format(time.RFC3339Nano))
	writeHash(hash, pointerValue(traceID))
	writeHash(hash, pointerValue(spanID))
	writeHash(hash, pointerValue(severityText))
	writeHash(hash, string(bodyJSON))
	writeHash(hash, pointerValue(service))
	return hex.EncodeToString(hash.Sum(nil))
}

type byteWriter interface {
	Write([]byte) (int, error)
}

func writeHash(writer byteWriter, value string) {
	_, _ = writer.Write([]byte(value))
	_, _ = writer.Write([]byte{0})
}

func pointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func aggregationTemporality(value metricspb.AggregationTemporality) contracts.AggregationTemporality {
	switch value {
	case metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA:
		return contracts.AggregationTemporalityDelta
	case metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE:
		return contracts.AggregationTemporalityCumulative
	default:
		return contracts.AggregationTemporalityUnspecified
	}
}

func requiredMetricTimestamp(value uint64) (time.Time, error) {
	if value == 0 {
		return time.Time{}, fmt.Errorf("timeUnixNano is required")
	}
	return unixNano(value), nil
}

func optionalUnixNano(value uint64) *time.Time {
	if value == 0 {
		return nil
	}
	timestamp := unixNano(value)
	return &timestamp
}

func numberDataPointValue(point *metricspb.NumberDataPoint) float64 {
	switch value := point.GetValue().(type) {
	case *metricspb.NumberDataPoint_AsDouble:
		return value.AsDouble
	case *metricspb.NumberDataPoint_AsInt:
		return float64(value.AsInt)
	default:
		return 0
	}
}

func metricPointAttributes(attrs contracts.Attributes, flags uint32) contracts.Attributes {
	out := cloneAttributes(attrs)
	if flags != 0 {
		out["otel.metric.flags"] = int64(flags)
	}
	return out
}

func exemplars(values []*metricspb.Exemplar) []contracts.MetricExemplar {
	out := make([]contracts.MetricExemplar, 0, len(values))
	for _, exemplar := range values {
		timestamp := unixNano(exemplar.GetTimeUnixNano())
		out = append(out, contracts.MetricExemplar{
			Timestamp:  timestamp,
			Value:      exemplarValue(exemplar),
			TraceID:    optionalHexID(exemplar.GetTraceId(), 16),
			SpanID:     optionalHexID(exemplar.GetSpanId(), 8),
			Attributes: attributes(exemplar.GetFilteredAttributes()),
		})
	}
	return out
}

func exemplarValue(exemplar *metricspb.Exemplar) float64 {
	switch value := exemplar.GetValue().(type) {
	case *metricspb.Exemplar_AsDouble:
		return value.AsDouble
	case *metricspb.Exemplar_AsInt:
		return float64(value.AsInt)
	default:
		return 0
	}
}

func uintsToFloats(values []uint64) []float64 {
	out := make([]float64, 0, len(values))
	for _, value := range values {
		out = append(out, float64(value))
	}
	return out
}

func quantileValues(values []*metricspb.SummaryDataPoint_ValueAtQuantile) []contracts.QuantileValue {
	out := make([]contracts.QuantileValue, 0, len(values))
	for _, value := range values {
		out = append(out, contracts.QuantileValue{
			Quantile: value.GetQuantile(),
			Value:    value.GetValue(),
		})
	}
	return out
}

func metricAttributeKeys(points []contracts.MetricPoint) []string {
	keys := []string{}
	seen := map[string]struct{}{}
	for _, point := range points {
		for key := range point.Attributes {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	return keys
}

func sortedUniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func metricTimeRange(points []contracts.MetricPoint, fallback time.Time) (time.Time, time.Time) {
	if len(points) == 0 {
		return fallback.UTC(), fallback.UTC()
	}
	first := points[0].Timestamp
	last := points[0].Timestamp
	for _, point := range points {
		if point.Timestamp.Before(first) {
			first = point.Timestamp
		}
		if point.Timestamp.After(last) {
			last = point.Timestamp
		}
	}
	return first.UTC(), last.UTC()
}

func slugMetricName(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	lastDash := false
	for _, ch := range slug {
		allowed := (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-'
		if allowed {
			builder.WriteRune(ch)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	slug = strings.Trim(builder.String(), "-")
	if slug == "" {
		return "unknown"
	}
	return slug
}

func deterministicMetricPointID(metricName string, timestamp time.Time, attrs contracts.Attributes) string {
	attrJSON, _ := json.Marshal(attrs)
	hash := sha256.New()
	writeHash(hash, metricName)
	writeHash(hash, timestamp.Format(time.RFC3339Nano))
	writeHash(hash, string(attrJSON))
	return slugMetricName(metricName) + "_" + timestamp.Format("20060102150405.000000000") + "_" + hex.EncodeToString(hash.Sum(nil))[:16]
}
