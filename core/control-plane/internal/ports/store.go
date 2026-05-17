package ports

import (
	"context"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type UserRecord struct {
	ID          string
	DisplayName *string
	Email       *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type OrganizationRecord struct {
	ID        string
	Name      string
	Slug      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type ProjectRecord struct {
	ID             string
	OrganizationID string
	Name           string
	Slug           string
	Status         contracts.ProjectStatus
	ChangedAt      time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type MembershipRecord struct {
	UserID         string
	OrganizationID string
	Role           contracts.CompanyRole
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type InvitationRecord struct {
	ID               string
	OrganizationID   string
	Email            string
	Role             contracts.CompanyRole
	Status           contracts.OrganizationInvitationStatus
	InvitedByUserID  string
	AcceptedByUserID *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	AcceptedAt       *time.Time
	RevokedAt        *time.Time
	ExpiresAt        *time.Time
}

type IngestCredentialRecord struct {
	ID            string
	ProjectID     string
	SecretHash    string
	CreatedAt     time.Time
	DisabledAt    *time.Time
	LastUsedAt    *time.Time
	DisplayName   *string
	CreatedByUser string
}

type DashboardVisibility string

const (
	DashboardVisibilityBuiltin  DashboardVisibility = "builtin"
	DashboardVisibilityProject  DashboardVisibility = "project"
	DashboardVisibilityPersonal DashboardVisibility = "personal"
)

type DashboardRecord struct {
	ID                string
	ProjectID         string
	OrganizationID    string
	Slug              string
	Name              string
	Description       *string
	Tags              []string
	Version           int
	Visibility        DashboardVisibility
	DefaultTimeWindow string
	OwnerUserID       *string
	Widgets           []byte
	CreatedAt         time.Time
	UpdatedAt         time.Time
	CreatedBy         *string
	UpdatedBy         *string
}

type DashboardPinRecord struct {
	UserID      string
	ProjectID   string
	DashboardID string
	Position    int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type ProjectMemberRecord struct {
	ProjectID       string
	UserID          string
	Role            contracts.ProjectRole
	CreatedAt       time.Time
	CreatedByUserID string
	UpdatedAt       time.Time
	UpdatedByUserID string
}

type RetentionPolicyRecord struct {
	ProjectID       string
	Rules           []RetentionRuleRecord
	UpdatedAt       time.Time
	UpdatedByUserID string
	Version         int
}

type ProjectAiSettingsRecord struct {
	ProjectID       string
	Settings        map[string]any
	UpdatedAt       time.Time
	UpdatedByUserID string
	Version         int
}

type RetentionRuleRecord struct {
	DataClass       contracts.RetentionDataClass
	Mode            contracts.RetentionMode
	RetentionDays   *int
	SoftDeleteDays  *int
	UpdatedAt       time.Time
	UpdatedByUserID string
	Version         int
}

type AlertRuleRecord struct {
	ID                      string
	ProjectID               string
	Name                    string
	Enabled                 bool
	Kind                    contracts.AlertRuleKind
	Severity                contracts.AlertSeverity
	Query                   map[string]any
	Condition               map[string]any
	EvaluationWindowSeconds int
	PendingForSeconds       int
	CooldownSeconds         int
	NotificationAdapterIDs  []string
	CreatedAt               time.Time
	UpdatedAt               time.Time
	UpdatedByUserID         string
	Version                 int
}

type AlertSilenceRecord struct {
	ID              string
	ProjectID       string
	RuleID          string
	Reason          string
	StartsAt        time.Time
	EndsAt          time.Time
	CreatedAt       time.Time
	CreatedByUserID string
}

type AlertEventRecord struct {
	ID                 string
	ProjectID          string
	RuleID             string
	InstanceID         string
	State              contracts.AlertState
	Severity           contracts.AlertSeverity
	Summary            string
	DeduplicationKey   string
	StartedAt          time.Time
	EndedAt            *time.Time
	CreatedAt          time.Time
	EvidenceTraceID    *string
	EvidenceSpanID     *string
	EvidenceLogID      *string
	EvidenceMetricName *string
}

type ControlStore interface {
	GetUser(ctx context.Context, userID string) (UserRecord, bool, error)
	PutUser(ctx context.Context, user UserRecord) error
	GetOrganization(ctx context.Context, organizationID string) (OrganizationRecord, bool, error)
	PutOrganization(ctx context.Context, organization OrganizationRecord) error
	ListOrganizations(ctx context.Context) ([]OrganizationRecord, error)
	GetMembership(ctx context.Context, organizationID string, userID string) (MembershipRecord, bool, error)
	PutMembership(ctx context.Context, membership MembershipRecord) error
	DeleteMembership(ctx context.Context, organizationID string, userID string) error
	ListMemberships(ctx context.Context, organizationID string) ([]MembershipRecord, error)
	ListMembershipsForUser(ctx context.Context, userID string) ([]MembershipRecord, error)
	GetInvitation(ctx context.Context, invitationID string) (InvitationRecord, bool, error)
	PutInvitation(ctx context.Context, invitation InvitationRecord) error
	ListInvitations(ctx context.Context, organizationID string) ([]InvitationRecord, error)
	GetPendingInvitationByEmail(ctx context.Context, organizationID string, email string) (InvitationRecord, bool, error)
	GetProject(ctx context.Context, projectID string) (ProjectRecord, bool, error)
	PutProject(ctx context.Context, project ProjectRecord) error
	ListProjects(ctx context.Context, organizationID *string, status *contracts.ProjectStatus) ([]ProjectRecord, error)
	GetIngestCredential(ctx context.Context, credentialID string) (IngestCredentialRecord, bool, error)
	PutIngestCredential(ctx context.Context, credential IngestCredentialRecord) error
	ListIngestCredentials(ctx context.Context, projectID string) ([]IngestCredentialRecord, error)
	GetDashboard(ctx context.Context, dashboardID string) (DashboardRecord, bool, error)
	PutDashboard(ctx context.Context, dashboard DashboardRecord) error
	DeleteDashboard(ctx context.Context, dashboardID string) error
	ListDashboards(ctx context.Context, projectID string) ([]DashboardRecord, error)
	ListDashboardPins(ctx context.Context, userID string, projectID string) ([]DashboardPinRecord, error)
	PutDashboardPin(ctx context.Context, pin DashboardPinRecord) error
	DeleteDashboardPin(ctx context.Context, userID string, projectID string, dashboardID string) error
	DeleteDashboardPinsForDashboard(ctx context.Context, dashboardID string) error
	GetProjectMember(ctx context.Context, projectID string, userID string) (ProjectMemberRecord, bool, error)
	PutProjectMember(ctx context.Context, member ProjectMemberRecord) error
	DeleteProjectMember(ctx context.Context, projectID string, userID string) error
	DeleteProjectMembershipsForUserInOrganization(ctx context.Context, organizationID string, userID string) error
	ListProjectMembers(ctx context.Context, projectID string) ([]ProjectMemberRecord, error)
	GetRetentionPolicy(ctx context.Context, projectID string) (RetentionPolicyRecord, bool, error)
	PutRetentionPolicy(ctx context.Context, policy RetentionPolicyRecord) error
	GetProjectAiSettings(ctx context.Context, projectID string) (ProjectAiSettingsRecord, bool, error)
	PutProjectAiSettings(ctx context.Context, settings ProjectAiSettingsRecord) error
	GetAlertRule(ctx context.Context, id string) (AlertRuleRecord, bool, error)
	PutAlertRule(ctx context.Context, rule AlertRuleRecord) error
	DeleteAlertRule(ctx context.Context, id string) error
	ListAlertRules(ctx context.Context, projectID string) ([]AlertRuleRecord, error)
	GetAlertSilence(ctx context.Context, id string) (AlertSilenceRecord, bool, error)
	PutAlertSilence(ctx context.Context, silence AlertSilenceRecord) error
	DeleteAlertSilence(ctx context.Context, id string) error
	ListAlertSilences(ctx context.Context, projectID string, ruleID *string) ([]AlertSilenceRecord, error)
	PutAlertEvent(ctx context.Context, event AlertEventRecord) error
	ListAlertEvents(ctx context.Context, projectID string, ruleID *string, first int, after *string) ([]AlertEventRecord, bool, *string, error)
}
