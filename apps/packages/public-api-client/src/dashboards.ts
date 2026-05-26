const dashboardThresholdFields = `
  value
  severity
  label
`;

const dashboardWidgetLayoutFields = `
  x
  y
  w
  h
  minW
  minH
`;

const dashboardWidgetFields = `
  id
  title
  description
  kind
  layout {
    ${dashboardWidgetLayoutFields}
  }
  metric {
    metricName
    aggregation
    groupBy
    filters {
      key
      operator
      value
    }
    timeWindow
    interval
    visualization
    legend
    maxSeries
    thresholds {
      ${dashboardThresholdFields}
    }
  }
  richMetric {
    query {
      timeWindow
      interval
      queries {
        id
        label
        metricName
        aggregation
        groupBy
        filters {
          key
          operator
          value
        }
        maxSeries
      }
      formulas {
        id
        label
        expression {
          kind
          refId
          value
          operator
          left {
            kind
            refId
            value
          }
          right {
            kind
            refId
            value
          }
          function
          arguments {
            kind
            refId
            value
          }
        }
        unit
      }
      displaySeries {
        id
        label
        sourceId
        visible
      }
    }
    visualization
    legend
    maxSeries
    thresholds {
      ${dashboardThresholdFields}
    }
  }
  logs {
    service
    traceId
    spanId
    severity
    search
    attributes {
      key
      operator
      value
    }
    sort
    limit
    columns
  }
  traces {
    service
    query
    operationName
    spanName
    status
    minDurationMs
    maxDurationMs
    attributes {
      key
      operator
      value
    }
    sort
    limit
    columns
  }
  liveTraces {
    service
    query
    operationName
    spanName
    status
    minDurationMs
    maxDurationMs
    attributes {
      key
      operator
      value
    }
    limit
  }
  alert {
    ruleIds
    states
    severities
    signals
    timeWindow
    limit
  }
`;

const dashboardFields = `
  id
  projectId
  slug
  name
  description
  tags
  version
  visibility
  defaultTimeWindow
  pinned
  widgets {
    ${dashboardWidgetFields}
  }
  createdAt
  updatedAt
  createdBy
  updatedBy
`;

export const dashboardsOperation = `
  query Dashboards($input: DashboardListInput) {
    dashboards(input: $input) {
      items {
        ${dashboardFields}
      }
      pinnedDashboardIds
    }
  }
`;

export const saveDashboardOperation = `
  mutation SaveDashboard($input: SaveDashboardInput!) {
    saveDashboard(input: $input) {
      ${dashboardFields}
    }
  }
`;

export const deleteDashboardOperation = `
  mutation DeleteDashboard($id: ID!) {
    deleteDashboard(id: $id)
  }
`;

export const setDashboardPinnedOperation = `
  mutation SetDashboardPinned($input: SetDashboardPinnedInput!) {
    setDashboardPinned(input: $input) {
      projectId
      pinnedDashboardIds
      updatedAt
    }
  }
`;

export const reorderDashboardPinsOperation = `
  mutation ReorderDashboardPins($input: ReorderDashboardPinsInput!) {
    reorderDashboardPins(input: $input) {
      projectId
      pinnedDashboardIds
      updatedAt
    }
  }
`;
