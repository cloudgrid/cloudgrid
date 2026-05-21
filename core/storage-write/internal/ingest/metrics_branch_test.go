package ingest

import (
	"context"
	"testing"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

type captureSelfObsMetrics struct {
	events []selfobs.MetricEvent
}

func (recorder *captureSelfObsMetrics) RecordMetric(event selfobs.MetricEvent) {
	recorder.events = append(recorder.events, event)
}

func (*captureSelfObsMetrics) Flush(context.Context) error {
	return nil
}

func (*captureSelfObsMetrics) Shutdown(context.Context) error {
	return nil
}

func TestMetricsRecorderBranches(t *testing.T) {
	OTLPMetricsRecorder{}.Increment("ignored", 1, nil)
	OTLPMetricsRecorder{}.Observe("ignored", 1, nil)

	capture := &captureSelfObsMetrics{}
	recorder := NewOTLPMetricsRecorder(capture)
	recorder.Increment("cloudgrid.storage.write.records", 3, map[string]string{"signal": "trace"})
	recorder.Observe("cloudgrid.storage.write.duration", 0.5, map[string]string{"signal": "trace"})
	if len(capture.events) != 2 {
		t.Fatalf("recorded events = %d, want 2", len(capture.events))
	}
	if capture.events[0].Kind != selfobs.MetricKindCounter || capture.events[1].Kind != selfobs.MetricKindHistogram {
		t.Fatalf("metric kinds = %s/%s", capture.events[0].Kind, capture.events[1].Kind)
	}

	memory := NewInMemoryMetricsRecorder()
	labels := map[string]string{"signal": "metric"}
	memory.Increment("records", 1, labels)
	memory.Observe("duration", 0.25, labels)
	labels["signal"] = "mutated"
	snapshot := memory.Snapshot()
	if len(snapshot) != 2 || snapshot[0].Labels["signal"] != "metric" {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	snapshot[0].Labels["signal"] = "changed"
	if again := memory.Snapshot(); again[0].Labels["signal"] != "metric" {
		t.Fatalf("snapshot mutated recorder state: %#v", again)
	}
	metricsRecorderOrNoop(nil).Increment("noop", 1, nil)
	metricsRecorderOrNoop(nil).Observe("noop", 1, nil)
	if metricsRecorderOrNoop(memory) != memory {
		t.Fatal("metricsRecorderOrNoop did not preserve recorder")
	}
}
