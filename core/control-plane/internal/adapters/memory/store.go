package memory

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type UserRecord = ports.UserRecord
type OrganizationRecord = ports.OrganizationRecord
type ProjectRecord = ports.ProjectRecord
type MembershipRecord = ports.MembershipRecord
type InvitationRecord = ports.InvitationRecord
type IngestCredentialRecord = ports.IngestCredentialRecord
type DashboardRecord = ports.DashboardRecord
type DashboardPinRecord = ports.DashboardPinRecord
type ProjectMemberRecord = ports.ProjectMemberRecord
type RetentionPolicyRecord = ports.RetentionPolicyRecord
type AlertRuleRecord = ports.AlertRuleRecord
type AlertSilenceRecord = ports.AlertSilenceRecord
type AlertEventRecord = ports.AlertEventRecord

type Store struct {
	mu                sync.RWMutex
	users             map[string]ports.UserRecord
	organizations     map[string]ports.OrganizationRecord
	projects          map[string]ports.ProjectRecord
	memberships       map[string]ports.MembershipRecord
	invitations       map[string]ports.InvitationRecord
	credentials       map[string]ports.IngestCredentialRecord
	dashboards        map[string]ports.DashboardRecord
	dashboardPins     map[string]ports.DashboardPinRecord
	projectMembers    map[string]ports.ProjectMemberRecord
	retentionPolicies map[string]ports.RetentionPolicyRecord
	alertRules        map[string]ports.AlertRuleRecord
	alertSilences     map[string]ports.AlertSilenceRecord
	alertEvents       map[string]ports.AlertEventRecord
}

func NewStore() *Store {
	return &Store{
		users:             map[string]ports.UserRecord{},
		organizations:     map[string]ports.OrganizationRecord{},
		projects:          map[string]ports.ProjectRecord{},
		memberships:       map[string]ports.MembershipRecord{},
		invitations:       map[string]ports.InvitationRecord{},
		credentials:       map[string]ports.IngestCredentialRecord{},
		dashboards:        map[string]ports.DashboardRecord{},
		dashboardPins:     map[string]ports.DashboardPinRecord{},
		projectMembers:    map[string]ports.ProjectMemberRecord{},
		retentionPolicies: map[string]ports.RetentionPolicyRecord{},
		alertRules:        map[string]ports.AlertRuleRecord{},
		alertSilences:     map[string]ports.AlertSilenceRecord{},
		alertEvents:       map[string]ports.AlertEventRecord{},
	}
}

func (store *Store) GetUser(_ context.Context, userID string) (ports.UserRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	user, ok := store.users[userID]
	return user, ok, nil
}

func (store *Store) PutUser(_ context.Context, user ports.UserRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.users[user.ID] = user
	return nil
}

func (store *Store) GetOrganization(_ context.Context, organizationID string) (ports.OrganizationRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	organization, ok := store.organizations[organizationID]
	return organization, ok, nil
}

func (store *Store) PutOrganization(_ context.Context, organization ports.OrganizationRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.organizations[organization.ID] = organization
	return nil
}

func (store *Store) ListOrganizations(_ context.Context) ([]ports.OrganizationRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := make([]ports.OrganizationRecord, 0, len(store.organizations))
	for _, organization := range store.organizations {
		items = append(items, organization)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (store *Store) GetMembership(_ context.Context, organizationID string, userID string) (ports.MembershipRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	membership, ok := store.memberships[membershipKey(organizationID, userID)]
	return membership, ok, nil
}

func (store *Store) PutMembership(_ context.Context, membership ports.MembershipRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.memberships[membershipKey(membership.OrganizationID, membership.UserID)] = membership
	return nil
}

func (store *Store) DeleteMembership(_ context.Context, organizationID string, userID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.memberships, membershipKey(organizationID, userID))
	return nil
}

func (store *Store) ListMemberships(_ context.Context, organizationID string) ([]ports.MembershipRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.MembershipRecord{}
	for _, membership := range store.memberships {
		if membership.OrganizationID == organizationID {
			items = append(items, membership)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UserID < items[j].UserID
	})
	return items, nil
}

func (store *Store) ListMembershipsForUser(_ context.Context, userID string) ([]ports.MembershipRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.MembershipRecord{}
	for _, membership := range store.memberships {
		if membership.UserID == userID {
			items = append(items, membership)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].OrganizationID < items[j].OrganizationID
	})
	return items, nil
}

func (store *Store) GetInvitation(_ context.Context, invitationID string) (ports.InvitationRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	invitation, ok := store.invitations[invitationID]
	return invitation, ok, nil
}

func (store *Store) PutInvitation(_ context.Context, invitation ports.InvitationRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.invitations[invitation.ID] = invitation
	return nil
}

func (store *Store) ListInvitations(_ context.Context, organizationID string) ([]ports.InvitationRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.InvitationRecord{}
	for _, invitation := range store.invitations {
		if invitation.OrganizationID == organizationID {
			items = append(items, invitation)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	return items, nil
}

func (store *Store) GetPendingInvitationByEmail(_ context.Context, organizationID string, email string) (ports.InvitationRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	for _, invitation := range store.invitations {
		if invitation.OrganizationID == organizationID &&
			invitation.Email == email &&
			invitation.Status == contracts.OrganizationInvitationStatusPending {
			return invitation, true, nil
		}
	}
	return ports.InvitationRecord{}, false, nil
}

func (store *Store) GetProject(_ context.Context, projectID string) (ports.ProjectRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	project, ok := store.projects[projectID]
	return project, ok, nil
}

func (store *Store) PutProject(_ context.Context, project ports.ProjectRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.projects[project.ID] = project
	return nil
}

func (store *Store) ListProjects(_ context.Context, organizationID *string, status *contracts.ProjectStatus) ([]ports.ProjectRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.ProjectRecord{}
	for _, project := range store.projects {
		if organizationID != nil && project.OrganizationID != *organizationID {
			continue
		}
		if status != nil && project.Status != *status {
			continue
		}
		items = append(items, project)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (store *Store) GetIngestCredential(_ context.Context, credentialID string) (ports.IngestCredentialRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	credential, ok := store.credentials[credentialID]
	return credential, ok, nil
}

func (store *Store) PutIngestCredential(_ context.Context, credential ports.IngestCredentialRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.credentials[credential.ID] = credential
	return nil
}

func (store *Store) ListIngestCredentials(_ context.Context, projectID string) ([]ports.IngestCredentialRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.IngestCredentialRecord{}
	for _, credential := range store.credentials {
		if credential.ProjectID == projectID {
			items = append(items, credential)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (store *Store) GetDashboard(_ context.Context, dashboardID string) (ports.DashboardRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	dashboard, ok := store.dashboards[dashboardID]
	return dashboard, ok, nil
}

func (store *Store) PutDashboard(_ context.Context, dashboard ports.DashboardRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.dashboards[dashboard.ID] = dashboard
	return nil
}

func (store *Store) DeleteDashboard(_ context.Context, dashboardID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.dashboards, dashboardID)
	for key, pin := range store.dashboardPins {
		if pin.DashboardID == dashboardID {
			delete(store.dashboardPins, key)
		}
	}
	return nil
}

func (store *Store) ListDashboards(_ context.Context, projectID string) ([]ports.DashboardRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.DashboardRecord{}
	for _, dashboard := range store.dashboards {
		if dashboard.ProjectID == projectID {
			items = append(items, dashboard)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Name == items[j].Name {
			return items[i].ID < items[j].ID
		}
		return items[i].Name < items[j].Name
	})
	return items, nil
}

func (store *Store) ListDashboardPins(_ context.Context, userID string, projectID string) ([]ports.DashboardPinRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.DashboardPinRecord{}
	for _, pin := range store.dashboardPins {
		if pin.UserID == userID && pin.ProjectID == projectID {
			items = append(items, pin)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Position == items[j].Position {
			return items[i].DashboardID < items[j].DashboardID
		}
		return items[i].Position < items[j].Position
	})
	return items, nil
}

func (store *Store) PutDashboardPin(_ context.Context, pin ports.DashboardPinRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.dashboardPins[dashboardPinKey(pin.UserID, pin.ProjectID, pin.DashboardID)] = pin
	return nil
}

func (store *Store) DeleteDashboardPin(_ context.Context, userID string, projectID string, dashboardID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.dashboardPins, dashboardPinKey(userID, projectID, dashboardID))
	return nil
}

func (store *Store) DeleteDashboardPinsForDashboard(_ context.Context, dashboardID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for key, pin := range store.dashboardPins {
		if pin.DashboardID == dashboardID {
			delete(store.dashboardPins, key)
		}
	}
	return nil
}

func (store *Store) GetProjectMember(_ context.Context, projectID string, userID string) (ports.ProjectMemberRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	member, ok := store.projectMembers[projectMemberKey(projectID, userID)]
	return member, ok, nil
}

func (store *Store) PutProjectMember(_ context.Context, member ports.ProjectMemberRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.projectMembers[projectMemberKey(member.ProjectID, member.UserID)] = member
	return nil
}

func (store *Store) DeleteProjectMember(_ context.Context, projectID string, userID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.projectMembers, projectMemberKey(projectID, userID))
	return nil
}

func (store *Store) DeleteProjectMembershipsForUserInOrganization(_ context.Context, organizationID string, userID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for key, member := range store.projectMembers {
		project, ok := store.projects[member.ProjectID]
		if ok && project.OrganizationID == organizationID && member.UserID == userID {
			delete(store.projectMembers, key)
		}
	}
	return nil
}

func (store *Store) ListProjectMembers(_ context.Context, projectID string) ([]ports.ProjectMemberRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.ProjectMemberRecord{}
	for _, member := range store.projectMembers {
		if member.ProjectID == projectID {
			items = append(items, member)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UserID < items[j].UserID
	})
	return items, nil
}

func (store *Store) GetRetentionPolicy(_ context.Context, projectID string) (ports.RetentionPolicyRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	policy, ok := store.retentionPolicies[projectID]
	policy.Rules = append([]ports.RetentionRuleRecord{}, policy.Rules...)
	return policy, ok, nil
}

func (store *Store) PutRetentionPolicy(_ context.Context, policy ports.RetentionPolicyRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	policy.Rules = append([]ports.RetentionRuleRecord{}, policy.Rules...)
	store.retentionPolicies[policy.ProjectID] = policy
	return nil
}

func (store *Store) GetAlertRule(_ context.Context, id string) (ports.AlertRuleRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	rule, ok := store.alertRules[id]
	return cloneAlertRule(rule), ok, nil
}

func (store *Store) PutAlertRule(_ context.Context, rule ports.AlertRuleRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.alertRules[rule.ID] = cloneAlertRule(rule)
	return nil
}

func (store *Store) DeleteAlertRule(_ context.Context, id string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.alertRules, id)
	return nil
}

func (store *Store) ListAlertRules(_ context.Context, projectID string) ([]ports.AlertRuleRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.AlertRuleRecord{}
	for _, rule := range store.alertRules {
		if rule.ProjectID == projectID {
			items = append(items, cloneAlertRule(rule))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Name == items[j].Name {
			return items[i].ID < items[j].ID
		}
		return items[i].Name < items[j].Name
	})
	return items, nil
}

func (store *Store) GetAlertSilence(_ context.Context, id string) (ports.AlertSilenceRecord, bool, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	silence, ok := store.alertSilences[id]
	return silence, ok, nil
}

func (store *Store) PutAlertSilence(_ context.Context, silence ports.AlertSilenceRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.alertSilences[silence.ID] = silence
	return nil
}

func (store *Store) DeleteAlertSilence(_ context.Context, id string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.alertSilences, id)
	return nil
}

func (store *Store) ListAlertSilences(_ context.Context, projectID string, ruleID *string) ([]ports.AlertSilenceRecord, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.AlertSilenceRecord{}
	for _, silence := range store.alertSilences {
		if silence.ProjectID != projectID {
			continue
		}
		if ruleID != nil && silence.RuleID != *ruleID {
			continue
		}
		items = append(items, silence)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].StartsAt.Equal(items[j].StartsAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].StartsAt.Before(items[j].StartsAt)
	})
	return items, nil
}

func (store *Store) PutAlertEvent(_ context.Context, event ports.AlertEventRecord) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.alertEvents[event.ID] = event
	return nil
}

func (store *Store) ListAlertEvents(_ context.Context, projectID string, ruleID *string, first int, after *string) ([]ports.AlertEventRecord, bool, *string, error) {
	store.mu.RLock()
	defer store.mu.RUnlock()
	items := []ports.AlertEventRecord{}
	for _, event := range store.alertEvents {
		if event.ProjectID != projectID {
			continue
		}
		if ruleID != nil && event.RuleID != *ruleID {
			continue
		}
		if after != nil && event.ID <= *after {
			continue
		}
		items = append(items, event)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	hasNext := len(items) > first
	if hasNext {
		items = items[:first]
	}
	var cursor *string
	if hasNext && len(items) > 0 {
		cursor = &items[len(items)-1].ID
	}
	return items, hasNext, cursor, nil
}

func membershipKey(organizationID string, userID string) string {
	return fmt.Sprintf("%s/%s", organizationID, userID)
}

func dashboardPinKey(userID string, projectID string, dashboardID string) string {
	return fmt.Sprintf("%s/%s/%s", userID, projectID, dashboardID)
}

func projectMemberKey(projectID string, userID string) string {
	return fmt.Sprintf("%s/%s", projectID, userID)
}

func cloneAlertRule(rule ports.AlertRuleRecord) ports.AlertRuleRecord {
	rule.Query = cloneMap(rule.Query)
	rule.Condition = cloneMap(rule.Condition)
	rule.NotificationAdapterIDs = append([]string{}, rule.NotificationAdapterIDs...)
	return rule
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
