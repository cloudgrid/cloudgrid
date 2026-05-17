package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/mail"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	LocalCompanyID = "local"
	LocalProjectID = "default"
	localUserID    = "local-user"
)

type Service struct {
	store         ports.ControlStore
	now           func() time.Time
	statusChanges []contracts.ProjectStatusChangedNotification
}

func NewService(store ports.ControlStore, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{store: store, now: now}
}

func (service *Service) GetViewer(ctx context.Context, envelope contracts.BridgeEnvelope) (contracts.Viewer, error) {
	principalID := principalID(envelope)
	if err := service.bootstrapViewer(ctx, envelope); err != nil {
		return contracts.Viewer{}, err
	}
	viewer, err := service.viewer(ctx, principalID, nil)
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
	if err := service.store.PutInvitation(ctx, record); err != nil {
		return contracts.OrganizationInvitation{}, storageError()
	}
	return contractInvitation(record), nil
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
		if _, ok, err := service.store.GetProject(ctx, LocalProjectID); err != nil {
			return storageError()
		} else if !ok {
			if err := service.store.PutProject(ctx, ports.ProjectRecord{
				ID:             LocalProjectID,
				OrganizationID: LocalCompanyID,
				Name:           "Default project",
				Slug:           LocalProjectID,
				Status:         contracts.ProjectStatusActive,
				ChangedAt:      now,
				CreatedAt:      now,
				UpdatedAt:      now,
			}); err != nil {
				return storageError()
			}
		}
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
	invitation.Status = contracts.OrganizationInvitationStatusAccepted
	invitation.AcceptedByUserID = &userID
	invitation.AcceptedAt = &now
	invitation.UpdatedAt = now
	if err := service.store.PutInvitation(ctx, invitation); err != nil {
		return storageError()
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
	memberships, err := service.store.ListMemberships(ctx, organizationID)
	if err != nil {
		return storageError()
	}
	for _, membership := range memberships {
		user, ok, err := service.store.GetUser(ctx, membership.UserID)
		if err != nil {
			return storageError()
		}
		if !ok || user.Email == nil {
			continue
		}
		memberEmail, err := normalizeEmail(*user.Email)
		if err == nil && memberEmail == email {
			return validationError("email already belongs to an active member")
		}
	}
	return nil
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
	return contracts.OrganizationInvitation{
		ID:               invitation.ID,
		OrganizationID:   invitation.OrganizationID,
		Email:            invitation.Email,
		Role:             invitation.Role,
		Status:           invitation.Status,
		InvitedByUserID:  invitation.InvitedByUserID,
		AcceptedByUserID: invitation.AcceptedByUserID,
		CreatedAt:        invitation.CreatedAt,
		UpdatedAt:        invitation.UpdatedAt,
		AcceptedAt:       invitation.AcceptedAt,
		RevokedAt:        invitation.RevokedAt,
		ExpiresAt:        invitation.ExpiresAt,
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
					MetricName:    "http.server.duration",
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
					GroupBy:       []string{"gen_ai.system"},
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

func defaultOrganizationName(organizationID string) string {
	if organizationID == LocalCompanyID {
		return "Personal"
	}
	return fmt.Sprintf("Company %s", organizationID)
}
