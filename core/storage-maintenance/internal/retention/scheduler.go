package retention

import (
	"context"
	"fmt"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const defaultSchedulerOwnerID = "storage-maintenance"

type SchedulerConfig struct {
	Enabled       bool
	ProjectIDs    []string
	Interval      time.Duration
	BatchLimit    int
	LeaseDuration time.Duration
	OwnerID       string
}

type RetentionLease struct {
	Key             string
	ProjectID       string
	DataClass       contracts.RetentionDataClass
	OwnerID         string
	AcquiredAt      time.Time
	ExpiresAt       time.Time
	LastCompletedAt *time.Time
	LastErrorCode   string
	LastErrorAt     *time.Time
}

type LeaseStore interface {
	AcquireRetentionLease(ctx context.Context, lease RetentionLease) (bool, error)
	CompleteRetentionLease(ctx context.Context, lease RetentionLease, result contracts.RetentionExecuteBatchData) error
}

type Scheduler struct {
	executor *Executor
	leases   LeaseStore
	config   SchedulerConfig
	now      func() time.Time
}

func NewScheduler(executor *Executor, leases LeaseStore, config SchedulerConfig, now func() time.Time) *Scheduler {
	if now == nil {
		now = time.Now
	}
	if config.OwnerID == "" {
		config.OwnerID = defaultSchedulerOwnerID
	}
	return &Scheduler{
		executor: executor,
		leases:   leases,
		config:   config,
		now:      now,
	}
}

func (scheduler *Scheduler) Enabled() bool {
	return scheduler != nil && scheduler.config.Enabled
}

func (scheduler *Scheduler) Interval() time.Duration {
	if scheduler == nil || scheduler.config.Interval <= 0 {
		return time.Hour
	}
	return scheduler.config.Interval
}

func (scheduler *Scheduler) Tick(ctx context.Context) ([]contracts.RetentionExecuteBatchData, error) {
	if !scheduler.Enabled() {
		return nil, nil
	}
	if scheduler.executor == nil {
		return nil, fmt.Errorf("retention scheduler executor is required")
	}
	if scheduler.leases == nil {
		return nil, fmt.Errorf("retention scheduler lease store is required")
	}

	requestedAt := scheduler.now().UTC()
	results := []contracts.RetentionExecuteBatchData{}
	for _, projectID := range scheduler.config.ProjectIDs {
		projectID = strings.TrimSpace(projectID)
		if projectID == "" {
			continue
		}
		for _, dataClass := range RetentionDataClasses() {
			lease := RetentionLease{
				Key:        RetentionLeaseKey(projectID, dataClass),
				ProjectID:  projectID,
				DataClass:  dataClass,
				OwnerID:    scheduler.config.OwnerID,
				AcquiredAt: requestedAt,
				ExpiresAt:  requestedAt.Add(scheduler.config.LeaseDuration),
			}
			acquired, err := scheduler.leases.AcquireRetentionLease(ctx, lease)
			if err != nil {
				return results, err
			}
			if !acquired {
				continue
			}
			request := contracts.RetentionExecuteBatchRequest{
				BridgeEnvelope: contracts.BridgeEnvelope{
					RequestID: fmt.Sprintf("retention-%s-%s-%d", projectID, dataClass, requestedAt.Unix()),
				},
				ProjectID:   projectID,
				DataClass:   dataClass,
				RequestedAt: requestedAt,
				DryRun:      ptr(false),
				Limit:       ptr(scheduler.config.BatchLimit),
			}
			result, _ := scheduler.executor.ExecuteBatch(ctx, request)
			results = append(results, result)
			if err := scheduler.leases.CompleteRetentionLease(ctx, lease, result); err != nil {
				return results, err
			}
		}
	}
	return results, nil
}

func RetentionLeaseKey(projectID string, dataClass contracts.RetentionDataClass) string {
	return fmt.Sprintf("retention:%s:%s", strings.TrimSpace(projectID), dataClass)
}

func RetentionDataClasses() []contracts.RetentionDataClass {
	return []contracts.RetentionDataClass{
		contracts.RetentionDataClassTraces,
		contracts.RetentionDataClassLogs,
		contracts.RetentionDataClassMetrics,
		contracts.RetentionDataClassAIEvals,
		contracts.RetentionDataClassDatasets,
		contracts.RetentionDataClassScorers,
		contracts.RetentionDataClassDashboardHistory,
		contracts.RetentionDataClassIngestCredentialAudit,
	}
}
