package selfobs

import "testing"

func TestParseTraceContextAcceptsValidW3CHeaders(t *testing.T) {
	context, ok := ParseTraceContext(
		"00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"rojo=00f067aa0ba902b7,congo=t61rcWkgMzE",
	)
	if !ok {
		t.Fatal("ParseTraceContext() ok = false, want true")
	}
	if context.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("TraceID = %q", context.TraceID)
	}
	if context.SpanID != "00f067aa0ba902b7" {
		t.Fatalf("SpanID = %q", context.SpanID)
	}
	if context.TraceState != "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE" {
		t.Fatalf("TraceState = %q", context.TraceState)
	}
	if got := FormatTraceParent(context); got != "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" {
		t.Fatalf("FormatTraceParent() = %q", got)
	}
}

func TestParseTraceContextRejectsMalformedAndAllZeroValues(t *testing.T) {
	for _, traceparent := range []string{
		"",
		"00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7",
		"00-00000000000000000000000000000000-00f067aa0ba902b7-01",
		"00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
		"00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
		"ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
	} {
		t.Run(traceparent, func(t *testing.T) {
			if _, ok := ParseTraceContext(traceparent, ""); ok {
				t.Fatalf("ParseTraceContext(%q) ok = true, want false", traceparent)
			}
		})
	}
	if context, ok := ParseTraceContext("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", stringsOfLength(513)); !ok || context.TraceState != "" {
		t.Fatalf("oversized tracestate context = %#v ok = %v, want accepted with empty tracestate", context, ok)
	}
}

func TestChildTraceContextPreservesTraceAndParent(t *testing.T) {
	parent, ok := ParseTraceContext("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", "rojo=1")
	if !ok {
		t.Fatal("valid parent was rejected")
	}
	child := NewChildTraceContext(parent)
	if child.TraceID != parent.TraceID {
		t.Fatalf("child TraceID = %q, want %q", child.TraceID, parent.TraceID)
	}
	if child.ParentSpanID != parent.SpanID {
		t.Fatalf("child ParentSpanID = %q, want %q", child.ParentSpanID, parent.SpanID)
	}
	if child.SpanID == "" || child.SpanID == parent.SpanID {
		t.Fatalf("child SpanID = %q, want new non-empty span", child.SpanID)
	}
	if child.TraceState != "rojo=1" {
		t.Fatalf("child TraceState = %q", child.TraceState)
	}
}

func stringsOfLength(length int) string {
	value := make([]byte, length)
	for i := range value {
		value[i] = 'a'
	}
	return string(value)
}
