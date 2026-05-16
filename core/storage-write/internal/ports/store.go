package ports

import (
	"context"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type TelemetryWriteStore interface {
	CommandExists(ctx context.Context, command contracts.PersistTelemetryCommand) (bool, error)
	Persist(ctx context.Context, command contracts.PersistTelemetryCommand, subject string, completedAt time.Time) error
}

type MetricsWriteStore interface {
	MetricsCommandExists(ctx context.Context, command contracts.PersistMetricsCommand) (bool, error)
	PersistMetrics(ctx context.Context, command contracts.PersistMetricsCommand, subject string, completedAt time.Time) error
}

type TraceNotificationPublisher interface {
	PublishTracePersisted(ctx context.Context, notification contracts.TracePersistedNotification) error
}

type AIWriteStore interface {
	AIProjectionCommandExists(ctx context.Context, command contracts.PersistAiProjectionCommand) (bool, error)
	PersistAIProjection(ctx context.Context, command contracts.PersistAiProjectionCommand, subject string, completedAt time.Time) ([]string, error)
	PersistEvalMutation(ctx context.Context, subject string, request contracts.EvalMutationRequest, occurredAt time.Time) (map[string]any, error)
}

type AIEventPublisher interface {
	PublishAIProjectionPersisted(ctx context.Context, notification contracts.AiProjectionPersistedNotification) error
	PublishExperimentProgress(ctx context.Context, notification contracts.ExperimentProgressNotification) error
}
