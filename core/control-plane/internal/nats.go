package internal

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	SubjectViewerGet                 = "control.viewer.get"
	SubjectOrganizationsList         = "control.organizations.list"
	SubjectOrganizationsGet          = "control.organizations.get"
	SubjectProjectsList              = "control.projects.list"
	SubjectProjectsListForService    = "control.projects.list_for_service"
	SubjectProjectsGet               = "control.projects.get"
	SubjectProjectsCreate            = "control.projects.create"
	SubjectProjectsUpdate            = "control.projects.update"
	SubjectProjectsSelect            = "control.projects.select"
	SubjectMembersList               = "control.members.list"
	SubjectMembersUpdate             = "control.members.update"
	SubjectMembersRemove             = "control.members.remove"
	SubjectInvitationsList           = "control.invitations.list"
	SubjectInvitationsCreate         = "control.invitations.create"
	SubjectInvitationsResend         = "control.invitations.resend"
	SubjectInvitationsRevoke         = "control.invitations.revoke"
	SubjectProjectInvitationsCreate  = "control.project_invitations.create"
	SubjectIngestCredentialsList     = "control.ingest_credentials.list"
	SubjectIngestCredentialsCreate   = "control.ingest_credentials.create"
	SubjectIngestCredentialsRevoke   = "control.ingest_credentials.revoke"
	SubjectProjectStatusSnapshot     = "control.project_status.snapshot"
	SubjectProjectStatusChanged      = "control.project_status.changed"
	SubjectDashboardsList            = "control.dashboards.list"
	SubjectDashboardsSave            = "control.dashboards.save"
	SubjectDashboardsDelete          = "control.dashboards.delete"
	SubjectDashboardPinsSet          = "control.dashboard_pins.set"
	SubjectDashboardPinsReorder      = "control.dashboard_pins.reorder"
	SubjectProjectAiSettingsGet      = "control.ai_settings.get"
	SubjectProjectAiSettingsUpdate   = "control.ai_settings.update"
	SubjectProjectAiProvidersGet     = "control.ai_providers.project.get"
	SubjectProjectAiProvidersUpdate  = "control.ai_providers.project.update"
	SubjectCompanyAiProvidersGet     = "control.ai_providers.company.get"
	SubjectCompanyAiProvidersUpdate  = "control.ai_providers.company.update"
	SubjectAiProviderSecretsResolve  = "control.ai_provider_secrets.resolve"
	SubjectAiChatHistory             = "control.ai_chat.history"
	SubjectAiChatConversationGet     = "control.ai_chat.conversation.get"
	SubjectAiChatConversationCreate  = "control.ai_chat.conversation.create"
	SubjectAiChatConversationArchive = "control.ai_chat.conversation.archive"
	SubjectAiChatConversationDelete  = "control.ai_chat.conversation.delete"
	SubjectAiChatMessageAppend       = "control.ai_chat.message.append"
	SubjectAiChatRunCreate           = "control.ai_chat.run.create"
	SubjectAiChatRunUpdate           = "control.ai_chat.run.update"
	SubjectAiChatRunFinalize         = "control.ai_chat.run.finalize"
	SubjectAiChatActionPropose       = "control.ai_chat.action.propose"
	SubjectAiChatActionApprove       = "control.ai_chat.action.approve"
	SubjectAiChatActionFinish        = "control.ai_chat.action.finish"
	SubjectAiChatCompactionSave      = "control.ai_chat.compaction.save"
	SubjectProjectMembersList        = "control.project_members.list"
	SubjectProjectMembersUpdate      = "control.project_members.update"
	SubjectProjectMembersRemove      = "control.project_members.remove"
	SubjectRetentionGet              = "control.retention.get"
	SubjectRetentionUpdate           = "control.retention.update"
	SubjectAlertRulesList            = "control.alert_rules.list"
	SubjectAlertRulesCreate          = "control.alert_rules.create"
	SubjectAlertRulesUpdate          = "control.alert_rules.update"
	SubjectAlertRulesDelete          = "control.alert_rules.delete"
	SubjectAlertSilencesList         = "control.alert_silences.list"
	SubjectAlertSilencesCreate       = "control.alert_silences.create"
	SubjectAlertSilencesDelete       = "control.alert_silences.delete"
	SubjectAlertHistoryList          = "control.alert_history.list"
	SubjectAlertSummaryGet           = "control.alert_summary.get"
	SubjectAlertNotificationAdapters = "control.alert_notification_adapters.list"
	SubjectAlertHistoryRecord        = "control.alert_history.record"
	controlPlaneService              = "control-plane"
)

func ControlSubjects() map[string]struct{} {
	return map[string]struct{}{
		SubjectViewerGet:                 {},
		SubjectOrganizationsList:         {},
		SubjectOrganizationsGet:          {},
		SubjectProjectsList:              {},
		SubjectProjectsListForService:    {},
		SubjectProjectsGet:               {},
		SubjectProjectsCreate:            {},
		SubjectProjectsUpdate:            {},
		SubjectProjectsSelect:            {},
		SubjectMembersList:               {},
		SubjectMembersUpdate:             {},
		SubjectMembersRemove:             {},
		SubjectInvitationsList:           {},
		SubjectInvitationsCreate:         {},
		SubjectInvitationsResend:         {},
		SubjectInvitationsRevoke:         {},
		SubjectProjectInvitationsCreate:  {},
		SubjectIngestCredentialsList:     {},
		SubjectIngestCredentialsCreate:   {},
		SubjectIngestCredentialsRevoke:   {},
		SubjectProjectStatusSnapshot:     {},
		SubjectProjectStatusChanged:      {},
		SubjectDashboardsList:            {},
		SubjectDashboardsSave:            {},
		SubjectDashboardsDelete:          {},
		SubjectDashboardPinsSet:          {},
		SubjectDashboardPinsReorder:      {},
		SubjectProjectAiSettingsGet:      {},
		SubjectProjectAiSettingsUpdate:   {},
		SubjectProjectAiProvidersGet:     {},
		SubjectProjectAiProvidersUpdate:  {},
		SubjectCompanyAiProvidersGet:     {},
		SubjectCompanyAiProvidersUpdate:  {},
		SubjectAiProviderSecretsResolve:  {},
		SubjectAiChatHistory:             {},
		SubjectAiChatConversationGet:     {},
		SubjectAiChatConversationCreate:  {},
		SubjectAiChatConversationArchive: {},
		SubjectAiChatConversationDelete:  {},
		SubjectAiChatMessageAppend:       {},
		SubjectAiChatRunCreate:           {},
		SubjectAiChatRunUpdate:           {},
		SubjectAiChatRunFinalize:         {},
		SubjectAiChatActionPropose:       {},
		SubjectAiChatActionApprove:       {},
		SubjectAiChatActionFinish:        {},
		SubjectAiChatCompactionSave:      {},
		SubjectProjectMembersList:        {},
		SubjectProjectMembersUpdate:      {},
		SubjectProjectMembersRemove:      {},
		SubjectRetentionGet:              {},
		SubjectRetentionUpdate:           {},
		SubjectAlertRulesList:            {},
		SubjectAlertRulesCreate:          {},
		SubjectAlertRulesUpdate:          {},
		SubjectAlertRulesDelete:          {},
		SubjectAlertSilencesList:         {},
		SubjectAlertSilencesCreate:       {},
		SubjectAlertSilencesDelete:       {},
		SubjectAlertHistoryList:          {},
		SubjectAlertSummaryGet:           {},
		SubjectAlertNotificationAdapters: {},
		SubjectAlertHistoryRecord:        {},
	}
}

type BridgeMessage interface {
	Data() []byte
	Respond(response []byte) error
}

type MessagePublisher interface {
	Publish(subject string, data []byte) error
}

type bridgeMessageHandler func(BridgeMessage)

func handleViewerGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ViewerGetRequest](SubjectViewerGet, logger, func(ctx context.Context, request contracts.ViewerGetRequest) contracts.ViewerGetResponse {
		viewer, err := service.GetViewer(ctx, request.BridgeEnvelope)
		if err != nil {
			return contracts.ViewerGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ViewerGetResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ViewerGetData{Viewer: &viewer}}
	})
}

func handleOrganizationsList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.OrganizationListRequest](SubjectOrganizationsList, logger, func(ctx context.Context, request contracts.OrganizationListRequest) contracts.OrganizationListResponse {
		items, err := service.ListOrganizations(ctx, request.BridgeEnvelope)
		if err != nil {
			return contracts.OrganizationListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.OrganizationListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.OrganizationListData{Items: items}}
	})
}

func handleOrganizationsGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.OrganizationGetRequest](SubjectOrganizationsGet, logger, func(ctx context.Context, request contracts.OrganizationGetRequest) contracts.OrganizationGetResponse {
		organization, err := service.GetOrganization(ctx, request)
		if err != nil {
			return contracts.OrganizationGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.OrganizationGetResponse{RequestID: request.RequestID, OK: true, Data: &contracts.OrganizationGetData{Organization: organization}}
	})
}

func handleProjectsList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectListRequest](SubjectProjectsList, logger, func(ctx context.Context, request contracts.ProjectListRequest) contracts.ProjectListResponse {
		items, err := service.ListProjects(ctx, request)
		if err != nil {
			return contracts.ProjectListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectListData{Items: items}}
	})
}

func handleProjectsListForService(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectListForServiceRequest](SubjectProjectsListForService, logger, func(ctx context.Context, request contracts.ProjectListForServiceRequest) contracts.ProjectListForServiceResponse {
		data, err := service.ListProjectsForService(ctx, request)
		if err != nil {
			return contracts.ProjectListForServiceResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectListForServiceResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleProjectsGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectGetRequest](SubjectProjectsGet, logger, func(ctx context.Context, request contracts.ProjectGetRequest) contracts.ProjectGetResponse {
		project, err := service.GetProject(ctx, request)
		if err != nil {
			return contracts.ProjectGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectGetResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectGetData{Project: project}}
	})
}

func handleProjectsCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectCreateRequest](SubjectProjectsCreate, logger, func(ctx context.Context, request contracts.ProjectCreateRequest) contracts.ProjectMutationResponse {
		project, err := service.CreateProject(ctx, request)
		if err != nil {
			return contracts.ProjectMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectGetData{Project: &project}}
	})
}

func handleProjectsUpdate(service *Service, publisher MessagePublisher, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectUpdateRequest](SubjectProjectsUpdate, logger, func(ctx context.Context, request contracts.ProjectUpdateRequest) contracts.ProjectMutationResponse {
		before := len(service.StatusChanges())
		project, err := service.UpdateProject(ctx, request)
		if err != nil {
			return contracts.ProjectMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		if publisher != nil {
			for _, change := range service.StatusChanges()[before:] {
				publishJSON(publisher, SubjectProjectStatusChanged, change)
			}
		}
		return contracts.ProjectMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectGetData{Project: &project}}
	})
}

func handleProjectsSelect(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectSelectRequest](SubjectProjectsSelect, logger, func(ctx context.Context, request contracts.ProjectSelectRequest) contracts.ProjectSelectResponse {
		viewer, err := service.SelectProject(ctx, request)
		if err != nil {
			return contracts.ProjectSelectResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectSelectResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ViewerGetData{Viewer: &viewer}}
	})
}

func handleMembersList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.MemberListRequest](SubjectMembersList, logger, func(ctx context.Context, request contracts.MemberListRequest) contracts.MemberListResponse {
		items, err := service.ListMembers(ctx, request)
		if err != nil {
			return contracts.MemberListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.MemberListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.MemberListData{Items: items}}
	})
}

func handleMembersUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.MemberUpdateRequest](SubjectMembersUpdate, logger, func(ctx context.Context, request contracts.MemberUpdateRequest) contracts.MemberUpdateResponse {
		member, err := service.UpdateMember(ctx, request)
		if err != nil {
			return contracts.MemberUpdateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.MemberUpdateResponse{RequestID: request.RequestID, OK: true, Data: &contracts.MemberUpdateData{Member: member}}
	})
}

func handleMembersRemove(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.MemberRemoveRequest](SubjectMembersRemove, logger, func(ctx context.Context, request contracts.MemberRemoveRequest) contracts.MemberRemoveResponse {
		removed, err := service.RemoveMember(ctx, request)
		if err != nil {
			return contracts.MemberRemoveResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.MemberRemoveResponse{RequestID: request.RequestID, OK: true, Data: &contracts.MemberRemoveData{Removed: removed}}
	})
}

func handleInvitationsList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.InvitationListRequest](SubjectInvitationsList, logger, func(ctx context.Context, request contracts.InvitationListRequest) contracts.InvitationListResponse {
		items, err := service.ListInvitations(ctx, request)
		if err != nil {
			return contracts.InvitationListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.InvitationListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.InvitationListData{Items: items}}
	})
}

func handleInvitationsCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.InvitationCreateRequest](SubjectInvitationsCreate, logger, func(ctx context.Context, request contracts.InvitationCreateRequest) contracts.InvitationMutationResponse {
		invitation, err := service.CreateInvitation(ctx, request)
		if err != nil {
			return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.InvitationMutationData{Invitation: invitation}}
	})
}

func handleInvitationsResend(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.InvitationResendRequest](SubjectInvitationsResend, logger, func(ctx context.Context, request contracts.InvitationResendRequest) contracts.InvitationMutationResponse {
		invitation, err := service.ResendInvitation(ctx, request)
		if err != nil {
			return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.InvitationMutationData{Invitation: invitation}}
	})
}

func handleInvitationsRevoke(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.InvitationRevokeRequest](SubjectInvitationsRevoke, logger, func(ctx context.Context, request contracts.InvitationRevokeRequest) contracts.InvitationMutationResponse {
		invitation, err := service.RevokeInvitation(ctx, request)
		if err != nil {
			return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.InvitationMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.InvitationMutationData{Invitation: invitation}}
	})
}

func handleProjectInvitationsCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectInvitationCreateRequest](SubjectProjectInvitationsCreate, logger, func(ctx context.Context, request contracts.ProjectInvitationCreateRequest) contracts.ProjectInvitationMutationResponse {
		result, err := service.CreateProjectInvitation(ctx, request)
		if err != nil {
			return contracts.ProjectInvitationMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectInvitationMutationResponse{RequestID: request.RequestID, OK: true, Data: &result}
	})
}

func handleIngestCredentialsList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[IngestCredentialListRequest](SubjectIngestCredentialsList, logger, func(ctx context.Context, request IngestCredentialListRequest) IngestCredentialListResponse {
		data, err := service.ListIngestCredentials(ctx, request)
		if err != nil {
			return IngestCredentialListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return IngestCredentialListResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleIngestCredentialsCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[IngestCredentialCreateRequest](SubjectIngestCredentialsCreate, logger, func(ctx context.Context, request IngestCredentialCreateRequest) IngestCredentialCreateResponse {
		data, err := service.CreateIngestCredential(ctx, request)
		if err != nil {
			return IngestCredentialCreateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return IngestCredentialCreateResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleIngestCredentialsRevoke(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[IngestCredentialRevokeRequest](SubjectIngestCredentialsRevoke, logger, func(ctx context.Context, request IngestCredentialRevokeRequest) IngestCredentialRevokeResponse {
		credential, err := service.RevokeIngestCredential(ctx, request)
		if err != nil {
			return IngestCredentialRevokeResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return IngestCredentialRevokeResponse{RequestID: request.RequestID, OK: true, Data: &IngestCredentialRevokeData{Credential: credential}}
	})
}

func handleProjectStatusSnapshot(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectStatusSnapshotRequest](SubjectProjectStatusSnapshot, logger, func(ctx context.Context, request contracts.ProjectStatusSnapshotRequest) contracts.ProjectStatusSnapshotResponse {
		snapshot, err := service.GetProjectStatusSnapshot(ctx, request)
		if err != nil {
			return contracts.ProjectStatusSnapshotResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectStatusSnapshotResponse{RequestID: request.RequestID, OK: true, Data: &snapshot}
	})
}

func handleDashboardsList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[DashboardListRequest](SubjectDashboardsList, logger, func(ctx context.Context, request DashboardListRequest) DashboardListResponse {
		data, err := service.ListDashboards(ctx, request)
		if err != nil {
			return DashboardListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return DashboardListResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleDashboardsSave(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[DashboardSaveRequest](SubjectDashboardsSave, logger, func(ctx context.Context, request DashboardSaveRequest) DashboardSaveResponse {
		dashboard, err := service.SaveDashboard(ctx, request)
		if err != nil {
			return DashboardSaveResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return DashboardSaveResponse{RequestID: request.RequestID, OK: true, Data: &DashboardSaveData{Dashboard: dashboard}}
	})
}

func handleDashboardsDelete(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[DashboardDeleteRequest](SubjectDashboardsDelete, logger, func(ctx context.Context, request DashboardDeleteRequest) DashboardDeleteResponse {
		deleted, err := service.DeleteDashboard(ctx, request)
		if err != nil {
			return DashboardDeleteResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return DashboardDeleteResponse{RequestID: request.RequestID, OK: true, Data: &DashboardDeleteData{Deleted: deleted}}
	})
}

func handleDashboardPinsSet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[DashboardPinSetRequest](SubjectDashboardPinsSet, logger, func(ctx context.Context, request DashboardPinSetRequest) DashboardPreferencesResponse {
		data, err := service.SetDashboardPin(ctx, request)
		if err != nil {
			return DashboardPreferencesResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return DashboardPreferencesResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleDashboardPinsReorder(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[DashboardPinReorderRequest](SubjectDashboardPinsReorder, logger, func(ctx context.Context, request DashboardPinReorderRequest) DashboardPreferencesResponse {
		data, err := service.ReorderDashboardPins(ctx, request)
		if err != nil {
			return DashboardPreferencesResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return DashboardPreferencesResponse{RequestID: request.RequestID, OK: true, Data: &data}
	})
}

func handleProjectAiSettingsGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectAiSettingsGetRequest](SubjectProjectAiSettingsGet, logger, func(ctx context.Context, request contracts.ProjectAiSettingsGetRequest) contracts.ProjectAiSettingsGetResponse {
		settings, err := service.GetProjectAiSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleProjectAiSettingsUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectAiSettingsUpdateRequest](SubjectProjectAiSettingsUpdate, logger, func(ctx context.Context, request contracts.ProjectAiSettingsUpdateRequest) contracts.ProjectAiSettingsUpdateResponse {
		settings, err := service.UpdateProjectAiSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleProjectAiProviderSettingsGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectAiProviderSettingsGetRequest](SubjectProjectAiProvidersGet, logger, func(ctx context.Context, request contracts.ProjectAiProviderSettingsGetRequest) contracts.ProjectAiSettingsGetResponse {
		settings, err := service.GetProjectAiProviderSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleProjectAiProviderSettingsUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectAiProviderSettingsUpdateRequest](SubjectProjectAiProvidersUpdate, logger, func(ctx context.Context, request contracts.ProjectAiProviderSettingsUpdateRequest) contracts.ProjectAiSettingsUpdateResponse {
		settings, err := service.UpdateProjectAiProviderSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleCompanyAiProviderSettingsGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.CompanyAiProviderSettingsGetRequest](SubjectCompanyAiProvidersGet, logger, func(ctx context.Context, request contracts.CompanyAiProviderSettingsGetRequest) contracts.ProjectAiSettingsGetResponse {
		settings, err := service.GetCompanyAiProviderSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleCompanyAiProviderSettingsUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.CompanyAiProviderSettingsUpdateRequest](SubjectCompanyAiProvidersUpdate, logger, func(ctx context.Context, request contracts.CompanyAiProviderSettingsUpdateRequest) contracts.ProjectAiSettingsUpdateResponse {
		settings, err := service.UpdateCompanyAiProviderSettings(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsUpdateResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"settings": settings}}
	})
}

func handleAiProviderSecretResolve(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiProviderSecretResolveRequest](SubjectAiProviderSecretsResolve, logger, func(ctx context.Context, request contracts.AiProviderSecretResolveRequest) contracts.ProjectAiSettingsGetResponse {
		credential, err := service.ResolveAiProviderSecret(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"credential": credential}}
	})
}

func handleAiChatHistory(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatHistoryRequest](SubjectAiChatHistory, logger, func(ctx context.Context, request contracts.AiChatHistoryRequest) contracts.ProjectAiSettingsGetResponse {
		history, err := service.GetAiChatHistory(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"history": history}}
	})
}

func handleAiChatConversationGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatConversationGetRequest](SubjectAiChatConversationGet, logger, func(ctx context.Context, request contracts.AiChatConversationGetRequest) contracts.ProjectAiSettingsGetResponse {
		conversation, err := service.GetAiChatConversation(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"conversation": conversation}}
	})
}

func handleAiChatConversationCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatConversationCreateRequest](SubjectAiChatConversationCreate, logger, func(ctx context.Context, request contracts.AiChatConversationCreateRequest) contracts.ProjectAiSettingsGetResponse {
		conversation, err := service.CreateAiChatConversation(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"conversation": conversation}}
	})
}

func handleAiChatConversationArchive(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatConversationArchiveRequest](SubjectAiChatConversationArchive, logger, func(ctx context.Context, request contracts.AiChatConversationArchiveRequest) contracts.ProjectAiSettingsGetResponse {
		conversation, err := service.ArchiveAiChatConversation(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"conversation": conversation}}
	})
}

func handleAiChatConversationDelete(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatConversationDeleteRequest](SubjectAiChatConversationDelete, logger, func(ctx context.Context, request contracts.AiChatConversationDeleteRequest) contracts.AlertDeleteResponse {
		deleted, err := service.DeleteAiChatConversation(ctx, request)
		if err != nil {
			return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertDeleteData{Deleted: deleted}}
	})
}

func handleAiChatMessageAppend(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatMessageAppendRequest](SubjectAiChatMessageAppend, logger, func(ctx context.Context, request contracts.AiChatMessageAppendRequest) contracts.ProjectAiSettingsGetResponse {
		message, err := service.AppendAiChatMessage(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"message": message}}
	})
}

func handleAiChatRunCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatRunCreateRequest](SubjectAiChatRunCreate, logger, func(ctx context.Context, request contracts.AiChatRunCreateRequest) contracts.AiChatRunMutationResponse {
		run, err := service.CreateAiChatRun(ctx, request)
		if err != nil {
			return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AiChatRunMutationData{Run: run}}
	})
}

func handleAiChatRunUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatRunUpdateRequest](SubjectAiChatRunUpdate, logger, func(ctx context.Context, request contracts.AiChatRunUpdateRequest) contracts.AiChatRunMutationResponse {
		run, err := service.UpdateAiChatRun(ctx, request)
		if err != nil {
			return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AiChatRunMutationData{Run: run}}
	})
}

func handleAiChatRunFinalize(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatRunFinalizeRequest](SubjectAiChatRunFinalize, logger, func(ctx context.Context, request contracts.AiChatRunFinalizeRequest) contracts.AiChatRunMutationResponse {
		run, err := service.FinalizeAiChatRun(ctx, request)
		if err != nil {
			return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AiChatRunMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AiChatRunMutationData{Run: run}}
	})
}

func handleAiChatActionPropose(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatActionProposeRequest](SubjectAiChatActionPropose, logger, func(ctx context.Context, request contracts.AiChatActionProposeRequest) contracts.ProjectAiSettingsGetResponse {
		action, err := service.ProposeAiChatAction(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"action": action}}
	})
}

func handleAiChatActionApprove(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatActionApproveRequest](SubjectAiChatActionApprove, logger, func(ctx context.Context, request contracts.AiChatActionApproveRequest) contracts.ProjectAiSettingsGetResponse {
		action, err := service.ApproveAiChatAction(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"action": action}}
	})
}

func handleAiChatActionFinish(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatActionFinishRequest](SubjectAiChatActionFinish, logger, func(ctx context.Context, request contracts.AiChatActionFinishRequest) contracts.ProjectAiSettingsGetResponse {
		action, err := service.FinishAiChatAction(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"action": action}}
	})
}

func handleAiChatCompactionSave(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AiChatCompactionSaveRequest](SubjectAiChatCompactionSave, logger, func(ctx context.Context, request contracts.AiChatCompactionSaveRequest) contracts.ProjectAiSettingsGetResponse {
		compaction, err := service.SaveAiChatCompaction(ctx, request)
		if err != nil {
			return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectAiSettingsGetResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"compaction": compaction}}
	})
}

func handleProjectMembersList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectMemberListRequest](SubjectProjectMembersList, logger, func(ctx context.Context, request contracts.ProjectMemberListRequest) contracts.ProjectMemberListResponse {
		items, err := service.ListProjectMembers(ctx, request)
		if err != nil {
			return contracts.ProjectMemberListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectMemberListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectMemberListData{Items: items}}
	})
}

func handleProjectMembersUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectMemberUpdateRequest](SubjectProjectMembersUpdate, logger, func(ctx context.Context, request contracts.ProjectMemberUpdateRequest) contracts.ProjectMemberMutationResponse {
		member, err := service.UpdateProjectMember(ctx, request)
		if err != nil {
			return contracts.ProjectMemberMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectMemberMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectMemberData{Member: member}}
	})
}

func handleProjectMembersRemove(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.ProjectMemberRemoveRequest](SubjectProjectMembersRemove, logger, func(ctx context.Context, request contracts.ProjectMemberRemoveRequest) contracts.ProjectMemberRemoveResponse {
		removed, err := service.RemoveProjectMember(ctx, request)
		if err != nil {
			return contracts.ProjectMemberRemoveResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.ProjectMemberRemoveResponse{RequestID: request.RequestID, OK: true, Data: &contracts.ProjectMemberRemoveData{Removed: removed}}
	})
}

func handleRetentionGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.RetentionGetRequest](SubjectRetentionGet, logger, func(ctx context.Context, request contracts.RetentionGetRequest) contracts.RetentionGetResponse {
		policy, err := service.GetRetentionPolicy(ctx, request)
		if err != nil {
			return contracts.RetentionGetResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.RetentionGetResponse{RequestID: request.RequestID, OK: true, Data: &contracts.RetentionPolicyData{Policy: policy}}
	})
}

func handleRetentionUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.RetentionUpdateRequest](SubjectRetentionUpdate, logger, func(ctx context.Context, request contracts.RetentionUpdateRequest) contracts.RetentionUpdateResponse {
		policy, err := service.UpdateRetentionPolicy(ctx, request)
		if err != nil {
			return contracts.RetentionUpdateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.RetentionUpdateResponse{RequestID: request.RequestID, OK: true, Data: &contracts.RetentionPolicyData{Policy: policy}}
	})
}

func handleAlertRulesList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertRuleListRequest](SubjectAlertRulesList, logger, func(ctx context.Context, request contracts.AlertRuleListRequest) contracts.AlertRuleListResponse {
		items, err := service.ListAlertRules(ctx, request)
		if err != nil {
			return contracts.AlertRuleListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertRuleListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertRuleListData{Items: items}}
	})
}

func handleAlertRulesCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertRuleCreateRequest](SubjectAlertRulesCreate, logger, func(ctx context.Context, request contracts.AlertRuleCreateRequest) contracts.AlertRuleMutationResponse {
		rule, err := service.CreateAlertRule(ctx, request)
		if err != nil {
			return contracts.AlertRuleMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertRuleMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertRuleData{Rule: rule}}
	})
}

func handleAlertRulesUpdate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertRuleUpdateRequest](SubjectAlertRulesUpdate, logger, func(ctx context.Context, request contracts.AlertRuleUpdateRequest) contracts.AlertRuleMutationResponse {
		rule, err := service.UpdateAlertRule(ctx, request)
		if err != nil {
			return contracts.AlertRuleMutationResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertRuleMutationResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertRuleData{Rule: rule}}
	})
}

func handleAlertRulesDelete(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertRuleDeleteRequest](SubjectAlertRulesDelete, logger, func(ctx context.Context, request contracts.AlertRuleDeleteRequest) contracts.AlertDeleteResponse {
		deleted, err := service.DeleteAlertRule(ctx, request)
		if err != nil {
			return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertDeleteData{Deleted: deleted}}
	})
}

func handleAlertSilencesList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertSilenceListRequest](SubjectAlertSilencesList, logger, func(ctx context.Context, request contracts.AlertSilenceListRequest) contracts.AlertSilenceListResponse {
		items, err := service.ListAlertSilences(ctx, request)
		if err != nil {
			return contracts.AlertSilenceListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertSilenceListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertSilenceListData{Items: items}}
	})
}

func handleAlertSilencesCreate(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertSilenceCreateRequest](SubjectAlertSilencesCreate, logger, func(ctx context.Context, request contracts.AlertSilenceCreateRequest) contracts.AlertSilenceCreateResponse {
		silence, err := service.CreateAlertSilence(ctx, request)
		if err != nil {
			return contracts.AlertSilenceCreateResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertSilenceCreateResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertSilenceData{Silence: silence}}
	})
}

func handleAlertSilencesDelete(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertSilenceDeleteRequest](SubjectAlertSilencesDelete, logger, func(ctx context.Context, request contracts.AlertSilenceDeleteRequest) contracts.AlertDeleteResponse {
		deleted, err := service.DeleteAlertSilence(ctx, request)
		if err != nil {
			return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertDeleteResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertDeleteData{Deleted: deleted}}
	})
}

func handleAlertHistoryList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertHistoryListRequest](SubjectAlertHistoryList, logger, func(ctx context.Context, request contracts.AlertHistoryListRequest) contracts.AlertHistoryListResponse {
		connection, err := service.ListAlertHistory(ctx, request)
		if err != nil {
			return contracts.AlertHistoryListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertHistoryListResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertHistoryListData{Connection: connection}}
	})
}

func handleAlertSummaryGet(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertSummaryRequest](SubjectAlertSummaryGet, logger, func(ctx context.Context, request contracts.AlertSummaryRequest) contracts.AlertSummaryResponse {
		summary, err := service.AlertSummary(ctx, request)
		if err != nil {
			return contracts.AlertSummaryResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertSummaryResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertSummaryData{Summary: summary}}
	})
}

func handleAlertNotificationAdaptersList(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertNotificationAdapterListRequest](SubjectAlertNotificationAdapters, logger, func(ctx context.Context, request contracts.AlertNotificationAdapterListRequest) contracts.AlertNotificationAdapterListResponse {
		adapters, err := service.ListAlertNotificationAdapters(ctx, request)
		if err != nil {
			return contracts.AlertNotificationAdapterListResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertNotificationAdapterListResponse{
			RequestID: request.RequestID,
			OK:        true,
			Data:      &contracts.AlertNotificationAdapterListData{Adapters: adapters},
		}
	})
}

func handleAlertHistoryRecord(service *Service, logger *slog.Logger) bridgeMessageHandler {
	return requestHandler[contracts.AlertHistoryRecordRequest](SubjectAlertHistoryRecord, logger, func(ctx context.Context, request contracts.AlertHistoryRecordRequest) contracts.AlertHistoryRecordResponse {
		event, err := service.RecordAlertHistory(ctx, request)
		if err != nil {
			return contracts.AlertHistoryRecordResponse{RequestID: request.RequestID, OK: false, Error: ptr(BridgeErrorFromError(err))}
		}
		return contracts.AlertHistoryRecordResponse{RequestID: request.RequestID, OK: true, Data: &contracts.AlertEventData{Event: event}}
	})
}

type responseEnvelope interface {
	GetRequestID() string
	IsOK() bool
	GetError() *contracts.BridgeError
}

func requestHandler[T any, R any](subject string, logger *slog.Logger, handle func(context.Context, T) R) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request T
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			bridgeError := BridgeErrorFromError(validationError("invalid request JSON"))
			respond(msg, map[string]any{"requestId": "", "ok": false, "error": bridgeError})
			logHandlerCompletion(logger, subject, "", false, start, &bridgeError)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
		defer cancel()
		response := handle(ctx, request)
		respond(msg, response)
		logGenericResponse(logger, subject, start, response)
	}
}

func respond(msg BridgeMessage, response any) {
	encoded, err := json.Marshal(response)
	if err != nil {
		return
	}
	_ = msg.Respond(encoded)
}

func publishJSON(publisher MessagePublisher, subject string, message any) {
	encoded, err := json.Marshal(message)
	if err == nil {
		_ = publisher.Publish(subject, encoded)
	}
}

func ErrorResponseJSON(requestID string, err contracts.BridgeError) ([]byte, error) {
	response := struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error,omitempty"`
	}{
		RequestID: requestID,
		OK:        false,
		Error:     &err,
	}
	return json.Marshal(response)
}

func logGenericResponse(logger *slog.Logger, subject string, start time.Time, response any) {
	var envelope struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error,omitempty"`
	}
	encoded, err := json.Marshal(response)
	if err != nil || json.Unmarshal(encoded, &envelope) != nil {
		logHandlerCompletion(logger, subject, "", false, start, nil)
		return
	}
	logHandlerCompletion(logger, subject, envelope.RequestID, envelope.OK, start, envelope.Error)
}

func logHandlerCompletion(logger *slog.Logger, subject string, requestID string, ok bool, start time.Time, bridgeError *contracts.BridgeError) {
	if logger == nil {
		return
	}
	level := slog.LevelDebug
	status := "ok"
	if !ok {
		level = slog.LevelWarn
		status = "error"
	}
	attrs := []any{
		"service", controlPlaneService,
		"event", "nats_handler_completed",
		"request_id", requestID,
		"operation_or_subject", subject,
		"status", status,
		"duration_ms", time.Since(start).Milliseconds(),
	}
	if bridgeError != nil {
		attrs = append(attrs, "error_id", bridgeError.ID, "error_code", bridgeError.Code)
	}
	logger.Log(context.Background(), level, "control plane NATS handler completed", attrs...)
}

func ptr[T any](value T) *T {
	return &value
}
