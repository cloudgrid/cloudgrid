import type {
  AgentRun,
  AgentRunSearchInput,
  AgentRunSearchResult,
  AiQualityOverview,
  AiQualityOverviewInput,
  AnnotationQueueItem,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  CommitDatasetImportInput,
  CommitDatasetCandidatesInput,
  CreateDatasetInput,
  CreateExperimentInput,
  CreateScorerInput,
  Dataset,
  DatasetCandidateSearchInput,
  DatasetCandidateSearchResult,
  DatasetExportJob,
  DatasetImportJob,
  DatasetItem,
  DatasetItemRunSearchResult,
  DatasetItemSearchInput,
  DatasetItemSearchResult,
  DatasetSearchInput,
  DatasetSearchResult,
  EvalResultSearchInput,
  EvalResultSearchResult,
  Experiment,
  ExperimentRun,
  ExperimentRunEvent,
  ExperimentRunSearchResult,
  ExperimentSearchInput,
  ExperimentSearchResult,
  LiveExperimentRunInput,
  PrepareDatasetImportInput,
  PrepareDatasetCandidatesInput,
  ProjectAiSettings,
  PromotePromptVersionInput,
  PromoteSpanToDatasetItemInput,
  PromptVersion,
  ResolveAnnotationInput,
  Scorer,
  ScorerSearchInput,
  ScorerSearchResult,
  StartDatasetExportInput,
  StartExperimentRunInput,
  StartOptimizationRunInput,
  UpdateProjectAiSettingsInput,
} from "@cloudgrid/ui-contracts";
import type { NormalizedAuthContext } from "../auth";

export interface AiEvalBridge {
  agentRuns(
    input: AgentRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AgentRunSearchResult>;
  agentRun(id: string, authContext?: NormalizedAuthContext): Promise<AgentRun | null>;
  datasets(
    input: DatasetSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetSearchResult>;
  dataset(id: string, authContext?: NormalizedAuthContext): Promise<Dataset | null>;
  datasetImport(id: string, authContext?: NormalizedAuthContext): Promise<DatasetImportJob | null>;
  datasetExport(id: string, authContext?: NormalizedAuthContext): Promise<DatasetExportJob | null>;
  datasetItems(
    datasetId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemSearchResult>;
  datasetCandidates(
    input: DatasetCandidateSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult>;
  scorers(
    input: ScorerSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ScorerSearchResult>;
  experiments(
    input: ExperimentSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentSearchResult>;
  experimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun | null>;
  experimentRuns(
    experimentId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRunSearchResult>;
  datasetItemRuns(
    experimentRunId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemRunSearchResult>;
  evalResults(
    input: EvalResultSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvalResultSearchResult>;
  annotationQueue(
    input: AnnotationQueueSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueResult>;
  projectAiSettings(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings>;
  aiQualityOverview(
    input: AiQualityOverviewInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiQualityOverview>;
  createDataset(input: CreateDatasetInput, authContext?: NormalizedAuthContext): Promise<Dataset>;
  appendDatasetItems(
    input: AppendDatasetItemsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset>;
  prepareDatasetImport(
    input: PrepareDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob>;
  commitDatasetImport(
    input: CommitDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob>;
  startDatasetExport(
    input: StartDatasetExportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetExportJob>;
  prepareDatasetCandidates(
    input: PrepareDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult>;
  commitDatasetCandidates(
    input: CommitDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset>;
  promoteSpanToDatasetItem(
    input: PromoteSpanToDatasetItemInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItem>;
  createScorer(input: CreateScorerInput, authContext?: NormalizedAuthContext): Promise<Scorer>;
  createExperiment(
    input: CreateExperimentInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Experiment>;
  startExperimentRun(
    input: StartExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun>;
  cancelExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  pauseExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  resumeExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  startOptimizationRun(
    input: StartOptimizationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun>;
  promotePromptVersion(
    input: PromotePromptVersionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromptVersion>;
  resolveAnnotation(
    input: ResolveAnnotationInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueItem>;
  updateProjectAiSettings(
    input: UpdateProjectAiSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings>;
  subscribeLiveExperimentRun(
    input: LiveExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<ExperimentRunEvent>;
}
