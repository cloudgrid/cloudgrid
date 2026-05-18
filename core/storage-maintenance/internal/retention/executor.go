package retention

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type Store interface {
	GetRetentionPolicy(ctx context.Context, projectID string, dataClass contracts.RetentionDataClass) (RetentionPolicy, bool, error)
	ExecuteRetention(ctx context.Context, plan RetentionExecutionPlan) (RetentionExecutionResult, error)
}

type RetentionPolicy struct {
	ProjectID       string
	DataClass       contracts.RetentionDataClass
	Mode            contracts.RetentionMode
	RetentionDays   int
	SoftDeleteDays  *int
	Version         int
	PolicyID        string
	UpdatedAt       time.Time
	UpdatedByUserID string
}

type RetentionExecutionPlan struct {
	ProjectID      string
	DataClass      contracts.RetentionDataClass
	Mode           contracts.RetentionMode
	PolicyID       string
	RequestedAt    time.Time
	Cutoff         time.Time
	SoftDeleteDays int
	DryRun         bool
	Limit          *int
}

type RetentionExecutionResult struct {
	MatchedCount      int
	HardDeletedCount  int
	SoftDeletedCount  int
	FinalDeletedCount int
}

type Executor struct {
	store  Store
	logger *slog.Logger
	now    func() time.Time
}

func NewExecutor(store Store, logger *slog.Logger, now func() time.Time) *Executor {
	if now == nil {
		now = time.Now
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Executor{store: store, logger: logger, now: now}
}

func (executor *Executor) ExecuteBatch(ctx context.Context, request contracts.RetentionExecuteBatchRequest) (contracts.RetentionExecuteBatchData, error) {
	startedAt := executor.now().UTC()
	dryRun := request.DryRun != nil && *request.DryRun
	result := contracts.RetentionExecuteBatchData{
		ProjectID:     strings.TrimSpace(request.ProjectID),
		DataClass:     request.DataClass,
		DryRun:        dryRun,
		StartedAt:     startedAt,
		CompletedAt:   startedAt,
		PolicyVersion: 0,
	}

	if err := validateRequest(request); err != nil {
		result.Error = bridgeError("ERR-001", "VALIDATION_FAILED", err.Error(), false)
		executor.logResult(result, startedAt)
		return result, nil
	}

	policy, ok, err := executor.store.GetRetentionPolicy(ctx, request.ProjectID, request.DataClass)
	if err != nil {
		result.Error = bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
		executor.logResult(result, startedAt)
		return result, nil
	}
	if !ok {
		result.Error = bridgeError("ERR-016", "FORBIDDEN", "Retention policy is missing for project data class", false)
		executor.logResult(result, startedAt)
		return result, nil
	}

	result.PolicyVersion = policy.Version
	if err := validatePolicy(policy, request.ProjectID, request.DataClass); err != nil {
		result.Error = bridgeError("ERR-001", "VALIDATION_FAILED", err.Error(), false)
		executor.logResult(result, startedAt)
		return result, nil
	}
	if policy.Mode == contracts.RetentionModeRetain {
		result.CompletedAt = executor.now().UTC()
		executor.logResult(result, startedAt)
		return result, nil
	}

	plan := RetentionExecutionPlan{
		ProjectID:      request.ProjectID,
		DataClass:      request.DataClass,
		Mode:           policy.Mode,
		PolicyID:       policy.PolicyID,
		RequestedAt:    request.RequestedAt.UTC(),
		Cutoff:         request.RequestedAt.UTC().AddDate(0, 0, -policy.RetentionDays),
		DryRun:         dryRun,
		Limit:          request.Limit,
		SoftDeleteDays: 0,
	}
	if plan.PolicyID == "" {
		plan.PolicyID = fmt.Sprintf("%s:%s:v%d", policy.ProjectID, policy.DataClass, policy.Version)
	}
	if policy.SoftDeleteDays != nil {
		plan.SoftDeleteDays = *policy.SoftDeleteDays
	}

	counts, err := executor.store.ExecuteRetention(ctx, plan)
	if err != nil {
		result.Error = bridgeError("ERR-006", "STORAGE_UNAVAILABLE", "Storage is unavailable", true)
		executor.logResult(result, startedAt)
		return result, nil
	}
	result.MatchedCount = counts.MatchedCount
	result.HardDeletedCount = counts.HardDeletedCount
	result.SoftDeletedCount = counts.SoftDeletedCount
	result.FinalDeletedCount = counts.FinalDeletedCount
	result.CompletedAt = executor.now().UTC()
	executor.logResult(result, startedAt)
	return result, nil
}

func validateRequest(request contracts.RetentionExecuteBatchRequest) error {
	if strings.TrimSpace(request.ProjectID) == "" {
		return fmt.Errorf("projectId is required")
	}
	if !validDataClass(request.DataClass) {
		return fmt.Errorf("unknown dataClass %q", request.DataClass)
	}
	if request.RequestedAt.IsZero() {
		return fmt.Errorf("requestedAt is required")
	}
	if request.Limit != nil && *request.Limit < 1 {
		return fmt.Errorf("limit must be at least 1")
	}
	return nil
}

func validatePolicy(policy RetentionPolicy, projectID string, dataClass contracts.RetentionDataClass) error {
	if policy.ProjectID != projectID || policy.DataClass != dataClass {
		return fmt.Errorf("retention policy does not match requested project and data class")
	}
	if policy.Version < 1 {
		return fmt.Errorf("retention policy version must be at least 1")
	}
	switch policy.Mode {
	case contracts.RetentionModeRetain:
		return nil
	case contracts.RetentionModeDelete:
		if policy.RetentionDays < 1 || policy.RetentionDays > 365 {
			return fmt.Errorf("retentionDays must be between 1 and 365")
		}
		return nil
	case contracts.RetentionModeSoftDeleteThenDelete:
		if policy.RetentionDays < 1 || policy.RetentionDays > 365 {
			return fmt.Errorf("retentionDays must be between 1 and 365")
		}
		if policy.SoftDeleteDays == nil || *policy.SoftDeleteDays < 1 || *policy.SoftDeleteDays > 90 {
			return fmt.Errorf("softDeleteDays must be between 1 and 90 for soft_delete_then_delete")
		}
		return nil
	default:
		return fmt.Errorf("unknown retention mode %q", policy.Mode)
	}
}

func validDataClass(dataClass contracts.RetentionDataClass) bool {
	switch dataClass {
	case contracts.RetentionDataClassTraces,
		contracts.RetentionDataClassLogs,
		contracts.RetentionDataClassMetrics,
		contracts.RetentionDataClassAIEvals,
		contracts.RetentionDataClassDatasets,
		contracts.RetentionDataClassScorers,
		contracts.RetentionDataClassDashboardHistory,
		contracts.RetentionDataClassIngestCredentialAudit:
		return true
	default:
		return false
	}
}

func (executor *Executor) logResult(result contracts.RetentionExecuteBatchData, startedAt time.Time) {
	duration := result.CompletedAt.Sub(startedAt)
	if result.CompletedAt.IsZero() {
		duration = 0
	}
	attrs := []any{
		"service", "storage-maintenance",
		"event", "retention.execute_batch",
		"project", result.ProjectID,
		"project_id", result.ProjectID,
		"data_class", string(result.DataClass),
		"policy_version", result.PolicyVersion,
		"dry_run", result.DryRun,
		"matched_count", result.MatchedCount,
		"hard_deleted_count", result.HardDeletedCount,
		"soft_deleted_count", result.SoftDeletedCount,
		"final_deleted_count", result.FinalDeletedCount,
		"duration_ms", duration.Milliseconds(),
		"terminal_error", result.Error != nil,
	}
	if result.Error != nil {
		attrs = append(attrs, "error_id", result.Error.ID, "error_code", result.Error.Code)
	}
	executor.logger.Info("retention batch execution completed", attrs...)
}

func bridgeError(id string, code string, message string, retryable bool) *contracts.BridgeError {
	return &contracts.BridgeError{
		ID:        id,
		Code:      code,
		Message:   message,
		Retryable: retryable,
	}
}
