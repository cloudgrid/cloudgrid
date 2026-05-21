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
  scorerId
  scorerVersion
  targetKind
  targetId
  experimentRunId
  score
  passed
  evidence
  judgeRunRef
  producedAt
`;

const datasetItemFields = `
  id
  datasetId
  version
  input
  expected
  metadata
  sourceTraceId
  sourceSpanId
  split
  reviewStatus
  synthetic
  duplicateOfItemId
  leakageWarnings
`;

const datasetItemRunFields = `
  id
  experimentRunId
  datasetItemId
  harnessRunId
  output
  latencyMs
  tokenTotals {
    input
    output
    total
  }
  evalResults {
    ${evalResultFields}
  }
`;

const experimentRunFields = `
  id
  experimentId
  solverRef
  manifest {
    digest
    datasetId
    datasetVersion
    splitSelector {
      splits
      reviewedOnly
      includeSynthetic
    }
    scorerRefs {
      id
      version
    }
    baselineRef
    solverRef
    promptVersionRefs
    skillSnapshotRefs
    toolSnapshotRefs
    providerProfileRefs
    budget
    concurrency
    createdAt
  }
  baselineRunId
  status
  startedAt
  endedAt
  summary
  itemRuns {
    items {
      ${datasetItemRunFields}
    }
    nextCursor
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
  evalResults {
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
        version
        createdAt
        itemCount
        reviewedItemCount
        splitCounts
        health {
          status
          reviewedItemCount
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
      version
      createdAt
      itemCount
      reviewedItemCount
      splitCounts
      health {
        status
        reviewedItemCount
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
      version
      createdAt
      itemCount
      reviewedItemCount
      splitCounts
      health {
        status
        reviewedItemCount
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
      version
      createdAt
      itemCount
      reviewedItemCount
      splitCounts
      health {
        status
        reviewedItemCount
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

export const scorersOperation = `
  query Scorers($input: ScorerSearchInput) {
    scorers(input: $input) {
      items {
        id
        name
        kind
        definition
        judgeModelRef
        version
      }
      nextCursor
    }
  }
`;

export const createScorerOperation = `
  mutation CreateScorer($input: CreateScorerInput!) {
    createScorer(input: $input) {
      id
      name
      kind
      definition
      judgeModelRef
      version
    }
  }
`;

export const experimentsOperation = `
  query Experiments($input: ExperimentSearchInput) {
    experiments(input: $input) {
      items {
        id
        name
        datasetId
        datasetVersion
        scorerIds
        splitSelector {
          splits
          reviewedOnly
          includeSynthetic
        }
        baselineRef
        promptVersionRefs
        skillSnapshotRefs
        toolSnapshotRefs
        providerProfileRefs
        createdAt
        tags
        runs {
          items {
            ${experimentRunFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

export const createExperimentOperation = `
  mutation CreateExperiment($input: CreateExperimentInput!) {
    createExperiment(input: $input) {
      id
      name
      datasetId
      datasetVersion
      scorerIds
      splitSelector {
        splits
        reviewedOnly
        includeSynthetic
      }
      baselineRef
      promptVersionRefs
      skillSnapshotRefs
      toolSnapshotRefs
      providerProfileRefs
      createdAt
      tags
      runs {
        items {
          ${experimentRunFields}
        }
        nextCursor
      }
    }
  }
`;

export const startExperimentRunOperation = `
  mutation StartExperimentRun($input: StartExperimentRunInput!) {
    startExperimentRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const experimentRunOperation = `
  query ExperimentRun($id: ID!) {
    experimentRun(id: $id) {
      ${experimentRunFields}
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
        scorerId
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
      metadata
      sourceTraceId
      sourceSpanId
      split
      reviewStatus
      synthetic
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
  committedDatasetVersion
`;

const datasetExportJobFields = `
  id
  datasetId
  datasetVersion
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
        regressionCount
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

export const liveExperimentRunSubscriptionOperation = `
  subscription LiveExperimentRun($input: LiveExperimentRunInput!) {
    liveExperimentRun(input: $input) {
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
