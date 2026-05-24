export const traceSearchOperation = `
  query TraceSearch($input: TraceSearchInput) {
    traces(input: $input) {
      items {
        id
        serviceName
        startedAt
        startedAtUnixNano
        endedAt
        endedAtUnixNano
        durationNano
        durationMs
        rootSpanId
        status
        attributes
        spanCount
        errorSpanCount
        logCount
        serviceCount
      }
      nextCursor
    }
  }
`;

export const traceDetailOperation = `
  query TraceDetail($id: ID!, $input: TraceDetailInput) {
    trace(id: $id, input: $input) {
      trace {
        id
        serviceName
        startedAt
        startedAtUnixNano
        endedAt
        endedAtUnixNano
        durationNano
        durationMs
        rootSpanId
        status
        attributes
      }
      structure {
        rootSpanIds
        orphanSpanIds
        criticalPathSpanIds
        maxDepth
        serviceBreakdown {
          serviceName
          spanCount
          errorSpanCount
          durationMs
          percentOfTraceDuration
        }
      }
      spans {
        id
        traceId
        parentSpanId
        name
        kind
        serviceName
        startedAt
        startedAtUnixNano
        endedAt
        endedAtUnixNano
        startOffsetNano
        durationNano
        durationMs
        status
        attributes
        depth
        childCount
        hasError
        isCriticalPath
        isOrphan
        isServiceEntry
        exceptionCount
        events {
          name
          timestamp
          timestampUnixNano
          attributes
        }
        links {
          traceId
          spanId
          traceState
          attributes
          direction
        }
        exceptions {
          timestamp
          type
          message
          stacktrace
          escaped
          attributes
          frames {
            raw
            functionName
            fileName
            lineNumber
            columnNumber
            language
          }
        }
      }
      selectedSpan {
        id
        traceId
        parentSpanId
        name
        kind
        serviceName
        startedAt
        startedAtUnixNano
        endedAt
        endedAtUnixNano
        startOffsetNano
        durationNano
        durationMs
        status
        attributes
        depth
        childCount
        hasError
        isCriticalPath
        isOrphan
        isServiceEntry
        exceptionCount
        events {
          name
          timestamp
          timestampUnixNano
          attributes
        }
        links {
          traceId
          spanId
          traceState
          attributes
          direction
        }
        exceptions {
          timestamp
          type
          message
          stacktrace
          escaped
          attributes
          frames {
            raw
            functionName
            fileName
            lineNumber
            columnNumber
            language
          }
        }
      }
      spanMatches {
        spanId
        reason
        fields
      }
      logs {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      relatedLogs {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      warnings {
        code
        message
        spanId
      }
    }
  }
`;

export const logSearchOperation = `
  query LogSearch($input: LogSearchInput) {
    logs(input: $input) {
      items {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      nextCursor
    }
  }
`;

export const telemetryFacetsOperation = `
  query TelemetryFacets($input: TelemetryFacetInput) {
    telemetryFacets(input: $input) {
      services {
        value
        count
      }
      operations {
        value
        count
      }
      spanNames {
        value
        count
      }
      severities {
        value
        count
      }
      attributeKeys {
        value
        count
      }
    }
  }
`;

const metricDescriptorFields = `
  id
  name
  description
  unit
  kind
  aggregationTemporality
  monotonic
  attributeKeys
  firstSeenAt
  lastSeenAt
`;

export const metricNamesOperation = `
  query MetricNames($input: MetricNameSearchInput) {
    metricNames(input: $input) {
      items {
        ${metricDescriptorFields}
      }
      nextCursor
    }
  }
`;

export const metricSeriesOperation = `
  query MetricSeries($input: MetricSeriesInput!) {
    metricSeries(input: $input) {
      metric {
        ${metricDescriptorFields}
      }
      aggregation
      interval
      groupBy
      series {
        labels
        points {
          timestamp
          value
          count
          exemplars {
            timestamp
            value
            traceId
            spanId
            attributes
          }
        }
      }
      warnings {
        code
        message
        field
      }
    }
  }
`;

export const richMetricSeriesOperation = `
  query RichMetricSeries($input: RichMetricSeriesInput!) {
    richMetricSeries(input: $input) {
      interval
      series {
        id
        label
        sourceId
        unit
        labels
        points {
          timestamp
          value
          count
          exemplars {
            timestamp
            value
            traceId
            spanId
            attributes
          }
        }
      }
      displaySeries {
        id
        label
        sourceId
        visible
      }
      warnings {
        code
        message
        field
      }
    }
  }
`;

const evalResultFields = `
  id
  metricId
  metricVersion
  scope
  subjectId
  family
  payload {
    kind
    numberValue
    booleanValue
    labelValue
    confusionMatrix {
      labels
      cells {
        expected
        actual
        count
      }
    }
    fieldBreakdown {
      fields {
        path
        matched
        missing
        extra
        typeMismatch
      }
    }
    distribution {
      count
      min
      max
      mean
      p50
      p95
    }
  }
  unit
  direction
  problem {
    code
    message
    details
  }
  evidenceRefs {
    kind
    traceId
    spanId
    evaluationRunId
    evaluationItemRunId
    importJobId
    candidateId
    metadata
  }
  metadata
`;

const datasetItemFields = `
  id
  datasetId
  latestRevisionId
  latestRevision {
    id
    datasetItemId
    datasetId
    input
    expected
    observedOutput
    reason
    metadata
    split
    curationStatus
    curationNote
    contentTreatment
    sourceRefs {
      kind
      traceId
      spanId
      metadata
    }
    createdAt
    createdBy
    updatedAt
    updatedBy
  }
  createdAt
  createdBy
  updatedAt
  updatedBy
`;

const datasetItemRunFields = `
  id
  evaluationRunId
  datasetItemId
  datasetItemRevisionId
  targetSnapshotId
  status
  actualOutput
  actualOutputType
  traceId
  rootSpanId
  metricResultIds
  metricResults {
    ${evalResultFields}
  }
  problems {
    code
    message
    details
  }
  trajectorySummary
  summaryDigest
  summaryGeneratedAt
  retentionRole
  startedAt
  endedAt
`;

const versionedRefFields = `
  id
  version
`;

const solverRefFields = `
  kind
  name
  promptVersion {
    ${versionedRefFields}
  }
  agentRef
  workflowRef
  skillSnapshotRef
  toolSnapshotRef
  modelAlias
  providerProfileId
`;

const _baselineRefFields = `
  kind
  experimentRunId
  promptVersion {
    ${versionedRefFields}
  }
  solverRef {
    ${solverRefFields}
  }
`;

const _optimizationConfigFields = `
  optimizerKind
  bootstrapFewshot {
    candidateCount
    maxExamplesPerCandidate
    selectionScorerIds
    seed
    diversityStrategy
  }
  criticMutateJudgePick {
    candidateCount
    mutationInstructions
    judgeScorerIds
    seed
    maxRounds
    keepTopK
  }
`;

const runPolicyFields = `
  maxParallelRequests
`;

const experimentRunSummaryFields = `
  itemCounts {
    total
    queued
    running
    completed
    failed
    cancelled
    quarantined
  }
  metricAggregates {
    metricId
    metricVersion
    scope
    subjectId
    payload {
      kind
      numberValue
      booleanValue
      labelValue
    }
    unit
    direction
    support
    problemCount
  }
  problemCounts {
    invalidActualOutput
    invalidExpectedOutput
    missingEvidence
    adapterFailure
    timeout
    providerFailure
    contentRedacted
    notApplicable
    metricConfigInvalid
    internalError
  }
  budgetUsage {
    inputTokens
    outputTokens
    totalTokens
    estimatedUsd
  }
  latency {
    p50Ms
    p95Ms
    maxMs
  }
`;

const experimentRunFields = `
  id
  projectId
  evaluationDefinitionId
  kind
  status
  datasetId
  datasetVersionId
  datasetDigest
  selectedItemRevisionIds
  splitSelector {
    splits
    curationStatuses
  }
  targetSnapshotId
  metricSettingsSnapshot {
    metricId
    metricVersion
    options
  }
  runPolicySnapshot {
    ${runPolicyFields}
  }
  retentionProfile
  retentionRole
  startedAt
  endedAt
  summary {
    ${experimentRunSummaryFields}
  }
  problem {
    code
    message
    details
  }
  itemRuns {
    items {
      ${datasetItemRunFields}
    }
    nextCursor
  }
  metricResults {
    ${evalResultFields}
  }
`;

const agentRunFields = `
  id
  traceId
  rootSpanId
  agent {
    id
    name
    version
  }
  status
  startedAt
  endedAt
  durationMs
  tokenTotals {
    input
    output
    total
  }
  costEstimate {
    amount
    currency
  }
  transcript {
    role
    content
    contentDigest
    spanId
    timestamp
  }
  llmCalls {
    id
    traceId
    spanId
    provider
    requestModel
    responseModel
    latencyMs
    tokenTotals {
      input
      output
      total
    }
    tokenDetails
  }
  toolCalls {
    id
    traceId
    spanId
    toolName
    toolCallId
    parametersDigest
    resultDigest
    latencyMs
    status
    synthetic
  }
  retrievalEvents {
    id
    traceId
    spanId
    documentCount
    topK
    embeddingModel
    latencyMs
    documentDigests
  }
  metricResults {
    ${evalResultFields}
  }
`;

export const agentRunsOperation = `
  query AgentRuns($input: AgentRunSearchInput) {
    agentRuns(input: $input) {
      items {
        ${agentRunFields}
      }
      nextCursor
    }
  }
`;

export const agentRunOperation = `
  query AgentRun($id: ID!) {
    agentRun(id: $id) {
      ${agentRunFields}
    }
  }
`;

export const datasetsOperation = `
  query Datasets($input: DatasetSearchInput) {
    datasets(input: $input) {
      items {
        id
        name
        description
        currentVersionId
        currentVersion { id version digest createdAt }
        createdAt
        itemCount
        readyItemCount
        splitCounts
        health {
          status
          readyItemCount
          totalItemCount
          splitCounts
          duplicateCandidateCount
          leakageWarningCount
          missingExpectedCount
          schemaIssueCount
          smallDataset
          warnings
        }
        tags
        items {
          items {
            ${datasetItemFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

export const datasetOperation = `
  query Dataset($id: ID!) {
    dataset(id: $id) {
      id
      name
      description
      currentVersionId
      currentVersion { id version digest createdAt }
      createdAt
      itemCount
      readyItemCount
      splitCounts
      health {
        status
        readyItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const createDatasetOperation = `
  mutation CreateDataset($input: CreateDatasetInput!) {
    createDataset(input: $input) {
      id
      name
      description
      currentVersionId
      currentVersion { id version digest createdAt }
      createdAt
      itemCount
      readyItemCount
      splitCounts
      health {
        status
        readyItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const appendDatasetItemsOperation = `
  mutation AppendDatasetItems($input: AppendDatasetItemsInput!) {
    appendDatasetItems(input: $input) {
      id
      name
      description
      currentVersionId
      currentVersion { id version digest createdAt }
      createdAt
      itemCount
      readyItemCount
      splitCounts
      health {
        status
        readyItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const updateDatasetItemsOperation = `
  mutation UpdateDatasetItems($input: UpdateDatasetItemsInput!) {
    updateDatasetItems(input: $input) {
      id
      name
      description
      currentVersionId
      currentVersion { id version digest createdAt }
      createdAt
      itemCount
      readyItemCount
      splitCounts
      health {
        status
        readyItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const evaluationDefinitionsOperation = `
  query EvaluationDefinitions($input: EvaluationDefinitionSearchInput) {
    evaluationDefinitions(input: $input) {
      items {
        id
        projectId
        name
        datasetId
        datasetVersionPolicy
        pinnedDatasetVersionId
        version
      }
      nextCursor
    }
  }
`;

export const evaluationDefinitionOperation = `
  query EvaluationDefinition($id: ID!) {
    evaluationDefinition(id: $id) {
      id
      projectId
      name
      datasetId
      datasetVersionPolicy
      pinnedDatasetVersionId
      version
    }
  }
`;

export const createEvaluationDefinitionOperation = `
  mutation CreateEvaluationDefinition($input: CreateEvaluationDefinitionInput!) {
    createEvaluationDefinition(input: $input) {
      id
      projectId
      name
      datasetId
      version
    }
  }
`;

export const updateEvaluationDefinitionOperation = `
  mutation UpdateEvaluationDefinition($input: UpdateEvaluationDefinitionInput!) {
    updateEvaluationDefinition(input: $input) {
      id
      projectId
      name
      datasetId
      datasetVersionPolicy
      pinnedDatasetVersionId
      version
    }
  }
`;

export const evaluationRunsOperation = `
  query EvaluationRuns($input: EvaluationRunSearchInput) {
    evaluationRuns(input: $input) {
      items {
        ${experimentRunFields}
      }
      nextCursor
    }
  }
`;

export const startEvaluationRunOperation = `
  mutation StartEvaluationRun($input: StartEvaluationRunInput!) {
    startEvaluationRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const pauseEvaluationRunOperation = `
  mutation PauseEvaluationRun($input: EvaluationRunControlInput!) {
    pauseEvaluationRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const resumeEvaluationRunOperation = `
  mutation ResumeEvaluationRun($input: EvaluationRunControlInput!) {
    resumeEvaluationRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const cancelEvaluationRunOperation = `
  mutation CancelEvaluationRun($input: EvaluationRunControlInput!) {
    cancelEvaluationRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const evaluationRunOperation = `
  query EvaluationRun($id: ID!) {
    evaluationRun(id: $id) {
      ${experimentRunFields}
    }
  }
`;

export const scorersOperation = evaluationDefinitionsOperation;
export const createScorerOperation = createEvaluationDefinitionOperation;
export const experimentsOperation = evaluationDefinitionsOperation;
export const createExperimentOperation = createEvaluationDefinitionOperation;
export const startExperimentRunOperation = startEvaluationRunOperation;
export const pauseExperimentRunOperation = pauseEvaluationRunOperation;
export const resumeExperimentRunOperation = resumeEvaluationRunOperation;
export const cancelExperimentRunOperation = cancelEvaluationRunOperation;
export const experimentRunOperation = evaluationRunOperation;

export const evaluationResultsOperation = `
  query EvaluationResults($input: EvaluationResultsSearchInput) {
    evaluationResults(input: $input) {
      items {
        ${evalResultFields}
      }
      nextCursor
    }
  }
`;

export const createEvaluationComparisonOperation = `
  mutation CreateEvaluationComparison($input: CreateEvaluationComparisonInput!) {
    createEvaluationComparison(input: $input) {
      id
      projectId
      baselineRunId
      candidateRunId
      summary
      createdAt
    }
  }
`;

export const evaluationComparisonsOperation = `
  query EvaluationComparisons($input: EvaluationComparisonSearchInput) {
    evaluationComparisons(input: $input) {
      items {
        id
        projectId
        baselineRunId
        candidateRunId
        summary
        createdAt
      }
      nextCursor
    }
  }
`;

export const startOptimizationRunOperation = `
  mutation StartOptimizationRun($input: StartOptimizationRunInput!) {
    startOptimizationRun(input: $input) {
      id
      projectId
      status
      baselineTargetSnapshotId
      candidateTargetSnapshotIds
      causedEvaluationRunIds
      comparisonIds
      selectedCandidateSnapshotId
      promotionRecordId
      budgetSnapshot
      createdAt
      startedAt
      endedAt
    }
  }
`;

export const optimizationRunsOperation = `
  query OptimizationRuns($input: OptimizationRunSearchInput) {
    optimizationRuns(input: $input) {
      items {
        id
        projectId
        status
        baselineTargetSnapshotId
        candidateTargetSnapshotIds
        causedEvaluationRunIds
        comparisonIds
        selectedCandidateSnapshotId
        promotionRecordId
        budgetSnapshot
        createdAt
        startedAt
        endedAt
      }
      nextCursor
    }
  }
`;

export const promoteTargetSnapshotOperation = `
  mutation PromoteTargetSnapshot($input: PromoteTargetSnapshotInput!) {
    promoteTargetSnapshot(input: $input) {
      id
      projectId
      targetRef
      baselineTargetSnapshotId
      candidateTargetSnapshotId
      evidenceEvaluationRunIds
      comparisonId
      summary
      promotedBy
      promotedAt
      notes
    }
  }
`;

export const annotationQueueOperation = `
  query AnnotationQueue($input: AnnotationQueueSearchInput) {
    annotationQueue(input: $input) {
      items {
        id
        targetTraceId
        targetSpanId
        reason
        assignedTo
        status
        createdAt
        resolvedDatasetItemId
        metricId
        score
        evidence
      }
      nextCursor
    }
  }
`;

const datasetImportJobFields = `
  id
  datasetId
  status
  format
  sourceFiles {
    path
    format
    sizeBytes
    rowCount
    sha256
  }
  mapping
  defaults
  previewRows {
    rowNumber
    filePath
    item {
      input
      expected
      observedOutput
      reason
      metadata
      split
      curationStatus
      sourceRefs {
        kind
        traceId
        spanId
        metadata
      }
    }
    errors {
      code
      message
      path
    }
    warnings {
      code
      message
      path
    }
  }
  totalRows
  validRows
  errorRows
  warnings
  createdAt
  expiresAt
  committedDatasetVersionId
`;

const datasetExportJobFields = `
  id
  datasetId
  datasetVersionId
  status
  format
  rowCount
  sizeBytes
  sha256
  downloadUrl
  createdAt
  expiresAt
`;

export const prepareDatasetImportOperation = `
  mutation PrepareDatasetImport($input: PrepareDatasetImportInput!) {
    prepareDatasetImport(input: $input) {
      ${datasetImportJobFields}
    }
  }
`;

export const commitDatasetImportOperation = `
  mutation CommitDatasetImport($input: CommitDatasetImportInput!) {
    commitDatasetImport(input: $input) {
      ${datasetImportJobFields}
    }
  }
`;

export const startDatasetExportOperation = `
  mutation StartDatasetExport($input: StartDatasetExportInput!) {
    startDatasetExport(input: $input) {
      ${datasetExportJobFields}
    }
  }
`;

export const datasetExportOperation = `
  query DatasetExport($id: ID!) {
    datasetExport(id: $id) {
      ${datasetExportJobFields}
    }
  }
`;

const datasetCandidateFields = `
  id
  datasetId
  status
  sourceKind
  source
  input
  expected
  observedOutput
  metadata
  split
  curationStatus
  curationNote
  contentTreatment
  anonymizationProvenance {
    policyId
    policyVersion
    transformedAt
    consistencyScope
    transformedFields {
      path
      entityType
      strategy
    }
  }
  reason
  sourceRefs {
    kind
    traceId
    spanId
    metadata
  }
  clusterId
  warnings
  createdAt
  updatedAt
`;

export const datasetCandidatesOperation = `
  query DatasetCandidates($input: DatasetCandidateSearchInput) {
    datasetCandidates(input: $input) {
      items {
        ${datasetCandidateFields}
      }
      nextCursor
    }
  }
`;

export const prepareDatasetCandidatesOperation = `
  mutation PrepareDatasetCandidates($input: PrepareDatasetCandidatesInput!) {
    prepareDatasetCandidates(input: $input) {
      items {
        ${datasetCandidateFields}
      }
      nextCursor
    }
  }
`;

export const commitDatasetCandidatesOperation = `
  mutation CommitDatasetCandidates($input: CommitDatasetCandidatesInput!) {
    commitDatasetCandidates(input: $input) {
      id
      name
      description
      currentVersionId
      currentVersion { id version digest createdAt }
      createdAt
      itemCount
      readyItemCount
      splitCounts
      health {
        status
        readyItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const aiQualityOverviewOperation = `
  query AiQualityOverview($input: AiQualityOverviewInput!) {
    aiQualityOverview(input: $input) {
      projectId
      from
      to
      summary
      warnings
      segments {
        key
        label
        dimensions
        runCount
        scoredRunCount
        passRate
        meanScore
        p50LatencyMs
        p95LatencyMs
        costUsd
        problemCount
      }
    }
  }
`;

export const liveTraceSubscriptionOperation = `
  subscription LiveTrace($input: LiveTraceInput) {
    liveTraces(input: $input) {
      type
      seq
      receivedAt
      trace {
        id
        serviceName
        startedAt
        endedAt
        durationMs
        rootSpanId
        status
        attributes
        spanCount
        errorSpanCount
        logCount
        serviceCount
      }
    }
  }
`;

export const liveEvaluationRunSubscriptionOperation = `
  subscription LiveEvaluationRun($input: LiveEvaluationRunInput!) {
    liveEvaluationRun(input: $input) {
      type
      seq
      receivedAt
      run {
        ${experimentRunFields}
      }
      itemRun {
        ${datasetItemRunFields}
      }
    }
  }
`;

export const liveExperimentRunSubscriptionOperation = liveEvaluationRunSubscriptionOperation;
