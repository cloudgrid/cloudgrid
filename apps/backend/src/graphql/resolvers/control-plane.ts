import type {
  AlertRuleSearchInput,
  AlertSummaryInput,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  ProjectListInput,
  RemoveOrganizationMemberInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
} from "@cloudgrid/ui-contracts";
import {
  validateAlertRuleSearchInput,
  validateAlertSummaryInput,
  validateCreateAlertRuleInput,
  validateCreateAlertSilenceInput,
  validateCreateIngestCredentialInput,
  validateCreateProjectInput,
  validateId,
  validateInviteOrganizationMemberInput,
  validateInviteProjectMemberInput,
  validateProjectListInput,
  validateProjectRole,
  validateRemoveOrganizationMemberInput,
  validateUpdateAlertRuleInput,
  validateUpdateOrganizationMemberInput,
  validateUpdateProjectInput,
  validateUpdateRetentionPolicyInput,
} from "../../validation";
import {
  authContext,
  logGraphQLOperation,
  requireControlBridge,
  type ResolverContext,
} from "./context";

export function controlPlaneResolvers() {
  return {
    Query: {
      viewer: async (_parent: unknown, _args: unknown, context: ResolverContext) =>
        logGraphQLOperation(context, "viewer", async () =>
          requireControlBridge(context).viewer(await authContext(context)),
        ),
      organizations: async (_parent: unknown, _args: unknown, context: ResolverContext) =>
        logGraphQLOperation(context, "organizations", async () =>
          requireControlBridge(context).organizations(await authContext(context)),
        ),
      organization: async (_parent: unknown, args: { id: string }, context: ResolverContext) =>
        logGraphQLOperation(context, "organization", async () =>
          requireControlBridge(context).organization(
            validateId(args.id, "organization id"),
            await authContext(context),
          ),
        ),
      organizationMembers: async (
        _parent: unknown,
        args: { organizationId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "organizationMembers", async () =>
          requireControlBridge(context).organizationMembers(
            validateId(args.organizationId, "organization id"),
            await authContext(context),
          ),
        ),
      organizationInvitations: async (
        _parent: unknown,
        args: { organizationId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "organizationInvitations", async () =>
          requireControlBridge(context).organizationInvitations(
            validateId(args.organizationId, "organization id"),
            await authContext(context),
          ),
        ),
      projects: async (
        _parent: unknown,
        args: { input?: ProjectListInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "projects", async () =>
          requireControlBridge(context).projects(
            validateProjectListInput(args.input ?? {}),
            await authContext(context),
          ),
        ),
      project: async (_parent: unknown, args: { id: string }, context: ResolverContext) =>
        logGraphQLOperation(context, "project", async () =>
          requireControlBridge(context).project(
            validateId(args.id, "project id"),
            await authContext(context),
          ),
        ),
      projectMembers: async (
        _parent: unknown,
        args: { projectId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "projectMembers", async () =>
          requireControlBridge(context).projectMembers(
            validateId(args.projectId, "project id"),
            await authContext(context),
          ),
        ),
      retentionPolicy: async (
        _parent: unknown,
        args: { projectId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "retentionPolicy", async () =>
          requireControlBridge(context).retentionPolicy(
            validateId(args.projectId, "project id"),
            await authContext(context),
          ),
        ),
      alertRules: async (
        _parent: unknown,
        args: { projectId: string; input?: AlertRuleSearchInput | null },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "alertRules", async () =>
          requireControlBridge(context).alertRules(
            validateId(args.projectId, "project id"),
            validateAlertRuleSearchInput(args.input ?? {}),
            await authContext(context),
          ),
        ),
      alertHistory: async (
        _parent: unknown,
        args: {
          projectId: string;
          ruleId?: string | null;
          first?: number | null;
          after?: string | null;
        },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "alertHistory", async () =>
          requireControlBridge(context).alertHistory(
            validateId(args.projectId, "project id"),
            args.ruleId ? validateId(args.ruleId, "alert rule id") : null,
            args.first ?? 50,
            args.after ?? null,
            await authContext(context),
          ),
        ),
      alertSummary: async (
        _parent: unknown,
        args: { projectId: string; input?: AlertSummaryInput | null },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "alertSummary", async () =>
          requireControlBridge(context).alertSummary(
            validateId(args.projectId, "project id"),
            validateAlertSummaryInput(args.input ?? {}),
            await authContext(context),
          ),
        ),
      alertSilences: async (
        _parent: unknown,
        args: { projectId: string; ruleId?: string | null },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "alertSilences", async () =>
          requireControlBridge(context).alertSilences(
            validateId(args.projectId, "project id"),
            args.ruleId ? validateId(args.ruleId, "alert rule id") : null,
            await authContext(context),
          ),
        ),
      ingestCredentials: async (
        _parent: unknown,
        args: { projectId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "ingestCredentials", async () =>
          requireControlBridge(context).ingestCredentials(
            validateId(args.projectId, "project id"),
            await authContext(context),
          ),
        ),
    },
    Mutation: {
      selectProject: async (
        _parent: unknown,
        args: { projectId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "selectProject", async () => {
          const projectId = validateId(args.projectId, "project id");
          const viewer = await requireControlBridge(context).selectProject(
            projectId,
            await authContext(context),
          );
          if (context.request) {
            const auth = context.hono.get("auth");
            await auth.rememberSelectedProject(context.request, projectId);
          }
          return viewer;
        }),
      createProject: async (
        _parent: unknown,
        args: { input: CreateProjectInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "createProject", async () =>
          requireControlBridge(context).createProject(
            validateCreateProjectInput(args.input),
            await authContext(context),
          ),
        ),
      updateProject: async (
        _parent: unknown,
        args: { id: string; input: UpdateProjectInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "updateProject", async () =>
          requireControlBridge(context).updateProject(
            validateId(args.id, "project id"),
            validateUpdateProjectInput(args.input),
            await authContext(context),
          ),
        ),
      inviteOrganizationMember: async (
        _parent: unknown,
        args: { input: InviteOrganizationMemberInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "inviteOrganizationMember", async () =>
          requireControlBridge(context).inviteOrganizationMember(
            validateInviteOrganizationMemberInput(args.input),
            await authContext(context),
          ),
        ),
      inviteProjectMember: async (
        _parent: unknown,
        args: { input: InviteProjectMemberInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "inviteProjectMember", async () =>
          requireControlBridge(context).inviteProjectMember(
            validateInviteProjectMemberInput(args.input),
            await authContext(context),
          ),
        ),
      resendOrganizationInvitation: async (
        _parent: unknown,
        args: { id: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "resendOrganizationInvitation", async () =>
          requireControlBridge(context).resendOrganizationInvitation(
            validateId(args.id, "invitation id"),
            await authContext(context),
          ),
        ),
      revokeOrganizationInvitation: async (
        _parent: unknown,
        args: { id: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "revokeOrganizationInvitation", async () =>
          requireControlBridge(context).revokeOrganizationInvitation(
            validateId(args.id, "invitation id"),
            await authContext(context),
          ),
        ),
      updateOrganizationMember: async (
        _parent: unknown,
        args: { input: UpdateOrganizationMemberInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "updateOrganizationMember", async () =>
          requireControlBridge(context).updateOrganizationMember(
            validateUpdateOrganizationMemberInput(args.input),
            await authContext(context),
          ),
        ),
      removeOrganizationMember: async (
        _parent: unknown,
        args: { input: RemoveOrganizationMemberInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "removeOrganizationMember", async () =>
          requireControlBridge(context).removeOrganizationMember(
            validateRemoveOrganizationMemberInput(args.input),
            await authContext(context),
          ),
        ),
      updateProjectMember: async (
        _parent: unknown,
        args: { projectId: string; userId: string; role: "viewer" | "editor" | "admin" },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "updateProjectMember", async () =>
          requireControlBridge(context).updateProjectMember(
            validateId(args.projectId, "project id"),
            validateId(args.userId, "user id"),
            validateProjectRole(args.role),
            await authContext(context),
          ),
        ),
      removeProjectMember: async (
        _parent: unknown,
        args: { projectId: string; userId: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "removeProjectMember", async () =>
          requireControlBridge(context).removeProjectMember(
            validateId(args.projectId, "project id"),
            validateId(args.userId, "user id"),
            await authContext(context),
          ),
        ),
      createIngestCredential: async (
        _parent: unknown,
        args: { input: CreateIngestCredentialInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "createIngestCredential", async () =>
          requireControlBridge(context).createIngestCredential(
            validateCreateIngestCredentialInput(args.input),
            await authContext(context),
          ),
        ),
      revokeIngestCredential: async (
        _parent: unknown,
        args: { id: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "revokeIngestCredential", async () =>
          requireControlBridge(context).revokeIngestCredential(
            validateId(args.id, "ingest credential id"),
            await authContext(context),
          ),
        ),
      updateRetentionPolicy: async (
        _parent: unknown,
        args: { input: UpdateRetentionPolicyInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "updateRetentionPolicy", async () =>
          requireControlBridge(context).updateRetentionPolicy(
            validateUpdateRetentionPolicyInput(args.input),
            await authContext(context),
          ),
        ),
      createAlertRule: async (
        _parent: unknown,
        args: { input: CreateAlertRuleInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "createAlertRule", async () =>
          requireControlBridge(context).createAlertRule(
            validateCreateAlertRuleInput(args.input),
            await authContext(context),
          ),
        ),
      updateAlertRule: async (
        _parent: unknown,
        args: { input: UpdateAlertRuleInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "updateAlertRule", async () =>
          requireControlBridge(context).updateAlertRule(
            validateUpdateAlertRuleInput(args.input),
            await authContext(context),
          ),
        ),
      deleteAlertRule: async (_parent: unknown, args: { id: string }, context: ResolverContext) =>
        logGraphQLOperation(context, "deleteAlertRule", async () =>
          requireControlBridge(context).deleteAlertRule(
            validateId(args.id, "alert rule id"),
            await authContext(context),
          ),
        ),
      createAlertSilence: async (
        _parent: unknown,
        args: { input: CreateAlertSilenceInput },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "createAlertSilence", async () =>
          requireControlBridge(context).createAlertSilence(
            validateCreateAlertSilenceInput(args.input),
            await authContext(context),
          ),
        ),
      deleteAlertSilence: async (
        _parent: unknown,
        args: { id: string },
        context: ResolverContext,
      ) =>
        logGraphQLOperation(context, "deleteAlertSilence", async () =>
          requireControlBridge(context).deleteAlertSilence(
            validateId(args.id, "alert silence id"),
            await authContext(context),
          ),
        ),
    },
  };
}
