package retention

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestExecuteBatchDryRunDoesNotDelete(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassTraces, contracts.RetentionModeDelete, 30, nil, 3))
	store.PutRecord(FixtureRecord{ID: "trace-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassTraces, EventTime: now.AddDate(0, 0, -31)})
	store.PutRecord(FixtureRecord{ID: "trace-new", ProjectID: "project-a", DataClass: contracts.RetentionDataClassTraces, EventTime: now.AddDate(0, 0, -10)})
	dryRun := true

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassTraces, now, &dryRun, nil))

	if result.Error != nil {
		t.Fatalf("result error = %#v, want nil", result.Error)
	}
	if result.MatchedCount != 1 || result.HardDeletedCount != 0 || result.SoftDeletedCount != 0 || result.FinalDeletedCount != 0 {
		t.Fatalf("counts = %#v, want one dry-run match and no deletes", result)
	}
	if !store.HasRecord("trace-old") {
		t.Fatal("dry run deleted eligible record")
	}
}

func TestExecuteBatchHardDeleteRemovesOnlyProjectScopedEligibleRecords(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 30, nil, 4))
	store.PutRecord(FixtureRecord{ID: "log-a-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -45)})
	store.PutRecord(FixtureRecord{ID: "log-a-new", ProjectID: "project-a", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -5)})
	store.PutRecord(FixtureRecord{ID: "log-b-old", ProjectID: "project-b", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -45)})

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassLogs, now, nil, nil))

	if result.MatchedCount != 1 || result.HardDeletedCount != 1 {
		t.Fatalf("counts = %#v, want one hard delete", result)
	}
	if store.HasRecord("log-a-old") {
		t.Fatal("eligible project-a record was not deleted")
	}
	if !store.HasRecord("log-a-new") || !store.HasRecord("log-b-old") {
		t.Fatal("hard delete removed non-eligible or cross-project record")
	}
}

func TestExecuteBatchSoftDeleteMarksEligibleRecords(t *testing.T) {
	now := fixedNow()
	softDays := 7
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassAIEvals, contracts.RetentionModeSoftDeleteThenDelete, 30, &softDays, 5))
	store.PutRecord(FixtureRecord{ID: "eval-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassAIEvals, EventTime: now.AddDate(0, 0, -60)})

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassAIEvals, now, nil, nil))

	record, ok := store.Record("eval-old")
	if !ok {
		t.Fatal("soft-deleted record was removed before final delete")
	}
	if result.MatchedCount != 1 || result.SoftDeletedCount != 1 || result.HardDeletedCount != 0 || result.FinalDeletedCount != 0 {
		t.Fatalf("counts = %#v, want one soft delete", result)
	}
	if record.DeletedAt == nil || !record.DeletedAt.Equal(now) {
		t.Fatalf("deletedAt = %v, want %v", record.DeletedAt, now)
	}
	if record.FinalDeleteAfter == nil || !record.FinalDeleteAfter.Equal(now.AddDate(0, 0, softDays)) {
		t.Fatalf("finalDeleteAfter = %v, want %v", record.FinalDeleteAfter, now.AddDate(0, 0, softDays))
	}
	if record.DeletedByRetentionPolicyID != "project-a:AI_EVALS:v5" {
		t.Fatalf("deletedByRetentionPolicyID = %q", record.DeletedByRetentionPolicyID)
	}
	if _, visible := store.VisibleRecord("eval-old"); visible {
		t.Fatal("soft-deleted record is visible to normal fixture reads")
	}
}

func TestExecuteBatchFinalDeleteRemovesDueSoftDeletedRecords(t *testing.T) {
	now := fixedNow()
	softDays := 7
	due := now.AddDate(0, 0, -1)
	future := now.AddDate(0, 0, 1)
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassDatasets, contracts.RetentionModeSoftDeleteThenDelete, 30, &softDays, 6))
	store.PutRecord(FixtureRecord{ID: "dataset-due", ProjectID: "project-a", DataClass: contracts.RetentionDataClassDatasets, EventTime: now.AddDate(0, 0, -60), DeletedAt: ptrTime(now.AddDate(0, 0, -10)), FinalDeleteAfter: &due})
	store.PutRecord(FixtureRecord{ID: "dataset-future", ProjectID: "project-a", DataClass: contracts.RetentionDataClassDatasets, EventTime: now.AddDate(0, 0, -60), DeletedAt: ptrTime(now.AddDate(0, 0, -1)), FinalDeleteAfter: &future})

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassDatasets, now, nil, nil))

	if result.MatchedCount != 1 || result.FinalDeletedCount != 1 || result.SoftDeletedCount != 0 {
		t.Fatalf("counts = %#v, want only due final delete", result)
	}
	if store.HasRecord("dataset-due") {
		t.Fatal("due soft-deleted record was not finally deleted")
	}
	if !store.HasRecord("dataset-future") {
		t.Fatal("future soft-deleted record was deleted early")
	}
}

func TestExecuteBatchLimitBoundsMutations(t *testing.T) {
	now := fixedNow()
	limit := 2
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassMetrics, contracts.RetentionModeDelete, 30, nil, 7))
	for _, id := range []string{"metric-1", "metric-2", "metric-3"} {
		store.PutRecord(FixtureRecord{ID: id, ProjectID: "project-a", DataClass: contracts.RetentionDataClassMetrics, EventTime: now.AddDate(0, 0, -40)})
	}

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassMetrics, now, nil, &limit))

	if result.MatchedCount != 2 || result.HardDeletedCount != 2 {
		t.Fatalf("counts = %#v, want limit of two", result)
	}
	if store.CountRecords("project-a", contracts.RetentionDataClassMetrics) != 1 {
		t.Fatalf("remaining metrics = %d, want 1", store.CountRecords("project-a", contracts.RetentionDataClassMetrics))
	}
}

func TestExecuteBatchRetainPolicyDoesNotDelete(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassScorers, contracts.RetentionModeRetain, 0, nil, 8))
	store.PutRecord(FixtureRecord{ID: "scorer-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassScorers, EventTime: now.AddDate(0, 0, -400)})

	result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassScorers, now, nil, nil))

	if result.Error != nil {
		t.Fatalf("result error = %#v, want nil", result.Error)
	}
	if result.MatchedCount != 0 || result.HardDeletedCount != 0 || result.SoftDeletedCount != 0 || result.FinalDeletedCount != 0 {
		t.Fatalf("counts = %#v, want retain no-op", result)
	}
	if !store.HasRecord("scorer-old") {
		t.Fatal("retain policy deleted record")
	}
}

func TestExecuteBatchFixturesCoverEveryRetentionDataClass(t *testing.T) {
	now := fixedNow()
	for _, dataClass := range []contracts.RetentionDataClass{
		contracts.RetentionDataClassTraces,
		contracts.RetentionDataClassLogs,
		contracts.RetentionDataClassMetrics,
		contracts.RetentionDataClassAIEvals,
		contracts.RetentionDataClassDatasets,
		contracts.RetentionDataClassScorers,
		contracts.RetentionDataClassDashboardHistory,
		contracts.RetentionDataClassIngestCredentialAudit,
	} {
		t.Run(string(dataClass), func(t *testing.T) {
			store := NewFixtureStore()
			store.PutPolicy(policy("project-a", dataClass, contracts.RetentionModeDelete, 30, nil, 9))
			store.PutRecord(FixtureRecord{ID: "record-" + string(dataClass), ProjectID: "project-a", DataClass: dataClass, EventTime: now.AddDate(0, 0, -40)})

			result := executeForTest(t, store, request("project-a", dataClass, now, nil, nil))

			if result.Error != nil {
				t.Fatalf("result error = %#v, want nil", result.Error)
			}
			if result.MatchedCount != 1 || result.HardDeletedCount != 1 {
				t.Fatalf("counts = %#v, want one hard delete", result)
			}
		})
	}
}

func TestExecuteBatchReportsUnknownAndMissingPolicy(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()

	unknown := executeForTest(t, store, request("project-a", contracts.RetentionDataClass("NOPE"), now, nil, nil))
	if unknown.Error == nil || unknown.Error.ID != "ERR-001" {
		t.Fatalf("unknown data class error = %#v, want ERR-001", unknown.Error)
	}

	missing := executeForTest(t, store, request("project-a", contracts.RetentionDataClassScorers, now, nil, nil))
	if missing.Error == nil || missing.Error.ID != "ERR-016" {
		t.Fatalf("missing policy error = %#v, want ERR-016", missing.Error)
	}
}

func TestExecuteBatchValidatesPolicyRangesAndModeFields(t *testing.T) {
	now := fixedNow()
	softDaysTooHigh := 91
	tests := []struct {
		name   string
		policy RetentionPolicy
	}{
		{
			name:   "delete retention below range",
			policy: policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 0, nil, 1),
		},
		{
			name:   "delete retention above range",
			policy: policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 366, nil, 1),
		},
		{
			name:   "soft delete missing soft days",
			policy: policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeSoftDeleteThenDelete, 30, nil, 1),
		},
		{
			name:   "soft delete soft days above range",
			policy: policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeSoftDeleteThenDelete, 30, &softDaysTooHigh, 1),
		},
		{
			name:   "policy version below range",
			policy: policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 30, nil, 0),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := NewFixtureStore()
			store.PutPolicy(tt.policy)

			result := executeForTest(t, store, request("project-a", contracts.RetentionDataClassLogs, now, nil, nil))

			if result.Error == nil || result.Error.ID != "ERR-001" {
				t.Fatalf("result error = %#v, want ERR-001", result.Error)
			}
		})
	}
}

func TestExecuteBatchRecordsStructuredMaintenanceLog(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassDashboardHistory, contracts.RetentionModeDelete, 30, nil, 8))
	store.PutRecord(FixtureRecord{ID: "dashboard-history-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassDashboardHistory, EventTime: now.AddDate(0, 0, -40)})
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, &slog.HandlerOptions{}))

	executor := NewExecutor(store, logger, func() time.Time { return now })
	result := executeWithExecutorForTest(t, executor, request("project-a", contracts.RetentionDataClassDashboardHistory, now, nil, nil))

	if result.Error != nil {
		t.Fatalf("result error = %#v, want nil", result.Error)
	}
	line := logs.String()
	for _, want := range []string{`"service":"storage-maintenance"`, `"event":"retention.execute_batch"`, `"project_id":"project-a"`, `"data_class":"DASHBOARD_HISTORY"`, `"hard_deleted_count":1`, `"terminal_error":false`} {
		if !strings.Contains(line, want) {
			t.Fatalf("log %s does not contain %s", line, want)
		}
	}
}

func executeForTest(t *testing.T, store *FixtureStore, req contracts.RetentionExecuteBatchRequest) contracts.RetentionExecuteBatchData {
	t.Helper()
	executor := NewExecutor(store, slog.New(slog.NewTextHandler(bytes.NewBuffer(nil), nil)), func() time.Time { return req.RequestedAt })
	return executeWithExecutorForTest(t, executor, req)
}

func executeWithExecutorForTest(t *testing.T, executor *Executor, req contracts.RetentionExecuteBatchRequest) contracts.RetentionExecuteBatchData {
	t.Helper()
	result, err := executor.ExecuteBatch(context.Background(), req)
	if err != nil {
		t.Fatalf("ExecuteBatch returned unexpected Go error: %v", err)
	}
	return result
}

func request(projectID string, dataClass contracts.RetentionDataClass, requestedAt time.Time, dryRun *bool, limit *int) contracts.RetentionExecuteBatchRequest {
	return contracts.RetentionExecuteBatchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-retention"},
		ProjectID:      projectID,
		DataClass:      dataClass,
		RequestedAt:    requestedAt,
		DryRun:         dryRun,
		Limit:          limit,
	}
}

func policy(projectID string, dataClass contracts.RetentionDataClass, mode contracts.RetentionMode, retentionDays int, softDeleteDays *int, version int) RetentionPolicy {
	return RetentionPolicy{
		ProjectID:       projectID,
		DataClass:       dataClass,
		Mode:            mode,
		RetentionDays:   retentionDays,
		SoftDeleteDays:  softDeleteDays,
		Version:         version,
		PolicyID:        fmt.Sprintf("%s:%s:v%d", projectID, dataClass, version),
		UpdatedAt:       fixedNow(),
		UpdatedByUserID: "user-admin",
	}
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 18, 10, 30, 0, 0, time.UTC)
}

func ptrTime(value time.Time) *time.Time {
	return &value
}
