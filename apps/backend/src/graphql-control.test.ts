import { describe, expect, test } from "bun:test";
import type {
  AiChatActionProposal,
  AiChatHistoryInput,
  ApproveAiChatActionInput,
  AlertEventConnection,
  AlertRule,
  AlertRuleSearchInput,
  AlertSummary,
  AlertSummaryInput,
  AlertSilence,
  CompanyAiProviderSettings,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateAiChatConversationInput,
  CreateProjectInput,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  OrganizationInvitation,
  ProjectAiProviderSettings,
  ProjectListInput,
  ProjectInvitationResult,
  ProjectMember,
  ProjectRole,
  RemoveOrganizationMemberInput,
  RetentionPolicy,
  UpdateCompanyAiProviderSettingsInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiProviderSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
} from "@cloudgrid/ui-contracts";
import type { NormalizedAuthContext } from "./auth";
import { createAppWithBridge } from "./index";
import { bridge, invitation, member, organization, project, viewer } from "./test-helpers";

describe("BFF GraphQL control-plane resolvers", () => {
  test("routes viewer, organization, and project queries through the control-plane bridge", async () => {
    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async viewer(_authContext: NormalizedAuthContext) {
          calls.push("viewer");
          return viewer();
        },
        async organizations(_authContext: NormalizedAuthContext) {
          calls.push("organizations");
          return [organization()];
        },
        async organization(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`organization:${id}`);
          return organization();
        },
        async projects(input: ProjectListInput, _authContext: NormalizedAuthContext) {
          calls.push(`projects:${input.organizationId}:${input.status}`);
          return [project()];
        },
        async project(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`project:${id}`);
          return project();
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Control($orgId: ID!, $projectId: ID!) {
            viewer { user { id } }
            organizations { id }
            organization(id: $orgId) { id }
            projects(input: { organizationId: $orgId, status: active }) { id }
            project(id: $projectId) { id }
          }
        `,
        variables: { orgId: "org-1", projectId: "project-1" },
      }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(calls).toEqual([
      "viewer",
      "organizations",
      "organization:org-1",
      "projects:org-1:active",
      "project:project-1",
    ]);
  });

  test("routes control mutations through the control-plane bridge", async () => {
    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async selectProject(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`select:${id}`);
          return viewer();
        },
        async createProject(input: CreateProjectInput, _authContext: NormalizedAuthContext) {
          calls.push(`create:${input.organizationId}:${input.name}:${input.slug}`);
          return project();
        },
        async updateProject(
          id: string,
          input: UpdateProjectInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateProject:${id}:${input.name}:${input.status}`);
          return project();
        },
        async updateOrganizationMember(
          input: UpdateOrganizationMemberInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateMember:${input.organizationId}:${input.userId}:${input.role}`);
          return member();
        },
        async removeOrganizationMember(
          input: RemoveOrganizationMemberInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`removeMember:${input.organizationId}:${input.userId}`);
          return true;
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation Control {
            selectProject(projectId: "project-1") { user { id } }
            createProject(input: { organizationId: "org-1", name: "API", slug: "api" }) { id }
            updateProject(id: "project-1", input: { name: "API 2", status: read_only }) { id }
            updateOrganizationMember(input: { organizationId: "org-1", userId: "user-1", role: admin }) { role }
            removeOrganizationMember(input: { organizationId: "org-1", userId: "user-1" })
          }
        `,
      }),
    });
    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(calls).toEqual([
      "select:project-1",
      "create:org-1:API:api",
      "updateProject:project-1:API 2:read_only",
      "updateMember:org-1:user-1:admin",
      "removeMember:org-1:user-1",
    ]);
  });

  test("persists selected project into the BFF auth context for deep reloads", async () => {
    const observedProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async selectProject() {
          return viewer();
        },
        async viewer(authContext: NormalizedAuthContext) {
          observedProjectIds.push(authContext.projectId);
          return viewer();
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const selectResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query:
          'mutation Select { selectProject(projectId: "project-1") { selectedProject { id } } }',
      }),
    });
    const viewerResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "query Viewer { viewer { selectedProject { id } } }",
      }),
    });

    expect((await selectResponse.json()).errors).toBeUndefined();
    expect((await viewerResponse.json()).errors).toBeUndefined();
    expect(observedProjectIds).toEqual(["project-1"]);
  });

  test("routes organization member and invitation operations through the control-plane bridge", async () => {
    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async organizationMembers(organizationId: string, _authContext: NormalizedAuthContext) {
          calls.push(`members:${organizationId}`);
          return [member()];
        },
        async organizationInvitations(organizationId: string, _authContext: NormalizedAuthContext) {
          calls.push(`invitations:${organizationId}`);
          return [invitation()];
        },
        async inviteOrganizationMember(
          input: InviteOrganizationMemberInput,
          _authContext: NormalizedAuthContext,
        ): Promise<OrganizationInvitation> {
          calls.push(`invite:${input.organizationId}:${input.email}`);
          return invitation({ email: input.email });
        },
        async inviteProjectMember(
          input: InviteProjectMemberInput,
          _authContext: NormalizedAuthContext,
        ): Promise<ProjectInvitationResult> {
          calls.push(`projectInvite:${input.projectId}:${input.email}:${input.role}`);
          return {
            outcome: "invitation_pending",
            invitation: invitation({
              email: input.email,
              projectGrants: [
                {
                  projectId: input.projectId,
                  role: input.role,
                  status: "pending",
                  createdAt: "2026-05-16T10:00:00.000Z",
                  createdByUserId: "admin-1",
                  appliedAt: null,
                },
              ],
            }),
            projectMember: null,
          };
        },
        async resendOrganizationInvitation(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`resend:${id}`);
          return invitation({ id, deliveryStatus: "pending" });
        },
        async revokeOrganizationInvitation(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`revoke:${id}`);
          return invitation({ id, status: "revoked", revokedAt: "2026-05-16T10:00:00.000Z" });
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const queryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query OrganizationAccess($orgId: ID!) {
            organizationMembers(organizationId: $orgId) { user { id } role }
            organizationInvitations(organizationId: $orgId) { id email status role }
          }
        `,
        variables: { orgId: "org-1" },
      }),
    });
    const mutationResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation OrganizationInvites {
            inviteOrganizationMember(input: { organizationId: "org-1", email: "Ada@Example.Test" }) {
              email
              status
              role
              deliveryStatus
              projectGrants { projectId role status appliedAt }
            }
            inviteProjectMember(input: { projectId: "project-1", email: "Grace@Example.Test", role: editor }) {
              outcome
              invitation {
                email
                projectGrants { projectId role status }
              }
              projectMember {
                userId
                role
              }
            }
            resendOrganizationInvitation(id: "invite-1") {
              id
              deliveryStatus
            }
            revokeOrganizationInvitation(id: "invite-1") {
              id
              status
              revokedAt
            }
          }
        `,
      }),
    });
    const queryBody = await queryResponse.json();
    const mutationBody = await mutationResponse.json();

    expect(queryBody.errors).toBeUndefined();
    expect(mutationBody.errors).toBeUndefined();
    expect(calls).toEqual([
      "members:org-1",
      "invitations:org-1",
      "invite:org-1:Ada@Example.Test",
      "projectInvite:project-1:Grace@Example.Test:editor",
      "resend:invite-1",
      "revoke:invite-1",
    ]);
    expect(mutationBody.data.inviteOrganizationMember).toMatchObject({
      email: "Ada@Example.Test",
      status: "pending",
      role: "user",
    });
    expect(mutationBody.data.inviteProjectMember).toMatchObject({
      outcome: "invitation_pending",
      invitation: {
        email: "Grace@Example.Test",
        projectGrants: [{ projectId: "project-1", role: "editor", status: "pending" }],
      },
      projectMember: null,
    });
    expect(mutationBody.data.resendOrganizationInvitation).toMatchObject({
      id: "invite-1",
      deliveryStatus: "pending",
    });
    expect(mutationBody.data.revokeOrganizationInvitation).toMatchObject({
      id: "invite-1",
      status: "revoked",
    });
  });

  test("routes project membership, retention, and alerting resolvers through the control-plane bridge", async () => {
    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async projectMembers(projectId: string, _authContext: NormalizedAuthContext) {
          calls.push(`projectMembers:${projectId}`);
          return [projectMember()];
        },
        async updateProjectMember(
          projectId: string,
          userId: string,
          role: ProjectRole,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateProjectMember:${projectId}:${userId}:${role}`);
          return projectMember({ projectId, userId, role });
        },
        async removeProjectMember(
          projectId: string,
          userId: string,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`removeProjectMember:${projectId}:${userId}`);
          return true;
        },
        async retentionPolicy(projectId: string, _authContext: NormalizedAuthContext) {
          calls.push(`retentionPolicy:${projectId}`);
          return retentionPolicy(projectId);
        },
        async updateRetentionPolicy(
          input: UpdateRetentionPolicyInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateRetentionPolicy:${input.projectId}:${input.expectedVersion}`);
          return retentionPolicy(input.projectId, 2);
        },
        async alertRules(
          projectId: string,
          input: AlertRuleSearchInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`alertRules:${projectId}:${input.search ?? ""}:${input.sort ?? ""}`);
          return [alertRule(projectId)];
        },
        async alertHistory(
          projectId: string,
          ruleId: string | null | undefined,
          first: number | null | undefined,
          after: string | null | undefined,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`alertHistory:${projectId}:${ruleId}:${first}:${after}`);
          return alertHistory(projectId, ruleId ?? "rule-1");
        },
        async alertSummary(
          projectId: string,
          input: AlertSummaryInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(
            `alertSummary:${projectId}:${input.states?.join(",") ?? ""}:${input.severities?.join(",") ?? ""}:${input.signals?.join(",") ?? ""}`,
          );
          return alertSummary();
        },
        async alertSilences(
          projectId: string,
          ruleId: string | null | undefined,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`alertSilences:${projectId}:${ruleId}`);
          return [alertSilence(projectId, ruleId ?? "rule-1")];
        },
        async createAlertRule(input: CreateAlertRuleInput, _authContext: NormalizedAuthContext) {
          calls.push(`createAlertRule:${input.projectId}:${input.kind}`);
          return alertRule(input.projectId, "rule-created");
        },
        async updateAlertRule(input: UpdateAlertRuleInput, _authContext: NormalizedAuthContext) {
          calls.push(`updateAlertRule:${input.id}:${input.expectedVersion}`);
          return alertRule("project-1", input.id, 2);
        },
        async deleteAlertRule(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`deleteAlertRule:${id}`);
          return true;
        },
        async createAlertSilence(
          input: CreateAlertSilenceInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`createAlertSilence:${input.projectId}:${input.ruleId}`);
          return alertSilence(input.projectId, input.ruleId);
        },
        async deleteAlertSilence(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`deleteAlertSilence:${id}`);
          return true;
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const mutationResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation Admin {
            updateProjectMember(projectId: "project-1", userId: "user-1", role: editor) { source role }
            removeProjectMember(projectId: "project-1", userId: "user-1")
            updateRetentionPolicy(input: {
              projectId: "project-1",
              expectedVersion: 1,
              rules: [
                { dataClass: TRACES, mode: delete, retentionDays: 14 },
                { dataClass: LOGS, mode: delete, retentionDays: 30 },
                { dataClass: METRICS, mode: delete, retentionDays: 30 },
                { dataClass: AI_EVALS, mode: delete, retentionDays: 90 },
                { dataClass: DATASETS, mode: retain },
                { dataClass: SCORERS, mode: retain },
                { dataClass: DASHBOARD_HISTORY, mode: retain },
                { dataClass: INGEST_CREDENTIAL_AUDIT, mode: delete, retentionDays: 365 }
              ]
            }) { version }
            createAlertRule(input: {
              projectId: "project-1",
              name: "Errors",
              enabled: true,
              kind: TRACE_ERROR,
              severity: ERROR,
              query: { service: "api" },
              condition: { minCount: 1 },
              evaluationWindowSeconds: 60,
              pendingForSeconds: 0,
              cooldownSeconds: 60,
              notificationAdapterIds: ["in_app"]
            }) { id }
            updateAlertRule(input: { id: "rule-1", enabled: false, expectedVersion: 1 }) { version }
            deleteAlertRule(id: "rule-1")
            createAlertSilence(input: {
              projectId: "project-1",
              ruleId: "rule-1",
              reason: "maintenance",
              startsAt: "2026-05-14T08:00:00.000Z",
              endsAt: "2026-05-14T09:00:00.000Z"
            }) { active }
            deleteAlertSilence(id: "silence-1")
          }
        `,
      }),
    });
    const mutationBody = await mutationResponse.json();

    expect(mutationBody.errors).toBeUndefined();

    const queryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AdminQueries {
            projectMembers(projectId: "project-1") { userId source }
            retentionPolicy(projectId: "project-1") { version }
            alertRules(projectId: "project-1", input: { search: "errors", severity: ERROR, signal: TRACE, enabled: true, sort: severity_desc }) { id }
            alertHistory(projectId: "project-1", ruleId: "rule-1", first: 25, after: "cursor-1") { items { id } pageInfo { hasNextPage endCursor } }
            alertSummary(projectId: "project-1", input: { states: [FIRING], severities: [ERROR], signals: [TRACE], timeWindow: "PT1H", limit: 20 }) {
              totalCount
              byState { state count }
              bySeverity { severity count }
              bySignal { signal count }
            }
            alertSilences(projectId: "project-1", ruleId: "rule-1") { id }
          }
        `,
      }),
    });
    const queryBody = await queryResponse.json();

    expect(queryBody.errors).toBeUndefined();
    expect(calls).toEqual([
      "updateProjectMember:project-1:user-1:editor",
      "removeProjectMember:project-1:user-1",
      "updateRetentionPolicy:project-1:1",
      "createAlertRule:project-1:TRACE_ERROR",
      "updateAlertRule:rule-1:1",
      "deleteAlertRule:rule-1",
      "createAlertSilence:project-1:rule-1",
      "deleteAlertSilence:silence-1",
      "projectMembers:project-1",
      "retentionPolicy:project-1",
      "alertRules:project-1:errors:severity_desc",
      "alertHistory:project-1:rule-1:25:cursor-1",
      "alertSummary:project-1:FIRING:ERROR:TRACE",
      "alertSilences:project-1:rule-1",
    ]);
  });

  test("routes AI provider settings and AI Chat contract resolvers through the control-plane bridge", async () => {
    const calls: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async projectAiProviderSettings(projectId: string, _authContext: NormalizedAuthContext) {
          calls.push(`projectAiProviderSettings:${projectId}`);
          return projectAiProviderSettings(projectId);
        },
        async companyAiProviderSettings(companyId: string, _authContext: NormalizedAuthContext) {
          calls.push(`companyAiProviderSettings:${companyId}`);
          return companyAiProviderSettings(companyId);
        },
        async aiChatHistory(input: AiChatHistoryInput, _authContext: NormalizedAuthContext) {
          calls.push(`aiChatHistory:${input.companyId}:${input.projectId}:${input.first}`);
          return {
            companyId: input.companyId,
            userId: "user-local",
            projectGroups: [
              {
                projectId: input.projectId ?? "project-1",
                projectName: "Default",
                conversations: [
                  aiChatConversation(input.companyId, input.projectId ?? "project-1"),
                ],
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          };
        },
        async aiChatConversation(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`aiChatConversation:${id}`);
          return aiChatConversation("org-1", "project-1", id);
        },
        async updateProjectAiProviderSettings(
          input: UpdateProjectAiProviderSettingsInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateProjectAiProviderSettings:${input.projectId}:${input.expectedVersion}`);
          return projectAiProviderSettings(input.projectId, input.expectedVersion + 1);
        },
        async updateCompanyAiProviderSettings(
          input: UpdateCompanyAiProviderSettingsInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`updateCompanyAiProviderSettings:${input.companyId}:${input.expectedVersion}`);
          return companyAiProviderSettings(input.companyId, input.expectedVersion + 1);
        },
        async createAiChatConversation(
          input: CreateAiChatConversationInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`createAiChatConversation:${input.companyId}:${input.projectId}`);
          return aiChatConversation(input.companyId, input.projectId, "chat-created");
        },
        async archiveAiChatConversation(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`archiveAiChatConversation:${id}`);
          return { ...aiChatConversation("org-1", "project-1", id), status: "archived" as const };
        },
        async deleteAiChatConversation(id: string, _authContext: NormalizedAuthContext) {
          calls.push(`deleteAiChatConversation:${id}`);
          return true;
        },
        async approveAiChatAction(
          input: ApproveAiChatActionInput,
          _authContext: NormalizedAuthContext,
        ) {
          calls.push(`approveAiChatAction:${input.actionId}:${input.approved}`);
          return aiChatActionProposal(input.actionId, input.approved ? "approved" : "rejected");
        },
      }),
      { graphqlUI: false, auth: { mode: "local", sessionTtlSeconds: 28_800 } },
    );

    const mutationResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation AiChatContracts {
            updateProjectAiProviderSettings(input: {
              projectId: "project-1",
              expectedVersion: 1,
              providerProfiles: [{
                id: "profile-1",
                label: "OpenAI",
                providerKind: openai,
                credentialRef: "env:OPENAI_API_KEY",
                models: { chat: ["gpt-5-mini"] }
              }],
              modelAliases: [{
                id: "alias-1",
                name: "chat-default",
                providerProfileId: "profile-1",
                model: "gpt-5-mini",
                purpose: chat
              }]
            }) { version providerProfiles { credentialRef } }
            updateCompanyAiProviderSettings(input: {
              companyId: "org-1",
              expectedVersion: 1,
              providerProfile: {
                id: "company-profile-1",
                label: "Company OpenAI",
                providerKind: openai,
                credentialRef: "env:OPENAI_API_KEY",
                models: { chat: ["gpt-5-mini"] }
              },
              chatModelAlias: {
                id: "company-chat",
                name: "chat-default",
                providerProfileId: "company-profile-1",
                model: "gpt-5-mini",
                purpose: chat
              }
            }) { version providerProfile { credentialRef } }
            createAiChatConversation(input: {
              companyId: "org-1",
              projectId: "project-1",
              firstUserMessage: "Investigate slow traces"
            }) { id projectId messages { role parts { type text } } }
            archiveAiChatConversation(id: "chat-1") { status }
            deleteAiChatConversation(id: "chat-2")
            approveAiChatAction(input: {
              actionId: "action-1",
              approved: true,
              expectedVersion: 1
            }) { id status }
          }
        `,
      }),
    });
    const queryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AiChatReads {
            projectAiProviderSettings(projectId: "project-1") { version }
            companyAiProviderSettings(companyId: "org-1") { version }
            aiChatHistory(input: { companyId: "org-1", projectId: "project-1", first: 10 }) {
              projectGroups { projectId conversations { id } }
            }
            aiChatConversation(id: "chat-1") { id projectId }
          }
        `,
      }),
    });
    const mutationBody = await mutationResponse.json();
    const queryBody = await queryResponse.json();

    expect(mutationBody.errors).toBeUndefined();
    expect(queryBody.errors).toBeUndefined();
    expect(calls).toEqual([
      "updateProjectAiProviderSettings:project-1:1",
      "updateCompanyAiProviderSettings:org-1:1",
      "createAiChatConversation:org-1:project-1",
      "archiveAiChatConversation:chat-1",
      "deleteAiChatConversation:chat-2",
      "approveAiChatAction:action-1:true",
      "projectAiProviderSettings:project-1",
      "companyAiProviderSettings:org-1",
      "aiChatHistory:org-1:project-1:10",
      "aiChatConversation:chat-1",
    ]);
  });
});

function projectMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return { ...projectMemberBase(), ...overrides };
}

function projectMemberBase(): ProjectMember {
  return {
    projectId: "project-1",
    userId: "user-1",
    email: null,
    displayName: null,
    role: "viewer" as const,
    effectiveRole: "viewer" as const,
    source: "direct" as const,
    createdAt: "2026-05-14T08:00:00.000Z",
    createdByUserId: "admin-1",
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
  };
}

function retentionPolicy(projectId: string, version = 1): RetentionPolicy {
  return {
    projectId,
    version,
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
    rules: [
      "TRACES",
      "LOGS",
      "METRICS",
      "AI_EVALS",
      "DATASETS",
      "SCORERS",
      "DASHBOARD_HISTORY",
      "INGEST_CREDENTIAL_AUDIT",
    ].map((dataClass) => ({
      dataClass: dataClass as RetentionPolicy["rules"][number]["dataClass"],
      mode: dataClass === "DATASETS" || dataClass === "SCORERS" ? "retain" : "delete",
      retentionDays: dataClass === "DATASETS" || dataClass === "SCORERS" ? null : 30,
      softDeleteDays: null,
      updatedAt: "2026-05-14T08:00:00.000Z",
      updatedByUserId: "admin-1",
      version,
    })),
  };
}

function alertRule(projectId: string, id = "rule-1", version = 1): AlertRule {
  return {
    id,
    projectId,
    name: "Errors",
    enabled: true,
    kind: "TRACE_ERROR",
    severity: "ERROR",
    query: { service: "api" },
    condition: { minCount: 1 },
    evaluationWindowSeconds: 60,
    pendingForSeconds: 0,
    cooldownSeconds: 60,
    notificationAdapterIds: ["in_app"],
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
    version,
  };
}

function projectAiProviderSettings(projectId: string, version = 1): ProjectAiProviderSettings {
  return {
    projectId,
    providerProfiles: [aiProviderProfile("profile-1", "project", projectId)],
    modelAliases: [aiModelAlias("alias-1", "profile-1")],
    effective: {
      warnings: [],
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      missingChatProvider: false,
    },
    version,
    updatedAt: "2026-05-18T00:00:00.000Z",
    updatedByUserId: "user-local",
  };
}

function companyAiProviderSettings(companyId: string, version = 1): CompanyAiProviderSettings {
  return {
    companyId,
    providerProfile: aiProviderProfile("company-profile-1", "company", companyId),
    chatModelAlias: aiModelAlias("company-chat", "company-profile-1"),
    effective: {
      warnings: [],
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      missingChatProvider: false,
    },
    version,
    updatedAt: "2026-05-18T00:00:00.000Z",
    updatedByUserId: "user-local",
  };
}

function aiProviderProfile(id: string, ownerScope: string, ownerId: string) {
  return {
    id,
    ownerScope,
    ownerId,
    label: "OpenAI",
    providerKind: "openai" as const,
    baseUrl: null,
    credentialRef: "env:OPENAI_API_KEY",
    models: { chat: ["gpt-5-mini"] },
    parameters: {},
    timeoutMs: 30_000,
    maxConcurrency: null,
    disabledAt: null,
  };
}

function aiModelAlias(id: string, providerProfileId: string) {
  return {
    id,
    name: "chat-default",
    providerProfileId,
    model: "gpt-5-mini",
    purpose: "chat" as const,
    parameters: { extras: {} },
  };
}

function aiChatConversation(companyId: string, projectId: string, id = "chat-1") {
  return {
    id,
    companyId,
    projectId,
    userId: "user-local",
    title: "Investigate slow traces",
    status: "active" as const,
    messages: [
      {
        id: "message-1",
        conversationId: id,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Investigate slow traces" }],
        createdAt: "2026-05-18T00:00:00.000Z",
      },
    ],
    latestRun: null,
    compaction: null,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastMessageAt: "2026-05-18T00:00:00.000Z",
    version: 1,
  };
}

function aiChatActionProposal(
  id: string,
  status: AiChatActionProposal["status"] = "proposed",
): AiChatActionProposal {
  return {
    id,
    runId: "run-1",
    conversationId: "chat-1",
    title: "Save dashboard",
    description: "Create a saved dashboard",
    risk: "medium",
    status,
    operation: "dashboard.save",
    preview: { name: "Latency" },
    result: null,
    requestedAt: "2026-05-18T00:00:00.000Z",
    decidedAt: status === "proposed" ? null : "2026-05-18T00:01:00.000Z",
    decidedByUserId: status === "proposed" ? null : "user-local",
    version: 2,
  };
}

function alertHistory(projectId: string, ruleId: string): AlertEventConnection {
  return {
    items: [
      {
        id: "event-1",
        projectId,
        ruleId,
        instanceId: "instance-1",
        state: "FIRING",
        severity: "ERROR",
        summary: "Errors firing",
        deduplicationKey: "errors:api",
        startedAt: "2026-05-14T08:00:00.000Z",
        endedAt: null,
        createdAt: "2026-05-14T08:00:00.000Z",
        evidenceTraceId: null,
        evidenceSpanId: null,
        evidenceLogId: null,
        evidenceMetricName: null,
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  };
}

function alertSummary(): AlertSummary {
  return {
    totalCount: 1,
    byState: [{ state: "FIRING", count: 1 }],
    bySeverity: [{ severity: "ERROR", count: 1 }],
    bySignal: [{ signal: "TRACE", count: 1 }],
  };
}

function alertSilence(projectId: string, ruleId: string): AlertSilence {
  return {
    id: "silence-1",
    projectId,
    ruleId,
    reason: "maintenance",
    startsAt: "2026-05-14T08:00:00.000Z",
    endsAt: "2026-05-14T09:00:00.000Z",
    createdAt: "2026-05-14T08:00:00.000Z",
    createdByUserId: "admin-1",
    active: true,
  };
}
