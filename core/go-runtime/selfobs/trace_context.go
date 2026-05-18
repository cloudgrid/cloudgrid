package selfobs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strings"
)

const (
	TraceParentHeader = "traceparent"
	TraceStateHeader  = "tracestate"
)

type TraceContext struct {
	TraceID      string
	SpanID       string
	ParentSpanID string
	TraceState   string
}

type traceContextKey struct{}

func ParseTraceContext(traceparent string, tracestate string) (TraceContext, bool) {
	traceparent = strings.TrimSpace(traceparent)
	parts := strings.Split(traceparent, "-")
	if len(parts) != 4 || parts[0] != "00" {
		return TraceContext{}, false
	}
	traceID := parts[1]
	spanID := parts[2]
	flags := parts[3]
	if !isLowerHex(traceID, 32) || !isLowerHex(spanID, 16) || !isLowerHex(flags, 2) ||
		isAllZero(traceID) || isAllZero(spanID) {
		return TraceContext{}, false
	}
	return TraceContext{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceState: validTraceState(tracestate),
	}, true
}

func NewRootTraceContext() TraceContext {
	return TraceContext{TraceID: randomNonZeroHex(16), SpanID: randomNonZeroHex(8)}
}

func NewChildTraceContext(parent TraceContext) TraceContext {
	if parent.TraceID == "" {
		return NewRootTraceContext()
	}
	return TraceContext{
		TraceID:      parent.TraceID,
		SpanID:       randomNonZeroHex(8),
		ParentSpanID: parent.SpanID,
		TraceState:   validTraceState(parent.TraceState),
	}
}

func FormatTraceParent(context TraceContext) string {
	if !isLowerHex(context.TraceID, 32) || !isLowerHex(context.SpanID, 16) ||
		isAllZero(context.TraceID) || isAllZero(context.SpanID) {
		return ""
	}
	return "00-" + context.TraceID + "-" + context.SpanID + "-01"
}

func ContextWithTraceContext(ctx context.Context, traceContext TraceContext) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if FormatTraceParent(traceContext) == "" {
		return ctx
	}
	return context.WithValue(ctx, traceContextKey{}, traceContext)
}

func TraceContextFromContext(ctx context.Context) (TraceContext, bool) {
	if ctx == nil {
		return TraceContext{}, false
	}
	traceContext, ok := ctx.Value(traceContextKey{}).(TraceContext)
	if !ok || FormatTraceParent(traceContext) == "" {
		return TraceContext{}, false
	}
	return traceContext, true
}

func TraceContextFromHeaders(headers interface{ Header(string) string }) (TraceContext, bool) {
	if headers == nil {
		return TraceContext{}, false
	}
	return ParseTraceContext(headers.Header(TraceParentHeader), headers.Header(TraceStateHeader))
}

func isLowerHex(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}

func isAllZero(value string) bool {
	for _, char := range value {
		if char != '0' {
			return false
		}
	}
	return value != ""
}

func validTraceState(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 512 {
		return ""
	}
	for _, char := range value {
		if char < 0x20 || char > 0x7e {
			return ""
		}
	}
	return value
}

func randomNonZeroHex(size int) string {
	for {
		bytes := make([]byte, size)
		if _, err := rand.Read(bytes); err != nil {
			return strings.Repeat("1", size*2)
		}
		value := hex.EncodeToString(bytes)
		if !isAllZero(value) {
			return value
		}
	}
}
