package retention

import (
	"context"
	"sort"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type FixtureRecord struct {
	ID                         string
	ProjectID                  string
	DataClass                  contracts.RetentionDataClass
	EventTime                  time.Time
	PersistedAt                time.Time
	DeletedAt                  *time.Time
	DeletedByRetentionPolicyID string
	FinalDeleteAfter           *time.Time
}

type FixtureStore struct {
	mu       sync.Mutex
	policies map[policyKey]RetentionPolicy
	records  map[string]FixtureRecord
	audits   []RetentionAuditRecord
}

type policyKey struct {
	projectID string
	dataClass contracts.RetentionDataClass
}

func NewFixtureStore() *FixtureStore {
	return &FixtureStore{
		policies: map[policyKey]RetentionPolicy{},
		records:  map[string]FixtureRecord{},
		audits:   []RetentionAuditRecord{},
	}
}

func (store *FixtureStore) PutPolicy(policy RetentionPolicy) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.policies[policyKey{projectID: policy.ProjectID, dataClass: policy.DataClass}] = policy
}

func (store *FixtureStore) PutRecord(record FixtureRecord) {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.records[record.ID] = record
}

func (store *FixtureStore) GetRetentionPolicy(ctx context.Context, projectID string, dataClass contracts.RetentionDataClass) (RetentionPolicy, bool, error) {
	_ = ctx
	store.mu.Lock()
	defer store.mu.Unlock()
	policy, ok := store.policies[policyKey{projectID: projectID, dataClass: dataClass}]
	return policy, ok, nil
}

func (store *FixtureStore) ExecuteRetention(ctx context.Context, plan RetentionExecutionPlan) (RetentionExecutionResult, error) {
	_ = ctx
	store.mu.Lock()
	defer store.mu.Unlock()

	ids := make([]string, 0, len(store.records))
	for id := range store.records {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	result := RetentionExecutionResult{}
	remaining := maxBatchSize(plan.Limit)

	if plan.Mode == contracts.RetentionModeSoftDeleteThenDelete {
		for _, id := range ids {
			if remaining == 0 {
				return result, nil
			}
			record := store.records[id]
			if !recordMatchesPlan(record, plan) || !finalDeleteDue(record, plan.RequestedAt) {
				continue
			}
			result.MatchedCount++
			if !plan.DryRun {
				delete(store.records, id)
				result.FinalDeletedCount++
			}
			remaining--
		}
	}

	for _, id := range ids {
		if remaining == 0 {
			return result, nil
		}
		record, ok := store.records[id]
		if !ok || !recordMatchesPlan(record, plan) || !recordEligible(record, plan.Cutoff) {
			continue
		}
		if record.DeletedAt != nil {
			continue
		}
		result.MatchedCount++
		if !plan.DryRun {
			switch plan.Mode {
			case contracts.RetentionModeDelete:
				delete(store.records, id)
				result.HardDeletedCount++
			case contracts.RetentionModeSoftDeleteThenDelete:
				deletedAt := plan.RequestedAt
				finalDeleteAfter := plan.RequestedAt.AddDate(0, 0, plan.SoftDeleteDays)
				record.DeletedAt = &deletedAt
				record.FinalDeleteAfter = &finalDeleteAfter
				record.DeletedByRetentionPolicyID = plan.PolicyID
				store.records[id] = record
				result.SoftDeletedCount++
			}
		}
		remaining--
	}

	return result, nil
}

func (store *FixtureStore) HasRecord(id string) bool {
	store.mu.Lock()
	defer store.mu.Unlock()
	_, ok := store.records[id]
	return ok
}

func (store *FixtureStore) Record(id string) (FixtureRecord, bool) {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.records[id]
	return record, ok
}

func (store *FixtureStore) VisibleRecord(id string) (FixtureRecord, bool) {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.records[id]
	if !ok || record.DeletedAt != nil {
		return FixtureRecord{}, false
	}
	return record, true
}

func (store *FixtureStore) CountRecords(projectID string, dataClass contracts.RetentionDataClass) int {
	store.mu.Lock()
	defer store.mu.Unlock()
	count := 0
	for _, record := range store.records {
		if record.ProjectID == projectID && record.DataClass == dataClass {
			count++
		}
	}
	return count
}

func (store *FixtureStore) RecordRetentionAudit(ctx context.Context, audit RetentionAuditRecord) error {
	_ = ctx
	store.mu.Lock()
	defer store.mu.Unlock()
	store.audits = append(store.audits, audit)
	return nil
}

func (store *FixtureStore) Audits() []RetentionAuditRecord {
	store.mu.Lock()
	defer store.mu.Unlock()
	return append([]RetentionAuditRecord(nil), store.audits...)
}

func recordMatchesPlan(record FixtureRecord, plan RetentionExecutionPlan) bool {
	return record.ProjectID == plan.ProjectID && record.DataClass == plan.DataClass
}

func recordEligible(record FixtureRecord, cutoff time.Time) bool {
	eventTime := record.EventTime
	if eventTime.IsZero() {
		eventTime = record.PersistedAt
	}
	return !eventTime.IsZero() && eventTime.Before(cutoff)
}

func finalDeleteDue(record FixtureRecord, requestedAt time.Time) bool {
	return record.DeletedAt != nil && record.FinalDeleteAfter != nil && !record.FinalDeleteAfter.After(requestedAt)
}

func maxBatchSize(limit *int) int {
	if limit == nil {
		return int(^uint(0) >> 1)
	}
	return *limit
}
