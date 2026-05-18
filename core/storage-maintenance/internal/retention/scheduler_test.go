package retention

import (
	"context"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestRetentionSchedulerDisabledByDefaultDoesNothing(t *testing.T) {
	store := NewFixtureStore()
	scheduler := NewScheduler(NewExecutor(store, nil, fixedNow), store, SchedulerConfig{}, fixedNow)

	results, err := scheduler.Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick returned error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("results = %#v, want none when disabled", results)
	}
}

func TestRetentionSchedulerExpandsProjectsAndDataClasses(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	for _, dataClass := range RetentionDataClasses() {
		store.PutPolicy(policy("project-a", dataClass, contracts.RetentionModeRetain, 0, nil, 1))
	}
	scheduler := NewScheduler(NewExecutor(store, nil, func() time.Time { return now }), store, SchedulerConfig{
		Enabled:       true,
		ProjectIDs:    []string{"project-a"},
		BatchLimit:    50,
		LeaseDuration: 15 * time.Minute,
		OwnerID:       "worker-a",
	}, func() time.Time { return now })

	results, err := scheduler.Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick returned error: %v", err)
	}
	if len(results) != len(RetentionDataClasses()) {
		t.Fatalf("results = %d, want one per retention data class", len(results))
	}
	for _, dataClass := range RetentionDataClasses() {
		lease, ok := store.Lease(RetentionLeaseKey("project-a", dataClass))
		if !ok {
			t.Fatalf("missing lease for %s", dataClass)
		}
		if lease.OwnerID != "worker-a" || !lease.ExpiresAt.Equal(now.Add(15*time.Minute)) {
			t.Fatalf("lease = %#v, want worker-a lease with configured duration", lease)
		}
	}
}

func TestRetentionSchedulerSkipsContendedLeaseUntilExpiry(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 30, nil, 1))
	store.PutRecord(FixtureRecord{ID: "log-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -40)})
	_, err := store.AcquireRetentionLease(context.Background(), RetentionLease{
		Key:        RetentionLeaseKey("project-a", contracts.RetentionDataClassLogs),
		ProjectID:  "project-a",
		DataClass:  contracts.RetentionDataClassLogs,
		OwnerID:    "worker-a",
		AcquiredAt: now,
		ExpiresAt:  now.Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("AcquireRetentionLease returned error: %v", err)
	}
	scheduler := NewScheduler(NewExecutor(store, nil, func() time.Time { return now }), store, SchedulerConfig{
		Enabled:       true,
		ProjectIDs:    []string{"project-a"},
		BatchLimit:    50,
		LeaseDuration: 15 * time.Minute,
		OwnerID:       "worker-b",
	}, func() time.Time { return now })

	results, err := scheduler.Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick returned error: %v", err)
	}
	for _, result := range results {
		if result.DataClass == contracts.RetentionDataClassLogs {
			t.Fatalf("logs result = %#v, want contended lease skipped", result)
		}
	}
	if !store.HasRecord("log-old") {
		t.Fatal("contended lease allowed deletion")
	}
}

func TestRetentionSchedulerRetriesAfterLeaseExpiryAndRecordsErrors(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(RetentionPolicy{
		ProjectID:     "project-a",
		DataClass:     contracts.RetentionDataClassLogs,
		Mode:          contracts.RetentionModeDelete,
		RetentionDays: 0,
		Version:       1,
	})
	scheduler := NewScheduler(NewExecutor(store, nil, func() time.Time { return now }), store, SchedulerConfig{
		Enabled:       true,
		ProjectIDs:    []string{"project-a"},
		BatchLimit:    50,
		LeaseDuration: time.Minute,
		OwnerID:       "worker-a",
	}, func() time.Time { return now })

	results, err := scheduler.Tick(context.Background())
	if err != nil {
		t.Fatalf("Tick returned error: %v", err)
	}
	var firstLogResult *contracts.RetentionExecuteBatchData
	for index := range results {
		if results[index].DataClass == contracts.RetentionDataClassLogs {
			firstLogResult = &results[index]
		}
	}
	if firstLogResult == nil || firstLogResult.Error == nil {
		t.Fatalf("results = %#v, want validation error for invalid log policy", results)
	}
	lease, ok := store.Lease(RetentionLeaseKey("project-a", contracts.RetentionDataClassLogs))
	if !ok || lease.LastErrorCode != "VALIDATION_FAILED" || lease.LastErrorAt == nil {
		t.Fatalf("lease = %#v, want recorded validation error", lease)
	}

	store.PutPolicy(policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 30, nil, 2))
	store.PutRecord(FixtureRecord{ID: "log-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -40)})
	now = now.Add(2 * time.Minute)
	results, err = scheduler.Tick(context.Background())
	if err != nil {
		t.Fatalf("retry Tick returned error: %v", err)
	}
	found := false
	for _, result := range results {
		if result.DataClass == contracts.RetentionDataClassLogs {
			found = true
			if result.Error != nil || result.HardDeletedCount != 1 {
				t.Fatalf("retry result = %#v, want successful hard delete", result)
			}
		}
	}
	if !found {
		t.Fatal("retry after lease expiry skipped logs data class")
	}
}
