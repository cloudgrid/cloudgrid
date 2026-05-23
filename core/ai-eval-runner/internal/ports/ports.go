package ports

import "context"

const (
	ScorerKindDeterministic = "deterministic"
	ScorerKindRAG           = "rag"
	ScorerKindLLMJudge      = "llm_judge"
	ScorerKindHuman         = "human"
)

const (
	EvalTargetKindDatasetItemRun = "datasetItemRun"
	EvalTargetKindAgentRun       = "agentRun"
	EvalTargetKindSpan           = "span"
)

const (
	ExperimentRunStatusQueued     = "queued"
	ExperimentRunStatusRunning    = "running"
	ExperimentRunStatusPausing    = "pausing"
	ExperimentRunStatusPaused     = "paused"
	ExperimentRunStatusResuming   = "resuming"
	ExperimentRunStatusCancelling = "cancelling"
	ExperimentRunStatusCancelled  = "cancelled"
	ExperimentRunStatusFailed     = "failed"
	ExperimentRunStatusFinished   = "completed"
)

const (
	ExperimentProgressStarted       = "started"
	ExperimentProgressItemCompleted = "item_completed"
	ExperimentProgressProgress      = "progress"
	ExperimentProgressCancelled     = "cancelled"
	ExperimentProgressFailed        = "failed"
	ExperimentProgressFinished      = "completed"
)

type Experiment struct {
	ID             string
	DatasetID      string
	DatasetVersion int
	ScorerIDs      []string
}

type VersionedRef struct {
	ID      string
	Version int
}

type DatasetSplitSelector struct {
	Splits           []string
	ReviewedOnly     bool
	IncludeSynthetic bool
}

type ExperimentManifest struct {
	Digest              string
	ExperimentRunID     string
	ExperimentID        string
	DatasetID           string
	DatasetVersion      int
	SplitSelector       DatasetSplitSelector
	DatasetItemIDs      []string
	ScorerRefs          []VersionedRef
	BaselineRef         map[string]any
	SolverRef           map[string]any
	PromptVersionRefs   []string
	SkillSnapshotRefs   []string
	ToolSnapshotRefs    []string
	ProviderProfileRefs []string
	Budget              map[string]any
	Concurrency         map[string]any
	RunPolicy           map[string]any
}

type ManifestResolveRequest struct {
	ExperimentRunID string
	ExperimentID    string
	SplitSelector   DatasetSplitSelector
	OptimizerKind   string
}

type ProjectAISettings struct {
	ProjectID string
	Budget    map[string]any
}

type ExperimentRun struct {
	ID           string
	ExperimentID string
	SolverRef    map[string]any
	RunPolicy    map[string]any
	Status       string
	StartedAt    string
	EndedAt      string
	Summary      map[string]any
}

type DatasetItem struct {
	ID       string
	Input    map[string]any
	Expected map[string]any
}

type Scorer struct {
	ID         string
	Kind       string
	Definition map[string]any
	Version    int
}

type DatasetItemRun struct {
	ID              string
	ExperimentRunID string
	DatasetItemID   string
	HarnessRunID    string
	Output          map[string]any
	LatencyMs       float64
}

type EvalResult struct {
	ID              string
	ScorerID        string
	ScorerVersion   int
	TargetKind      string
	TargetID        string
	ExperimentRunID string
	Score           float64
	Passed          bool
	Evidence        map[string]any
	JudgeRunRef     string
	ProducedAt      string
}

type OnlinePolicyResolveRequest struct {
	RequestID     string
	ProjectID     string
	TraceID       string
	ProjectionIDs []string
	SpanIDs       []string
	Kinds         []string
	PersistedAt   string
}

type OnlinePolicyMatches struct {
	Matches  []OnlinePolicyMatch
	Warnings []string
}

type OnlinePolicyMatch struct {
	PolicyID      string
	PolicyVersion int
	PolicyName    string
	Target        map[string]any
	SampleRate    float64
	MaxDailyRuns  int
	ScorerRefs    []OnlinePolicyScorerRef
	Projection    OnlinePolicyProjection
}

type OnlinePolicyScorerRef struct {
	ScorerID      string
	ScorerVersion int
	Kind          string
}

type OnlinePolicyProjection struct {
	ProjectID       string
	TraceID         string
	SpanID          string
	ProjectionID    string
	Kind            string
	AgentID         string
	AgentName       string
	Environment     string
	ServiceName     string
	Route           string
	ToolName        string
	RetrievalSource string
	Model           string
	PromptVersionID string
	ExperimentRunID string
	SafeAttributes  map[string]any
}

type ExperimentProgress struct {
	ExperimentRunID  string
	Type             string
	Status           string
	DatasetItemRunID string
	OccurredAt       string
	Summary          map[string]any
}

type PersistedProjectionNotification struct {
	RequestID     string
	ProjectID     string
	TraceID       string
	ProjectionIDs []string
	SpanIDs       []string
	Kinds         []string
	PersistedAt   string
}

type StorageReader interface {
	SearchExperiments(ctx context.Context, experimentID string) ([]Experiment, error)
	SearchDatasetItems(ctx context.Context, datasetID string, datasetVersion int) ([]DatasetItem, error)
	SearchScorers(ctx context.Context, scorerIDs []string) ([]Scorer, error)
	ResolveManifest(ctx context.Context, request ManifestResolveRequest) (ExperimentManifest, error)
	ResolveOnlinePolicyMatches(ctx context.Context, request OnlinePolicyResolveRequest) (OnlinePolicyMatches, error)
}

type ControlPlane interface {
	GetProjectAISettings(ctx context.Context, projectID string) (ProjectAISettings, error)
}

type StorageWriter interface {
	PersistExperimentRun(ctx context.Context, run ExperimentRun) error
	PersistDatasetItemRun(ctx context.Context, idempotencyKey string, run DatasetItemRun) error
	PersistEvalResult(ctx context.Context, idempotencyKey string, result EvalResult) error
	UpdateExperimentProgress(ctx context.Context, progress ExperimentProgress) error
}

type HarnessAdapter interface {
	StartSandbox(ctx context.Context, request SandboxLifecycleRequest) (SandboxLifecycleResult, error)
	PauseSandbox(ctx context.Context, request SandboxLifecycleRequest) (SandboxLifecycleResult, error)
	ResumeSandbox(ctx context.Context, request SandboxLifecycleRequest) (SandboxLifecycleResult, error)
	AbortSandbox(ctx context.Context, request SandboxLifecycleRequest) (SandboxLifecycleResult, error)
	CleanupSandbox(ctx context.Context, request SandboxLifecycleRequest) (SandboxLifecycleResult, error)
	Run(ctx context.Context, request HarnessRunRequest) (HarnessRunResult, error)
	Score(ctx context.Context, request HarnessScoreRequest) (HarnessScoreResult, error)
	Optimize(ctx context.Context, request HarnessOptimizeRequest) (HarnessOptimizeResult, error)
}

type ProgressPublisher interface {
	PublishExperimentProgress(ctx context.Context, progress ExperimentProgress) error
}

const (
	SandboxProfileEphemeralEvalItem              = "ephemeral_eval_item"
	SandboxProfileEphemeralOptimizationCandidate = "ephemeral_optimization_candidate"
	SandboxProfileDurableReplayWorkspace         = "durable_replay_workspace"
)

type SandboxLifecycleRequest struct {
	ExperimentRunID string
	DatasetItemID   string
	ScorerID        string
	CandidateID     string
	AttemptID       string
	ManifestDigest  string
	SandboxProfile  string
	SandboxRef      string
	CheckpointRef   string
	RunPolicy       map[string]any
	CleanupRetry    map[string]any
	TraceContext    map[string]string
}

type SandboxLifecycleResult struct {
	SandboxRef          string
	SandboxProfile      string
	CheckpointSupported bool
	CheckpointRef       string
	CleanupRequired     bool
	CleanupDeadline     string
	CleanupSummary      map[string]any
	Warnings            []string
}

type HarnessRunRequest struct {
	ExperimentRunID string
	DatasetItemID   string
	Input           map[string]any
	SolverRef       map[string]any
	ManifestDigest  string
	RunPolicy       map[string]any
	SandboxProfile  string
	SandboxRef      string
	TraceContext    map[string]string
}

type HarnessRunResult struct {
	HarnessRunID string
	Output       map[string]any
	LatencyMs    float64
}

type HarnessScoreRequest struct {
	ScorerID       string
	ScorerVersion  int
	TargetKind     string
	TargetID       string
	Input          map[string]any
	Output         map[string]any
	Expected       map[string]any
	ManifestDigest string
	RunPolicy      map[string]any
	SandboxProfile string
	SandboxRef     string
	TraceContext   map[string]string
}

type HarnessScoreResult struct {
	Score       float64
	Passed      bool
	Evidence    map[string]any
	JudgeRunRef string
}

type HarnessOptimizeRequest struct {
	ExperimentRunID     string
	ExperimentID        string
	BasePromptVersionID string
	OptimizerKind       string
	Config              map[string]any
	ManifestDigest      string
	RunPolicy           map[string]any
	SandboxProfile      string
	SandboxRef          string
	TraceContext        map[string]string
}

type HarnessOptimizeResult struct {
	CandidatePromptIDs []string
	Summary            map[string]any
}
