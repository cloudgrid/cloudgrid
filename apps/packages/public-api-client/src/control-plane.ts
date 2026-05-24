const projectFields = `
  id
  organizationId
  name
  slug
  status
  telemetry {
    lastIngestAt
    traceCount
    logCount
    metricCount
    serviceCount
  }
`;

const organizationFields = `
  id
  name
  slug
  role
  projects {
    ${projectFields}
  }
`;

const viewerFields = `
  user {
    id
    displayName
    email
  }
  organizations {
    ${organizationFields}
  }
  selectedProject {
    ${projectFields}
  }
`;

export const viewerOperation = `
  query Viewer {
    viewer {
      ${viewerFields}
    }
  }
`;

export const organizationsOperation = `
  query Organizations {
    organizations {
      ${organizationFields}
    }
  }
`;

export const organizationOperation = `
  query Organization($id: ID!) {
    organization(id: $id) {
      ${organizationFields}
    }
  }
`;

export const projectsOperation = `
  query Projects($input: ProjectListInput) {
    projects(input: $input) {
      ${projectFields}
    }
  }
`;

export const projectOperation = `
  query Project($id: ID!) {
    project(id: $id) {
      ${projectFields}
    }
  }
`;

export const selectProjectOperation = `
  mutation SelectProject($projectId: ID!) {
    selectProject(projectId: $projectId) {
      ${viewerFields}
    }
  }
`;

export const createProjectOperation = `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      ${projectFields}
    }
  }
`;

export const updateOrganizationMemberOperation = `
  mutation UpdateOrganizationMember($input: UpdateOrganizationMemberInput!) {
    updateOrganizationMember(input: $input) {
      user {
        id
        displayName
        email
      }
      role
    }
  }
`;

export const removeOrganizationMemberOperation = `
  mutation RemoveOrganizationMember($input: RemoveOrganizationMemberInput!) {
    removeOrganizationMember(input: $input)
  }
`;

const organizationMemberFields = `
  user {
    id
    displayName
    email
  }
  role
`;

const organizationInvitationFields = `
  id
  organizationId
  email
  role
  status
  deliveryStatus
  lastDeliveryAttemptAt
  lastDeliveryErrorCode
  lastEmailDeliveryId
  projectGrants {
    projectId
    role
    status
    createdAt
    createdByUserId
    appliedAt
  }
  invitedByUserId
  acceptedByUserId
  createdAt
  updatedAt
  acceptedAt
  revokedAt
  expiresAt
`;

export const organizationMembersOperation = `
  query OrganizationMembers($organizationId: ID!) {
    organizationMembers(organizationId: $organizationId) {
      ${organizationMemberFields}
    }
  }
`;

export const organizationInvitationsOperation = `
  query OrganizationInvitations($organizationId: ID!) {
    organizationInvitations(organizationId: $organizationId) {
      ${organizationInvitationFields}
    }
  }
`;

export const inviteOrganizationMemberOperation = `
  mutation InviteOrganizationMember($input: InviteOrganizationMemberInput!) {
    inviteOrganizationMember(input: $input) {
      ${organizationInvitationFields}
    }
  }
`;

export const resendOrganizationInvitationOperation = `
  mutation ResendOrganizationInvitation($id: ID!) {
    resendOrganizationInvitation(id: $id) {
      ${organizationInvitationFields}
    }
  }
`;

export const revokeOrganizationInvitationOperation = `
  mutation RevokeOrganizationInvitation($id: ID!) {
    revokeOrganizationInvitation(id: $id) {
      ${organizationInvitationFields}
    }
  }
`;

const projectMemberFields = `
  projectId
  userId
  email
  displayName
  role
  effectiveRole
  source
  createdAt
  createdByUserId
  updatedAt
  updatedByUserId
`;

export const inviteProjectMemberOperation = `
  mutation InviteProjectMember($input: InviteProjectMemberInput!) {
    inviteProjectMember(input: $input) {
      outcome
      invitation {
        ${organizationInvitationFields}
      }
      projectMember {
        ${projectMemberFields}
      }
    }
  }
`;

export const projectMembersOperation = `
  query ProjectMembers($projectId: ID!) {
    projectMembers(projectId: $projectId) {
      ${projectMemberFields}
    }
  }
`;

export const updateProjectMemberOperation = `
  mutation UpdateProjectMember($projectId: ID!, $userId: ID!, $role: ProjectRole!) {
    updateProjectMember(projectId: $projectId, userId: $userId, role: $role) {
      ${projectMemberFields}
    }
  }
`;

export const removeProjectMemberOperation = `
  mutation RemoveProjectMember($projectId: ID!, $userId: ID!) {
    removeProjectMember(projectId: $projectId, userId: $userId)
  }
`;

const ingestCredentialFields = `
  id
  projectId
  title
  scopes
  secretPreview
  createdAt
  lastUsedAt
  revokedAt
  createdByUserId
`;

export const ingestCredentialsOperation = `
  query IngestCredentials($projectId: ID!) {
    ingestCredentials(projectId: $projectId) {
      items {
        ${ingestCredentialFields}
      }
    }
  }
`;

export const createIngestCredentialOperation = `
  mutation CreateIngestCredential($input: CreateIngestCredentialInput!) {
    createIngestCredential(input: $input) {
      credential {
        ${ingestCredentialFields}
      }
      secret
    }
  }
`;

export const revokeIngestCredentialOperation = `
  mutation RevokeIngestCredential($id: ID!) {
    revokeIngestCredential(id: $id) {
      ${ingestCredentialFields}
    }
  }
`;

const retentionRuleFields = `
  dataClass
  mode
  retentionDays
  softDeleteDays
  updatedAt
  updatedByUserId
  version
`;

const retentionPolicyFields = `
  projectId
  rules {
    ${retentionRuleFields}
  }
  updatedAt
  updatedByUserId
  version
`;

export const retentionPolicyOperation = `
  query RetentionPolicy($projectId: ID!) {
    retentionPolicy(projectId: $projectId) {
      ${retentionPolicyFields}
    }
  }
`;

export const updateRetentionPolicyOperation = `
  mutation UpdateRetentionPolicy($input: UpdateRetentionPolicyInput!) {
    updateRetentionPolicy(input: $input) {
      ${retentionPolicyFields}
    }
  }
`;

const projectAiSettingsFields = `
  projectId
  enabled
  defaultProviderProfileId
  defaultJudgeProfileId
  defaultOptimizerProfileId
  defaultEmbeddingProfileId
  providerProfiles {
    id
    projectId
    label
    providerKind
    baseUrl
    credentialRef
    models
    timeoutMs
    maxConcurrency
    disabledAt
  }
  modelAliases {
    id
    name
    providerProfileId
    model
    purpose
    parameters
  }
  onlinePolicies {
    id
    enabled
    name
    target
    metricIds
    sampleRate
    maxDailyRuns
    annotationRules {
      reason
      threshold
      assignTo
      datasetId
    }
    updatedAt
    updatedByUserId
  }
  budget {
    dailyUsd
    perRunUsd
    deterministicOnly
    spentTodayUsd
  }
  sampling {
    defaultOnlineSampleRate
    maxOnlineSampleRate
    maxConcurrentEvaluationItems
    maxConcurrentOptimizationCandidates
  }
  datasetDefaults {
    splitAllocation
    smallDatasetReadyThreshold
    requireReadyForTest
  }
  effective {
    warnings
    deterministicOnly
    missingProviderProfiles
    disabledProviderProfiles
    budgetExhausted
  }
  version
  updatedAt
  updatedByUserId
`;

export const projectAiSettingsOperation = `
  query ProjectAiSettings($projectId: ID!) {
    projectAiSettings(projectId: $projectId) {
      ${projectAiSettingsFields}
    }
  }
`;

export const updateProjectAiSettingsOperation = `
  mutation UpdateProjectAiSettings($input: UpdateProjectAiSettingsInput!) {
    updateProjectAiSettings(input: $input) {
      ${projectAiSettingsFields}
    }
  }
`;

const alertRuleFields = `
  id
  projectId
  name
  enabled
  kind
  severity
  query
  condition
  evaluationWindowSeconds
  pendingForSeconds
  cooldownSeconds
  notificationAdapterIds
  createdAt
  updatedAt
  updatedByUserId
  version
`;

const alertEventFields = `
  id
  projectId
  ruleId
  instanceId
  state
  severity
  summary
  deduplicationKey
  startedAt
  endedAt
  createdAt
  evidenceTraceId
  evidenceSpanId
  evidenceLogId
  evidenceMetricName
`;

const alertSilenceFields = `
  id
  projectId
  ruleId
  reason
  startsAt
  endsAt
  createdAt
  createdByUserId
  active
`;

export const alertRulesOperation = `
  query AlertRules($projectId: ID!, $input: AlertRuleSearchInput) {
    alertRules(projectId: $projectId, input: $input) {
      ${alertRuleFields}
    }
  }
`;

export const alertHistoryOperation = `
  query AlertHistory($projectId: ID!, $ruleId: ID, $first: Int = 50, $after: String) {
    alertHistory(projectId: $projectId, ruleId: $ruleId, first: $first, after: $after) {
      items {
        ${alertEventFields}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const alertSummaryOperation = `
  query AlertSummary($projectId: ID!, $input: AlertSummaryInput) {
    alertSummary(projectId: $projectId, input: $input) {
      totalCount
      byState {
        state
        count
      }
      bySeverity {
        severity
        count
      }
      bySignal {
        signal
        count
      }
    }
  }
`;

export const alertSilencesOperation = `
  query AlertSilences($projectId: ID!, $ruleId: ID) {
    alertSilences(projectId: $projectId, ruleId: $ruleId) {
      ${alertSilenceFields}
    }
  }
`;

export const createAlertRuleOperation = `
  mutation CreateAlertRule($input: CreateAlertRuleInput!) {
    createAlertRule(input: $input) {
      ${alertRuleFields}
    }
  }
`;

export const updateAlertRuleOperation = `
  mutation UpdateAlertRule($input: UpdateAlertRuleInput!) {
    updateAlertRule(input: $input) {
      ${alertRuleFields}
    }
  }
`;

export const deleteAlertRuleOperation = `
  mutation DeleteAlertRule($id: ID!) {
    deleteAlertRule(id: $id)
  }
`;

export const createAlertSilenceOperation = `
  mutation CreateAlertSilence($input: CreateAlertSilenceInput!) {
    createAlertSilence(input: $input) {
      ${alertSilenceFields}
    }
  }
`;

export const deleteAlertSilenceOperation = `
  mutation DeleteAlertSilence($id: ID!) {
    deleteAlertSilence(id: $id)
  }
`;
