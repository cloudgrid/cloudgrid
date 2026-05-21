package internal

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/mail"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	LocalCompanyID                  = "local"
	LocalProjectID                  = "default"
	LocalSelfObservabilityProjectID = "cloudgrid-system"
	localUserID                     = "local-user"
)

type Service struct {
	store               ports.ControlStore
	now                 func() time.Time
	statusChanges       []contracts.ProjectStatusChangedNotification
	invitationEmail     InvitationEmailConfig
	emailTransport      InvitationEmailTransport
	alertAdapters       map[string]struct{}
	secretKey           []byte
	requireSecretKey    bool
	secretKeyConfigured bool
}

func NewService(store ports.ControlStore, now func() time.Time) *Service {
	return NewServiceWithOptions(store, now, ServiceOptions{})
}

func NewServiceWithOptions(store ports.ControlStore, now func() time.Time, options ServiceOptions) *Service {
	if now == nil {
		now = time.Now
	}
	config := options.InvitationEmail.normalized()
	return &Service{
		store:               store,
		now:                 now,
		invitationEmail:     config,
		emailTransport:      options.EmailTransport,
		alertAdapters:       alertAdapterCatalog(options.AlertNotificationAdapters),
		secretKey:           providerSecretKey(options.ProviderSecretEncryptionKey),
		requireSecretKey:    options.RequireProviderSecretEncryptionKey,
		secretKeyConfigured: providerSecretKeyConfigured(options.ProviderSecretEncryptionKey),
	}
}

func (service *Service) GetViewer(ctx context.Context, envelope contracts.BridgeEnvelope) (contracts.Viewer, error) {
	principalID := principalID(envelope)
	if err := service.bootstrapViewer(ctx, envelope); err != nil {
		return contracts.Viewer{}, err
	}
	viewer, err := service.viewer(ctx, principalID, authContextProjectID(envelope))
	if err != nil {
		return contracts.Viewer{}, err
	}
	return viewer, nil
}

func (service *Service) ListOrganizations(ctx context.Context, envelope contracts.BridgeEnvelope) ([]contracts.Organization, error) {
	viewer, err := service.GetViewer(ctx, envelope)
	if err != nil {
		return nil, err
	}
	return viewer.Organizations, nil
}

func (service *Service) GetOrganization(ctx context.Context, request contracts.OrganizationGetRequest) (*contracts.Organization, error) {
	if strings.TrimSpace(request.OrganizationID) == "" {
		return nil, validationError("organizationId is required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	membership, ok, err := service.store.GetMembership(ctx, request.OrganizationID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, forbiddenError("viewer is not a member of organization")
	}
	organization, ok, err := service.store.GetOrganization(ctx, request.OrganizationID)
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, nil
	}
	result, err := service.organizationForMembership(ctx, organization, membership)
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (service *Service) ListProjects(ctx context.Context, request contracts.ProjectListRequest) ([]contracts.Project, error) {
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	organizationIDs, err := service.accessibleOrganizationIDs(ctx, principalID(request.BridgeEnvelope), request.OrganizationID)
	if err != nil {
		return nil, err
	}
	items := []contracts.Project{}
	for _, organizationID := range organizationIDs {
		projects, err := service.store.ListProjects(ctx, &organizationID, request.Status)
		if err != nil {
			return nil, storageError()
		}
		for _, project := range projects {
			items = append(items, contractProject(project))
		}
	}
	return items, nil
}

func (service *Service) ListProjectsForService(ctx context.Context, request contracts.ProjectListForServiceRequest) (contracts.ProjectListForServiceData, error) {
	if err := validateServiceProjectScope(request.ServiceScope); err != nil {
		return contracts.ProjectListForServiceData{}, err
	}
	if !serviceScopedEnumerationAccess(request.BridgeEnvelope, request.ServiceScope) {
		return contracts.ProjectListForServiceData{}, forbiddenError("service scope is not allowed to enumerate projects")
	}
	status := contracts.ProjectStatusActive
	if request.Status != nil {
		status = *request.Status
	}
	if err := validateProjectStatus(status); err != nil {
		return contracts.ProjectListForServiceData{}, err
	}
	limit := 100
	if request.Limit != nil {
		limit = *request.Limit
	}
	if limit < 1 || limit > 500 {
		return contracts.ProjectListForServiceData{}, validationError("limit must be between 1 and 500")
	}
	records, err := service.store.ListProjects(ctx, nil, &status)
	if err != nil {
		return contracts.ProjectListForServiceData{}, storageError()
	}
	sort.Slice(records, func(i, j int) bool {
		return records[i].ID < records[j].ID
	})
	cursor := strings.TrimSpace(pointerString(request.Cursor))
	items := make([]contracts.ServiceProject, 0, limit)
	var nextCursor *string
	for _, project := range records {
		if cursor != "" && project.ID <= cursor {
			continue
		}
		if len(items) == limit {
			nextCursor = &items[len(items)-1].ProjectID
			break
		}
		items = append(items, contracts.ServiceProject{
			ProjectID: project.ID,
			CompanyID: project.OrganizationID,
			TenantID:  tenantIDForProject(project.OrganizationID),
			Status:    project.Status,
			ChangedAt: project.ChangedAt,
		})
	}
	return contracts.ProjectListForServiceData{Items: items, NextCursor: nextCursor}, nil
}

func (service *Service) GetProject(ctx context.Context, request contracts.ProjectGetRequest) (*contracts.Project, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	result := contractProject(project)
	return &result, nil
}

func (service *Service) CreateProject(ctx context.Context, request contracts.ProjectCreateRequest) (contracts.Project, error) {
	if strings.TrimSpace(request.OrganizationID) == "" || strings.TrimSpace(request.Name) == "" || strings.TrimSpace(request.Slug) == "" {
		return contracts.Project{}, validationError("organizationId, name, and slug are required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return contracts.Project{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, request.OrganizationID); err != nil {
		return contracts.Project{}, err
	}
	now := service.now().UTC()
	project := ports.ProjectRecord{
		ID:             "project-" + normalizeID(request.Slug),
		OrganizationID: request.OrganizationID,
		Name:           strings.TrimSpace(request.Name),
		Slug:           normalizeID(request.Slug),
		Status:         contracts.ProjectStatusActive,
		ChangedAt:      now,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := service.store.PutProject(ctx, project); err != nil {
		return contracts.Project{}, storageError()
	}
	return contractProject(project), nil
}

func (service *Service) UpdateProject(ctx context.Context, request contracts.ProjectUpdateRequest) (contracts.Project, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.Project{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, project.OrganizationID); err != nil {
		return contracts.Project{}, err
	}
	if isLocalSelfObservabilityProject(project) && isSelfObservabilityProjectChange(project, request) {
		return contracts.Project{}, forbiddenError("local self-observability project is fixed")
	}
	if request.Name != nil && strings.TrimSpace(*request.Name) != "" {
		project.Name = strings.TrimSpace(*request.Name)
	}
	if request.Status != nil {
		if err := validateProjectStatus(*request.Status); err != nil {
			return contracts.Project{}, err
		}
		if project.Status != *request.Status {
			project.Status = *request.Status
			project.ChangedAt = service.now().UTC()
			service.statusChanges = append(service.statusChanges, contracts.ProjectStatusChangedNotification{
				BridgeEnvelope: request.BridgeEnvelope,
				CompanyID:      project.OrganizationID,
				ProjectID:      project.ID,
				Status:         project.Status,
				ChangedAt:      project.ChangedAt,
			})
		}
	}
	project.UpdatedAt = service.now().UTC()
	if err := service.store.PutProject(ctx, project); err != nil {
		return contracts.Project{}, storageError()
	}
	return contractProject(project), nil
}

func (service *Service) SelectProject(ctx context.Context, request contracts.ProjectSelectRequest) (contracts.Viewer, error) {
	if strings.TrimSpace(request.ProjectID) == "" {
		return contracts.Viewer{}, validationError("projectId is required")
	}
	if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID); err != nil {
		return contracts.Viewer{}, err
	}
	selected := request.ProjectID
	return service.viewer(ctx, principalID(request.BridgeEnvelope), &selected)
}

func (service *Service) ListMembers(ctx context.Context, request contracts.MemberListRequest) ([]contracts.OrganizationMember, error) {
	if strings.TrimSpace(request.OrganizationID) == "" {
		return nil, validationError("organizationId is required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	if _, ok, err := service.store.GetMembership(ctx, request.OrganizationID, principalID(request.BridgeEnvelope)); err != nil {
		return nil, storageError()
	} else if !ok {
		return nil, forbiddenError("viewer is not a member of organization")
	}
	memberships, err := service.store.ListMemberships(ctx, request.OrganizationID)
	if err != nil {
		return nil, storageError()
	}
	items := make([]contracts.OrganizationMember, 0, len(memberships))
	for _, membership := range memberships {
		user, ok, err := service.store.GetUser(ctx, membership.UserID)
		if err != nil {
			return nil, storageError()
		}
		if !ok {
			continue
		}
		items = append(items, contracts.OrganizationMember{User: contractUser(user), Role: membership.Role})
	}
	sort.Slice(items, func(i, j int) bool {
		left := strings.ToLower(optionalString(items[i].User.Email))
		right := strings.ToLower(optionalString(items[j].User.Email))
		if left != right {
			return left < right
		}
		return items[i].User.ID < items[j].User.ID
	})
	return items, nil
}

func (service *Service) ListInvitations(ctx context.Context, request contracts.InvitationListRequest) ([]contracts.OrganizationInvitation, error) {
	if strings.TrimSpace(request.OrganizationID) == "" {
		return nil, validationError("organizationId is required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, request.OrganizationID); err != nil {
		return nil, err
	}
	records, err := service.store.ListInvitations(ctx, request.OrganizationID)
	if err != nil {
		return nil, storageError()
	}
	items := make([]contracts.OrganizationInvitation, 0, len(records))
	for _, record := range records {
		items = append(items, contractInvitation(record))
	}
	return items, nil
}

func (service *Service) CreateInvitation(ctx context.Context, request contracts.InvitationCreateRequest) (contracts.OrganizationInvitation, error) {
	if strings.TrimSpace(request.OrganizationID) == "" {
		return contracts.OrganizationInvitation{}, validationError("organizationId is required")
	}
	email, err := normalizeEmail(request.Email)
	if err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, request.OrganizationID); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if _, ok, err := service.store.GetPendingInvitationByEmail(ctx, request.OrganizationID, email); err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	} else if ok {
		return contracts.OrganizationInvitation{}, validationError("pending invitation already exists")
	}
	if err := service.requireEmailNotActiveMember(ctx, request.OrganizationID, email); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	existing, err := service.store.ListInvitations(ctx, request.OrganizationID)
	if err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	now := service.now().UTC()
	record := ports.InvitationRecord{
		ID:              fmt.Sprintf("invitation-%s-%d", normalizeID(request.OrganizationID), len(existing)+1),
		OrganizationID:  request.OrganizationID,
		Email:           email,
		Role:            contracts.CompanyRoleUser,
		Status:          contracts.OrganizationInvitationStatusPending,
		InvitedByUserID: principalID(request.BridgeEnvelope),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	delivery, err := service.prepareInvitationEmailDelivery(ctx, &record, ports.EmailDeliveryKindOrganizationInvitation, nil, nil)
	if err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.store.PutInvitationAndEmailDelivery(ctx, record, delivery); err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	return contractInvitation(record), nil
}

func (service *Service) ResendInvitation(ctx context.Context, request contracts.InvitationResendRequest) (contracts.OrganizationInvitation, error) {
	if strings.TrimSpace(request.InvitationID) == "" {
		return contracts.OrganizationInvitation{}, validationError("invitationId is required")
	}
	invitation, ok, err := service.store.GetInvitation(ctx, request.InvitationID)
	if err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	if !ok {
		return contracts.OrganizationInvitation{}, forbiddenError("invitation is not accessible")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, invitation.OrganizationID); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if invitation.Status != contracts.OrganizationInvitationStatusPending {
		return contracts.OrganizationInvitation{}, forbiddenError("only pending invitations can be resent")
	}
	kind := ports.EmailDeliveryKindOrganizationInvitation
	var projectID *string
	if len(invitation.ProjectGrants) > 0 {
		kind = ports.EmailDeliveryKindProjectAccess
		for _, grant := range invitation.ProjectGrants {
			if grant.Status == contracts.InvitationProjectGrantStatusPending {
				projectID = &grant.ProjectID
				break
			}
		}
	}
	delivery, err := service.prepareInvitationEmailDelivery(ctx, &invitation, kind, projectID, nil)
	if err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.store.PutInvitationAndEmailDelivery(ctx, invitation, delivery); err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	return contractInvitation(invitation), nil
}

func (service *Service) RevokeInvitation(ctx context.Context, request contracts.InvitationRevokeRequest) (contracts.OrganizationInvitation, error) {
	if strings.TrimSpace(request.InvitationID) == "" {
		return contracts.OrganizationInvitation{}, validationError("invitationId is required")
	}
	invitation, ok, err := service.store.GetInvitation(ctx, request.InvitationID)
	if err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	if !ok {
		return contracts.OrganizationInvitation{}, forbiddenError("invitation is not accessible")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, invitation.OrganizationID); err != nil {
		return contracts.OrganizationInvitation{}, err
	}
	switch invitation.Status {
	case contracts.OrganizationInvitationStatusPending:
		now := service.now().UTC()
		invitation.Status = contracts.OrganizationInvitationStatusRevoked
		invitation.RevokedAt = &now
		invitation.UpdatedAt = now
		for index := range invitation.ProjectGrants {
			if invitation.ProjectGrants[index].Status == contracts.InvitationProjectGrantStatusPending {
				invitation.ProjectGrants[index].Status = contracts.InvitationProjectGrantStatusRevoked
			}
		}
		if err := service.store.PutInvitation(ctx, invitation); err != nil {
			return contracts.OrganizationInvitation{}, storageError()
		}
	case contracts.OrganizationInvitationStatusRevoked:
		return contractInvitation(invitation), nil
	case contracts.OrganizationInvitationStatusAccepted:
		return contracts.OrganizationInvitation{}, forbiddenError("accepted invitations cannot be revoked")
	default:
		return contracts.OrganizationInvitation{}, forbiddenError("invitation cannot be revoked")
	}
	return contractInvitation(invitation), nil
}

func (service *Service) UpdateMember(ctx context.Context, request contracts.MemberUpdateRequest) (contracts.OrganizationMember, error) {
	if strings.TrimSpace(request.OrganizationID) == "" || strings.TrimSpace(request.UserID) == "" {
		return contracts.OrganizationMember{}, validationError("organizationId and userId are required")
	}
	if err := validateRole(request.Role); err != nil {
		return contracts.OrganizationMember{}, err
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return contracts.OrganizationMember{}, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, request.OrganizationID); err != nil {
		return contracts.OrganizationMember{}, err
	}
	current, ok, err := service.store.GetMembership(ctx, request.OrganizationID, request.UserID)
	if err != nil {
		return contracts.OrganizationMember{}, storageError()
	}
	if !ok {
		return contracts.OrganizationMember{}, validationError("member does not exist")
	}
	if ok && current.Role == contracts.CompanyRoleAdmin && request.Role != contracts.CompanyRoleAdmin {
		if err := service.requireAnotherAdmin(ctx, request.OrganizationID, request.UserID); err != nil {
			return contracts.OrganizationMember{}, err
		}
	}
	user, ok, err := service.store.GetUser(ctx, request.UserID)
	if err != nil {
		return contracts.OrganizationMember{}, storageError()
	}
	if !ok {
		return contracts.OrganizationMember{}, validationError("member user does not exist")
	}
	now := service.now().UTC()
	current.Role = request.Role
	current.UpdatedAt = now
	if err := service.store.PutMembership(ctx, current); err != nil {
		return contracts.OrganizationMember{}, storageError()
	}
	return contracts.OrganizationMember{User: contractUser(user), Role: current.Role}, nil
}

func (service *Service) RemoveMember(ctx context.Context, request contracts.MemberRemoveRequest) (bool, error) {
	if strings.TrimSpace(request.OrganizationID) == "" || strings.TrimSpace(request.UserID) == "" {
		return false, validationError("organizationId and userId are required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return false, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, request.OrganizationID); err != nil {
		return false, err
	}
	current, ok, err := service.store.GetMembership(ctx, request.OrganizationID, request.UserID)
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return false, nil
	}
	if current.Role == contracts.CompanyRoleAdmin {
		if err := service.requireAnotherAdmin(ctx, request.OrganizationID, request.UserID); err != nil {
			return false, err
		}
	}
	if err := service.store.DeleteMembership(ctx, request.OrganizationID, request.UserID); err != nil {
		return false, storageError()
	}
	if err := service.store.DeleteProjectMembershipsForUserInOrganization(ctx, request.OrganizationID, request.UserID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) ListProjectMembers(ctx context.Context, request contracts.ProjectMemberListRequest) ([]contracts.ProjectMember, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	direct, err := service.store.ListProjectMembers(ctx, project.ID)
	if err != nil {
		return nil, storageError()
	}
	memberships, err := service.store.ListMemberships(ctx, project.OrganizationID)
	if err != nil {
		return nil, storageError()
	}
	items := []contracts.ProjectMember{}
	impliedUsers := map[string]struct{}{}
	for _, membership := range memberships {
		if membership.Role != contracts.CompanyRoleAdmin {
			continue
		}
		source := contracts.ProjectMemberSourceCompanyAdmin
		if isLocalPersonalProject(project.ID, project.OrganizationID, membership.UserID) {
			source = contracts.ProjectMemberSourceLocalPersonal
		}
		member, err := service.impliedProjectMember(ctx, project.ID, membership, source)
		if err != nil {
			return nil, err
		}
		items = append(items, member)
		impliedUsers[membership.UserID] = struct{}{}
	}
	for _, record := range direct {
		if _, implied := impliedUsers[record.UserID]; implied {
			continue
		}
		member, err := service.contractProjectMember(ctx, record, contracts.ProjectMemberSourceDirect)
		if err != nil {
			return nil, err
		}
		items = append(items, member)
	}
	sortProjectMembers(items)
	return items, nil
}

func (service *Service) UpdateProjectMember(ctx context.Context, request contracts.ProjectMemberUpdateRequest) (contracts.ProjectMember, error) {
	if strings.TrimSpace(request.ProjectID) == "" || strings.TrimSpace(request.UserID) == "" {
		return contracts.ProjectMember{}, validationError("projectId and userId are required")
	}
	if err := validateProjectRole(request.Role); err != nil {
		return contracts.ProjectMember{}, err
	}
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.ProjectMember{}, err
	}
	if isLocalPersonalProject(project.ID, project.OrganizationID, request.UserID) && request.Role != contracts.ProjectRoleAdmin {
		return contracts.ProjectMember{}, forbiddenError("local Personal project admin cannot be demoted")
	}
	if _, ok, err := service.store.GetMembership(ctx, project.OrganizationID, request.UserID); err != nil {
		return contracts.ProjectMember{}, storageError()
	} else if !ok {
		return contracts.ProjectMember{}, forbiddenError("user is not a member of project organization")
	}
	current, ok, err := service.store.GetProjectMember(ctx, project.ID, request.UserID)
	if err != nil {
		return contracts.ProjectMember{}, storageError()
	}
	if ok && current.Role == contracts.ProjectRoleAdmin && request.Role != contracts.ProjectRoleAdmin {
		if err := service.requireAnotherProjectAdminOrCompanyAdmin(ctx, project, request.UserID); err != nil {
			return contracts.ProjectMember{}, err
		}
	}
	now := service.now().UTC()
	actor := principalID(request.BridgeEnvelope)
	if !ok {
		current = ports.ProjectMemberRecord{
			ProjectID:       project.ID,
			UserID:          request.UserID,
			CreatedAt:       now,
			CreatedByUserID: actor,
		}
	}
	current.Role = request.Role
	current.UpdatedAt = now
	current.UpdatedByUserID = actor
	if err := service.store.PutProjectMember(ctx, current); err != nil {
		return contracts.ProjectMember{}, storageError()
	}
	return service.contractProjectMember(ctx, current, contracts.ProjectMemberSourceDirect)
}

func (service *Service) CreateProjectInvitation(ctx context.Context, request contracts.ProjectInvitationCreateRequest) (contracts.ProjectInvitationData, error) {
	if strings.TrimSpace(request.ProjectID) == "" {
		return contracts.ProjectInvitationData{}, validationError("projectId is required")
	}
	email, err := normalizeEmail(request.Email)
	if err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	if err := validateProjectRole(request.Role); err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	membership, user, ok, err := service.findActiveMemberByEmail(ctx, project.OrganizationID, email)
	if err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	if ok {
		member, err := service.createOrUpdateProjectMemberForActiveUser(ctx, request.BridgeEnvelope, project, membership, user, request.Role)
		if err != nil {
			return contracts.ProjectInvitationData{}, err
		}
		return contracts.ProjectInvitationData{
			Outcome:       contracts.ProjectInvitationOutcomeMembershipCreated,
			ProjectMember: &member,
		}, nil
	}

	invitation, created, err := service.pendingInvitationForProjectGrant(ctx, project, email, principalID(request.BridgeEnvelope))
	if err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	now := service.now().UTC()
	grantUpdated := false
	for index := range invitation.ProjectGrants {
		grant := &invitation.ProjectGrants[index]
		if grant.ProjectID != project.ID {
			continue
		}
		if grant.Status == contracts.InvitationProjectGrantStatusPending {
			grant.Role = request.Role
			grant.CreatedAt = now
			grant.CreatedByUserID = principalID(request.BridgeEnvelope)
			grantUpdated = true
			break
		}
	}
	if !grantUpdated {
		invitation.ProjectGrants = append(invitation.ProjectGrants, contracts.InvitationProjectGrant{
			ProjectID:       project.ID,
			Role:            request.Role,
			Status:          contracts.InvitationProjectGrantStatusPending,
			CreatedAt:       now,
			CreatedByUserID: principalID(request.BridgeEnvelope),
		})
	}
	if !created {
		invitation.UpdatedAt = now
	}
	delivery, err := service.prepareInvitationEmailDelivery(ctx, &invitation, ports.EmailDeliveryKindProjectAccess, &project.ID, nil)
	if err != nil {
		return contracts.ProjectInvitationData{}, err
	}
	if err := service.store.PutInvitationAndEmailDelivery(ctx, invitation, delivery); err != nil {
		return contracts.ProjectInvitationData{}, storageError()
	}
	contract := contractInvitation(invitation)
	return contracts.ProjectInvitationData{
		Outcome:    contracts.ProjectInvitationOutcomeInvitationPending,
		Invitation: &contract,
	}, nil
}

func (service *Service) RemoveProjectMember(ctx context.Context, request contracts.ProjectMemberRemoveRequest) (bool, error) {
	if strings.TrimSpace(request.ProjectID) == "" || strings.TrimSpace(request.UserID) == "" {
		return false, validationError("projectId and userId are required")
	}
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return false, err
	}
	if isLocalPersonalProject(project.ID, project.OrganizationID, request.UserID) {
		return false, forbiddenError("local Personal project admin cannot be removed")
	}
	if membership, ok, err := service.store.GetMembership(ctx, project.OrganizationID, request.UserID); err != nil {
		return false, storageError()
	} else if ok && membership.Role == contracts.CompanyRoleAdmin {
		return false, forbiddenError("company admin project fallback cannot be removed")
	}
	current, ok, err := service.store.GetProjectMember(ctx, project.ID, request.UserID)
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return true, nil
	}
	if current.Role == contracts.ProjectRoleAdmin {
		if err := service.requireAnotherProjectAdminOrCompanyAdmin(ctx, project, request.UserID); err != nil {
			return false, err
		}
	}
	if err := service.store.DeleteProjectMember(ctx, project.ID, request.UserID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) GetRetentionPolicy(ctx context.Context, request contracts.RetentionGetRequest) (contracts.RetentionPolicy, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.RetentionPolicy{}, err
	}
	return service.retentionPolicy(ctx, project.ID, principalID(request.BridgeEnvelope))
}

func (service *Service) UpdateRetentionPolicy(ctx context.Context, request contracts.RetentionUpdateRequest) (contracts.RetentionPolicy, error) {
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.RetentionPolicy{}, err
	}
	if err := validateRetentionRules(request.Rules); err != nil {
		return contracts.RetentionPolicy{}, err
	}
	current, err := service.retentionPolicyRecord(ctx, project.ID, principalID(request.BridgeEnvelope))
	if err != nil {
		return contracts.RetentionPolicy{}, err
	}
	if request.ExpectedVersion != current.Version {
		return contracts.RetentionPolicy{}, forbiddenError("retention policy version is stale")
	}
	now := service.now().UTC()
	actor := principalID(request.BridgeEnvelope)
	rules := make([]ports.RetentionRuleRecord, 0, len(request.Rules))
	for _, input := range request.Rules {
		rules = append(rules, ports.RetentionRuleRecord{
			DataClass:       input.DataClass,
			Mode:            input.Mode,
			RetentionDays:   copyInt(input.RetentionDays),
			SoftDeleteDays:  copyInt(input.SoftDeleteDays),
			UpdatedAt:       now,
			UpdatedByUserID: actor,
			Version:         current.Version + 1,
		})
	}
	updated := ports.RetentionPolicyRecord{
		ProjectID:       project.ID,
		Rules:           rules,
		UpdatedAt:       now,
		UpdatedByUserID: actor,
		Version:         current.Version + 1,
	}
	if err := service.store.PutRetentionPolicy(ctx, updated); err != nil {
		return contracts.RetentionPolicy{}, storageError()
	}
	return contractRetentionPolicy(updated), nil
}

func (service *Service) GetProjectAiSettings(ctx context.Context, request contracts.ProjectAiSettingsGetRequest) (map[string]any, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	return service.projectAiSettings(ctx, project.ID, principalID(request.BridgeEnvelope))
}

func (service *Service) UpdateProjectAiSettings(ctx context.Context, request contracts.ProjectAiSettingsUpdateRequest) (map[string]any, error) {
	projectID, ok := stringFromMap(request.Input, "projectId")
	if !ok {
		return nil, validationError("projectId is required")
	}
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, projectID)
	if err != nil {
		return nil, err
	}
	current, err := service.projectAiSettingsRecord(ctx, project.ID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	expectedVersion := request.ExpectedVersion
	if expectedVersion == nil {
		if value, ok := intFromMap(request.Input, "expectedVersion"); ok {
			expectedVersion = &value
		}
	}
	if expectedVersion == nil || *expectedVersion != current.Version {
		return nil, forbiddenError("project AI settings version is stale")
	}
	updated, err := normalizeProjectAiSettingsInput(request.Input, project.ID, service.now().UTC(), principalID(request.BridgeEnvelope), current.Version+1)
	if err != nil {
		return nil, err
	}
	record := ports.ProjectAiSettingsRecord{
		ProjectID:       project.ID,
		Settings:        updated,
		UpdatedAt:       service.now().UTC(),
		UpdatedByUserID: principalID(request.BridgeEnvelope),
		Version:         current.Version + 1,
	}
	if err := service.store.PutProjectAiSettings(ctx, record); err != nil {
		return nil, storageError()
	}
	return cloneAnyMap(updated), nil
}

func (service *Service) GetProjectAiProviderSettings(ctx context.Context, request contracts.ProjectAiProviderSettingsGetRequest) (map[string]any, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	settings, err := service.projectAiSettings(ctx, project.ID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	return projectAiProviderSettingsFromProjectSettings(project, settings, service.now().UTC(), principalID(request.BridgeEnvelope)), nil
}

func (service *Service) UpdateProjectAiProviderSettings(ctx context.Context, request contracts.ProjectAiProviderSettingsUpdateRequest) (map[string]any, error) {
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	current, err := service.projectAiSettingsRecord(ctx, project.ID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	if request.ExpectedVersion != current.Version {
		return nil, forbiddenError("project AI provider settings version is stale")
	}
	now := service.now().UTC()
	profiles, err := service.normalizeProjectProviderProfilesStrict(ctx, request.ProviderProfiles, project.OrganizationID, project.ID, now, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	aliases, err := normalizeProjectModelAliasesStrict(request.ModelAliases, project.OrganizationID, project.ID, now, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	updated := cloneAnyMap(current.Settings)
	updated["projectId"] = project.ID
	updated["providerProfiles"] = profiles
	updated["modelAliases"] = aliases
	updated["version"] = current.Version + 1
	updated["updatedAt"] = now
	updated["updatedByUserId"] = principalID(request.BridgeEnvelope)
	updated["effective"] = effectiveProjectAiSettings(updated)
	record := ports.ProjectAiSettingsRecord{
		ProjectID:       project.ID,
		Settings:        updated,
		UpdatedAt:       now,
		UpdatedByUserID: principalID(request.BridgeEnvelope),
		Version:         current.Version + 1,
	}
	if err := service.store.PutProjectAiSettings(ctx, record); err != nil {
		return nil, storageError()
	}
	return projectAiProviderSettingsFromProjectSettings(project, updated, now, principalID(request.BridgeEnvelope)), nil
}

func (service *Service) GetCompanyAiProviderSettings(ctx context.Context, request contracts.CompanyAiProviderSettingsGetRequest) (map[string]any, error) {
	companyID := strings.TrimSpace(request.CompanyID)
	if companyID == "" {
		return nil, validationError("companyId is required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	if _, ok, err := service.store.GetMembership(ctx, companyID, principalID(request.BridgeEnvelope)); err != nil {
		return nil, storageError()
	} else if !ok {
		return nil, forbiddenError("viewer is not a member of company")
	}
	record, err := service.companyAiProviderSettingsRecord(ctx, companyID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	return companyAiProviderSettingsFromRecord(record, service.now().UTC(), principalID(request.BridgeEnvelope)), nil
}

func (service *Service) UpdateCompanyAiProviderSettings(ctx context.Context, request contracts.CompanyAiProviderSettingsUpdateRequest) (map[string]any, error) {
	companyID := strings.TrimSpace(request.CompanyID)
	if companyID == "" {
		return nil, validationError("companyId is required")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	if err := service.requireAdmin(ctx, request.BridgeEnvelope, companyID); err != nil {
		return nil, err
	}
	current, err := service.companyAiProviderSettingsRecord(ctx, companyID, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	if request.ExpectedVersion != current.Version {
		return nil, forbiddenError("company AI provider settings version is stale")
	}
	if containsSecretLookingKeyExceptCredentialValue(request.ProviderProfile) || containsSecretLookingKey(request.ChatModelAlias) {
		return nil, validationError("company AI provider settings must not contain raw secret-looking fields")
	}
	now := service.now().UTC()
	settings := defaultCompanyAiProviderSettings(companyID, now, principalID(request.BridgeEnvelope), current.Version+1)
	profile, err := service.normalizeCompanyAiProviderProfile(ctx, request.ProviderProfile, companyID, now, principalID(request.BridgeEnvelope))
	if err != nil {
		return nil, err
	}
	settings["chatProviderProfile"] = profile
	settings["chatModelAlias"] = normalizeCompanyChatModelAlias(request.ChatModelAlias, companyID, now, principalID(request.BridgeEnvelope))
	settings["effective"] = effectiveCompanyAiProviderSettings(profile)
	record := ports.CompanyAiProviderSettingsRecord{
		CompanyID:       companyID,
		Settings:        settings,
		UpdatedAt:       now,
		UpdatedByUserID: principalID(request.BridgeEnvelope),
		Version:         current.Version + 1,
	}
	if err := service.store.PutCompanyAiProviderSettings(ctx, record); err != nil {
		return nil, storageError()
	}
	return companyAiProviderSettingsFromRecord(record, now, principalID(request.BridgeEnvelope)), nil
}

func (service *Service) ResolveAiProviderSecret(ctx context.Context, request contracts.AiProviderSecretResolveRequest) (map[string]any, error) {
	ref := strings.TrimSpace(request.CredentialRef)
	if !strings.HasPrefix(ref, "managed:") {
		return nil, validationError("credentialRef must use managed:")
	}
	parts := strings.Split(ref, "/")
	if len(parts) != 3 {
		return nil, validationError("managed credentialRef is invalid")
	}
	scope := strings.TrimPrefix(parts[0], "managed:")
	ownerID := parts[1]
	providerID := parts[2]
	if scope != "company" && scope != "project" {
		return nil, validationError("managed credentialRef scope is invalid")
	}
	var companyID string
	var projectID string
	switch scope {
	case "company":
		companyID = ownerID
		if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
			return nil, err
		}
		if _, ok, err := service.store.GetMembership(ctx, companyID, principalID(request.BridgeEnvelope)); err != nil {
			return nil, storageError()
		} else if !ok {
			return nil, forbiddenError("viewer is not a member of company")
		}
	case "project":
		projectID = ownerID
		project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, projectID)
		if err != nil {
			return nil, err
		}
		companyID = project.OrganizationID
	}
	record, ok, err := service.store.GetAiProviderSecret(ctx, managedAiProviderSecretID(scope, companyID, projectID, providerID))
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, validationError("managed credentialRef was not found")
	}
	value, err := service.decryptAiProviderSecret(record)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"credentialRef": ref,
		"value":         value,
	}, nil
}

func (service *Service) GetAiChatHistory(ctx context.Context, request contracts.AiChatHistoryRequest) (map[string]any, error) {
	companyID := strings.TrimSpace(request.CompanyID)
	if companyID == "" {
		return nil, validationError("companyId is required")
	}
	userID := strings.TrimSpace(request.UserID)
	if userID == "" {
		userID = principalID(request.BridgeEnvelope)
	}
	if userID == "" || userID != principalID(request.BridgeEnvelope) {
		return nil, forbiddenError("AI Chat history user must match the authenticated principal")
	}
	if err := service.bootstrapViewer(ctx, request.BridgeEnvelope); err != nil {
		return nil, err
	}
	membership, ok, err := service.store.GetMembership(ctx, companyID, userID)
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, forbiddenError("viewer is not a member of company")
	}
	if request.ProjectID != nil && strings.TrimSpace(*request.ProjectID) != "" {
		selectedProjectID := strings.TrimSpace(*request.ProjectID)
		if err := requireAiChatCurrentProject(request.BridgeEnvelope, selectedProjectID); err != nil {
			return nil, err
		}
		if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, selectedProjectID); err != nil {
			return nil, err
		}
	}
	_ = membership
	limit := 50
	if request.First != nil {
		limit = *request.First
	}
	if limit < 1 || limit > 100 {
		return nil, validationError("first must be between 1 and 100")
	}
	var projectID *string
	if request.ProjectID != nil && strings.TrimSpace(*request.ProjectID) != "" {
		trimmed := strings.TrimSpace(*request.ProjectID)
		projectID = &trimmed
	}
	conversations, err := service.store.ListAiChatConversations(ctx, companyID, userID, projectID, request.IncludeArchived, limit)
	if err != nil {
		return nil, storageError()
	}
	groups := map[string][]any{}
	projectNames := map[string]string{}
	for _, conversation := range conversations {
		groups[conversation.ProjectID] = append(groups[conversation.ProjectID], contractAiChatConversation(conversation, nil))
		if _, known := projectNames[conversation.ProjectID]; !known {
			if project, ok, err := service.store.GetProject(ctx, conversation.ProjectID); err != nil {
				return nil, storageError()
			} else if ok {
				projectNames[conversation.ProjectID] = project.Name
			} else {
				projectNames[conversation.ProjectID] = conversation.ProjectID
			}
		}
	}
	projectGroups := []any{}
	for projectID, items := range groups {
		projectName := projectNames[projectID]
		if strings.TrimSpace(projectName) == "" {
			projectName = projectID
		}
		projectGroups = append(projectGroups, map[string]any{"projectId": projectID, "projectName": projectName, "conversations": items})
	}
	sort.Slice(projectGroups, func(i, j int) bool {
		left := projectGroups[i].(map[string]any)["projectId"].(string)
		right := projectGroups[j].(map[string]any)["projectId"].(string)
		if projectID != nil {
			if left == *projectID {
				return true
			}
			if right == *projectID {
				return false
			}
		}
		return left < right
	})
	return map[string]any{
		"companyId":     companyID,
		"userId":        userID,
		"projectGroups": projectGroups,
		"pageInfo": map[string]any{
			"hasNextPage": false,
			"endCursor":   nil,
		},
	}, nil
}

func (service *Service) GetAiChatConversation(ctx context.Context, request contracts.AiChatConversationGetRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ConversationID) == "" {
		return nil, validationError("conversationId is required")
	}
	conversation, ok, err := service.store.GetAiChatConversation(ctx, strings.TrimSpace(request.ConversationID))
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, nil
	}
	if conversation.UserID != principalID(request.BridgeEnvelope) {
		return nil, forbiddenError("AI Chat conversation user must match the authenticated principal")
	}
	if err := requireAiChatCurrentProject(request.BridgeEnvelope, conversation.ProjectID); err != nil {
		return nil, err
	}
	if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, conversation.ProjectID); err != nil {
		return nil, err
	}
	messages, err := service.store.ListAiChatMessages(ctx, conversation.ID, 200)
	if err != nil {
		return nil, storageError()
	}
	return contractAiChatConversation(conversation, messages), nil
}

func (service *Service) requireAiChatConversationAccess(ctx context.Context, envelope contracts.BridgeEnvelope, conversationID string) (ports.AiChatConversationRecord, error) {
	if strings.TrimSpace(conversationID) == "" {
		return ports.AiChatConversationRecord{}, validationError("conversationId is required")
	}
	conversation, ok, err := service.store.GetAiChatConversation(ctx, strings.TrimSpace(conversationID))
	if err != nil {
		return ports.AiChatConversationRecord{}, storageError()
	}
	if !ok {
		return ports.AiChatConversationRecord{}, notFoundError("AI Chat conversation")
	}
	if conversation.UserID != principalID(envelope) {
		return ports.AiChatConversationRecord{}, forbiddenError("AI Chat conversation user must match the authenticated principal")
	}
	if err := requireAiChatCurrentProject(envelope, conversation.ProjectID); err != nil {
		return ports.AiChatConversationRecord{}, err
	}
	if _, err := service.requireProjectAccess(ctx, envelope, conversation.ProjectID); err != nil {
		return ports.AiChatConversationRecord{}, err
	}
	return conversation, nil
}

func (service *Service) requireAiChatActionAccess(ctx context.Context, envelope contracts.BridgeEnvelope, actionID string) (ports.AiChatActionRecord, ports.AiChatConversationRecord, error) {
	if strings.TrimSpace(actionID) == "" {
		return ports.AiChatActionRecord{}, ports.AiChatConversationRecord{}, validationError("actionId is required")
	}
	action, ok, err := service.store.GetAiChatAction(ctx, strings.TrimSpace(actionID))
	if err != nil {
		return ports.AiChatActionRecord{}, ports.AiChatConversationRecord{}, storageError()
	}
	if !ok {
		return ports.AiChatActionRecord{}, ports.AiChatConversationRecord{}, notFoundError("AI Chat action")
	}
	conversation, err := service.requireAiChatConversationAccess(ctx, envelope, action.ConversationID)
	if err != nil {
		return ports.AiChatActionRecord{}, ports.AiChatConversationRecord{}, err
	}
	if action.ProjectID != conversation.ProjectID {
		return ports.AiChatActionRecord{}, ports.AiChatConversationRecord{}, forbiddenError("AI Chat action project must match the conversation project")
	}
	return action, conversation, nil
}

func (service *Service) CreateAiChatConversation(ctx context.Context, request contracts.AiChatConversationCreateRequest) (map[string]any, error) {
	if strings.TrimSpace(request.CompanyID) == "" || strings.TrimSpace(request.ProjectID) == "" || strings.TrimSpace(request.UserID) == "" || strings.TrimSpace(request.FirstUserMessage) == "" {
		return nil, validationError("AI Chat conversation create requires company, project, user, and first message fields")
	}
	if request.UserID != principalID(request.BridgeEnvelope) {
		return nil, forbiddenError("AI Chat conversation user must match the authenticated principal")
	}
	if err := requireAiChatCurrentProject(request.BridgeEnvelope, request.ProjectID); err != nil {
		return nil, err
	}
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	if project.OrganizationID != request.CompanyID {
		return nil, forbiddenError("project does not belong to company")
	}
	now := service.now().UTC()
	title := strings.TrimSpace(pointerString(request.Title))
	if title == "" {
		title = strings.TrimSpace(request.FirstUserMessage)
	}
	if len(title) > 80 {
		title = title[:80]
	}
	conversation := ports.AiChatConversationRecord{
		ID:            fmt.Sprintf("chat-%s-%d", normalizeID(project.ID), now.UnixNano()),
		CompanyID:     request.CompanyID,
		ProjectID:     project.ID,
		UserID:        request.UserID,
		Title:         title,
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: now,
		LastRunStatus: string(contracts.AiChatRunStatusIdle),
		CreatedAt:     now,
		UpdatedAt:     now,
		Version:       1,
	}
	if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
		return nil, storageError()
	}
	message := ports.AiChatMessageRecord{
		ID:             fmt.Sprintf("msg-%s-1", conversation.ID),
		ConversationID: conversation.ID,
		Role:           "user",
		Parts:          []map[string]any{{"type": "text", "text": strings.TrimSpace(request.FirstUserMessage)}},
		CreatedAt:      now,
	}
	if err := service.store.PutAiChatMessage(ctx, message); err != nil {
		return nil, storageError()
	}
	return contractAiChatConversation(conversation, []ports.AiChatMessageRecord{message}), nil
}

func (service *Service) ArchiveAiChatConversation(ctx context.Context, request contracts.AiChatConversationArchiveRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.UserID) == "" {
		return nil, validationError("conversationId and userId are required")
	}
	if request.UserID != principalID(request.BridgeEnvelope) {
		return nil, forbiddenError("AI Chat conversation user must match the authenticated principal")
	}
	if request.ExpectedVersion < 1 {
		return nil, validationError("expectedVersion is required")
	}
	conversation, err := service.requireAiChatConversationAccess(ctx, request.BridgeEnvelope, request.ConversationID)
	if err != nil {
		return nil, err
	}
	if conversation.UserID != request.UserID {
		return nil, forbiddenError("AI Chat conversation user must match the conversation owner")
	}
	if request.ExpectedVersion != conversation.Version {
		return nil, forbiddenError("AI Chat conversation version is stale")
	}
	now := service.now().UTC()
	conversation.Status = contracts.AiChatConversationStatusArchived
	conversation.UpdatedAt = now
	conversation.Version++
	if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
		return nil, storageError()
	}
	messages, err := service.store.ListAiChatMessages(ctx, conversation.ID, 200)
	if err != nil {
		return nil, storageError()
	}
	return contractAiChatConversation(conversation, messages), nil
}

func (service *Service) DeleteAiChatConversation(ctx context.Context, request contracts.AiChatConversationDeleteRequest) (bool, error) {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.UserID) == "" {
		return false, validationError("conversationId and userId are required")
	}
	if request.UserID != principalID(request.BridgeEnvelope) {
		return false, forbiddenError("AI Chat conversation user must match the authenticated principal")
	}
	conversation, ok, err := service.store.GetAiChatConversation(ctx, strings.TrimSpace(request.ConversationID))
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return false, notFoundError("AI Chat conversation")
	}
	if conversation.UserID != request.UserID {
		return false, forbiddenError("AI Chat conversation user must match the conversation owner")
	}
	if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, conversation.ProjectID); err != nil {
		return false, err
	}
	if err := service.store.DeleteAiChatConversation(ctx, conversation.ID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) AppendAiChatMessage(ctx context.Context, request contracts.AiChatMessageAppendRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.RunID) == "" || strings.TrimSpace(request.Role) == "" || len(request.Parts) == 0 {
		return nil, validationError("AI Chat message append requires conversation, run, role, and parts")
	}
	if containsSecretLookingKey(map[string]any{"parts": mapsFromAnySlice(request.Parts)}) {
		return nil, validationError("AI Chat message parts must not contain raw secret-looking fields")
	}
	conversation, err := service.requireAiChatConversationAccess(ctx, request.BridgeEnvelope, request.ConversationID)
	if err != nil {
		return nil, err
	}
	run, err := service.aiChatRunForMutation(ctx, request.BridgeEnvelope, request.RunID)
	if err != nil {
		return nil, err
	}
	if run.ConversationID != conversation.ID {
		return nil, validationError("AI Chat message run does not belong to conversation")
	}
	now := service.now().UTC()
	message := ports.AiChatMessageRecord{
		ID:             fmt.Sprintf("msg-%s-%d", normalizeID(request.ConversationID), now.UnixNano()),
		ConversationID: conversation.ID,
		RunID:          run.ID,
		Role:           request.Role,
		Parts:          cloneAnyMapSlice(request.Parts),
		CreatedAt:      now,
	}
	if err := service.store.PutAiChatMessage(ctx, message); err != nil {
		return nil, storageError()
	}
	conversation.LastMessageAt = now
	conversation.UpdatedAt = now
	if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
		return nil, storageError()
	}
	return contractAiChatMessage(message), nil
}

func (service *Service) ProposeAiChatAction(ctx context.Context, request contracts.AiChatActionProposeRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.RunID) == "" || strings.TrimSpace(request.Title) == "" || strings.TrimSpace(request.Operation) == "" {
		return nil, validationError("AI Chat action proposal requires conversation, run, title, and operation")
	}
	if containsSecretLookingKey(request.Preview) {
		return nil, validationError("AI Chat action proposal preview must not contain raw secret-looking fields")
	}
	conversation, err := service.requireAiChatConversationAccess(ctx, request.BridgeEnvelope, request.ConversationID)
	if err != nil {
		return nil, err
	}
	run, err := service.aiChatRunForMutation(ctx, request.BridgeEnvelope, request.RunID)
	if err != nil {
		return nil, err
	}
	if run.ConversationID != conversation.ID {
		return nil, validationError("AI Chat action run does not belong to conversation")
	}
	now := service.now().UTC()
	action := ports.AiChatActionRecord{
		ID:               fmt.Sprintf("action-%s-%d", normalizeID(request.RunID), now.UnixNano()),
		ConversationID:   conversation.ID,
		RunID:            run.ID,
		ProjectID:        run.ProjectID,
		Risk:             contracts.AiChatActionRisk(request.Risk),
		Status:           contracts.AiChatActionStatusProposed,
		ActionKind:       request.Operation,
		InputPreview:     cloneAnyMap(request.Preview),
		RequiresApproval: true,
		IdempotencyKey:   fmt.Sprintf("%s-%d", request.RunID, now.UnixNano()),
		ExpiresAt:        now.Add(15 * time.Minute),
		CreatedAt:        now,
		UpdatedAt:        now,
		Version:          1,
	}
	if err := service.store.PutAiChatAction(ctx, action); err != nil {
		return nil, storageError()
	}
	return contractAiChatAction(action), nil
}

func (service *Service) ApproveAiChatAction(ctx context.Context, request contracts.AiChatActionApproveRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ActionID) == "" || strings.TrimSpace(request.UserID) == "" {
		return nil, validationError("actionId and userId are required")
	}
	if request.UserID != principalID(request.BridgeEnvelope) {
		return nil, forbiddenError("AI Chat action approver must match the authenticated principal")
	}
	if request.ExpectedVersion < 1 {
		return nil, validationError("expectedVersion is required")
	}
	action, _, err := service.requireAiChatActionAccess(ctx, request.BridgeEnvelope, request.ActionID)
	if err != nil {
		return nil, err
	}
	if request.ExpectedVersion != action.Version {
		return nil, forbiddenError("AI Chat action version is stale")
	}
	now := service.now().UTC()
	status := contracts.AiChatActionStatusRejected
	if request.Approved {
		status = contracts.AiChatActionStatusApproved
	}
	action.Status = status
	action.ApprovedByUserID = &request.UserID
	action.ApprovedAt = &now
	action.UpdatedAt = now
	action.Version++
	if err := service.store.PutAiChatAction(ctx, action); err != nil {
		return nil, storageError()
	}
	return contractAiChatAction(action), nil
}

func (service *Service) FinishAiChatAction(ctx context.Context, request contracts.AiChatActionFinishRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ActionID) == "" || strings.TrimSpace(request.Status) == "" {
		return nil, validationError("actionId and status are required")
	}
	if containsSecretLookingKey(request.Result) {
		return nil, validationError("AI Chat action result must not contain raw secret-looking fields")
	}
	action, _, err := service.requireAiChatActionAccess(ctx, request.BridgeEnvelope, request.ActionID)
	if err != nil {
		return nil, err
	}
	now := service.now().UTC()
	action.Status = contracts.AiChatActionStatus(request.Status)
	action.Result = cloneAnyMap(request.Result)
	action.UpdatedAt = now
	action.Version++
	if err := service.store.PutAiChatAction(ctx, action); err != nil {
		return nil, storageError()
	}
	return contractAiChatAction(action), nil
}

func (service *Service) SaveAiChatCompaction(ctx context.Context, request contracts.AiChatCompactionSaveRequest) (map[string]any, error) {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.Summary) == "" || request.TokenCount < 0 {
		return nil, validationError("AI Chat compaction requires conversation, summary, and non-negative token count")
	}
	conversation, err := service.requireAiChatConversationAccess(ctx, request.BridgeEnvelope, request.ConversationID)
	if err != nil {
		return nil, err
	}
	now := service.now().UTC()
	compaction := ports.AiChatCompactionRecord{
		ID:                 fmt.Sprintf("compaction-%s-%d", normalizeID(request.ConversationID), now.UnixNano()),
		ConversationID:     conversation.ID,
		SourceMessageCount: len(request.CoveredMessageIDs),
		Summary:            strings.TrimSpace(request.Summary),
		RetainedMessageIDs: append([]string{}, request.CoveredMessageIDs...),
		ArtifactSummaries:  []string{},
		PendingActionIDs:   []string{},
		TokenCount:         request.TokenCount,
		CreatedAt:          now,
	}
	if err := service.store.PutAiChatCompaction(ctx, compaction); err != nil {
		return nil, storageError()
	}
	conversation.LatestCompactionID = &compaction.ID
	conversation.UpdatedAt = now
	if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
		return nil, storageError()
	}
	return contractAiChatCompaction(compaction), nil
}

func (service *Service) ListAlertRules(ctx context.Context, request contracts.AlertRuleListRequest) ([]contracts.AlertRule, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	records, err := service.store.ListAlertRules(ctx, project.ID)
	if err != nil {
		return nil, storageError()
	}
	records, err = service.filterAndSortAlertRules(ctx, project.ID, records, request.Input)
	if err != nil {
		return nil, err
	}
	items := make([]contracts.AlertRule, 0, len(records))
	for _, record := range records {
		items = append(items, contractAlertRule(record))
	}
	return items, nil
}

func (service *Service) filterAndSortAlertRules(ctx context.Context, projectID string, records []ports.AlertRuleRecord, input *contracts.AlertRuleSearchInput) ([]ports.AlertRuleRecord, error) {
	if input == nil {
		input = &contracts.AlertRuleSearchInput{}
	}
	search := strings.ToLower(strings.TrimSpace(pointerString(input.Search)))
	items := make([]ports.AlertRuleRecord, 0, len(records))
	for _, record := range records {
		if input.Enabled != nil && record.Enabled != *input.Enabled {
			continue
		}
		if input.Severity != nil && record.Severity != *input.Severity {
			continue
		}
		if input.Signal != nil && alertRuleSignal(record.Kind) != *input.Signal {
			continue
		}
		if search != "" && !alertRuleMatchesSearch(record, search) {
			continue
		}
		if input.Status != nil {
			matches, err := service.alertRuleMatchesLatestState(ctx, projectID, record.ID, *input.Status)
			if err != nil {
				return nil, err
			}
			if !matches {
				continue
			}
		}
		items = append(items, record)
	}
	sortAlertRules(items, input.Sort)
	return items, nil
}

func alertRuleMatchesSearch(record ports.AlertRuleRecord, search string) bool {
	return strings.Contains(strings.ToLower(record.Name), search) ||
		strings.Contains(strings.ToLower(record.ID), search) ||
		strings.Contains(strings.ToLower(string(record.Kind)), search) ||
		strings.Contains(strings.ToLower(string(record.Severity)), search)
}

func pointerString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func alertRuleSignal(kind contracts.AlertRuleKind) contracts.AlertSignal {
	switch kind {
	case contracts.AlertRuleKindMetricThreshold, contracts.AlertRuleKindMetricAbsence:
		return contracts.AlertSignalMetric
	case contracts.AlertRuleKindLogMatch, contracts.AlertRuleKindLogCount:
		return contracts.AlertSignalLog
	default:
		return contracts.AlertSignalTrace
	}
}

func (service *Service) alertRuleMatchesLatestState(ctx context.Context, projectID string, ruleID string, state contracts.AlertState) (bool, error) {
	events, _, _, err := service.store.ListAlertEvents(ctx, projectID, &ruleID, 1, nil)
	if err != nil {
		return false, storageError()
	}
	return len(events) > 0 && events[0].State == state, nil
}

func sortAlertRules(items []ports.AlertRuleRecord, sortInput *contracts.AlertRuleSort) {
	sortMode := contracts.AlertRuleSortUpdatedAtDesc
	if sortInput != nil {
		sortMode = *sortInput
	}
	sort.SliceStable(items, func(i, j int) bool {
		left := items[i]
		right := items[j]
		switch sortMode {
		case contracts.AlertRuleSortUpdatedAtAsc:
			return alertTimeLess(left.UpdatedAt, left.ID, right.UpdatedAt, right.ID)
		case contracts.AlertRuleSortUpdatedAtDesc:
			return alertTimeLess(right.UpdatedAt, right.ID, left.UpdatedAt, left.ID)
		case contracts.AlertRuleSortCreatedAtAsc:
			return alertTimeLess(left.CreatedAt, left.ID, right.CreatedAt, right.ID)
		case contracts.AlertRuleSortCreatedAtDesc:
			return alertTimeLess(right.CreatedAt, right.ID, left.CreatedAt, left.ID)
		case contracts.AlertRuleSortNameDesc:
			return alertStringLess(right.Name, right.ID, left.Name, left.ID)
		case contracts.AlertRuleSortSeverityAsc:
			return alertStringLess(string(left.Severity), left.ID, string(right.Severity), right.ID)
		case contracts.AlertRuleSortSeverityDesc:
			return alertStringLess(string(right.Severity), right.ID, string(left.Severity), left.ID)
		case contracts.AlertRuleSortKindAsc:
			return alertStringLess(string(left.Kind), left.ID, string(right.Kind), right.ID)
		case contracts.AlertRuleSortKindDesc:
			return alertStringLess(string(right.Kind), right.ID, string(left.Kind), left.ID)
		case contracts.AlertRuleSortEnabledAsc:
			if left.Enabled == right.Enabled {
				return left.ID < right.ID
			}
			return !left.Enabled && right.Enabled
		case contracts.AlertRuleSortEnabledDesc:
			if left.Enabled == right.Enabled {
				return left.ID < right.ID
			}
			return left.Enabled && !right.Enabled
		default:
			return alertStringLess(left.Name, left.ID, right.Name, right.ID)
		}
	})
}

func alertStringLess(leftValue string, leftID string, rightValue string, rightID string) bool {
	left := strings.ToLower(leftValue)
	right := strings.ToLower(rightValue)
	if left == right {
		return leftID < rightID
	}
	return left < right
}

func alertTimeLess(leftTime time.Time, leftID string, rightTime time.Time, rightID string) bool {
	if leftTime.Equal(rightTime) {
		return leftID < rightID
	}
	return leftTime.Before(rightTime)
}

func (service *Service) CreateAlertRule(ctx context.Context, request contracts.AlertRuleCreateRequest) (contracts.AlertRule, error) {
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.Input.ProjectID)
	if err != nil {
		return contracts.AlertRule{}, err
	}
	if err := validateAlertRuleInput(request.Input); err != nil {
		return contracts.AlertRule{}, err
	}
	now := service.now().UTC()
	actor := principalID(request.BridgeEnvelope)
	existing, err := service.store.ListAlertRules(ctx, project.ID)
	if err != nil {
		return contracts.AlertRule{}, storageError()
	}
	id := fmt.Sprintf("alert-rule-%s-%d", normalizeID(request.Input.Name), len(existing)+1)
	record := ports.AlertRuleRecord{
		ID:                      id,
		ProjectID:               project.ID,
		Name:                    strings.TrimSpace(request.Input.Name),
		Enabled:                 request.Input.Enabled,
		Kind:                    request.Input.Kind,
		Severity:                request.Input.Severity,
		Query:                   cloneAnyMap(request.Input.Query),
		Condition:               cloneAnyMap(request.Input.Condition),
		EvaluationWindowSeconds: request.Input.EvaluationWindowSeconds,
		PendingForSeconds:       request.Input.PendingForSeconds,
		CooldownSeconds:         request.Input.CooldownSeconds,
		NotificationAdapterIDs:  normalizeStringList(request.Input.NotificationAdapterIDs),
		CreatedAt:               now,
		UpdatedAt:               now,
		UpdatedByUserID:         actor,
		Version:                 1,
	}
	if err := service.validateAlertAdapterIDs(record.NotificationAdapterIDs); err != nil {
		return contracts.AlertRule{}, err
	}
	if err := service.store.PutAlertRule(ctx, record); err != nil {
		return contracts.AlertRule{}, storageError()
	}
	return contractAlertRule(record), nil
}

func (service *Service) UpdateAlertRule(ctx context.Context, request contracts.AlertRuleUpdateRequest) (contracts.AlertRule, error) {
	current, ok, err := service.store.GetAlertRule(ctx, request.Input.ID)
	if err != nil {
		return contracts.AlertRule{}, storageError()
	}
	if !ok {
		return contracts.AlertRule{}, forbiddenError("alert rule is not accessible")
	}
	if _, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, current.ProjectID); err != nil {
		return contracts.AlertRule{}, err
	}
	if request.Input.ExpectedVersion != current.Version {
		return contracts.AlertRule{}, forbiddenError("alert rule version is stale")
	}
	updated := current
	if request.Input.Name != nil {
		updated.Name = strings.TrimSpace(*request.Input.Name)
	}
	if request.Input.Enabled != nil {
		updated.Enabled = *request.Input.Enabled
	}
	if request.Input.Kind != nil {
		updated.Kind = *request.Input.Kind
	}
	if request.Input.Severity != nil {
		updated.Severity = *request.Input.Severity
	}
	if request.Input.Query != nil {
		updated.Query = cloneAnyMap(request.Input.Query)
	}
	if request.Input.Condition != nil {
		updated.Condition = cloneAnyMap(request.Input.Condition)
	}
	if request.Input.EvaluationWindowSeconds != nil {
		updated.EvaluationWindowSeconds = *request.Input.EvaluationWindowSeconds
	}
	if request.Input.PendingForSeconds != nil {
		updated.PendingForSeconds = *request.Input.PendingForSeconds
	}
	if request.Input.CooldownSeconds != nil {
		updated.CooldownSeconds = *request.Input.CooldownSeconds
	}
	if request.Input.NotificationAdapterIDs != nil {
		updated.NotificationAdapterIDs = normalizeStringList(request.Input.NotificationAdapterIDs)
	}
	if err := validateAlertRuleRecord(updated); err != nil {
		return contracts.AlertRule{}, err
	}
	if err := service.validateAlertAdapterIDs(updated.NotificationAdapterIDs); err != nil {
		return contracts.AlertRule{}, err
	}
	updated.UpdatedAt = service.now().UTC()
	updated.UpdatedByUserID = principalID(request.BridgeEnvelope)
	updated.Version = current.Version + 1
	if err := service.store.PutAlertRule(ctx, updated); err != nil {
		return contracts.AlertRule{}, storageError()
	}
	return contractAlertRule(updated), nil
}

func (service *Service) DeleteAlertRule(ctx context.Context, request contracts.AlertRuleDeleteRequest) (bool, error) {
	current, ok, err := service.store.GetAlertRule(ctx, request.ID)
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return true, nil
	}
	if _, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, current.ProjectID); err != nil {
		return false, err
	}
	if err := service.store.DeleteAlertRule(ctx, request.ID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) ListAlertSilences(ctx context.Context, request contracts.AlertSilenceListRequest) ([]contracts.AlertSilence, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return nil, err
	}
	records, err := service.store.ListAlertSilences(ctx, project.ID, request.RuleID)
	if err != nil {
		return nil, storageError()
	}
	now := service.now().UTC()
	items := make([]contracts.AlertSilence, 0, len(records))
	for _, record := range records {
		items = append(items, contractAlertSilence(record, now))
	}
	return items, nil
}

func (service *Service) CreateAlertSilence(ctx context.Context, request contracts.AlertSilenceCreateRequest) (contracts.AlertSilence, error) {
	project, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, request.Input.ProjectID)
	if err != nil {
		return contracts.AlertSilence{}, err
	}
	if strings.TrimSpace(request.Input.RuleID) == "" || strings.TrimSpace(request.Input.Reason) == "" || !request.Input.StartsAt.Before(request.Input.EndsAt) {
		return contracts.AlertSilence{}, validationError("alert silence ruleId, reason, and valid time range are required")
	}
	rule, ok, err := service.store.GetAlertRule(ctx, request.Input.RuleID)
	if err != nil {
		return contracts.AlertSilence{}, storageError()
	}
	if !ok || rule.ProjectID != project.ID {
		return contracts.AlertSilence{}, forbiddenError("alert rule is not accessible")
	}
	existing, err := service.store.ListAlertSilences(ctx, project.ID, nil)
	if err != nil {
		return contracts.AlertSilence{}, storageError()
	}
	now := service.now().UTC()
	record := ports.AlertSilenceRecord{
		ID:              fmt.Sprintf("alert-silence-%s-%d", normalizeID(request.Input.RuleID), len(existing)+1),
		ProjectID:       project.ID,
		RuleID:          request.Input.RuleID,
		Reason:          strings.TrimSpace(request.Input.Reason),
		StartsAt:        request.Input.StartsAt.UTC(),
		EndsAt:          request.Input.EndsAt.UTC(),
		CreatedAt:       now,
		CreatedByUserID: principalID(request.BridgeEnvelope),
	}
	if err := service.store.PutAlertSilence(ctx, record); err != nil {
		return contracts.AlertSilence{}, storageError()
	}
	return contractAlertSilence(record, now), nil
}

func (service *Service) DeleteAlertSilence(ctx context.Context, request contracts.AlertSilenceDeleteRequest) (bool, error) {
	current, ok, err := service.store.GetAlertSilence(ctx, request.ID)
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return true, nil
	}
	if _, err := service.requireProjectAdmin(ctx, request.BridgeEnvelope, current.ProjectID); err != nil {
		return false, err
	}
	if err := service.store.DeleteAlertSilence(ctx, request.ID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) ListAlertHistory(ctx context.Context, request contracts.AlertHistoryListRequest) (contracts.AlertEventConnection, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.AlertEventConnection{}, err
	}
	first := 50
	if request.First != nil {
		first = *request.First
	}
	if first < 1 || first > 200 {
		return contracts.AlertEventConnection{}, validationError("alert history first must be between 1 and 200")
	}
	records, hasNext, cursor, err := service.store.ListAlertEvents(ctx, project.ID, request.RuleID, first, request.After)
	if err != nil {
		return contracts.AlertEventConnection{}, storageError()
	}
	items := make([]contracts.AlertEvent, 0, len(records))
	for _, record := range records {
		items = append(items, contractAlertEvent(record))
	}
	return contracts.AlertEventConnection{Items: items, PageInfo: contracts.AlertPageInfo{HasNextPage: hasNext, EndCursor: cursor}}, nil
}

func (service *Service) AlertSummary(ctx context.Context, request contracts.AlertSummaryRequest) (contracts.AlertSummary, error) {
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID)
	if err != nil {
		return contracts.AlertSummary{}, err
	}
	input := request.Input
	if input == nil {
		input = &contracts.AlertSummaryInput{}
	}
	limit := 20
	if input.Limit != nil {
		limit = *input.Limit
	}
	if limit < 1 || limit > 100 {
		return contracts.AlertSummary{}, validationError("alert summary limit must be between 1 and 100")
	}
	windowStart, err := service.alertSummaryWindowStart(input.TimeWindow)
	if err != nil {
		return contracts.AlertSummary{}, err
	}
	if err := validateAlertSummaryInput(*input); err != nil {
		return contracts.AlertSummary{}, err
	}
	rules, err := service.store.ListAlertRules(ctx, project.ID)
	if err != nil {
		return contracts.AlertSummary{}, storageError()
	}
	ruleSignals := map[string]contracts.AlertSignal{}
	for _, rule := range rules {
		ruleSignals[rule.ID] = alertRuleSignal(rule.Kind)
	}
	records, _, _, err := service.store.ListAlertEvents(ctx, project.ID, nil, limit, nil)
	if err != nil {
		return contracts.AlertSummary{}, storageError()
	}
	summary := contracts.AlertSummary{
		ByState:    []contracts.AlertStateCount{},
		BySeverity: []contracts.AlertSeverityCount{},
		BySignal:   []contracts.AlertSignalCount{},
	}
	stateCounts := map[contracts.AlertState]int{}
	severityCounts := map[contracts.AlertSeverity]int{}
	signalCounts := map[contracts.AlertSignal]int{}
	for _, record := range records {
		if windowStart != nil && record.CreatedAt.Before(*windowStart) {
			continue
		}
		signal, ok := ruleSignals[record.RuleID]
		if !ok {
			continue
		}
		if !alertSummaryMatchesInput(record, signal, *input) {
			continue
		}
		summary.TotalCount++
		stateCounts[record.State]++
		severityCounts[record.Severity]++
		signalCounts[signal]++
	}
	for _, state := range []contracts.AlertState{contracts.AlertStateOK, contracts.AlertStatePending, contracts.AlertStateFiring, contracts.AlertStateResolved, contracts.AlertStateSilenced, contracts.AlertStateError} {
		if count := stateCounts[state]; count > 0 {
			summary.ByState = append(summary.ByState, contracts.AlertStateCount{State: state, Count: count})
		}
	}
	for _, severity := range []contracts.AlertSeverity{contracts.AlertSeverityInfo, contracts.AlertSeverityWarning, contracts.AlertSeverityError, contracts.AlertSeverityCritical} {
		if count := severityCounts[severity]; count > 0 {
			summary.BySeverity = append(summary.BySeverity, contracts.AlertSeverityCount{Severity: severity, Count: count})
		}
	}
	for _, signal := range []contracts.AlertSignal{contracts.AlertSignalMetric, contracts.AlertSignalLog, contracts.AlertSignalTrace} {
		if count := signalCounts[signal]; count > 0 {
			summary.BySignal = append(summary.BySignal, contracts.AlertSignalCount{Signal: signal, Count: count})
		}
	}
	return summary, nil
}

func (service *Service) alertSummaryWindowStart(timeWindow *string) (*time.Time, error) {
	if timeWindow == nil || strings.TrimSpace(*timeWindow) == "" {
		start := service.now().UTC().Add(-time.Hour)
		return &start, nil
	}
	duration, err := parseDashboardDuration(strings.TrimSpace(*timeWindow))
	if err != nil {
		return nil, validationError("alert summary timeWindow is invalid")
	}
	start := service.now().UTC().Add(-duration)
	return &start, nil
}

func parseDashboardDuration(value string) (time.Duration, error) {
	if strings.HasPrefix(value, "PT") {
		rest := strings.TrimPrefix(value, "PT")
		switch {
		case strings.HasSuffix(rest, "H"):
			hours, err := strconv.Atoi(strings.TrimSuffix(rest, "H"))
			if err != nil || hours < 1 {
				return 0, fmt.Errorf("invalid hours")
			}
			return time.Duration(hours) * time.Hour, nil
		case strings.HasSuffix(rest, "M"):
			minutes, err := strconv.Atoi(strings.TrimSuffix(rest, "M"))
			if err != nil || minutes < 1 {
				return 0, fmt.Errorf("invalid minutes")
			}
			return time.Duration(minutes) * time.Minute, nil
		}
	}
	return time.ParseDuration(value)
}

func validateAlertSummaryInput(input contracts.AlertSummaryInput) error {
	if len(input.RuleIDs) > 20 {
		return validationError("alert summary ruleIds exceeds limit")
	}
	for _, ruleID := range input.RuleIDs {
		if strings.TrimSpace(ruleID) == "" {
			return validationError("alert summary ruleIds cannot be blank")
		}
	}
	for _, state := range input.States {
		if !isAlertState(state) {
			return validationError("alert summary state is invalid")
		}
	}
	for _, severity := range input.Severities {
		if !isAlertSeverity(severity) {
			return validationError("alert summary severity is invalid")
		}
	}
	for _, signal := range input.Signals {
		if !isAlertSignal(signal) {
			return validationError("alert summary signal is invalid")
		}
	}
	return nil
}

func alertSummaryMatchesInput(record ports.AlertEventRecord, signal contracts.AlertSignal, input contracts.AlertSummaryInput) bool {
	return (len(input.RuleIDs) == 0 || slices.Contains(input.RuleIDs, record.RuleID)) &&
		(len(input.States) == 0 || slices.Contains(input.States, record.State)) &&
		(len(input.Severities) == 0 || slices.Contains(input.Severities, record.Severity)) &&
		(len(input.Signals) == 0 || slices.Contains(input.Signals, signal))
}

func (service *Service) RecordAlertHistory(ctx context.Context, request contracts.AlertHistoryRecordRequest) (contracts.AlertEvent, error) {
	if err := validateAlertEvent(request.Event); err != nil {
		return contracts.AlertEvent{}, err
	}
	if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.Event.ProjectID); err != nil {
		return contracts.AlertEvent{}, err
	}
	record := ports.AlertEventRecord{
		ID:                 request.Event.ID,
		ProjectID:          request.Event.ProjectID,
		RuleID:             request.Event.RuleID,
		InstanceID:         request.Event.InstanceID,
		State:              request.Event.State,
		Severity:           request.Event.Severity,
		Summary:            request.Event.Summary,
		DeduplicationKey:   request.Event.DeduplicationKey,
		StartedAt:          request.Event.StartedAt.UTC(),
		EndedAt:            request.Event.EndedAt,
		CreatedAt:          request.Event.CreatedAt.UTC(),
		EvidenceTraceID:    request.Event.EvidenceTraceID,
		EvidenceSpanID:     request.Event.EvidenceSpanID,
		EvidenceLogID:      request.Event.EvidenceLogID,
		EvidenceMetricName: request.Event.EvidenceMetricName,
	}
	if err := service.store.PutAlertEvent(ctx, record); err != nil {
		return contracts.AlertEvent{}, storageError()
	}
	return contractAlertEvent(record), nil
}

func (service *Service) GetProjectStatusSnapshot(ctx context.Context, request contracts.ProjectStatusSnapshotRequest) (contracts.ProjectStatusSnapshotData, error) {
	if strings.TrimSpace(request.CompanyID) == "" || strings.TrimSpace(request.ProjectID) == "" {
		return contracts.ProjectStatusSnapshotData{}, validationError("companyId and projectId are required")
	}
	project, ok, err := service.store.GetProject(ctx, request.ProjectID)
	if err != nil {
		return contracts.ProjectStatusSnapshotData{}, storageError()
	}
	if !ok || project.OrganizationID != request.CompanyID {
		return contracts.ProjectStatusSnapshotData{}, forbiddenError("project is not accessible for company")
	}
	return contracts.ProjectStatusSnapshotData{
		CompanyID: project.OrganizationID,
		ProjectID: project.ID,
		Status:    project.Status,
		ChangedAt: project.ChangedAt,
	}, nil
}

func (service *Service) ListDashboards(ctx context.Context, request DashboardListRequest) (DashboardListData, error) {
	projectID := authContextProjectID(request.BridgeEnvelope)
	if projectID == nil {
		return DashboardListData{}, validationError("selected project is required")
	}
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, *projectID)
	if err != nil {
		return DashboardListData{}, err
	}
	includeBuiltins := true
	query := ""
	tag := ""
	var visibility *DashboardVisibility
	pinnedOnly := false
	if request.Input != nil {
		if request.Input.IncludeBuiltins != nil {
			includeBuiltins = *request.Input.IncludeBuiltins
		}
		if request.Input.Query != nil {
			query = strings.ToLower(strings.TrimSpace(*request.Input.Query))
		}
		if request.Input.Tag != nil {
			tag = strings.ToLower(strings.TrimSpace(*request.Input.Tag))
		}
		if request.Input.Visibility != nil {
			visibility = request.Input.Visibility
		}
		if request.Input.PinnedOnly != nil {
			pinnedOnly = *request.Input.PinnedOnly
		}
	}

	userID := principalID(request.BridgeEnvelope)
	pinnedIDs, err := service.visibleDashboardPinIDs(ctx, userID, project.ID)
	if err != nil {
		return DashboardListData{}, err
	}
	pinnedSet := map[string]struct{}{}
	for _, id := range pinnedIDs {
		pinnedSet[id] = struct{}{}
	}

	items := []Dashboard{}
	if includeBuiltins {
		items = append(items, builtinDashboards(project, service.now().UTC())...)
	}
	records, err := service.store.ListDashboards(ctx, project.ID)
	if err != nil {
		return DashboardListData{}, storageError()
	}
	for _, record := range records {
		if record.Visibility == ports.DashboardVisibilityPersonal && (record.OwnerUserID == nil || *record.OwnerUserID != userID) {
			continue
		}
		dashboard, err := contractDashboard(record)
		if err != nil {
			return DashboardListData{}, storageError()
		}
		items = append(items, dashboard)
	}
	filtered := items[:0]
	for _, item := range items {
		_, item.Pinned = pinnedSet[item.ID]
		if visibility != nil && item.Visibility != *visibility {
			continue
		}
		if pinnedOnly {
			if _, ok := pinnedSet[item.ID]; !ok {
				continue
			}
		}
		if query != "" && !strings.Contains(strings.ToLower(item.Name), query) && (item.Description == nil || !strings.Contains(strings.ToLower(*item.Description), query)) {
			continue
		}
		if tag != "" && !hasDashboardTag(item.Tags, tag) {
			continue
		}
		filtered = append(filtered, item)
	}
	return DashboardListData{Items: filtered, PinnedDashboardIDs: pinnedIDs}, nil
}

func (service *Service) SaveDashboard(ctx context.Context, request DashboardSaveRequest) (Dashboard, error) {
	projectID := authContextProjectID(request.BridgeEnvelope)
	if projectID == nil {
		return Dashboard{}, validationError("selected project is required")
	}
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, *projectID)
	if err != nil {
		return Dashboard{}, err
	}
	visibility := DashboardVisibilityPersonal
	if request.Input.Visibility != nil {
		visibility = *request.Input.Visibility
	}
	if err := validateDashboardVisibility(visibility); err != nil {
		return Dashboard{}, err
	}
	if visibility == DashboardVisibilityProject {
		if err := service.requireAdmin(ctx, request.BridgeEnvelope, project.OrganizationID); err != nil {
			return Dashboard{}, err
		}
	}
	if err := validateDashboardInput(request.Input); err != nil {
		return Dashboard{}, err
	}
	now := service.now().UTC()
	updatedBy := principalID(request.BridgeEnvelope)
	slug := normalizeSlug(request.Input.Name)
	if slug == "" {
		return Dashboard{}, validationError("dashboard name must produce a slug")
	}
	ownerUserID := (*string)(nil)
	if visibility == DashboardVisibilityPersonal {
		ownerUserID = &updatedBy
	}
	id := dashboardID(project.ID, visibility, ownerUserID, slug)
	version := 1
	createdAt := now
	createdBy := &updatedBy
	if request.Input.ID != nil && strings.TrimSpace(*request.Input.ID) != "" {
		current, ok, err := service.store.GetDashboard(ctx, strings.TrimSpace(*request.Input.ID))
		if err != nil {
			return Dashboard{}, storageError()
		}
		if !ok {
			return Dashboard{}, validationError("dashboard id is invalid")
		}
		if current.ProjectID != project.ID {
			return Dashboard{}, forbiddenError("dashboard is not accessible for selected project")
		}
		if current.Visibility == ports.DashboardVisibilityBuiltin {
			return Dashboard{}, forbiddenError("built-in dashboards are not mutable")
		}
		if current.Visibility == ports.DashboardVisibilityPersonal && (current.OwnerUserID == nil || *current.OwnerUserID != updatedBy) {
			return Dashboard{}, forbiddenError("personal dashboard is not accessible")
		}
		if current.Visibility == ports.DashboardVisibilityProject {
			if err := service.requireAdmin(ctx, request.BridgeEnvelope, project.OrganizationID); err != nil {
				return Dashboard{}, err
			}
		}
		if request.Input.Version == nil || *request.Input.Version != current.Version {
			return Dashboard{}, validationError("dashboard version is stale")
		}
		if current.Visibility != portsDashboardVisibility(visibility) {
			return Dashboard{}, validationError("dashboard visibility cannot change")
		}
		if err := service.ensureDashboardSlugAvailable(ctx, project.ID, visibility, ownerUserID, slug, current.ID); err != nil {
			return Dashboard{}, err
		}
		if current.Slug != slug {
			if err := service.store.DeleteDashboard(ctx, current.ID); err != nil {
				return Dashboard{}, storageError()
			}
		}
		version = current.Version + 1
		createdAt = current.CreatedAt
		createdBy = current.CreatedBy
	} else if err := service.ensureDashboardSlugAvailable(ctx, project.ID, visibility, ownerUserID, slug, ""); err != nil {
		return Dashboard{}, err
	}

	widgets := dashboardWidgetsFromInput(request.Input.Widgets)
	widgetBytes, err := json.Marshal(widgets)
	if err != nil {
		return Dashboard{}, validationError("dashboard widgets are invalid")
	}
	defaultTimeWindow := "PT1H"
	if request.Input.DefaultTimeWindow != nil && strings.TrimSpace(*request.Input.DefaultTimeWindow) != "" {
		defaultTimeWindow = strings.TrimSpace(*request.Input.DefaultTimeWindow)
	}
	record := ports.DashboardRecord{
		ID:                id,
		ProjectID:         project.ID,
		OrganizationID:    project.OrganizationID,
		Slug:              slug,
		Name:              strings.TrimSpace(request.Input.Name),
		Description:       trimOptionalString(request.Input.Description),
		Tags:              normalizeStringList(request.Input.Tags),
		Version:           version,
		Visibility:        portsDashboardVisibility(visibility),
		DefaultTimeWindow: defaultTimeWindow,
		OwnerUserID:       ownerUserID,
		Widgets:           widgetBytes,
		CreatedAt:         createdAt,
		UpdatedAt:         now,
		CreatedBy:         createdBy,
		UpdatedBy:         &updatedBy,
	}
	if err := service.store.PutDashboard(ctx, record); err != nil {
		return Dashboard{}, storageError()
	}
	return contractDashboard(record)
}

func (service *Service) DeleteDashboard(ctx context.Context, request DashboardDeleteRequest) (bool, error) {
	projectID := authContextProjectID(request.BridgeEnvelope)
	if projectID == nil {
		return false, validationError("selected project is required")
	}
	project, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, *projectID)
	if err != nil {
		return false, err
	}
	dashboardIDValue := strings.TrimSpace(request.DashboardID)
	if dashboardIDValue == "" {
		return false, validationError("dashboardId is required")
	}
	if isBuiltinDashboardID(dashboardIDValue) {
		return false, forbiddenError("built-in dashboards cannot be deleted")
	}
	current, ok, err := service.store.GetDashboard(ctx, dashboardIDValue)
	if err != nil {
		return false, storageError()
	}
	if !ok {
		return false, nil
	}
	if current.ProjectID != project.ID {
		return false, forbiddenError("dashboard is not accessible for selected project")
	}
	if current.Visibility == ports.DashboardVisibilityBuiltin {
		return false, forbiddenError("built-in dashboards cannot be deleted")
	}
	userID := principalID(request.BridgeEnvelope)
	if current.Visibility == ports.DashboardVisibilityPersonal {
		if current.OwnerUserID == nil || *current.OwnerUserID != userID {
			return false, forbiddenError("personal dashboard is not accessible")
		}
	} else if err := service.requireAdmin(ctx, request.BridgeEnvelope, project.OrganizationID); err != nil {
		return false, err
	}
	if err := service.store.DeleteDashboard(ctx, current.ID); err != nil {
		return false, storageError()
	}
	if err := service.store.DeleteDashboardPinsForDashboard(ctx, current.ID); err != nil {
		return false, storageError()
	}
	return true, nil
}

func (service *Service) SetDashboardPin(ctx context.Context, request DashboardPinSetRequest) (DashboardPreferencesData, error) {
	project, err := service.requireSelectedDashboardProject(ctx, request.BridgeEnvelope)
	if err != nil {
		return DashboardPreferencesData{}, err
	}
	userID := principalID(request.BridgeEnvelope)
	dashboardIDValue := strings.TrimSpace(request.DashboardID)
	if dashboardIDValue == "" {
		return DashboardPreferencesData{}, validationError("dashboardId is required")
	}
	if _, err := service.requireDashboardVisible(ctx, project, userID, dashboardIDValue); err != nil {
		return DashboardPreferencesData{}, err
	}
	now := service.now().UTC()
	if request.Pinned {
		pins, err := service.visibleDashboardPins(ctx, userID, project.ID)
		if err != nil {
			return DashboardPreferencesData{}, err
		}
		for _, pin := range pins {
			if pin.DashboardID == dashboardIDValue {
				return service.dashboardPreferences(ctx, userID, project.ID, now)
			}
		}
		if len(pins) >= 5 {
			return DashboardPreferencesData{}, validationError("project sidebar supports at most five pinned dashboards")
		}
		if err := service.store.PutDashboardPin(ctx, ports.DashboardPinRecord{
			UserID:      userID,
			ProjectID:   project.ID,
			DashboardID: dashboardIDValue,
			Position:    len(pins),
			CreatedAt:   now,
			UpdatedAt:   now,
		}); err != nil {
			return DashboardPreferencesData{}, storageError()
		}
	} else if err := service.store.DeleteDashboardPin(ctx, userID, project.ID, dashboardIDValue); err != nil {
		return DashboardPreferencesData{}, storageError()
	}
	if err := service.compactDashboardPins(ctx, userID, project.ID, now); err != nil {
		return DashboardPreferencesData{}, err
	}
	return service.dashboardPreferences(ctx, userID, project.ID, now)
}

func (service *Service) ReorderDashboardPins(ctx context.Context, request DashboardPinReorderRequest) (DashboardPreferencesData, error) {
	project, err := service.requireSelectedDashboardProject(ctx, request.BridgeEnvelope)
	if err != nil {
		return DashboardPreferencesData{}, err
	}
	if len(request.DashboardIDs) > 5 {
		return DashboardPreferencesData{}, validationError("project sidebar supports at most five pinned dashboards")
	}
	userID := principalID(request.BridgeEnvelope)
	seen := map[string]struct{}{}
	now := service.now().UTC()
	for position, id := range request.DashboardIDs {
		dashboardIDValue := strings.TrimSpace(id)
		if dashboardIDValue == "" {
			return DashboardPreferencesData{}, validationError("dashboardIds cannot include blank values")
		}
		if _, ok := seen[dashboardIDValue]; ok {
			return DashboardPreferencesData{}, validationError("dashboardIds cannot include duplicates")
		}
		seen[dashboardIDValue] = struct{}{}
		if _, err := service.requireDashboardVisible(ctx, project, userID, dashboardIDValue); err != nil {
			return DashboardPreferencesData{}, err
		}
		if err := service.store.PutDashboardPin(ctx, ports.DashboardPinRecord{
			UserID:      userID,
			ProjectID:   project.ID,
			DashboardID: dashboardIDValue,
			Position:    position,
			CreatedAt:   now,
			UpdatedAt:   now,
		}); err != nil {
			return DashboardPreferencesData{}, storageError()
		}
	}
	current, err := service.store.ListDashboardPins(ctx, userID, project.ID)
	if err != nil {
		return DashboardPreferencesData{}, storageError()
	}
	for _, pin := range current {
		if _, ok := seen[pin.DashboardID]; !ok {
			if err := service.store.DeleteDashboardPin(ctx, userID, project.ID, pin.DashboardID); err != nil {
				return DashboardPreferencesData{}, storageError()
			}
		}
	}
	return service.dashboardPreferences(ctx, userID, project.ID, now)
}

func (service *Service) requireSelectedDashboardProject(ctx context.Context, envelope contracts.BridgeEnvelope) (ports.ProjectRecord, error) {
	projectID := authContextProjectID(envelope)
	if projectID == nil {
		return ports.ProjectRecord{}, validationError("selected project is required")
	}
	return service.requireProjectAccess(ctx, envelope, *projectID)
}

func (service *Service) requireDashboardVisible(ctx context.Context, project ports.ProjectRecord, userID string, dashboardID string) (Dashboard, error) {
	for _, builtin := range builtinDashboards(project, service.now().UTC()) {
		if builtin.ID == dashboardID {
			return builtin, nil
		}
	}
	record, ok, err := service.store.GetDashboard(ctx, dashboardID)
	if err != nil {
		return Dashboard{}, storageError()
	}
	if !ok || record.ProjectID != project.ID {
		return Dashboard{}, forbiddenError("dashboard is not visible for selected project")
	}
	if record.Visibility == ports.DashboardVisibilityPersonal && (record.OwnerUserID == nil || *record.OwnerUserID != userID) {
		return Dashboard{}, forbiddenError("dashboard is not visible for selected project")
	}
	dashboard, err := contractDashboard(record)
	if err != nil {
		return Dashboard{}, storageError()
	}
	return dashboard, nil
}

func (service *Service) visibleDashboardPinIDs(ctx context.Context, userID string, projectID string) ([]string, error) {
	pins, err := service.visibleDashboardPins(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(pins))
	for _, pin := range pins {
		ids = append(ids, pin.DashboardID)
	}
	return ids, nil
}

func (service *Service) visibleDashboardPins(ctx context.Context, userID string, projectID string) ([]ports.DashboardPinRecord, error) {
	pins, err := service.store.ListDashboardPins(ctx, userID, projectID)
	if err != nil {
		return nil, storageError()
	}
	project, ok, err := service.store.GetProject(ctx, projectID)
	if err != nil {
		return nil, storageError()
	}
	if !ok {
		return nil, forbiddenError("project is not accessible")
	}
	visible := make([]ports.DashboardPinRecord, 0, len(pins))
	for _, pin := range pins {
		if _, err := service.requireDashboardVisible(ctx, project, userID, pin.DashboardID); err == nil {
			visible = append(visible, pin)
		}
	}
	return visible, nil
}

func (service *Service) compactDashboardPins(ctx context.Context, userID string, projectID string, now time.Time) error {
	pins, err := service.visibleDashboardPins(ctx, userID, projectID)
	if err != nil {
		return err
	}
	for position, pin := range pins {
		if pin.Position == position {
			continue
		}
		pin.Position = position
		pin.UpdatedAt = now
		if err := service.store.PutDashboardPin(ctx, pin); err != nil {
			return storageError()
		}
	}
	return nil
}

func (service *Service) dashboardPreferences(ctx context.Context, userID string, projectID string, updatedAt time.Time) (DashboardPreferencesData, error) {
	ids, err := service.visibleDashboardPinIDs(ctx, userID, projectID)
	if err != nil {
		return DashboardPreferencesData{}, err
	}
	return DashboardPreferencesData{ProjectID: projectID, PinnedDashboardIDs: ids, UpdatedAt: updatedAt}, nil
}

func (service *Service) StatusChanges() []contracts.ProjectStatusChangedNotification {
	items := make([]contracts.ProjectStatusChangedNotification, len(service.statusChanges))
	copy(items, service.statusChanges)
	return items
}

func (service *Service) bootstrapViewer(ctx context.Context, envelope contracts.BridgeEnvelope) error {
	userID := principalID(envelope)
	organizationID := companyID(envelope)
	user, err := service.ensureUser(ctx, userID, principalProfile(envelope))
	if err != nil {
		return err
	}
	_ = user
	now := service.now().UTC()
	if _, ok, err := service.store.GetOrganization(ctx, organizationID); err != nil {
		return storageError()
	} else if !ok {
		if err := service.store.PutOrganization(ctx, ports.OrganizationRecord{
			ID:        organizationID,
			Name:      defaultOrganizationName(organizationID),
			Slug:      normalizeID(organizationID),
			CreatedAt: now,
			UpdatedAt: now,
		}); err != nil {
			return storageError()
		}
	}
	memberships, err := service.store.ListMemberships(ctx, organizationID)
	if err != nil {
		return storageError()
	}
	if len(memberships) == 0 {
		hasAcceptedInvitation, err := service.hasAcceptedInvitation(ctx, organizationID)
		if err != nil {
			return err
		}
		if hasAcceptedInvitation {
			return nil
		}
		if err := service.store.PutMembership(ctx, ports.MembershipRecord{
			UserID:         userID,
			OrganizationID: organizationID,
			Role:           contracts.CompanyRoleAdmin,
			CreatedAt:      now,
			UpdatedAt:      now,
		}); err != nil {
			return storageError()
		}
	}
	if _, ok, err := service.store.GetMembership(ctx, organizationID, userID); err != nil {
		return storageError()
	} else if !ok && isSSOAuth(envelope) {
		if err := service.acceptMatchingInvitation(ctx, envelope, userID, organizationID); err != nil {
			return err
		}
	}
	if organizationID == LocalCompanyID {
		if err := service.ensureLocalAdminMembership(ctx, userID, now); err != nil {
			return err
		}
		localProjects := []ports.ProjectRecord{
			{
				ID:             LocalProjectID,
				OrganizationID: LocalCompanyID,
				Name:           "Default project",
				Slug:           LocalProjectID,
				Status:         contracts.ProjectStatusActive,
				ChangedAt:      now,
				CreatedAt:      now,
				UpdatedAt:      now,
			},
			{
				ID:             LocalSelfObservabilityProjectID,
				OrganizationID: LocalCompanyID,
				Name:           "CloudGrid",
				Slug:           LocalSelfObservabilityProjectID,
				Status:         contracts.ProjectStatusActive,
				ChangedAt:      now,
				CreatedAt:      now,
				UpdatedAt:      now,
			},
		}
		for _, project := range localProjects {
			if _, ok, err := service.store.GetProject(ctx, project.ID); err != nil {
				return storageError()
			} else if !ok {
				if err := service.store.PutProject(ctx, project); err != nil {
					return storageError()
				}
			}
		}
	}
	return nil
}

func (service *Service) ensureLocalAdminMembership(ctx context.Context, userID string, now time.Time) error {
	if userID == "" {
		userID = localUserID
	}
	if userID != localUserID {
		return nil
	}
	membership, ok, err := service.store.GetMembership(ctx, LocalCompanyID, localUserID)
	if err != nil {
		return storageError()
	}
	if ok && membership.Role == contracts.CompanyRoleAdmin {
		return nil
	}
	if !ok {
		membership = ports.MembershipRecord{
			UserID:         localUserID,
			OrganizationID: LocalCompanyID,
			CreatedAt:      now,
		}
	}
	membership.Role = contracts.CompanyRoleAdmin
	membership.UpdatedAt = now
	if membership.CreatedAt.IsZero() {
		membership.CreatedAt = now
	}
	if err := service.store.PutMembership(ctx, membership); err != nil {
		return storageError()
	}
	return nil
}

func (service *Service) hasAcceptedInvitation(ctx context.Context, organizationID string) (bool, error) {
	invitations, err := service.store.ListInvitations(ctx, organizationID)
	if err != nil {
		return false, storageError()
	}
	for _, invitation := range invitations {
		if invitation.Status == contracts.OrganizationInvitationStatusAccepted {
			return true, nil
		}
	}
	return false, nil
}

func (service *Service) acceptMatchingInvitation(ctx context.Context, envelope contracts.BridgeEnvelope, userID string, organizationID string) error {
	if envelope.AuthContext == nil ||
		envelope.AuthContext.PrincipalEmail == nil ||
		envelope.AuthContext.PrincipalEmailVerified == nil ||
		!*envelope.AuthContext.PrincipalEmailVerified {
		return nil
	}
	email, err := normalizeEmail(*envelope.AuthContext.PrincipalEmail)
	if err != nil {
		return nil
	}
	invitation, ok, err := service.store.GetPendingInvitationByEmail(ctx, organizationID, email)
	if err != nil {
		return storageError()
	}
	if !ok {
		return nil
	}
	now := service.now().UTC()
	if invitation.ExpiresAt != nil && !invitation.ExpiresAt.After(now) {
		invitation.Status = contracts.OrganizationInvitationStatusExpired
		invitation.UpdatedAt = now
		if err := service.store.PutInvitation(ctx, invitation); err != nil {
			return storageError()
		}
		return nil
	}
	if err := service.store.PutMembership(ctx, ports.MembershipRecord{
		UserID:         userID,
		OrganizationID: organizationID,
		Role:           contracts.CompanyRoleUser,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		return storageError()
	}
	if err := service.applyInvitationProjectGrants(ctx, &invitation, userID, now); err != nil {
		return err
	}
	invitation.Status = contracts.OrganizationInvitationStatusAccepted
	invitation.AcceptedByUserID = &userID
	invitation.AcceptedAt = &now
	invitation.UpdatedAt = now
	if err := service.store.PutInvitation(ctx, invitation); err != nil {
		return storageError()
	}
	return nil
}

func (service *Service) applyInvitationProjectGrants(ctx context.Context, invitation *ports.InvitationRecord, userID string, now time.Time) error {
	for index := range invitation.ProjectGrants {
		grant := &invitation.ProjectGrants[index]
		if grant.Status != contracts.InvitationProjectGrantStatusPending {
			continue
		}
		project, ok, err := service.store.GetProject(ctx, grant.ProjectID)
		if err != nil {
			return storageError()
		}
		if !ok || project.OrganizationID != invitation.OrganizationID || project.Status == contracts.ProjectStatusDisabled {
			grant.Status = contracts.InvitationProjectGrantStatusFailed
			continue
		}
		member, ok, err := service.store.GetProjectMember(ctx, grant.ProjectID, userID)
		if err != nil {
			return storageError()
		}
		if !ok {
			member = ports.ProjectMemberRecord{
				ProjectID:       grant.ProjectID,
				UserID:          userID,
				CreatedAt:       now,
				CreatedByUserID: grant.CreatedByUserID,
			}
		}
		member.Role = grant.Role
		member.UpdatedAt = now
		member.UpdatedByUserID = grant.CreatedByUserID
		if err := service.store.PutProjectMember(ctx, member); err != nil {
			return storageError()
		}
		grant.Status = contracts.InvitationProjectGrantStatusApplied
		grant.AppliedAt = &now
	}
	return nil
}

func (service *Service) ensureUser(ctx context.Context, userID string, profile userProfile) (ports.UserRecord, error) {
	if strings.TrimSpace(userID) == "" {
		return ports.UserRecord{}, validationError("principalId is required")
	}
	user, ok, err := service.store.GetUser(ctx, userID)
	if err != nil {
		return ports.UserRecord{}, storageError()
	}
	if ok {
		updated := false
		if profile.DisplayName != "" && stringPtrValue(user.DisplayName) != profile.DisplayName {
			displayName := profile.DisplayName
			user.DisplayName = &displayName
			updated = true
		}
		if profile.Email != "" && stringPtrValue(user.Email) != profile.Email {
			email := profile.Email
			user.Email = &email
			updated = true
		}
		if updated {
			user.UpdatedAt = service.now().UTC()
			if err := service.store.PutUser(ctx, user); err != nil {
				return ports.UserRecord{}, storageError()
			}
		}
		return user, nil
	}
	now := service.now().UTC()
	user = ports.UserRecord{ID: userID, DisplayName: optionalStringPtr(profile.DisplayName), Email: optionalStringPtr(profile.Email), CreatedAt: now, UpdatedAt: now}
	if err := service.store.PutUser(ctx, user); err != nil {
		return ports.UserRecord{}, storageError()
	}
	return user, nil
}

func (service *Service) viewer(ctx context.Context, userID string, selectedProjectID *string) (contracts.Viewer, error) {
	user, ok, err := service.store.GetUser(ctx, userID)
	if err != nil {
		return contracts.Viewer{}, storageError()
	}
	if !ok {
		return contracts.Viewer{}, validationError("viewer user is missing")
	}
	memberships, err := service.store.ListMembershipsForUser(ctx, userID)
	if err != nil {
		return contracts.Viewer{}, storageError()
	}
	organizations := make([]contracts.Organization, 0, len(memberships))
	for _, membership := range memberships {
		organization, ok, err := service.store.GetOrganization(ctx, membership.OrganizationID)
		if err != nil {
			return contracts.Viewer{}, storageError()
		}
		if !ok {
			continue
		}
		item, err := service.organizationForMembership(ctx, organization, membership)
		if err != nil {
			return contracts.Viewer{}, err
		}
		organizations = append(organizations, item)
	}
	viewer := contracts.Viewer{User: contractUser(user), Organizations: organizations}
	if selectedProjectID != nil && strings.TrimSpace(*selectedProjectID) != "" {
		project, err := service.projectForViewer(ctx, userID, *selectedProjectID)
		if err != nil {
			return contracts.Viewer{}, err
		}
		viewer.SelectedProject = &project
	}
	return viewer, nil
}

func (service *Service) organizationForMembership(ctx context.Context, organization ports.OrganizationRecord, membership ports.MembershipRecord) (contracts.Organization, error) {
	organizationID := organization.ID
	projects, err := service.store.ListProjects(ctx, &organizationID, nil)
	if err != nil {
		return contracts.Organization{}, storageError()
	}
	contractProjects := make([]contracts.Project, 0, len(projects))
	for _, project := range projects {
		contractProjects = append(contractProjects, contractProject(project))
	}
	return contracts.Organization{
		ID:       organization.ID,
		Name:     organization.Name,
		Slug:     organization.Slug,
		Role:     membership.Role,
		Projects: contractProjects,
	}, nil
}

func (service *Service) requireProjectAccess(ctx context.Context, envelope contracts.BridgeEnvelope, projectID string) (ports.ProjectRecord, error) {
	if strings.TrimSpace(projectID) == "" {
		return ports.ProjectRecord{}, validationError("projectId is required")
	}
	if err := service.bootstrapViewer(ctx, envelope); err != nil {
		return ports.ProjectRecord{}, err
	}
	project, ok, err := service.store.GetProject(ctx, projectID)
	if err != nil {
		return ports.ProjectRecord{}, storageError()
	}
	if !ok {
		return ports.ProjectRecord{}, forbiddenError("project is not accessible")
	}
	if serviceScopedProjectAccess(envelope, project.ID) {
		return project, nil
	}
	membership, ok, err := service.store.GetMembership(ctx, project.OrganizationID, principalID(envelope))
	if err != nil {
		return ports.ProjectRecord{}, storageError()
	}
	if !ok {
		return ports.ProjectRecord{}, forbiddenError("viewer is not a member of project organization")
	}
	if membership.Role == contracts.CompanyRoleAdmin {
		return project, nil
	}
	if _, ok, err := service.store.GetProjectMember(ctx, project.ID, principalID(envelope)); err != nil {
		return ports.ProjectRecord{}, storageError()
	} else if !ok {
		return ports.ProjectRecord{}, forbiddenError("viewer is not a member of project")
	}
	return project, nil
}

func serviceScopedProjectAccess(envelope contracts.BridgeEnvelope, projectID string) bool {
	auth := envelope.AuthContext
	if auth == nil || auth.ProjectID == nil || *auth.ProjectID != projectID {
		return false
	}
	for _, scope := range auth.Scopes {
		switch scope {
		case "cloudgrid:alert-evaluator", "cloudgrid:storage-maintenance":
			return true
		}
	}
	return false
}

func requireAiChatCurrentProject(envelope contracts.BridgeEnvelope, projectID string) error {
	selectedProjectID := authContextProjectID(envelope)
	if selectedProjectID != nil && *selectedProjectID != strings.TrimSpace(projectID) {
		return forbiddenError("AI Chat project must match the current project")
	}
	return nil
}

func serviceScopedEnumerationAccess(envelope contracts.BridgeEnvelope, scope contracts.ServiceProjectScope) bool {
	auth := envelope.AuthContext
	if auth == nil || auth.Mode != "service" {
		return false
	}
	requiredScope := "cloudgrid:" + strings.ReplaceAll(string(scope), "_", "-")
	for _, actualScope := range auth.Scopes {
		if actualScope == requiredScope {
			return true
		}
	}
	return false
}

func validateServiceProjectScope(scope contracts.ServiceProjectScope) error {
	switch scope {
	case contracts.ServiceProjectScopeAlertEvaluator, contracts.ServiceProjectScopeStorageMaintenance:
		return nil
	default:
		return validationError("serviceScope is invalid")
	}
}

func tenantIDForProject(organizationID string) string {
	if strings.TrimSpace(organizationID) == "" {
		return LocalCompanyID
	}
	return strings.TrimSpace(organizationID)
}

func (service *Service) projectForViewer(ctx context.Context, userID string, projectID string) (contracts.Project, error) {
	project, ok, err := service.store.GetProject(ctx, projectID)
	if err != nil {
		return contracts.Project{}, storageError()
	}
	if !ok {
		return contracts.Project{}, forbiddenError("selected project is not accessible")
	}
	membership, ok, err := service.store.GetMembership(ctx, project.OrganizationID, userID)
	if err != nil {
		return contracts.Project{}, storageError()
	}
	if !ok {
		return contracts.Project{}, forbiddenError("selected project is not accessible")
	}
	if membership.Role != contracts.CompanyRoleAdmin {
		if _, ok, err := service.store.GetProjectMember(ctx, project.ID, userID); err != nil {
			return contracts.Project{}, storageError()
		} else if !ok {
			return contracts.Project{}, forbiddenError("selected project is not accessible")
		}
	}
	result := contractProject(project)
	return result, nil
}

func (service *Service) requireProjectAdmin(ctx context.Context, envelope contracts.BridgeEnvelope, projectID string) (ports.ProjectRecord, error) {
	project, err := service.requireProjectAccess(ctx, envelope, projectID)
	if err != nil {
		return ports.ProjectRecord{}, err
	}
	membership, ok, err := service.store.GetMembership(ctx, project.OrganizationID, principalID(envelope))
	if err != nil {
		return ports.ProjectRecord{}, storageError()
	}
	if ok && membership.Role == contracts.CompanyRoleAdmin {
		return project, nil
	}
	projectMember, ok, err := service.store.GetProjectMember(ctx, project.ID, principalID(envelope))
	if err != nil {
		return ports.ProjectRecord{}, storageError()
	}
	if !ok || projectMember.Role != contracts.ProjectRoleAdmin {
		return ports.ProjectRecord{}, forbiddenError("project admin role is required")
	}
	return project, nil
}

func (service *Service) requireAnotherProjectAdminOrCompanyAdmin(ctx context.Context, project ports.ProjectRecord, userID string) error {
	memberships, err := service.store.ListMemberships(ctx, project.OrganizationID)
	if err != nil {
		return storageError()
	}
	for _, membership := range memberships {
		if membership.UserID != userID && membership.Role == contracts.CompanyRoleAdmin {
			return nil
		}
	}
	members, err := service.store.ListProjectMembers(ctx, project.ID)
	if err != nil {
		return storageError()
	}
	for _, member := range members {
		if member.UserID != userID && member.Role == contracts.ProjectRoleAdmin {
			return nil
		}
	}
	return forbiddenError("project must keep at least one admin")
}

func (service *Service) requireAdmin(ctx context.Context, envelope contracts.BridgeEnvelope, organizationID string) error {
	membership, ok, err := service.store.GetMembership(ctx, organizationID, principalID(envelope))
	if err != nil {
		return storageError()
	}
	if !ok || membership.Role != contracts.CompanyRoleAdmin {
		return forbiddenError("company admin role is required")
	}
	return nil
}

func (service *Service) requireAnotherAdmin(ctx context.Context, organizationID string, userID string) error {
	memberships, err := service.store.ListMemberships(ctx, organizationID)
	if err != nil {
		return storageError()
	}
	for _, membership := range memberships {
		if membership.UserID != userID && membership.Role == contracts.CompanyRoleAdmin {
			return nil
		}
	}
	return forbiddenError("company must keep at least one admin")
}

func (service *Service) accessibleOrganizationIDs(ctx context.Context, userID string, requested *string) ([]string, error) {
	if requested != nil && strings.TrimSpace(*requested) != "" {
		if _, ok, err := service.store.GetMembership(ctx, *requested, userID); err != nil {
			return nil, storageError()
		} else if !ok {
			return nil, forbiddenError("viewer is not a member of organization")
		}
		return []string{*requested}, nil
	}
	memberships, err := service.store.ListMembershipsForUser(ctx, userID)
	if err != nil {
		return nil, storageError()
	}
	organizationIDs := make([]string, 0, len(memberships))
	for _, membership := range memberships {
		organizationIDs = append(organizationIDs, membership.OrganizationID)
	}
	return organizationIDs, nil
}

func principalID(envelope contracts.BridgeEnvelope) string {
	if envelope.AuthContext != nil && envelope.AuthContext.PrincipalID != nil && strings.TrimSpace(*envelope.AuthContext.PrincipalID) != "" {
		return strings.TrimSpace(*envelope.AuthContext.PrincipalID)
	}
	return localUserID
}

func isSSOAuth(envelope contracts.BridgeEnvelope) bool {
	return envelope.AuthContext != nil &&
		envelope.AuthContext.AuthMode != nil &&
		*envelope.AuthContext.AuthMode == "sso"
}

func companyID(envelope contracts.BridgeEnvelope) string {
	if envelope.AuthContext != nil && envelope.AuthContext.CompanyID != nil && strings.TrimSpace(*envelope.AuthContext.CompanyID) != "" {
		return strings.TrimSpace(*envelope.AuthContext.CompanyID)
	}
	return LocalCompanyID
}

func authContextProjectID(envelope contracts.BridgeEnvelope) *string {
	if envelope.AuthContext != nil && envelope.AuthContext.ProjectID != nil && strings.TrimSpace(*envelope.AuthContext.ProjectID) != "" {
		projectID := strings.TrimSpace(*envelope.AuthContext.ProjectID)
		return &projectID
	}
	return nil
}

type userProfile struct {
	DisplayName string
	Email       string
}

func principalProfile(envelope contracts.BridgeEnvelope) userProfile {
	if envelope.AuthContext == nil {
		return userProfile{}
	}
	profile := userProfile{}
	if envelope.AuthContext.PrincipalName != nil {
		profile.DisplayName = strings.TrimSpace(*envelope.AuthContext.PrincipalName)
	}
	if envelope.AuthContext.PrincipalEmail != nil {
		if email, err := normalizeEmail(*envelope.AuthContext.PrincipalEmail); err == nil {
			profile.Email = email
		}
	}
	return profile
}

func normalizeEmail(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	if email == "" {
		return "", validationError("email is required")
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || strings.Contains(address.Name, "@") {
		return "", validationError("email is invalid")
	}
	return email, nil
}

func (service *Service) requireEmailNotActiveMember(ctx context.Context, organizationID string, email string) error {
	if _, _, ok, err := service.findActiveMemberByEmail(ctx, organizationID, email); err != nil {
		return err
	} else if ok {
		return validationError("email already belongs to an active member")
	}
	return nil
}

func (service *Service) findActiveMemberByEmail(ctx context.Context, organizationID string, email string) (ports.MembershipRecord, ports.UserRecord, bool, error) {
	memberships, err := service.store.ListMemberships(ctx, organizationID)
	if err != nil {
		return ports.MembershipRecord{}, ports.UserRecord{}, false, storageError()
	}
	for _, membership := range memberships {
		user, ok, err := service.store.GetUser(ctx, membership.UserID)
		if err != nil {
			return ports.MembershipRecord{}, ports.UserRecord{}, false, storageError()
		}
		if !ok || user.Email == nil {
			continue
		}
		memberEmail, err := normalizeEmail(*user.Email)
		if err == nil && memberEmail == email {
			return membership, user, true, nil
		}
	}
	return ports.MembershipRecord{}, ports.UserRecord{}, false, nil
}

func (service *Service) createOrUpdateProjectMemberForActiveUser(ctx context.Context, envelope contracts.BridgeEnvelope, project ports.ProjectRecord, membership ports.MembershipRecord, user ports.UserRecord, role contracts.ProjectRole) (contracts.ProjectMember, error) {
	if membership.Role == contracts.CompanyRoleAdmin {
		return service.impliedProjectMember(ctx, project.ID, membership, contracts.ProjectMemberSourceCompanyAdmin)
	}
	current, ok, err := service.store.GetProjectMember(ctx, project.ID, membership.UserID)
	if err != nil {
		return contracts.ProjectMember{}, storageError()
	}
	if ok && current.Role == contracts.ProjectRoleAdmin && role != contracts.ProjectRoleAdmin {
		if err := service.requireAnotherProjectAdminOrCompanyAdmin(ctx, project, membership.UserID); err != nil {
			return contracts.ProjectMember{}, err
		}
	}
	now := service.now().UTC()
	actor := principalID(envelope)
	if !ok {
		current = ports.ProjectMemberRecord{
			ProjectID:       project.ID,
			UserID:          membership.UserID,
			CreatedAt:       now,
			CreatedByUserID: actor,
		}
	}
	current.Role = role
	current.UpdatedAt = now
	current.UpdatedByUserID = actor
	if err := service.store.PutProjectMember(ctx, current); err != nil {
		return contracts.ProjectMember{}, storageError()
	}
	return service.contractProjectMember(ctx, current, contracts.ProjectMemberSourceDirect)
}

func (service *Service) pendingInvitationForProjectGrant(ctx context.Context, project ports.ProjectRecord, email string, actor string) (ports.InvitationRecord, bool, error) {
	if invitation, ok, err := service.store.GetPendingInvitationByEmail(ctx, project.OrganizationID, email); err != nil {
		return ports.InvitationRecord{}, false, storageError()
	} else if ok {
		return invitation, false, nil
	}
	existing, err := service.store.ListInvitations(ctx, project.OrganizationID)
	if err != nil {
		return ports.InvitationRecord{}, false, storageError()
	}
	now := service.now().UTC()
	return ports.InvitationRecord{
		ID:              fmt.Sprintf("invitation-%s-%d", normalizeID(project.OrganizationID), len(existing)+1),
		OrganizationID:  project.OrganizationID,
		Email:           email,
		Role:            contracts.CompanyRoleUser,
		Status:          contracts.OrganizationInvitationStatusPending,
		InvitedByUserID: actor,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, true, nil
}

func optionalStringPtr(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
	return &trimmed
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func contractUser(user ports.UserRecord) contracts.User {
	return contracts.User{ID: user.ID, DisplayName: user.DisplayName, Email: user.Email}
}

func contractInvitation(invitation ports.InvitationRecord) contracts.OrganizationInvitation {
	deliveryStatus := invitation.DeliveryStatus
	if deliveryStatus == "" {
		deliveryStatus = contracts.InvitationDeliveryStatusSuppressed
	}
	projectGrants := append([]contracts.InvitationProjectGrant{}, invitation.ProjectGrants...)
	if projectGrants == nil {
		projectGrants = []contracts.InvitationProjectGrant{}
	}
	return contracts.OrganizationInvitation{
		ID:                    invitation.ID,
		OrganizationID:        invitation.OrganizationID,
		Email:                 invitation.Email,
		Role:                  invitation.Role,
		Status:                invitation.Status,
		DeliveryStatus:        deliveryStatus,
		LastDeliveryAttemptAt: invitation.LastDeliveryAttemptAt,
		LastDeliveryErrorCode: invitation.LastDeliveryErrorCode,
		LastEmailDeliveryID:   invitation.LastEmailDeliveryID,
		ProjectGrants:         projectGrants,
		InvitedByUserID:       invitation.InvitedByUserID,
		AcceptedByUserID:      invitation.AcceptedByUserID,
		CreatedAt:             invitation.CreatedAt,
		UpdatedAt:             invitation.UpdatedAt,
		AcceptedAt:            invitation.AcceptedAt,
		RevokedAt:             invitation.RevokedAt,
		ExpiresAt:             invitation.ExpiresAt,
	}
}

func contractProject(project ports.ProjectRecord) contracts.Project {
	return contracts.Project{
		ID:             project.ID,
		OrganizationID: project.OrganizationID,
		Name:           project.Name,
		Slug:           project.Slug,
		Status:         project.Status,
		Telemetry:      contracts.ProjectTelemetryOverview{},
	}
}

func contractDashboard(record ports.DashboardRecord) (Dashboard, error) {
	widgets := []DashboardWidget{}
	if len(record.Widgets) > 0 {
		if err := json.Unmarshal(record.Widgets, &widgets); err != nil {
			return Dashboard{}, err
		}
	}
	return Dashboard{
		ID:                record.ID,
		ProjectID:         record.ProjectID,
		OrganizationID:    record.OrganizationID,
		Slug:              record.Slug,
		Name:              record.Name,
		Description:       record.Description,
		Tags:              append([]string{}, record.Tags...),
		Version:           record.Version,
		Visibility:        internalDashboardVisibility(record.Visibility),
		DefaultTimeWindow: record.DefaultTimeWindow,
		OwnerUserID:       record.OwnerUserID,
		Widgets:           widgets,
		CreatedAt:         record.CreatedAt,
		UpdatedAt:         record.UpdatedAt,
		CreatedBy:         record.CreatedBy,
		UpdatedBy:         record.UpdatedBy,
	}, nil
}

func (service *Service) impliedProjectMember(ctx context.Context, projectID string, membership ports.MembershipRecord, source contracts.ProjectMemberSource) (contracts.ProjectMember, error) {
	user, err := service.ensureUser(ctx, membership.UserID, userProfile{})
	if err != nil {
		return contracts.ProjectMember{}, err
	}
	return contracts.ProjectMember{
		ProjectID:       projectID,
		UserID:          membership.UserID,
		Email:           user.Email,
		DisplayName:     user.DisplayName,
		Role:            contracts.ProjectRoleAdmin,
		EffectiveRole:   contracts.ProjectRoleAdmin,
		Source:          source,
		CreatedAt:       membership.CreatedAt,
		CreatedByUserID: membership.UserID,
		UpdatedAt:       membership.UpdatedAt,
		UpdatedByUserID: membership.UserID,
	}, nil
}

func (service *Service) contractProjectMember(ctx context.Context, record ports.ProjectMemberRecord, source contracts.ProjectMemberSource) (contracts.ProjectMember, error) {
	user, err := service.ensureUser(ctx, record.UserID, userProfile{})
	if err != nil {
		return contracts.ProjectMember{}, err
	}
	effectiveRole := record.Role
	if source != contracts.ProjectMemberSourceDirect {
		effectiveRole = contracts.ProjectRoleAdmin
	}
	return contracts.ProjectMember{
		ProjectID:       record.ProjectID,
		UserID:          record.UserID,
		Email:           user.Email,
		DisplayName:     user.DisplayName,
		Role:            record.Role,
		EffectiveRole:   effectiveRole,
		Source:          source,
		CreatedAt:       record.CreatedAt,
		CreatedByUserID: record.CreatedByUserID,
		UpdatedAt:       record.UpdatedAt,
		UpdatedByUserID: record.UpdatedByUserID,
	}, nil
}

func contractRetentionPolicy(record ports.RetentionPolicyRecord) contracts.RetentionPolicy {
	rules := make([]contracts.RetentionRule, 0, len(record.Rules))
	for _, rule := range record.Rules {
		rules = append(rules, contracts.RetentionRule{
			DataClass:       rule.DataClass,
			Mode:            rule.Mode,
			RetentionDays:   copyInt(rule.RetentionDays),
			SoftDeleteDays:  copyInt(rule.SoftDeleteDays),
			UpdatedAt:       rule.UpdatedAt,
			UpdatedByUserID: rule.UpdatedByUserID,
			Version:         rule.Version,
		})
	}
	sort.Slice(rules, func(i, j int) bool {
		return retentionClassRank(rules[i].DataClass) < retentionClassRank(rules[j].DataClass)
	})
	return contracts.RetentionPolicy{
		ProjectID:       record.ProjectID,
		Rules:           rules,
		UpdatedAt:       record.UpdatedAt,
		UpdatedByUserID: record.UpdatedByUserID,
		Version:         record.Version,
	}
}

func contractAlertRule(record ports.AlertRuleRecord) contracts.AlertRule {
	return contracts.AlertRule{
		ID:                      record.ID,
		ProjectID:               record.ProjectID,
		Name:                    record.Name,
		Enabled:                 record.Enabled,
		Kind:                    record.Kind,
		Severity:                record.Severity,
		Query:                   cloneAnyMap(record.Query),
		Condition:               cloneAnyMap(record.Condition),
		EvaluationWindowSeconds: record.EvaluationWindowSeconds,
		PendingForSeconds:       record.PendingForSeconds,
		CooldownSeconds:         record.CooldownSeconds,
		NotificationAdapterIDs:  append([]string{}, record.NotificationAdapterIDs...),
		CreatedAt:               record.CreatedAt,
		UpdatedAt:               record.UpdatedAt,
		UpdatedByUserID:         record.UpdatedByUserID,
		Version:                 record.Version,
	}
}

func contractAlertSilence(record ports.AlertSilenceRecord, now time.Time) contracts.AlertSilence {
	return contracts.AlertSilence{
		ID:              record.ID,
		ProjectID:       record.ProjectID,
		RuleID:          record.RuleID,
		Reason:          record.Reason,
		StartsAt:        record.StartsAt,
		EndsAt:          record.EndsAt,
		CreatedAt:       record.CreatedAt,
		CreatedByUserID: record.CreatedByUserID,
		Active:          !now.Before(record.StartsAt) && now.Before(record.EndsAt),
	}
}

func contractAlertEvent(record ports.AlertEventRecord) contracts.AlertEvent {
	return contracts.AlertEvent{
		ID:                 record.ID,
		ProjectID:          record.ProjectID,
		RuleID:             record.RuleID,
		InstanceID:         record.InstanceID,
		State:              record.State,
		Severity:           record.Severity,
		Summary:            record.Summary,
		DeduplicationKey:   record.DeduplicationKey,
		StartedAt:          record.StartedAt,
		EndedAt:            record.EndedAt,
		CreatedAt:          record.CreatedAt,
		EvidenceTraceID:    record.EvidenceTraceID,
		EvidenceSpanID:     record.EvidenceSpanID,
		EvidenceLogID:      record.EvidenceLogID,
		EvidenceMetricName: record.EvidenceMetricName,
	}
}

func (service *Service) retentionPolicy(ctx context.Context, projectID string, actor string) (contracts.RetentionPolicy, error) {
	record, err := service.retentionPolicyRecord(ctx, projectID, actor)
	if err != nil {
		return contracts.RetentionPolicy{}, err
	}
	return contractRetentionPolicy(record), nil
}

func (service *Service) retentionPolicyRecord(ctx context.Context, projectID string, actor string) (ports.RetentionPolicyRecord, error) {
	record, ok, err := service.store.GetRetentionPolicy(ctx, projectID)
	if err != nil {
		return ports.RetentionPolicyRecord{}, storageError()
	}
	if ok {
		return record, nil
	}
	now := service.now().UTC()
	record = ports.RetentionPolicyRecord{
		ProjectID:       projectID,
		Rules:           defaultRetentionRuleRecords(now, actor),
		UpdatedAt:       now,
		UpdatedByUserID: actor,
		Version:         1,
	}
	if err := service.store.PutRetentionPolicy(ctx, record); err != nil {
		return ports.RetentionPolicyRecord{}, storageError()
	}
	return record, nil
}

func (service *Service) projectAiSettings(ctx context.Context, projectID string, actor string) (map[string]any, error) {
	record, err := service.projectAiSettingsRecord(ctx, projectID, actor)
	if err != nil {
		return nil, err
	}
	return cloneAnyMap(record.Settings), nil
}

func (service *Service) projectAiSettingsRecord(ctx context.Context, projectID string, actor string) (ports.ProjectAiSettingsRecord, error) {
	record, ok, err := service.store.GetProjectAiSettings(ctx, projectID)
	if err != nil {
		return ports.ProjectAiSettingsRecord{}, storageError()
	}
	if ok {
		return record, nil
	}
	now := service.now().UTC()
	settings := defaultProjectAiSettings(projectID, now, actor, 1)
	record = ports.ProjectAiSettingsRecord{
		ProjectID:       projectID,
		Settings:        settings,
		UpdatedAt:       now,
		UpdatedByUserID: actor,
		Version:         1,
	}
	if err := service.store.PutProjectAiSettings(ctx, record); err != nil {
		return ports.ProjectAiSettingsRecord{}, storageError()
	}
	return record, nil
}

func (service *Service) companyAiProviderSettingsRecord(ctx context.Context, companyID string, actor string) (ports.CompanyAiProviderSettingsRecord, error) {
	record, ok, err := service.store.GetCompanyAiProviderSettings(ctx, companyID)
	if err != nil {
		return ports.CompanyAiProviderSettingsRecord{}, storageError()
	}
	if ok {
		normalized, changed := normalizeCompanyAiProviderSettingsRecord(record)
		if changed {
			if err := service.store.PutCompanyAiProviderSettings(ctx, normalized); err != nil {
				return ports.CompanyAiProviderSettingsRecord{}, storageError()
			}
		}
		return normalized, nil
	}
	now := service.now().UTC()
	settings := defaultCompanyAiProviderSettings(companyID, now, actor, 1)
	record = ports.CompanyAiProviderSettingsRecord{
		CompanyID:       companyID,
		Settings:        settings,
		UpdatedAt:       now,
		UpdatedByUserID: actor,
		Version:         1,
	}
	if err := service.store.PutCompanyAiProviderSettings(ctx, record); err != nil {
		return ports.CompanyAiProviderSettingsRecord{}, storageError()
	}
	return record, nil
}

func defaultProjectAiSettings(projectID string, now time.Time, actor string, version int) map[string]any {
	return map[string]any{
		"projectId":                 projectID,
		"enabled":                   false,
		"defaultProviderProfileId":  nil,
		"defaultJudgeProfileId":     nil,
		"defaultOptimizerProfileId": nil,
		"defaultEmbeddingProfileId": nil,
		"providerProfiles":          []any{},
		"modelAliases":              []any{},
		"onlinePolicies":            []any{},
		"budget": map[string]any{
			"dailyUsd":          0,
			"perRunUsd":         nil,
			"deterministicOnly": true,
			"spentTodayUsd":     0,
		},
		"sampling": map[string]any{
			"defaultOnlineSampleRate":             0,
			"maxOnlineSampleRate":                 1,
			"maxConcurrentExperimentItems":        4,
			"maxConcurrentOptimizationCandidates": 2,
		},
		"datasetDefaults": map[string]any{
			"splitAllocation": map[string]any{
				"dev":          0.20,
				"optimization": 0.40,
				"validation":   0.20,
				"regression":   0.15,
				"holdout":      0.05,
			},
			"smallDatasetReviewedThreshold": 30,
			"requireReviewForRegression":    true,
		},
		"effective": map[string]any{
			"warnings":                 []any{},
			"deterministicOnly":        true,
			"missingProviderProfiles":  []any{},
			"disabledProviderProfiles": []any{},
			"missingChatProvider":      false,
			"budgetExhausted":          false,
		},
		"version":         version,
		"updatedAt":       now,
		"updatedByUserId": actor,
	}
}

func defaultCompanyAiProviderSettings(companyID string, now time.Time, actor string, version int) map[string]any {
	return map[string]any{
		"companyId":           companyID,
		"chatProviderProfile": nil,
		"chatModelAlias":      nil,
		"effective": map[string]any{
			"enabled":                  false,
			"warnings":                 []any{"No company AI Chat provider configured."},
			"missingCredentialRefs":    []any{},
			"missingProviderProfiles":  []any{},
			"disabledProviderProfiles": []any{},
			"missingChatProvider":      true,
			"runtimeSource":            "stored",
		},
		"version":         version,
		"updatedAt":       now,
		"updatedByUserId": actor,
	}
}

func normalizeCompanyAiProviderSettingsRecord(record ports.CompanyAiProviderSettingsRecord) (ports.CompanyAiProviderSettingsRecord, bool) {
	settings := cloneAnyMap(record.Settings)
	changed := false
	effective, ok := settings["effective"].(map[string]any)
	if !ok {
		effective = map[string]any{}
		settings["effective"] = effective
		changed = true
	} else {
		effective = cloneAnyMap(effective)
		settings["effective"] = effective
	}
	if settings["chatProviderProfile"] == nil && settings["providerProfile"] != nil {
		settings["chatProviderProfile"] = settings["providerProfile"]
		changed = true
	}
	if legacyDisabled, ok := effective["disabledProviderProfileIds"].([]any); ok {
		if _, hasCurrent := effective["disabledProviderProfiles"].([]any); !hasCurrent {
			effective["disabledProviderProfiles"] = legacyDisabled
			changed = true
		}
	}
	delete(effective, "disabledProviderProfileIds")
	for _, key := range []string{"warnings", "missingCredentialRefs", "missingProviderProfiles", "disabledProviderProfiles"} {
		if _, ok := effective[key].([]any); !ok {
			effective[key] = []any{}
			changed = true
		}
	}
	if _, ok := effective["enabled"].(bool); !ok {
		effective["enabled"] = false
		changed = true
	}
	if _, ok := effective["missingChatProvider"].(bool); !ok {
		effective["missingChatProvider"] = settings["chatProviderProfile"] == nil
		changed = true
	}
	if _, ok := effective["runtimeSource"].(string); !ok {
		effective["runtimeSource"] = "stored"
		changed = true
	}
	record.Settings = settings
	return record, changed
}

func companyAiProviderSettingsFromRecord(record ports.CompanyAiProviderSettingsRecord, now time.Time, actor string) map[string]any {
	settings := cloneAnyMap(record.Settings)
	profile := settings["chatProviderProfile"]
	if profile == nil {
		profile = settings["providerProfile"]
	}
	if rawProfile := mapFromAny(profile); len(rawProfile) > 0 {
		profile = publicAiProviderProfile(rawProfile, record.CompanyID, "", now, actor)
	}
	return map[string]any{
		"companyId":       stringFromMapDefault(settings, "companyId", record.CompanyID),
		"providerProfile": profile,
		"chatModelAlias":  settings["chatModelAlias"],
		"effective":       valueOrDefault(settings["effective"], effectiveCompanyAiProviderSettings(mapFromAny(profile))),
		"version":         valueOrDefault(settings["version"], record.Version),
		"updatedAt":       valueOrDefault(settings["updatedAt"], valueOrDefault(record.UpdatedAt, now)),
		"updatedByUserId": valueOrDefault(settings["updatedByUserId"], valueOrDefault(record.UpdatedByUserID, actor)),
	}
}

func projectAiProviderSettingsFromProjectSettings(project ports.ProjectRecord, settings map[string]any, now time.Time, actor string) map[string]any {
	version := 1
	if value, ok := intFromMap(settings, "version"); ok {
		version = value
	}
	return map[string]any{
		"projectId":        project.ID,
		"providerProfiles": normalizeProjectProviderProfiles(anySliceFromMap(settings, "providerProfiles"), project.OrganizationID, project.ID, now, actor),
		"modelAliases":     normalizeProjectModelAliases(anySliceFromMap(settings, "modelAliases"), project.OrganizationID, project.ID, now, actor),
		"effective":        effectiveAiProviderSettings(anySliceFromMap(settings, "providerProfiles"), anySliceFromMap(settings, "modelAliases")),
		"version":          version,
		"updatedAt":        valueOrDefault(settings["updatedAt"], now),
		"updatedByUserId":  stringFromMapDefault(settings, "updatedByUserId", actor),
	}
}

func publicAiProviderProfile(profile map[string]any, companyID string, projectID string, now time.Time, actor string) map[string]any {
	result := cloneAnyMap(profile)
	scope := stringFromMapDefault(result, "ownerScope", stringFromMapDefault(result, "scope", "company"))
	ownerID := stringFromMapDefault(result, "ownerId", "")
	if ownerID == "" {
		if scope == "project" && projectID != "" {
			ownerID = projectID
		} else {
			ownerID = companyID
		}
	}
	result["ownerScope"] = scope
	result["ownerId"] = ownerID
	result["timeoutMs"] = valueOrDefault(result["timeoutMs"], 30000)
	result["parameters"] = valueOrDefault(result["parameters"], map[string]any{})
	result["models"] = valueOrDefault(result["models"], map[string]any{})
	result["updatedAt"] = valueOrDefault(result["updatedAt"], now)
	result["updatedByUserId"] = stringFromMapDefault(result, "updatedByUserId", actor)
	delete(result, "scope")
	delete(result, "companyId")
	delete(result, "projectId")
	return result
}

func normalizeProjectProviderProfiles(items []any, companyID string, projectID string, now time.Time, actor string) []any {
	profiles := make([]any, 0, len(items))
	seen := map[string]struct{}{}
	for index, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		profile, err := normalizeAiProviderProfile(input, "project", companyID, projectID, now, actor, index)
		if err != nil {
			continue
		}
		id := profile["id"].(string)
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		profiles = append(profiles, profile)
	}
	return profiles
}

func (service *Service) normalizeProjectProviderProfilesStrict(ctx context.Context, items []map[string]any, companyID string, projectID string, now time.Time, actor string) ([]any, error) {
	profiles := make([]any, 0, len(items))
	seen := map[string]struct{}{}
	for index, input := range items {
		profile, err := service.normalizeAiProviderProfile(ctx, input, "project", companyID, projectID, now, actor, index)
		if err != nil {
			return nil, err
		}
		id := profile["id"].(string)
		if _, exists := seen[id]; exists {
			return nil, validationError("provider profile IDs must be unique")
		}
		seen[id] = struct{}{}
		profiles = append(profiles, profile)
	}
	return profiles, nil
}

func (service *Service) normalizeCompanyAiProviderProfile(ctx context.Context, input map[string]any, companyID string, now time.Time, actor string) (map[string]any, error) {
	return service.normalizeAiProviderProfile(ctx, input, "company", companyID, "", now, actor, 0)
}

func normalizeAiProviderProfile(input map[string]any, scope string, companyID string, projectID string, now time.Time, actor string, index int) (map[string]any, error) {
	if containsSecretLookingKey(input) {
		return nil, validationError("AI provider profile must not contain raw secret-looking fields")
	}
	id, _ := stringFromMap(input, "id")
	if id == "" {
		id = fmt.Sprintf("provider-%d", index+1)
	}
	kind := stringFromMapDefault(input, "providerKind", string(contracts.AiProviderKindOpenAI))
	if !slices.Contains(contracts.AiProviderKinds, kind) {
		return nil, validationError("unsupported AI provider kind")
	}
	credentialRef := stringFromMapDefault(input, "credentialRef", "")
	if credentialRef == "" || !allowedAiCredentialRef(credentialRef) {
		return nil, validationError("credentialRef must use managed:, env:, or external:")
	}
	parameters, _ := mapFromMap(input, "parameters")
	baseURL, hasBaseURL := stringFromMap(input, "baseUrl")
	if kind == string(contracts.AiProviderKindOpenAICompatible) || kind == string(contracts.AiProviderKindAzureFoundry) {
		if !hasBaseURL || !strings.HasPrefix(baseURL, "https://") {
			return nil, validationError("provider baseUrl must be HTTPS")
		}
	}
	if kind == string(contracts.AiProviderKindOpenAI) || kind == string(contracts.AiProviderKindAnthropic) || kind == string(contracts.AiProviderKindAWSBedrock) {
		if hasBaseURL {
			return nil, validationError("provider baseUrl is not allowed for this provider kind")
		}
	}
	if kind == string(contracts.AiProviderKindAWSBedrock) {
		if _, ok := stringFromMap(parameters, "region"); !ok {
			return nil, validationError("aws_bedrock provider requires parameters.region")
		}
	}
	if kind == string(contracts.AiProviderKindAzureFoundry) {
		if _, ok := stringFromMap(parameters, "deployment"); !ok {
			return nil, validationError("azure_foundry provider requires parameters.deployment")
		}
	}
	profile := map[string]any{
		"id":              id,
		"ownerScope":      scope,
		"ownerId":         companyID,
		"scope":           scope,
		"companyId":       companyID,
		"label":           stringFromMapDefault(input, "label", id),
		"providerKind":    kind,
		"credentialRef":   credentialRef,
		"models":          valueOrDefault(input["models"], map[string]any{}),
		"parameters":      parameters,
		"timeoutMs":       valueOrDefault(input["timeoutMs"], 30000),
		"createdAt":       valueOrDefault(input["createdAt"], now),
		"updatedAt":       now,
		"updatedByUserId": actor,
	}
	if projectID != "" {
		profile["ownerId"] = projectID
		profile["projectId"] = projectID
	}
	if hasBaseURL {
		profile["baseUrl"] = baseURL
	}
	copyOptionalStringSetting(profile, input, "defaultModel")
	if value := nullableIntNumberFromMap(input, "maxConcurrency"); value != nil {
		profile["maxConcurrency"] = value
	}
	if disabledAt := input["disabledAt"]; disabledAt != nil {
		profile["disabledAt"] = disabledAt
	}
	return profile, nil
}

func (service *Service) normalizeAiProviderProfile(ctx context.Context, input map[string]any, scope string, companyID string, projectID string, now time.Time, actor string, index int) (map[string]any, error) {
	if containsSecretLookingKeyExceptCredentialValue(input) {
		return nil, validationError("AI provider profile must not contain raw secret-looking fields")
	}
	credentialValue, hasCredentialValue := stringFromMap(input, "credentialValue")
	sanitized := cloneAnyMap(input)
	delete(sanitized, "credentialValue")
	id, _ := stringFromMap(sanitized, "id")
	if id == "" {
		id = fmt.Sprintf("provider-%d", index+1)
		sanitized["id"] = id
	}
	if hasCredentialValue {
		credentialRef, err := service.storeAiProviderSecret(ctx, scope, companyID, projectID, id, credentialValue, now, actor)
		if err != nil {
			return nil, err
		}
		sanitized["credentialRef"] = credentialRef
	}
	return normalizeAiProviderProfile(sanitized, scope, companyID, projectID, now, actor, index)
}

func normalizeProjectModelAliases(items []any, companyID string, projectID string, now time.Time, actor string) []any {
	aliases := make([]any, 0, len(items))
	seen := map[string]struct{}{}
	for index, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := stringFromMap(input, "id")
		if id == "" {
			id = fmt.Sprintf("model-alias-%d", index+1)
		}
		name := stringFromMapDefault(input, "name", id)
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		parameters, _ := mapFromMap(input, "parameters")
		aliases = append(aliases, map[string]any{
			"id":                id,
			"companyId":         companyID,
			"projectId":         projectID,
			"name":              name,
			"providerProfileId": stringFromMapDefault(input, "providerProfileId", ""),
			"model":             stringFromMapDefault(input, "model", ""),
			"purpose":           stringFromMapDefault(input, "purpose", string(contracts.AiModelPurposeDefault)),
			"parameters":        parameters,
			"createdAt":         valueOrDefault(input["createdAt"], now),
			"updatedAt":         now,
			"updatedByUserId":   actor,
		})
	}
	return aliases
}

func normalizeProjectModelAliasesStrict(items []map[string]any, companyID string, projectID string, now time.Time, actor string) ([]any, error) {
	aliases := make([]any, 0, len(items))
	seenIDs := map[string]struct{}{}
	seenNames := map[string]struct{}{}
	for index, input := range items {
		if containsSecretLookingKey(input) {
			return nil, validationError("AI model aliases must not contain raw secret-looking fields")
		}
		id, _ := stringFromMap(input, "id")
		if id == "" {
			id = fmt.Sprintf("model-alias-%d", index+1)
		}
		if _, exists := seenIDs[id]; exists {
			return nil, validationError("model alias IDs must be unique")
		}
		seenIDs[id] = struct{}{}
		name := stringFromMapDefault(input, "name", id)
		if _, exists := seenNames[name]; exists {
			return nil, validationError("model alias names must be unique")
		}
		seenNames[name] = struct{}{}
		providerProfileID := stringFromMapDefault(input, "providerProfileId", "")
		if providerProfileID == "" {
			return nil, validationError("model aliases require providerProfileId")
		}
		model := stringFromMapDefault(input, "model", "")
		if model == "" {
			return nil, validationError("model aliases require model")
		}
		purpose := stringFromMapDefault(input, "purpose", string(contracts.AiModelPurposeDefault))
		if !slices.Contains(contracts.AiModelPurposes, purpose) {
			return nil, validationError("unsupported AI model purpose")
		}
		parameters, _ := mapFromMap(input, "parameters")
		aliases = append(aliases, map[string]any{
			"id":                id,
			"companyId":         companyID,
			"projectId":         projectID,
			"name":              name,
			"providerProfileId": providerProfileID,
			"model":             model,
			"purpose":           purpose,
			"parameters":        parameters,
			"createdAt":         valueOrDefault(input["createdAt"], now),
			"updatedAt":         now,
			"updatedByUserId":   actor,
		})
	}
	return aliases, nil
}

func normalizeCompanyChatModelAlias(input map[string]any, companyID string, now time.Time, actor string) map[string]any {
	parameters, _ := mapFromMap(input, "parameters")
	return map[string]any{
		"id":                stringFromMapDefault(input, "id", "company-chat"),
		"companyId":         companyID,
		"name":              stringFromMapDefault(input, "name", "chat"),
		"providerProfileId": stringFromMapDefault(input, "providerProfileId", ""),
		"model":             stringFromMapDefault(input, "model", ""),
		"purpose":           stringFromMapDefault(input, "purpose", string(contracts.AiModelPurposeChat)),
		"parameters":        parameters,
		"createdAt":         valueOrDefault(input["createdAt"], now),
		"updatedAt":         now,
		"updatedByUserId":   actor,
	}
}

func effectiveAiProviderSettings(profiles []any, aliases []any) map[string]any {
	missingCredentialRefs := []any{}
	disabledProfileIDs := []any{}
	for _, item := range profiles {
		profile, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := stringFromMapDefault(profile, "id", "")
		if _, ok := stringFromMap(profile, "credentialRef"); !ok && id != "" {
			missingCredentialRefs = append(missingCredentialRefs, id)
		}
		if profile["disabledAt"] != nil && id != "" {
			disabledProfileIDs = append(disabledProfileIDs, id)
		}
	}
	return map[string]any{
		"enabled":                  len(profiles) > 0 && len(missingCredentialRefs) == 0,
		"warnings":                 []any{},
		"missingCredentialRefs":    missingCredentialRefs,
		"missingProviderProfiles":  []any{},
		"disabledProviderProfiles": disabledProfileIDs,
		"missingChatProvider":      false,
		"missingAliasPurposes":     missingAiModelAliasPurposes(aliases),
		"runtimeSource":            "stored",
	}
}

func effectiveCompanyAiProviderSettings(profile map[string]any) map[string]any {
	missingCredentialRefs := []any{}
	warnings := []any{}
	missingChatProvider := len(profile) == 0
	if missingChatProvider {
		warnings = append(warnings, "No company AI Chat provider configured.")
	} else if _, ok := stringFromMap(profile, "credentialRef"); !ok {
		missingCredentialRefs = append(missingCredentialRefs, stringFromMapDefault(profile, "id", "company-chat"))
		warnings = append(warnings, "Company AI Chat provider is missing a credential reference.")
	}
	disabledProfileIDs := []any{}
	if profile["disabledAt"] != nil {
		disabledProfileIDs = append(disabledProfileIDs, stringFromMapDefault(profile, "id", "company-chat"))
	}
	return map[string]any{
		"enabled":                  len(missingCredentialRefs) == 0 && len(disabledProfileIDs) == 0,
		"warnings":                 warnings,
		"missingCredentialRefs":    missingCredentialRefs,
		"missingProviderProfiles":  []any{},
		"disabledProviderProfiles": disabledProfileIDs,
		"missingChatProvider":      missingChatProvider,
		"runtimeSource":            "stored",
	}
}

func missingAiModelAliasPurposes(aliases []any) []any {
	purposes := map[string]struct{}{}
	for _, item := range aliases {
		alias, ok := item.(map[string]any)
		if !ok {
			continue
		}
		purpose := stringFromMapDefault(alias, "purpose", "")
		if purpose != "" {
			purposes[purpose] = struct{}{}
		}
	}
	missing := []any{}
	for _, purpose := range []string{string(contracts.AiModelPurposeDefault), string(contracts.AiModelPurposeChat), string(contracts.AiModelPurposeJudge), string(contracts.AiModelPurposeOptimizer), string(contracts.AiModelPurposeEmbedding), string(contracts.AiModelPurposeReplay)} {
		if _, ok := purposes[purpose]; !ok {
			missing = append(missing, purpose)
		}
	}
	return missing
}

func normalizeProjectAiSettingsInput(input map[string]any, projectID string, now time.Time, actor string, version int) (map[string]any, error) {
	if containsSecretLookingKey(input) {
		return nil, validationError("project AI settings must not contain raw secret-looking fields")
	}
	settings := defaultProjectAiSettings(projectID, now, actor, version)
	settings["enabled"] = boolFromMap(input, "enabled")
	copyOptionalStringSetting(settings, input, "defaultProviderProfileId")
	copyOptionalStringSetting(settings, input, "defaultJudgeProfileId")
	copyOptionalStringSetting(settings, input, "defaultOptimizerProfileId")
	copyOptionalStringSetting(settings, input, "defaultEmbeddingProfileId")
	settings["providerProfiles"] = normalizeProviderProfiles(anySliceFromMap(input, "providerProfiles"), projectID, now)
	settings["modelAliases"] = normalizeModelAliases(anySliceFromMap(input, "modelAliases"))
	policies, err := normalizeOnlinePolicies(anySliceFromMap(input, "onlinePolicies"), now, actor)
	if err != nil {
		return nil, err
	}
	settings["onlinePolicies"] = policies
	if budget, ok := mapFromMap(input, "budget"); ok {
		settings["budget"] = map[string]any{
			"dailyUsd":          numberFromMap(budget, "dailyUsd", 0),
			"perRunUsd":         nullableNumberFromMap(budget, "perRunUsd"),
			"deterministicOnly": boolFromMapDefault(budget, "deterministicOnly", false),
			"spentTodayUsd":     0,
		}
	}
	if sampling, ok := mapFromMap(input, "sampling"); ok {
		settings["sampling"] = map[string]any{
			"defaultOnlineSampleRate":             numberFromMap(sampling, "defaultOnlineSampleRate", 0),
			"maxOnlineSampleRate":                 numberFromMap(sampling, "maxOnlineSampleRate", 1),
			"maxConcurrentExperimentItems":        intNumberFromMap(sampling, "maxConcurrentExperimentItems", 4),
			"maxConcurrentOptimizationCandidates": intNumberFromMap(sampling, "maxConcurrentOptimizationCandidates", 2),
		}
	}
	if defaults, ok := mapFromMap(input, "datasetDefaults"); ok {
		split, _ := mapFromMap(defaults, "splitAllocation")
		settings["datasetDefaults"] = map[string]any{
			"splitAllocation":               split,
			"smallDatasetReviewedThreshold": intNumberFromMap(defaults, "smallDatasetReviewedThreshold", 30),
			"requireReviewForRegression":    boolFromMapDefault(defaults, "requireReviewForRegression", true),
		}
	}
	settings["effective"] = effectiveProjectAiSettings(settings)
	return settings, nil
}

func normalizeProviderProfiles(items []any, projectID string, now time.Time) []any {
	profiles := make([]any, 0, len(items))
	for index, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := stringFromMap(input, "id")
		if id == "" {
			id = fmt.Sprintf("provider-%d", index+1)
		}
		profile := map[string]any{
			"id":           id,
			"projectId":    projectID,
			"label":        stringFromMapDefault(input, "label", id),
			"providerKind": stringFromMapDefault(input, "providerKind", "local_harness"),
			"models":       valueOrDefault(input["models"], map[string]any{}),
			"timeoutMs":    intNumberFromMap(input, "timeoutMs", 30000),
		}
		copyOptionalStringSetting(profile, input, "baseUrl")
		copyOptionalStringSetting(profile, input, "credentialRef")
		if value := nullableIntNumberFromMap(input, "maxConcurrency"); value != nil {
			profile["maxConcurrency"] = value
		}
		if boolFromMapDefault(input, "disabled", false) {
			profile["disabledAt"] = now
		}
		profiles = append(profiles, profile)
	}
	return profiles
}

func normalizeModelAliases(items []any) []any {
	aliases := make([]any, 0, len(items))
	for index, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := stringFromMap(input, "id")
		if id == "" {
			id = fmt.Sprintf("model-alias-%d", index+1)
		}
		aliases = append(aliases, map[string]any{
			"id":                id,
			"name":              stringFromMapDefault(input, "name", id),
			"providerProfileId": stringFromMapDefault(input, "providerProfileId", ""),
			"model":             stringFromMapDefault(input, "model", ""),
			"purpose":           stringFromMapDefault(input, "purpose", "default"),
			"parameters":        valueOrDefault(input["parameters"], map[string]any{}),
		})
	}
	return aliases
}

func normalizeOnlinePolicies(items []any, now time.Time, actor string) ([]any, error) {
	policies := make([]any, 0, len(items))
	for index, item := range items {
		input, ok := item.(map[string]any)
		if !ok {
			continue
		}
		target, _ := mapFromMap(input, "target")
		if boolFromMapDefault(input, "enabled", false) && len(target) == 0 {
			return nil, validationError("enabled online policies require a target")
		}
		id, _ := stringFromMap(input, "id")
		if id == "" {
			id = fmt.Sprintf("online-policy-%d", index+1)
		}
		policies = append(policies, map[string]any{
			"id":              id,
			"enabled":         boolFromMapDefault(input, "enabled", false),
			"name":            stringFromMapDefault(input, "name", id),
			"target":          target,
			"scorerIds":       stringSliceFromAny(input["scorerIds"]),
			"sampleRate":      numberFromMap(input, "sampleRate", 0),
			"maxDailyRuns":    nullableIntNumberFromMap(input, "maxDailyRuns"),
			"annotationRules": anySliceFromMap(input, "annotationRules"),
			"updatedAt":       now,
			"updatedByUserId": actor,
		})
	}
	return policies, nil
}

func effectiveProjectAiSettings(settings map[string]any) map[string]any {
	budget, _ := settings["budget"].(map[string]any)
	deterministicOnly := boolFromMapDefault(budget, "deterministicOnly", false)
	warnings := []any{}
	if profiles := anySlice(settings["providerProfiles"]); len(profiles) == 0 && !deterministicOnly {
		warnings = append(warnings, "No provider profiles configured.")
	}
	return map[string]any{
		"warnings":                 warnings,
		"deterministicOnly":        deterministicOnly,
		"missingProviderProfiles":  []any{},
		"disabledProviderProfiles": []any{},
		"budgetExhausted":          numberFromMap(budget, "dailyUsd", 0) <= numberFromMap(budget, "spentTodayUsd", 0),
	}
}

func defaultRetentionRuleRecords(now time.Time, actor string) []ports.RetentionRuleRecord {
	days30 := 30
	days90 := 90
	days365 := 365
	return []ports.RetentionRuleRecord{
		{DataClass: contracts.RetentionDataClassTraces, Mode: contracts.RetentionModeDelete, RetentionDays: &days30, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassLogs, Mode: contracts.RetentionModeDelete, RetentionDays: &days30, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassMetrics, Mode: contracts.RetentionModeDelete, RetentionDays: &days30, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassAIEvals, Mode: contracts.RetentionModeDelete, RetentionDays: &days90, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassDatasets, Mode: contracts.RetentionModeRetain, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassScorers, Mode: contracts.RetentionModeRetain, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassDashboardHistory, Mode: contracts.RetentionModeRetain, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
		{DataClass: contracts.RetentionDataClassIngestCredentialAudit, Mode: contracts.RetentionModeDelete, RetentionDays: &days365, UpdatedAt: now, UpdatedByUserID: actor, Version: 1},
	}
}

func dashboardWidgetsFromInput(inputs []DashboardWidgetInput) []DashboardWidget {
	widgets := make([]DashboardWidget, 0, len(inputs))
	for _, input := range inputs {
		minW := 3
		if input.Layout.MinW != nil {
			minW = *input.Layout.MinW
		}
		minH := 2
		if input.Layout.MinH != nil {
			minH = *input.Layout.MinH
		}
		widgets = append(widgets, DashboardWidget{
			ID:          strings.TrimSpace(input.ID),
			Title:       strings.TrimSpace(input.Title),
			Description: trimOptionalString(input.Description),
			Kind:        input.Kind,
			Layout: DashboardWidgetLayout{
				X:    input.Layout.X,
				Y:    input.Layout.Y,
				W:    input.Layout.W,
				H:    input.Layout.H,
				MinW: minW,
				MinH: minH,
			},
			Metric:     normalizeDashboardMetricWidget(input.Metric),
			RichMetric: normalizeDashboardRichMetricWidget(input.RichMetric),
			Logs:       normalizeDashboardLogWidget(input.Logs),
			Traces:     normalizeDashboardTraceWidget(input.Traces),
			LiveTraces: normalizeDashboardLiveTraceWidget(input.LiveTraces),
			Alert:      normalizeDashboardAlertWidget(input.Alert),
		})
	}
	return widgets
}

func normalizeDashboardMetricWidget(input *DashboardMetricWidgetInput) *DashboardMetricWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.MetricName = strings.TrimSpace(widget.MetricName)
	widget.GroupBy = normalizeStringList(widget.GroupBy)
	widget.Filters = append([]contracts.AttributeFilter{}, widget.Filters...)
	widget.Interval = trimOptionalString(widget.Interval)
	if widget.TimeWindow == nil {
		widget.TimeWindow = ptr("PT1H")
	} else if strings.TrimSpace(*widget.TimeWindow) != "" {
		timeWindow := strings.TrimSpace(*widget.TimeWindow)
		widget.TimeWindow = &timeWindow
	}
	if widget.Legend == nil {
		widget.Legend = ptr(true)
	}
	if widget.MaxSeries == nil {
		widget.MaxSeries = ptr(20)
	}
	widget.Thresholds = append([]DashboardThresholdInput{}, widget.Thresholds...)
	return &widget
}

func normalizeDashboardRichMetricWidget(input *DashboardRichMetricWidgetInput) *DashboardRichMetricWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.Query = normalizeDashboardMetricQuery(widget.Query)
	if widget.Legend == nil {
		widget.Legend = ptr(true)
	}
	if widget.MaxSeries == nil {
		widget.MaxSeries = ptr(20)
	}
	widget.Thresholds = append([]DashboardThresholdInput{}, widget.Thresholds...)
	return &widget
}

func normalizeDashboardMetricQuery(input DashboardMetricQueryInput) DashboardMetricQueryInput {
	query := input
	if query.TimeWindow == nil {
		query.TimeWindow = ptr("PT1H")
	} else if strings.TrimSpace(*query.TimeWindow) != "" {
		timeWindow := strings.TrimSpace(*query.TimeWindow)
		query.TimeWindow = &timeWindow
	}
	query.Interval = trimOptionalString(query.Interval)
	query.Queries = append([]DashboardMetricQueryRowInput{}, query.Queries...)
	for index := range query.Queries {
		query.Queries[index].ID = strings.TrimSpace(query.Queries[index].ID)
		query.Queries[index].Label = strings.TrimSpace(query.Queries[index].Label)
		query.Queries[index].MetricName = strings.TrimSpace(query.Queries[index].MetricName)
		query.Queries[index].GroupBy = normalizeStringList(query.Queries[index].GroupBy)
		query.Queries[index].Filters = append([]contracts.AttributeFilter{}, query.Queries[index].Filters...)
		if query.Queries[index].MaxSeries == nil {
			query.Queries[index].MaxSeries = ptr(20)
		}
	}
	query.Formulas = append([]DashboardMetricFormulaInput{}, query.Formulas...)
	for index := range query.Formulas {
		query.Formulas[index].ID = strings.TrimSpace(query.Formulas[index].ID)
		query.Formulas[index].Label = strings.TrimSpace(query.Formulas[index].Label)
		query.Formulas[index].Unit = trimOptionalString(query.Formulas[index].Unit)
	}
	query.DisplaySeries = append([]DashboardMetricDisplaySeriesInput{}, query.DisplaySeries...)
	for index := range query.DisplaySeries {
		query.DisplaySeries[index].ID = strings.TrimSpace(query.DisplaySeries[index].ID)
		query.DisplaySeries[index].Label = strings.TrimSpace(query.DisplaySeries[index].Label)
		query.DisplaySeries[index].SourceID = strings.TrimSpace(query.DisplaySeries[index].SourceID)
		if query.DisplaySeries[index].Visible == nil {
			query.DisplaySeries[index].Visible = ptr(true)
		}
	}
	return query
}

func normalizeDashboardLogWidget(input *DashboardLogWidgetInput) *DashboardLogWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.Service = trimOptionalString(widget.Service)
	widget.TraceID = trimOptionalString(widget.TraceID)
	widget.SpanID = trimOptionalString(widget.SpanID)
	widget.Severity = trimOptionalString(widget.Severity)
	widget.Search = trimOptionalString(widget.Search)
	widget.Attributes = append([]contracts.AttributeFilter{}, widget.Attributes...)
	if widget.Sort == nil {
		widget.Sort = ptr(contracts.LogSortTimestampDesc)
	}
	if widget.Limit == nil {
		widget.Limit = ptr(50)
	}
	if len(widget.Columns) == 0 {
		widget.Columns = []string{"timestamp", "severity", "service", "trace_span", "body"}
	} else {
		widget.Columns = normalizeStringList(widget.Columns)
	}
	return &widget
}

func normalizeDashboardTraceWidget(input *DashboardTraceWidgetInput) *DashboardTraceWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.Service = trimOptionalString(widget.Service)
	widget.Query = trimOptionalString(widget.Query)
	widget.OperationName = trimOptionalString(widget.OperationName)
	widget.SpanName = trimOptionalString(widget.SpanName)
	widget.Attributes = append([]contracts.AttributeFilter{}, widget.Attributes...)
	if widget.Sort == nil {
		widget.Sort = ptr(contracts.TraceSortStartedAtDesc)
	}
	if widget.Limit == nil {
		widget.Limit = ptr(50)
	}
	if len(widget.Columns) == 0 {
		widget.Columns = []string{"started_at", "status", "service", "operation", "duration"}
	} else {
		widget.Columns = normalizeStringList(widget.Columns)
	}
	return &widget
}

func normalizeDashboardLiveTraceWidget(input *DashboardLiveTraceWidgetInput) *DashboardLiveTraceWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.Service = trimOptionalString(widget.Service)
	widget.Query = trimOptionalString(widget.Query)
	widget.OperationName = trimOptionalString(widget.OperationName)
	widget.SpanName = trimOptionalString(widget.SpanName)
	widget.Attributes = append([]contracts.AttributeFilter{}, widget.Attributes...)
	if widget.Limit == nil {
		widget.Limit = ptr(50)
	}
	return &widget
}

func normalizeDashboardAlertWidget(input *DashboardAlertWidgetInput) *DashboardAlertWidgetInput {
	if input == nil {
		return nil
	}
	widget := *input
	widget.RuleIDs = append([]string{}, widget.RuleIDs...)
	widget.States = append([]contracts.AlertState{}, widget.States...)
	widget.Severities = append([]contracts.AlertSeverity{}, widget.Severities...)
	widget.Signals = append([]contracts.AlertSignal{}, widget.Signals...)
	if widget.TimeWindow == nil {
		widget.TimeWindow = ptr("PT1H")
	} else {
		timeWindow := strings.TrimSpace(*widget.TimeWindow)
		widget.TimeWindow = &timeWindow
	}
	if widget.Limit == nil {
		widget.Limit = ptr(20)
	}
	return &widget
}

func validateDashboardInput(input DashboardSaveInput) error {
	if strings.TrimSpace(input.Name) == "" {
		return validationError("dashboard name is required")
	}
	if len(input.Widgets) == 0 || len(input.Widgets) > 24 {
		return validationError("dashboard must include between 1 and 24 widgets")
	}
	if input.DefaultTimeWindow != nil && strings.TrimSpace(*input.DefaultTimeWindow) == "" {
		return validationError("dashboard defaultTimeWindow cannot be blank")
	}
	if containsSecretKey("name", input.Name) || containsSecretKey("description", optionalStringValue(input.Description)) {
		return validationError("dashboard contains a secret-like key")
	}
	for _, tag := range input.Tags {
		if containsSecretKey("tag", tag) {
			return validationError("dashboard contains a secret-like key")
		}
	}
	widgetIDs := map[string]struct{}{}
	for _, widget := range input.Widgets {
		if strings.TrimSpace(widget.ID) == "" || strings.TrimSpace(widget.Title) == "" {
			return validationError("dashboard widget id and title are required")
		}
		if _, ok := widgetIDs[widget.ID]; ok {
			return validationError("dashboard widget ids must be unique")
		}
		widgetIDs[widget.ID] = struct{}{}
		if widget.Layout.X < 0 || widget.Layout.X > 11 || widget.Layout.Y < 0 || widget.Layout.W < 1 || widget.Layout.W > 12 || widget.Layout.H < 1 || widget.Layout.H > 12 || widget.Layout.X+widget.Layout.W > 12 {
			return validationError("dashboard widget layout is invalid")
		}
		if widget.Layout.MinW != nil && (*widget.Layout.MinW < 1 || *widget.Layout.MinW > 12 || widget.Layout.W < *widget.Layout.MinW) {
			return validationError("dashboard widget minW is invalid")
		}
		if widget.Layout.MinH != nil && (*widget.Layout.MinH < 1 || *widget.Layout.MinH > 12 || widget.Layout.H < *widget.Layout.MinH) {
			return validationError("dashboard widget minH is invalid")
		}
		if containsSecretKey("title", widget.Title) || containsSecretKey("description", optionalStringValue(widget.Description)) {
			return validationError("dashboard contains a secret-like key")
		}
		if err := validateDashboardWidgetKind(widget); err != nil {
			return err
		}
	}
	if dashboardWidgetsOverlap(input.Widgets) {
		return validationError("dashboard widget layouts must not overlap")
	}
	return nil
}

func dashboardWidgetsOverlap(widgets []DashboardWidgetInput) bool {
	for leftIndex := range widgets {
		for rightIndex := leftIndex + 1; rightIndex < len(widgets); rightIndex++ {
			left := widgets[leftIndex].Layout
			right := widgets[rightIndex].Layout
			if left.X < right.X+right.W && left.X+left.W > right.X && left.Y < right.Y+right.H && left.Y+left.H > right.Y {
				return true
			}
		}
	}
	return false
}

func validateDashboardWidgetKind(widget DashboardWidgetInput) error {
	configCount := 0
	if widget.Metric != nil {
		configCount++
	}
	if widget.RichMetric != nil {
		configCount++
	}
	if widget.Logs != nil {
		configCount++
	}
	if widget.Traces != nil {
		configCount++
	}
	if widget.LiveTraces != nil {
		configCount++
	}
	if widget.Alert != nil {
		configCount++
	}
	switch widget.Kind {
	case DashboardWidgetKindMetricTimeseries, DashboardWidgetKindMetricStat, DashboardWidgetKindMetricTable:
		if configCount != 1 || widget.Metric == nil {
			return validationError("metric dashboard widgets require exactly one metric config")
		}
		return validateDashboardMetricWidget(*widget.Metric)
	case DashboardWidgetKindMetricRich:
		if configCount != 1 || widget.RichMetric == nil {
			return validationError("rich metric dashboard widgets require exactly one richMetric config")
		}
		return validateDashboardRichMetricWidget(*widget.RichMetric)
	case DashboardWidgetKindLogTable:
		if configCount != 1 || widget.Logs == nil {
			return validationError("log dashboard widgets require exactly one logs config")
		}
		return validateDashboardLogWidget(*widget.Logs)
	case DashboardWidgetKindTraceTable:
		if configCount != 1 || widget.Traces == nil {
			return validationError("trace dashboard widgets require exactly one traces config")
		}
		return validateDashboardTraceWidget(*widget.Traces)
	case DashboardWidgetKindLiveTraceTable:
		if configCount != 1 || widget.LiveTraces == nil {
			return validationError("live trace dashboard widgets require exactly one liveTraces config")
		}
		return validateDashboardLiveTraceWidget(*widget.LiveTraces)
	case DashboardWidgetKindAlertStatus, DashboardWidgetKindAlertHistory, DashboardWidgetKindAlertEvidence:
		if configCount != 1 || widget.Alert == nil {
			return validationError("alert dashboard widgets require exactly one alert config")
		}
		return validateDashboardAlertWidget(*widget.Alert)
	default:
		return validationError("dashboard widget kind is invalid")
	}
}

func validateDashboardMetricWidget(metric DashboardMetricWidgetInput) error {
	if strings.TrimSpace(metric.MetricName) == "" {
		return validationError("dashboard metric widget metricName is required")
	}
	if err := validateMetricAggregation(metric.Aggregation); err != nil {
		return err
	}
	if err := validateMetricChartType(metric.Visualization); err != nil {
		return err
	}
	if metric.TimeWindow != nil && strings.TrimSpace(*metric.TimeWindow) == "" {
		return validationError("dashboard metric widget timeWindow cannot be blank")
	}
	if metric.MaxSeries != nil && (*metric.MaxSeries < 1 || *metric.MaxSeries > 50) {
		return validationError("dashboard metric widget maxSeries is invalid")
	}
	if len(metric.GroupBy) > 6 || len(metric.Filters) > 20 || len(metric.Thresholds) > 8 {
		return validationError("dashboard metric widget exceeds limits")
	}
	if containsSecretKey("metricName", metric.MetricName) {
		return validationError("dashboard contains a secret-like key")
	}
	for _, groupBy := range metric.GroupBy {
		if strings.TrimSpace(groupBy) == "" {
			return validationError("dashboard metric groupBy keys cannot be blank")
		}
		if containsSecretKey(groupBy, groupBy) {
			return validationError("dashboard contains a secret-like key")
		}
	}
	if err := validateAttributeFilters(metric.Filters); err != nil {
		return err
	}
	for _, threshold := range metric.Thresholds {
		if err := validateDashboardThreshold(threshold); err != nil {
			return err
		}
	}
	return nil
}

func validateDashboardRichMetricWidget(metric DashboardRichMetricWidgetInput) error {
	if err := validateMetricChartType(metric.Visualization); err != nil {
		return err
	}
	if metric.MaxSeries != nil && (*metric.MaxSeries < 1 || *metric.MaxSeries > 50) {
		return validationError("dashboard rich metric widget maxSeries is invalid")
	}
	if len(metric.Thresholds) > 8 {
		return validationError("dashboard rich metric widget exceeds limits")
	}
	if err := validateDashboardMetricQuery(metric.Query); err != nil {
		return err
	}
	for _, threshold := range metric.Thresholds {
		if err := validateDashboardThreshold(threshold); err != nil {
			return err
		}
	}
	return nil
}

func validateDashboardMetricQuery(query DashboardMetricQueryInput) error {
	if query.TimeWindow != nil && strings.TrimSpace(*query.TimeWindow) == "" {
		return validationError("dashboard rich metric query timeWindow cannot be blank")
	}
	if len(query.Queries) == 0 || len(query.Queries) > 8 || len(query.Formulas) > 8 || len(query.DisplaySeries) > 20 {
		return validationError("dashboard rich metric query exceeds limits")
	}
	availableIDs := map[string]struct{}{}
	for _, row := range query.Queries {
		if strings.TrimSpace(row.ID) == "" || strings.TrimSpace(row.Label) == "" || strings.TrimSpace(row.MetricName) == "" {
			return validationError("dashboard rich metric query rows require id, label, and metricName")
		}
		if _, ok := availableIDs[row.ID]; ok {
			return validationError("dashboard rich metric query ids must be unique")
		}
		availableIDs[row.ID] = struct{}{}
		if err := validateMetricAggregation(row.Aggregation); err != nil {
			return err
		}
		if row.MaxSeries != nil && (*row.MaxSeries < 1 || *row.MaxSeries > 50) {
			return validationError("dashboard rich metric query maxSeries is invalid")
		}
		if len(row.GroupBy) > 6 || len(row.Filters) > 20 {
			return validationError("dashboard rich metric query row exceeds limits")
		}
		if containsSecretKey("metricName", row.MetricName) {
			return validationError("dashboard contains a secret-like key")
		}
		for _, groupBy := range row.GroupBy {
			if strings.TrimSpace(groupBy) == "" {
				return validationError("dashboard metric groupBy keys cannot be blank")
			}
			if containsSecretKey(groupBy, groupBy) {
				return validationError("dashboard contains a secret-like key")
			}
		}
		if err := validateAttributeFilters(row.Filters); err != nil {
			return err
		}
	}
	for _, formula := range query.Formulas {
		if strings.TrimSpace(formula.ID) == "" || strings.TrimSpace(formula.Label) == "" {
			return validationError("dashboard rich metric formulas require id and label")
		}
		if _, ok := availableIDs[formula.ID]; ok {
			return validationError("dashboard rich metric query ids must be unique")
		}
		if err := validateDashboardMetricFormulaExpression(formula.Expression, availableIDs, 1); err != nil {
			return err
		}
		availableIDs[formula.ID] = struct{}{}
	}
	for _, display := range query.DisplaySeries {
		if strings.TrimSpace(display.ID) == "" || strings.TrimSpace(display.Label) == "" || strings.TrimSpace(display.SourceID) == "" {
			return validationError("dashboard rich metric display series require id, label, and sourceId")
		}
		if _, ok := availableIDs[display.SourceID]; !ok {
			return validationError("dashboard rich metric display series source is unknown")
		}
	}
	return nil
}

func validateDashboardMetricFormulaExpression(expression DashboardMetricFormulaExpressionInput, availableIDs map[string]struct{}, depth int) error {
	if depth > 8 {
		return validationError("dashboard rich metric formula expression is too deep")
	}
	switch expression.Kind {
	case contracts.DashboardMetricFormulaExpressionKindRef:
		if expression.RefID == nil || strings.TrimSpace(*expression.RefID) == "" {
			return validationError("dashboard rich metric formula refId is required")
		}
		if _, ok := availableIDs[strings.TrimSpace(*expression.RefID)]; !ok {
			return validationError("dashboard rich metric formula reference is unknown")
		}
		return nil
	case contracts.DashboardMetricFormulaExpressionKindNumber:
		if expression.Value == nil {
			return validationError("dashboard rich metric formula number value is required")
		}
		return nil
	case contracts.DashboardMetricFormulaExpressionKindBinary:
		if expression.Operator == nil || !validDashboardMetricFormulaBinaryOperator(*expression.Operator) || expression.Left == nil || expression.Right == nil {
			return validationError("dashboard rich metric binary formula is invalid")
		}
		if err := validateDashboardMetricFormulaExpression(*expression.Left, availableIDs, depth+1); err != nil {
			return err
		}
		return validateDashboardMetricFormulaExpression(*expression.Right, availableIDs, depth+1)
	case contracts.DashboardMetricFormulaExpressionKindUnary:
		return validationError("dashboard rich metric unary formulas are not supported")
	case contracts.DashboardMetricFormulaExpressionKindFunction:
		return validateDashboardMetricFormulaFunction(expression, availableIDs, depth)
	default:
		return validationError("dashboard rich metric formula expression kind is invalid")
	}
}

func validDashboardMetricFormulaBinaryOperator(operator contracts.DashboardMetricFormulaBinaryOperator) bool {
	switch operator {
	case contracts.DashboardMetricFormulaBinaryOperatorAdd, contracts.DashboardMetricFormulaBinaryOperatorSubtract, contracts.DashboardMetricFormulaBinaryOperatorMultiply, contracts.DashboardMetricFormulaBinaryOperatorDivide:
		return true
	default:
		return false
	}
}

func validateDashboardMetricFormulaFunction(expression DashboardMetricFormulaExpressionInput, availableIDs map[string]struct{}, depth int) error {
	if expression.Function == nil {
		return validationError("dashboard rich metric formula function is required")
	}
	switch *expression.Function {
	case contracts.DashboardMetricFormulaFunctionRatio:
		if len(expression.Arguments) != 2 {
			return validationError("dashboard rich metric ratio formula requires two arguments")
		}
	default:
		return validationError("dashboard rich metric formula function is not supported")
	}
	for _, argument := range expression.Arguments {
		if err := validateDashboardMetricFormulaExpression(argument, availableIDs, depth+1); err != nil {
			return err
		}
	}
	return nil
}

func validateDashboardLogWidget(logs DashboardLogWidgetInput) error {
	if logs.Limit != nil && (*logs.Limit < 1 || *logs.Limit > 200) {
		return validationError("dashboard log widget limit is invalid")
	}
	if len(logs.Attributes) > 20 {
		return validationError("dashboard log widget exceeds filter limits")
	}
	for _, value := range []any{optionalStringValue(logs.Service), optionalStringValue(logs.TraceID), optionalStringValue(logs.SpanID), optionalStringValue(logs.Severity), optionalStringValue(logs.Search)} {
		if containsSecretKey("", value) {
			return validationError("dashboard contains a secret-like key")
		}
	}
	return validateAttributeFilters(logs.Attributes)
}

func validateDashboardTraceWidget(traces DashboardTraceWidgetInput) error {
	if traces.Limit != nil && (*traces.Limit < 1 || *traces.Limit > 200) {
		return validationError("dashboard trace widget limit is invalid")
	}
	if len(traces.Attributes) > 20 {
		return validationError("dashboard trace widget exceeds filter limits")
	}
	if traces.MinDurationMs != nil && traces.MaxDurationMs != nil && *traces.MinDurationMs > *traces.MaxDurationMs {
		return validationError("dashboard trace duration bounds are invalid")
	}
	return validateAttributeFilters(traces.Attributes)
}

func validateDashboardLiveTraceWidget(traces DashboardLiveTraceWidgetInput) error {
	if traces.Limit != nil && (*traces.Limit < 1 || *traces.Limit > 200) {
		return validationError("dashboard live trace widget limit is invalid")
	}
	if len(traces.Attributes) > 20 {
		return validationError("dashboard live trace widget exceeds filter limits")
	}
	if traces.MinDurationMs != nil && traces.MaxDurationMs != nil && *traces.MinDurationMs > *traces.MaxDurationMs {
		return validationError("dashboard live trace duration bounds are invalid")
	}
	return validateAttributeFilters(traces.Attributes)
}

func validateDashboardAlertWidget(alert DashboardAlertWidgetInput) error {
	if len(alert.RuleIDs) > 20 {
		return validationError("dashboard alert widget exceeds rule limits")
	}
	if alert.Limit != nil && (*alert.Limit < 1 || *alert.Limit > 100) {
		return validationError("dashboard alert widget limit is invalid")
	}
	if alert.TimeWindow != nil && strings.TrimSpace(*alert.TimeWindow) == "" {
		return validationError("dashboard alert widget timeWindow cannot be blank")
	}
	for _, ruleID := range alert.RuleIDs {
		if strings.TrimSpace(ruleID) == "" {
			return validationError("dashboard alert widget ruleIds cannot be blank")
		}
		if containsSecretKey("ruleId", ruleID) {
			return validationError("dashboard contains a secret-like key")
		}
	}
	for _, state := range alert.States {
		if !isAlertState(state) {
			return validationError("dashboard alert widget state is invalid")
		}
	}
	for _, severity := range alert.Severities {
		if !isAlertSeverity(severity) {
			return validationError("dashboard alert widget severity is invalid")
		}
	}
	for _, signal := range alert.Signals {
		if !isAlertSignal(signal) {
			return validationError("dashboard alert widget signal is invalid")
		}
	}
	return nil
}

func validateDashboardThreshold(threshold DashboardThresholdInput) error {
	switch threshold.Severity {
	case DashboardThresholdSeverityInfo, DashboardThresholdSeverityWarning, DashboardThresholdSeverityError:
		return nil
	default:
		return validationError("dashboard threshold severity is invalid")
	}
}

func validateAttributeFilters(filters []contracts.AttributeFilter) error {
	for _, filter := range filters {
		if strings.TrimSpace(filter.Key) == "" {
			return validationError("dashboard filter keys cannot be blank")
		}
		if containsSecretKey(filter.Key, filter.Value) {
			return validationError("dashboard contains a secret-like key")
		}
	}
	return nil
}

func validateMetricAggregation(aggregation contracts.MetricAggregation) error {
	switch aggregation {
	case contracts.MetricAggregationAvg, contracts.MetricAggregationSum, contracts.MetricAggregationMin, contracts.MetricAggregationMax, contracts.MetricAggregationCount, contracts.MetricAggregationRate, contracts.MetricAggregationP50, contracts.MetricAggregationP90, contracts.MetricAggregationP95, contracts.MetricAggregationP99:
		return nil
	default:
		return validationError("metric aggregation is invalid")
	}
}

func validateMetricChartType(chartType contracts.MetricChartType) error {
	switch chartType {
	case contracts.MetricChartTypeLine, contracts.MetricChartTypeArea, contracts.MetricChartTypeBar, contracts.MetricChartTypePie, contracts.MetricChartTypeStat, contracts.MetricChartTypeTable:
		return nil
	default:
		return validationError("metric chart type is invalid")
	}
}

func validateDashboardVisibility(visibility DashboardVisibility) error {
	switch visibility {
	case DashboardVisibilityProject, DashboardVisibilityPersonal:
		return nil
	default:
		return validationError("dashboard visibility is invalid")
	}
}

func portsDashboardVisibility(visibility DashboardVisibility) ports.DashboardVisibility {
	return ports.DashboardVisibility(visibility)
}

func internalDashboardVisibility(visibility ports.DashboardVisibility) DashboardVisibility {
	return DashboardVisibility(visibility)
}

func sameOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

func (service *Service) ensureDashboardSlugAvailable(ctx context.Context, projectID string, visibility DashboardVisibility, ownerUserID *string, slug string, allowedID string) error {
	records, err := service.store.ListDashboards(ctx, projectID)
	if err != nil {
		return storageError()
	}
	for _, record := range records {
		if record.Slug != slug || record.ID == allowedID || record.Visibility != portsDashboardVisibility(visibility) {
			continue
		}
		if visibility == DashboardVisibilityProject || sameOptionalString(record.OwnerUserID, ownerUserID) {
			return validationError("dashboard slug already exists")
		}
	}
	return nil
}

func builtinDashboards(project ports.ProjectRecord, now time.Time) []Dashboard {
	return []Dashboard{
		{
			ID:                "builtin-service-latency",
			ProjectID:         project.ID,
			OrganizationID:    project.OrganizationID,
			Slug:              "service-latency",
			Name:              "Service latency",
			Tags:              []string{"builtin", "latency"},
			Version:           1,
			Visibility:        DashboardVisibilityBuiltin,
			DefaultTimeWindow: "PT1H",
			Widgets: []DashboardWidget{{
				ID:    "p95-latency",
				Title: "P95 latency",
				Kind:  DashboardWidgetKindMetricTimeseries,
				Layout: DashboardWidgetLayout{
					X: 0, Y: 0, W: 6, H: 4, MinW: 3, MinH: 2,
				},
				Metric: &DashboardMetricWidgetInput{
					MetricName:    "http.server.request.duration",
					Aggregation:   contracts.MetricAggregationP95,
					GroupBy:       []string{"service.name"},
					Filters:       []contracts.AttributeFilter{},
					TimeWindow:    ptr("PT1H"),
					Visualization: contracts.MetricChartTypeLine,
					Legend:        ptr(true),
					MaxSeries:     ptr(20),
					Thresholds:    []DashboardThresholdInput{},
				},
			}},
			CreatedAt: now,
			UpdatedAt: now,
		},
		{
			ID:                "builtin-genai-token-usage",
			ProjectID:         project.ID,
			OrganizationID:    project.OrganizationID,
			Slug:              "genai-token-usage",
			Name:              "GenAI token usage",
			Tags:              []string{"builtin", "genai"},
			Version:           1,
			Visibility:        DashboardVisibilityBuiltin,
			DefaultTimeWindow: "PT1H",
			Widgets: []DashboardWidget{{
				ID:    "token-usage",
				Title: "Token usage",
				Kind:  DashboardWidgetKindMetricTimeseries,
				Layout: DashboardWidgetLayout{
					X: 0, Y: 0, W: 6, H: 4, MinW: 3, MinH: 2,
				},
				Metric: &DashboardMetricWidgetInput{
					MetricName:    "gen_ai.client.token.usage",
					Aggregation:   contracts.MetricAggregationSum,
					GroupBy:       []string{"gen_ai.token.type"},
					Filters:       []contracts.AttributeFilter{},
					TimeWindow:    ptr("PT1H"),
					Visualization: contracts.MetricChartTypeBar,
					Legend:        ptr(true),
					MaxSeries:     ptr(20),
					Thresholds:    []DashboardThresholdInput{},
				},
			}},
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
}

func hasDashboardTag(tags []string, wanted string) bool {
	return slices.ContainsFunc(tags, func(tag string) bool {
		return strings.ToLower(strings.TrimSpace(tag)) == wanted
	})
}

func isBuiltinDashboardID(id string) bool {
	return strings.HasPrefix(id, "builtin-")
}

func dashboardID(projectID string, visibility DashboardVisibility, ownerUserID *string, slug string) string {
	if visibility == DashboardVisibilityPersonal && ownerUserID != nil {
		return fmt.Sprintf("dashboard:%s_personal_%s_%s", projectID, normalizeID(*ownerUserID), slug)
	}
	return fmt.Sprintf("dashboard:%s_project_%s", projectID, slug)
}

func normalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	previousDash := false
	for _, char := range value {
		isAlphaNum := (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
		if isAlphaNum {
			builder.WriteRune(char)
			previousDash = false
			continue
		}
		if !previousDash && builder.Len() > 0 {
			builder.WriteByte('-')
			previousDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func normalizeStringList(values []string) []string {
	result := []string{}
	seen := map[string]struct{}{}
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func trimOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func optionalStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func containsSecretKey(key string, value any) bool {
	if isSecretKey(key) {
		return true
	}
	switch typed := value.(type) {
	case map[string]any:
		for nestedKey, nestedValue := range typed {
			if containsSecretKey(nestedKey, nestedValue) {
				return true
			}
		}
	case []any:
		for _, item := range typed {
			if containsSecretKey("", item) {
				return true
			}
		}
	}
	return false
}

func isSecretKey(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "authorization", "cookie", "set-cookie", "x-api-key", "api_key", "token", "secret", "password":
		return true
	default:
		return false
	}
}

func validateProjectRole(role contracts.ProjectRole) error {
	switch role {
	case contracts.ProjectRoleViewer, contracts.ProjectRoleEditor, contracts.ProjectRoleAdmin:
		return nil
	default:
		return validationError("project role must be viewer, editor, or admin")
	}
}

func validateRetentionRules(rules []contracts.RetentionRuleInput) error {
	if len(rules) != len(retentionDataClasses()) {
		return forbiddenError("retention policy must include exactly one rule for every data class")
	}
	seen := map[contracts.RetentionDataClass]struct{}{}
	for _, rule := range rules {
		if !isRetentionDataClass(rule.DataClass) {
			return forbiddenError("retention policy includes an unknown data class")
		}
		if _, ok := seen[rule.DataClass]; ok {
			return forbiddenError("retention policy includes duplicate data classes")
		}
		seen[rule.DataClass] = struct{}{}
		switch rule.Mode {
		case contracts.RetentionModeRetain:
			if rule.RetentionDays != nil || rule.SoftDeleteDays != nil {
				return forbiddenError("retain rules must not include retentionDays or softDeleteDays")
			}
		case contracts.RetentionModeDelete:
			if rule.RetentionDays == nil || *rule.RetentionDays < 1 || *rule.RetentionDays > 365 || rule.SoftDeleteDays != nil {
				return forbiddenError("delete rules require retentionDays from 1 to 365 and no softDeleteDays")
			}
		case contracts.RetentionModeSoftDeleteThenDelete:
			if rule.RetentionDays == nil || *rule.RetentionDays < 1 || *rule.RetentionDays > 365 || rule.SoftDeleteDays == nil || *rule.SoftDeleteDays < 1 || *rule.SoftDeleteDays > 90 {
				return forbiddenError("soft-delete retention rules require valid retentionDays and softDeleteDays")
			}
		default:
			return forbiddenError("retention mode is invalid")
		}
	}
	return nil
}

func validateAlertRuleInput(input contracts.AlertRuleCreateInput) error {
	record := ports.AlertRuleRecord{
		ProjectID:               input.ProjectID,
		Name:                    input.Name,
		Kind:                    input.Kind,
		Severity:                input.Severity,
		Query:                   input.Query,
		Condition:               input.Condition,
		EvaluationWindowSeconds: input.EvaluationWindowSeconds,
		PendingForSeconds:       input.PendingForSeconds,
		CooldownSeconds:         input.CooldownSeconds,
		NotificationAdapterIDs:  input.NotificationAdapterIDs,
	}
	return validateAlertRuleRecord(record)
}

func validateAlertRuleRecord(rule ports.AlertRuleRecord) error {
	if strings.TrimSpace(rule.ProjectID) == "" || strings.TrimSpace(rule.Name) == "" {
		return validationError("alert rule projectId and name are required")
	}
	if !isAlertRuleKind(rule.Kind) || !isAlertSeverity(rule.Severity) {
		return alertRuleInvalid("alert rule kind or severity is invalid")
	}
	if len(rule.Query) == 0 || len(rule.Condition) == 0 {
		return alertRuleInvalid("alert rule query and condition are required")
	}
	if rule.EvaluationWindowSeconds < 1 || rule.PendingForSeconds < 0 || rule.CooldownSeconds < 0 {
		return alertRuleInvalid("alert rule timing fields are invalid")
	}
	switch rule.Kind {
	case contracts.AlertRuleKindMetricThreshold, contracts.AlertRuleKindTraceLatency:
		return validateOperatorThresholdCondition(rule.Condition, false)
	case contracts.AlertRuleKindLogCount, contracts.AlertRuleKindTraceCount:
		return validateOperatorThresholdCondition(rule.Condition, true)
	case contracts.AlertRuleKindMetricAbsence:
		value, ok := numericValue(rule.Condition["maxAllowedCount"])
		if !ok || value != 0 {
			return alertRuleInvalid("absence rules require maxAllowedCount 0")
		}
	case contracts.AlertRuleKindLogMatch, contracts.AlertRuleKindTraceMatch, contracts.AlertRuleKindTraceError:
		value, ok := numericValue(rule.Condition["minCount"])
		if !ok || value < 1 || value > 100000 || value != float64(int(value)) {
			return alertRuleInvalid("match and error rules require minCount from 1 to 100000")
		}
	}
	return nil
}

func validateAlertEvent(event contracts.AlertEvent) error {
	if strings.TrimSpace(event.ID) == "" || strings.TrimSpace(event.ProjectID) == "" || strings.TrimSpace(event.RuleID) == "" || strings.TrimSpace(event.InstanceID) == "" || strings.TrimSpace(event.Summary) == "" || strings.TrimSpace(event.DeduplicationKey) == "" {
		return validationError("alert event required fields are missing")
	}
	if !isAlertState(event.State) || !isAlertSeverity(event.Severity) {
		return alertRuleInvalid("alert event state or severity is invalid")
	}
	return nil
}

func validateOperatorThresholdCondition(condition map[string]any, integer bool) error {
	operator, _ := condition["operator"].(string)
	if !slices.Contains([]string{"GT", "GTE", "LT", "LTE", "EQ", "NEQ"}, operator) {
		return alertRuleInvalid("alert condition operator is invalid")
	}
	value, ok := numericValue(condition["threshold"])
	if !ok {
		return alertRuleInvalid("alert condition threshold is required")
	}
	if integer && value != float64(int(value)) {
		return alertRuleInvalid("alert count threshold must be an integer")
	}
	return nil
}

func alertRuleInvalid(reason string) error {
	return codedError("ERR-018", "ALERT_RULE_INVALID", "Alert rule configuration is invalid", false, reason)
}

func alertAdapterCatalog(adapterIDs []string) map[string]struct{} {
	if len(adapterIDs) == 0 {
		adapterIDs = []string{"in_app"}
	}
	catalog := map[string]struct{}{}
	for _, adapterID := range adapterIDs {
		adapterID = strings.TrimSpace(adapterID)
		if adapterID == "" {
			continue
		}
		catalog[adapterID] = struct{}{}
	}
	return catalog
}

func (service *Service) validateAlertAdapterIDs(adapterIDs []string) error {
	if len(adapterIDs) == 0 {
		return nil
	}
	for _, adapterID := range normalizeStringList(adapterIDs) {
		if _, ok := service.alertAdapters[adapterID]; !ok {
			return alertRuleInvalid("notificationAdapterIds contains unknown adapter " + adapterID)
		}
	}
	return nil
}

func validateRole(role contracts.CompanyRole) error {
	switch role {
	case contracts.CompanyRoleAdmin, contracts.CompanyRoleUser:
		return nil
	default:
		return validationError("role must be admin or user")
	}
}

func validateProjectStatus(status contracts.ProjectStatus) error {
	switch status {
	case contracts.ProjectStatusActive, contracts.ProjectStatusReadOnly, contracts.ProjectStatusDisabled:
		return nil
	default:
		return validationError("project status is invalid")
	}
}

func normalizeID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "-")
	return value
}

func isLocalPersonalProject(projectID string, organizationID string, userID string) bool {
	return projectID == LocalProjectID && organizationID == LocalCompanyID && userID == localUserID
}

func isLocalSelfObservabilityProject(project ports.ProjectRecord) bool {
	return project.ID == LocalSelfObservabilityProjectID && project.OrganizationID == LocalCompanyID
}

func isSelfObservabilityProjectChange(project ports.ProjectRecord, request contracts.ProjectUpdateRequest) bool {
	if request.Name != nil {
		name := strings.TrimSpace(*request.Name)
		if name != "" && name != project.Name {
			return true
		}
	}
	return request.Status != nil && *request.Status != project.Status
}

func sortProjectMembers(items []contracts.ProjectMember) {
	sort.Slice(items, func(i, j int) bool {
		if sourceRank(items[i].Source) != sourceRank(items[j].Source) {
			return sourceRank(items[i].Source) < sourceRank(items[j].Source)
		}
		leftName := strings.ToLower(optionalString(items[i].DisplayName))
		rightName := strings.ToLower(optionalString(items[j].DisplayName))
		if leftName != rightName {
			return leftName < rightName
		}
		leftEmail := strings.ToLower(optionalString(items[i].Email))
		rightEmail := strings.ToLower(optionalString(items[j].Email))
		if leftEmail != rightEmail {
			return leftEmail < rightEmail
		}
		return items[i].UserID < items[j].UserID
	})
}

func sourceRank(source contracts.ProjectMemberSource) int {
	switch source {
	case contracts.ProjectMemberSourceLocalPersonal:
		return 0
	case contracts.ProjectMemberSourceCompanyAdmin:
		return 1
	default:
		return 2
	}
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func retentionDataClasses() []contracts.RetentionDataClass {
	return []contracts.RetentionDataClass{
		contracts.RetentionDataClassTraces,
		contracts.RetentionDataClassLogs,
		contracts.RetentionDataClassMetrics,
		contracts.RetentionDataClassAIEvals,
		contracts.RetentionDataClassDatasets,
		contracts.RetentionDataClassScorers,
		contracts.RetentionDataClassDashboardHistory,
		contracts.RetentionDataClassIngestCredentialAudit,
	}
}

func retentionClassRank(dataClass contracts.RetentionDataClass) int {
	for index, item := range retentionDataClasses() {
		if item == dataClass {
			return index
		}
	}
	return 999
}

func isRetentionDataClass(value contracts.RetentionDataClass) bool {
	return slices.Contains(retentionDataClasses(), value)
}

func isAlertRuleKind(value contracts.AlertRuleKind) bool {
	return slices.Contains([]contracts.AlertRuleKind{
		contracts.AlertRuleKindMetricThreshold,
		contracts.AlertRuleKindMetricAbsence,
		contracts.AlertRuleKindLogMatch,
		contracts.AlertRuleKindLogCount,
		contracts.AlertRuleKindTraceMatch,
		contracts.AlertRuleKindTraceCount,
		contracts.AlertRuleKindTraceLatency,
		contracts.AlertRuleKindTraceError,
	}, value)
}

func isAlertSeverity(value contracts.AlertSeverity) bool {
	return slices.Contains([]contracts.AlertSeverity{
		contracts.AlertSeverityInfo,
		contracts.AlertSeverityWarning,
		contracts.AlertSeverityError,
		contracts.AlertSeverityCritical,
	}, value)
}

func isAlertState(value contracts.AlertState) bool {
	return slices.Contains([]contracts.AlertState{
		contracts.AlertStateOK,
		contracts.AlertStatePending,
		contracts.AlertStateFiring,
		contracts.AlertStateResolved,
		contracts.AlertStateSilenced,
		contracts.AlertStateError,
	}, value)
}

func isAlertSignal(value contracts.AlertSignal) bool {
	return slices.Contains([]contracts.AlertSignal{
		contracts.AlertSignalMetric,
		contracts.AlertSignalLog,
		contracts.AlertSignalTrace,
	}, value)
}

func numericValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	default:
		return 0, false
	}
}

func copyInt(value *int) *int {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func mapsFromAnySlice(input []map[string]any) []any {
	output := make([]any, 0, len(input))
	for _, item := range input {
		output = append(output, cloneAnyMap(item))
	}
	return output
}

func cloneAnyMapSlice(input []map[string]any) []map[string]any {
	if input == nil {
		return nil
	}
	output := make([]map[string]any, 0, len(input))
	for _, item := range input {
		output = append(output, cloneAnyMap(item))
	}
	return output
}

func contractAiChatConversation(conversation ports.AiChatConversationRecord, messages []ports.AiChatMessageRecord) map[string]any {
	messageViews := []any{}
	for _, message := range messages {
		messageViews = append(messageViews, contractAiChatMessage(message))
	}
	return map[string]any{
		"id":                 conversation.ID,
		"companyId":          conversation.CompanyID,
		"projectId":          conversation.ProjectID,
		"userId":             conversation.UserID,
		"title":              conversation.Title,
		"status":             string(conversation.Status),
		"lastMessageAt":      conversation.LastMessageAt,
		"lastRunStatus":      conversation.LastRunStatus,
		"latestCompactionId": conversation.LatestCompactionID,
		"messages":           messageViews,
		"runs":               []any{},
		"artifacts":          []any{},
		"actionProposals":    []any{},
		"compactions":        []any{},
		"version":            conversation.Version,
		"createdAt":          conversation.CreatedAt,
		"updatedAt":          conversation.UpdatedAt,
	}
}

func contractAiChatMessage(message ports.AiChatMessageRecord) map[string]any {
	return map[string]any{
		"id":             message.ID,
		"conversationId": message.ConversationID,
		"runId":          message.RunID,
		"role":           message.Role,
		"parts":          mapsFromAnySlice(message.Parts),
		"tokenEstimate":  message.TokenEstimate,
		"createdAt":      message.CreatedAt,
	}
}

func contractAiChatAction(action ports.AiChatActionRecord) map[string]any {
	return map[string]any{
		"id":               action.ID,
		"conversationId":   action.ConversationID,
		"runId":            action.RunID,
		"projectId":        action.ProjectID,
		"risk":             string(action.Risk),
		"status":           string(action.Status),
		"actionKind":       action.ActionKind,
		"inputPreview":     cloneAnyMap(action.InputPreview),
		"requiresApproval": action.RequiresApproval,
		"approvedByUserId": action.ApprovedByUserID,
		"approvedAt":       action.ApprovedAt,
		"idempotencyKey":   action.IdempotencyKey,
		"expiresAt":        action.ExpiresAt,
		"result":           cloneAnyMap(action.Result),
		"version":          action.Version,
		"createdAt":        action.CreatedAt,
		"updatedAt":        action.UpdatedAt,
	}
}

func contractAiChatCompaction(compaction ports.AiChatCompactionRecord) map[string]any {
	return map[string]any{
		"id":                 compaction.ID,
		"conversationId":     compaction.ConversationID,
		"sourceMessageCount": compaction.SourceMessageCount,
		"summary":            compaction.Summary,
		"retainedMessageIds": append([]string{}, compaction.RetainedMessageIDs...),
		"artifactSummaries":  append([]string{}, compaction.ArtifactSummaries...),
		"pendingActionIds":   append([]string{}, compaction.PendingActionIDs...),
		"tokenCount":         compaction.TokenCount,
		"createdAt":          compaction.CreatedAt,
	}
}

func stringFromMap(input map[string]any, key string) (string, bool) {
	value, ok := input[key].(string)
	if !ok {
		return "", false
	}
	value = strings.TrimSpace(value)
	return value, value != ""
}

func stringFromMapDefault(input map[string]any, key string, fallback string) string {
	if value, ok := stringFromMap(input, key); ok {
		return value
	}
	return fallback
}

func boolFromMap(input map[string]any, key string) bool {
	return boolFromMapDefault(input, key, false)
}

func boolFromMapDefault(input map[string]any, key string, fallback bool) bool {
	value, ok := input[key].(bool)
	if !ok {
		return fallback
	}
	return value
}

func mapFromMap(input map[string]any, key string) (map[string]any, bool) {
	value, ok := input[key].(map[string]any)
	if !ok {
		return map[string]any{}, false
	}
	return value, true
}

func mapFromAny(input any) map[string]any {
	value, ok := input.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return value
}

func anySliceFromMap(input map[string]any, key string) []any {
	return anySlice(input[key])
}

func anySlice(input any) []any {
	if values, ok := input.([]any); ok {
		return values
	}
	return []any{}
}

func stringSliceFromAny(input any) []string {
	values, ok := input.([]any)
	if !ok {
		return []string{}
	}
	output := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
			output = append(output, strings.TrimSpace(text))
		}
	}
	return output
}

func valueOrDefault(value any, fallback any) any {
	if value == nil {
		return fallback
	}
	return value
}

func numberFromMap(input map[string]any, key string, fallback float64) float64 {
	if value, ok := numericValue(input[key]); ok {
		return value
	}
	return fallback
}

func nullableNumberFromMap(input map[string]any, key string) any {
	if value, ok := numericValue(input[key]); ok {
		return value
	}
	return nil
}

func intNumberFromMap(input map[string]any, key string, fallback int) int {
	if value, ok := numericValue(input[key]); ok {
		return int(value)
	}
	return fallback
}

func nullableIntNumberFromMap(input map[string]any, key string) any {
	if value, ok := numericValue(input[key]); ok {
		return int(value)
	}
	return nil
}

func intFromMap(input map[string]any, key string) (int, bool) {
	if value, ok := numericValue(input[key]); ok {
		return int(value), true
	}
	return 0, false
}

func copyOptionalStringSetting(output map[string]any, input map[string]any, key string) {
	if value, ok := stringFromMap(input, key); ok {
		output[key] = value
		return
	}
	if _, exists := input[key]; exists {
		output[key] = nil
	}
}

func containsSecretLookingKey(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for key, nested := range typed {
			normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
			if strings.Contains(normalized, "authorization") ||
				strings.Contains(normalized, "cookie") ||
				strings.Contains(normalized, "x_api_key") ||
				strings.Contains(normalized, "api_key") ||
				strings.Contains(normalized, "token") ||
				strings.Contains(normalized, "secret") ||
				strings.Contains(normalized, "password") {
				return true
			}
			if containsSecretLookingKey(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range typed {
			if containsSecretLookingKey(nested) {
				return true
			}
		}
	}
	return false
}

func containsSecretLookingKeyExceptCredentialValue(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for key, nested := range typed {
			if key == "credentialValue" {
				continue
			}
			normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
			if strings.Contains(normalized, "authorization") ||
				strings.Contains(normalized, "cookie") ||
				strings.Contains(normalized, "x_api_key") ||
				strings.Contains(normalized, "api_key") ||
				strings.Contains(normalized, "token") ||
				strings.Contains(normalized, "secret") ||
				strings.Contains(normalized, "password") {
				return true
			}
			if containsSecretLookingKeyExceptCredentialValue(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range typed {
			if containsSecretLookingKeyExceptCredentialValue(nested) {
				return true
			}
		}
	}
	return false
}

func allowedAiCredentialRef(ref string) bool {
	return strings.HasPrefix(ref, "managed:") || strings.HasPrefix(ref, "env:") || strings.HasPrefix(ref, "external:")
}

func providerSecretKey(input string) []byte {
	key := strings.TrimSpace(input)
	if key == "" {
		key = "cloudgrid-local-provider-secret-key"
	}
	sum := sha256.Sum256([]byte(key))
	return sum[:]
}

func providerSecretKeyConfigured(input string) bool {
	return strings.TrimSpace(input) != ""
}

func managedAiProviderSecretRef(scope string, companyID string, projectID string, providerID string) string {
	if scope == "project" {
		return "managed:project/" + normalizeID(projectID) + "/" + normalizeID(providerID)
	}
	return "managed:company/" + normalizeID(companyID) + "/" + normalizeID(providerID)
}

func managedAiProviderSecretID(scope string, companyID string, projectID string, providerID string) string {
	if scope == "project" {
		return "project-" + normalizeID(projectID) + "-" + normalizeID(providerID)
	}
	return "company-" + normalizeID(companyID) + "-" + normalizeID(providerID)
}

func (service *Service) storeAiProviderSecret(ctx context.Context, scope string, companyID string, projectID string, providerID string, value string, now time.Time, actor string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", validationError("credentialValue must not be empty")
	}
	if service.requireSecretKey && !service.secretKeyConfigured {
		return "", validationError("CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY is required before storing managed provider secrets")
	}
	block, err := aes.NewCipher(service.secretKey)
	if err != nil {
		return "", validationError("provider secret encryption is unavailable")
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", validationError("provider secret encryption is unavailable")
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", validationError("provider secret encryption is unavailable")
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(value), nil)
	record := ports.AiProviderSecretRecord{
		ID:              managedAiProviderSecretID(scope, companyID, projectID, providerID),
		Scope:           scope,
		CompanyID:       companyID,
		ProjectID:       projectID,
		ProviderID:      providerID,
		Algorithm:       "aes-256-gcm",
		Nonce:           base64.StdEncoding.EncodeToString(nonce),
		Ciphertext:      base64.StdEncoding.EncodeToString(ciphertext),
		CreatedAt:       now,
		UpdatedAt:       now,
		UpdatedByUserID: actor,
	}
	if existing, ok, err := service.store.GetAiProviderSecret(ctx, record.ID); err != nil {
		return "", storageError()
	} else if ok {
		record.CreatedAt = existing.CreatedAt
	}
	if err := service.store.PutAiProviderSecret(ctx, record); err != nil {
		return "", storageError()
	}
	return managedAiProviderSecretRef(scope, companyID, projectID, providerID), nil
}

func (service *Service) decryptAiProviderSecret(record ports.AiProviderSecretRecord) (string, error) {
	if record.Algorithm != "aes-256-gcm" {
		return "", validationError("provider secret uses an unsupported encryption algorithm")
	}
	if service.requireSecretKey && !service.secretKeyConfigured {
		return "", validationError("CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY is required before resolving managed provider secrets")
	}
	nonce, err := base64.StdEncoding.DecodeString(record.Nonce)
	if err != nil {
		return "", validationError("provider secret is invalid")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(record.Ciphertext)
	if err != nil {
		return "", validationError("provider secret is invalid")
	}
	block, err := aes.NewCipher(service.secretKey)
	if err != nil {
		return "", validationError("provider secret encryption is unavailable")
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", validationError("provider secret encryption is unavailable")
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", validationError("provider secret could not be decrypted")
	}
	return string(plaintext), nil
}

func defaultOrganizationName(organizationID string) string {
	if organizationID == LocalCompanyID {
		return "Personal"
	}
	return fmt.Sprintf("Company %s", organizationID)
}
