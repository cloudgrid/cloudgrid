package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestViewerBootstrapCreatesLocalCompanyAndFirstUserAdmin(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)

	viewer, err := service.GetViewer(context.Background(), localEnvelope("req-1", "local-user", nil))
	if err != nil {
		t.Fatalf("GetViewer returned error: %v", err)
	}

	if viewer.User.ID != "local-user" {
		t.Fatalf("viewer user = %q, want local-user", viewer.User.ID)
	}
	if len(viewer.Organizations) != 1 {
		t.Fatalf("organizations length = %d, want 1", len(viewer.Organizations))
	}
	org := viewer.Organizations[0]
	if org.ID != LocalCompanyID || org.Slug != LocalCompanyID {
		t.Fatalf("organization = %#v, want local company", org)
	}
	if org.Name != "Personal" {
		t.Fatalf("organization name = %q, want Personal", org.Name)
	}
	if org.Role != contracts.CompanyRoleAdmin {
		t.Fatalf("role = %q, want admin", org.Role)
	}
	if len(org.Projects) != 2 {
		t.Fatalf("projects length = %d, want local default and self-observability projects: %#v", len(org.Projects), org.Projects)
	}
	defaultProject, ok := projectByID(org.Projects, LocalProjectID)
	if !ok {
		t.Fatalf("projects = %#v, want local default project", org.Projects)
	}
	if defaultProject.Name != "Default project" || defaultProject.Slug != LocalProjectID || defaultProject.Status != contracts.ProjectStatusActive {
		t.Fatalf("default project = %#v, want active Default project", defaultProject)
	}
	systemProject, ok := projectByID(org.Projects, "cloudgrid-system")
	if !ok {
		t.Fatalf("projects = %#v, want local self-observability project", org.Projects)
	}
	if systemProject.Name != "CloudGrid" || systemProject.Slug != "cloudgrid-system" || systemProject.Status != contracts.ProjectStatusActive {
		t.Fatalf("self-observability project = %#v, want active CloudGrid project", systemProject)
	}
	if viewer.SelectedProject != nil {
		t.Fatalf("selected project = %#v, want nil", viewer.SelectedProject)
	}
}

func TestListProjectsIncludesLocalDefaultAndSelfObservabilityProjects(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)

	projects, err := service.ListProjects(ctx, contracts.ProjectListRequest{BridgeEnvelope: admin})
	if err != nil {
		t.Fatalf("ListProjects returned error: %v", err)
	}
	if len(projects) != 2 {
		t.Fatalf("projects length = %d, want local default and self-observability projects: %#v", len(projects), projects)
	}
	if _, ok := projectByID(projects, LocalProjectID); !ok {
		t.Fatalf("projects = %#v, want default project", projects)
	}
	systemProject, ok := projectByID(projects, "cloudgrid-system")
	if !ok {
		t.Fatalf("projects = %#v, want self-observability project", projects)
	}
	if systemProject.OrganizationID != LocalCompanyID || systemProject.Name != "CloudGrid" || systemProject.Status != contracts.ProjectStatusActive {
		t.Fatalf("self-observability project = %#v, want active CloudGrid project in Personal", systemProject)
	}
}

func TestSelectProjectAllowsLocalSelfObservabilityProject(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)

	viewer, err := service.SelectProject(ctx, contracts.ProjectSelectRequest{
		BridgeEnvelope: admin,
		ProjectID:      "cloudgrid-system",
	})
	if err != nil {
		t.Fatalf("SelectProject returned error: %v", err)
	}
	if viewer.SelectedProject == nil || viewer.SelectedProject.ID != "cloudgrid-system" {
		t.Fatalf("selected project = %#v, want cloudgrid-system", viewer.SelectedProject)
	}
	if viewer.SelectedProject.Name != "CloudGrid" || viewer.SelectedProject.Status != contracts.ProjectStatusActive {
		t.Fatalf("selected project = %#v, want active CloudGrid project", viewer.SelectedProject)
	}
}

func TestUpdateProjectRejectsLocalSelfObservabilityNameChange(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedLocalSelfObservabilityProject(t, store)
	name := "Renamed CloudGrid"

	if _, err := service.UpdateProject(ctx, contracts.ProjectUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      "cloudgrid-system",
		Name:           &name,
	}); !isForbidden(err) {
		t.Fatalf("UpdateProject name change error = %v, want forbidden", err)
	}
}

func TestUpdateProjectRejectsLocalSelfObservabilityStatusChange(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedLocalSelfObservabilityProject(t, store)
	status := contracts.ProjectStatusReadOnly

	if _, err := service.UpdateProject(ctx, contracts.ProjectUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      "cloudgrid-system",
		Status:         &status,
	}); !isForbidden(err) {
		t.Fatalf("UpdateProject status change error = %v, want forbidden", err)
	}
}

func TestViewerBootstrapStoresSSOProfileAndConfiguredCompany(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	companyID := "company-1"
	tenantID := "tenant-1"
	authMode := "sso"
	principalID := "github:42"
	displayName := "Ada Lovelace"
	email := "ada@example.test"
	envelope := contracts.BridgeEnvelope{
		RequestID: "req-sso",
		IssuedAt:  fixedNow(),
		AuthContext: &contracts.AuthContext{
			Mode:           "authenticated",
			AuthMode:       &authMode,
			PrincipalID:    &principalID,
			PrincipalName:  &displayName,
			PrincipalEmail: &email,
			TenantID:       &tenantID,
			CompanyID:      &companyID,
		},
	}

	viewer, err := service.GetViewer(context.Background(), envelope)
	if err != nil {
		t.Fatalf("GetViewer returned error: %v", err)
	}

	if viewer.User.ID != principalID {
		t.Fatalf("viewer user = %q, want principal", viewer.User.ID)
	}
	if viewer.User.DisplayName == nil || *viewer.User.DisplayName != displayName {
		t.Fatalf("displayName = %#v, want %q", viewer.User.DisplayName, displayName)
	}
	if viewer.User.Email == nil || *viewer.User.Email != email {
		t.Fatalf("email = %#v, want %q", viewer.User.Email, email)
	}
	if len(viewer.Organizations) != 1 || viewer.Organizations[0].ID != companyID {
		t.Fatalf("organizations = %#v, want configured company", viewer.Organizations)
	}
	if viewer.Organizations[0].Role != contracts.CompanyRoleAdmin {
		t.Fatalf("role = %q, want first SSO user admin", viewer.Organizations[0].Role)
	}
}

func TestIngestCredentialCreateListAndRevokeNeverReturnSecretAfterCreate(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	projectID := LocalProjectID
	selected := localEnvelope("req-credential", "admin-1", &projectID)

	created, err := service.CreateIngestCredential(ctx, IngestCredentialCreateRequest{
		BridgeEnvelope: selected,
		ProjectID:      LocalProjectID,
		Title:          "Checkout service",
	})
	if err != nil {
		t.Fatalf("CreateIngestCredential returned error: %v", err)
	}
	if created.Secret == "" || !strings.HasPrefix(created.Secret, "cgk_") {
		t.Fatalf("created secret = %q, want generated cgk_ secret", created.Secret)
	}
	if created.Credential.Title != "Checkout service" {
		t.Fatalf("credential title = %q", created.Credential.Title)
	}
	if created.Credential.ProjectID != LocalProjectID {
		t.Fatalf("credential project = %q, want local project", created.Credential.ProjectID)
	}
	if created.Credential.SecretPreview == "" || strings.Contains(created.Credential.SecretPreview, created.Secret) {
		t.Fatalf("secret preview = %q must be non-empty and not the full secret", created.Credential.SecretPreview)
	}

	listed, err := service.ListIngestCredentials(ctx, IngestCredentialListRequest{BridgeEnvelope: selected, ProjectID: LocalProjectID})
	if err != nil {
		t.Fatalf("ListIngestCredentials returned error: %v", err)
	}
	if len(listed.Items) != 1 {
		t.Fatalf("listed items length = %d, want 1", len(listed.Items))
	}
	if listed.Items[0].SecretPreview != created.Credential.SecretPreview {
		t.Fatalf("listed preview = %q, want created preview", listed.Items[0].SecretPreview)
	}

	revoked, err := service.RevokeIngestCredential(ctx, IngestCredentialRevokeRequest{
		BridgeEnvelope: selected,
		CredentialID:   created.Credential.ID,
	})
	if err != nil {
		t.Fatalf("RevokeIngestCredential returned error: %v", err)
	}
	if revoked.RevokedAt == nil {
		t.Fatalf("revoked credential RevokedAt = nil, want timestamp")
	}
}

func TestProjectAiSettingsDefaultAndUpdate(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-settings", "admin-1", nil)
	settings, err := service.GetProjectAiSettings(ctx, contracts.ProjectAiSettingsGetRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
	})
	if err != nil {
		t.Fatalf("GetProjectAiSettings returned error: %v", err)
	}
	if settings["projectId"] != LocalProjectID || settings["enabled"] != false || settings["version"] != 1 {
		t.Fatalf("default settings = %#v, want disabled v1 local project", settings)
	}

	updated, err := service.UpdateProjectAiSettings(ctx, contracts.ProjectAiSettingsUpdateRequest{
		BridgeEnvelope: admin,
		Input: map[string]any{
			"projectId": LocalProjectID,
			"enabled":   true,
			"providerProfiles": []any{map[string]any{
				"id":           "provider-1",
				"label":        "Local harness",
				"providerKind": "local_harness",
				"models":       map[string]any{},
				"timeoutMs":    30000,
			}},
			"modelAliases":   []any{},
			"onlinePolicies": []any{},
			"budget": map[string]any{
				"dailyUsd":          10,
				"deterministicOnly": false,
			},
			"sampling": map[string]any{
				"defaultOnlineSampleRate":             0.1,
				"maxOnlineSampleRate":                 1,
				"maxConcurrentExperimentItems":        4,
				"maxConcurrentOptimizationCandidates": 2,
			},
			"datasetDefaults": map[string]any{
				"splitAllocation":               map[string]any{},
				"smallDatasetReviewedThreshold": 30,
				"requireReviewForRegression":    true,
			},
			"expectedVersion": 1,
		},
	})
	if err != nil {
		t.Fatalf("UpdateProjectAiSettings returned error: %v", err)
	}
	if updated["enabled"] != true || updated["version"] != 2 {
		t.Fatalf("updated settings = %#v, want enabled v2", updated)
	}
	profiles := updated["providerProfiles"].([]any)
	if len(profiles) != 1 || profiles[0].(map[string]any)["projectId"] != LocalProjectID {
		t.Fatalf("provider profiles = %#v, want project-scoped provider", profiles)
	}
}

func TestAiProviderSettingsUseAsyncAPIContractsAndPersistInControlPlane(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-providers", localUserID, nil)

	projectSettings, err := service.GetProjectAiProviderSettings(ctx, contracts.ProjectAiProviderSettingsGetRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
	})
	if err != nil {
		t.Fatalf("GetProjectAiProviderSettings returned error: %v", err)
	}
	if projectSettings["projectId"] != LocalProjectID || projectSettings["version"] != 1 {
		t.Fatalf("default project provider settings = %#v, want v1 local project", projectSettings)
	}

	updatedProject, err := service.UpdateProjectAiProviderSettings(ctx, contracts.ProjectAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		ProviderProfiles: []map[string]any{{
			"id":              "provider-1",
			"label":           "OpenAI",
			"providerKind":    "openai",
			"credentialValue": "sk-project-secret",
			"models":          map[string]any{"chat": []any{"gpt-4.1-mini"}},
			"parameters":      map[string]any{},
		}},
		ModelAliases: []map[string]any{{
			"id":                "alias-1",
			"name":              "chat-fast",
			"providerProfileId": "provider-1",
			"model":             "gpt-4.1-mini",
			"purpose":           "chat",
			"parameters":        map[string]any{},
		}},
		ExpectedVersion: 1,
	})
	if err != nil {
		t.Fatalf("UpdateProjectAiProviderSettings returned error: %v", err)
	}
	if updatedProject["version"] != 2 {
		t.Fatalf("updated project provider settings = %#v, want version 2", updatedProject)
	}
	persistedProject, err := service.GetProjectAiProviderSettings(ctx, contracts.ProjectAiProviderSettingsGetRequest{BridgeEnvelope: admin, ProjectID: LocalProjectID})
	if err != nil {
		t.Fatalf("GetProjectAiProviderSettings persisted returned error: %v", err)
	}
	if persistedProject["version"] != 2 || len(persistedProject["providerProfiles"].([]any)) != 1 {
		t.Fatalf("persisted project provider settings = %#v, want stored v2 provider", persistedProject)
	}
	projectProfile := persistedProject["providerProfiles"].([]any)[0].(map[string]any)
	if projectProfile["credentialRef"] != "managed:project/default/provider-1" {
		t.Fatalf("project provider credentialRef = %#v, want managed ref", projectProfile["credentialRef"])
	}
	if text := fmt.Sprint(store.aiProviderSecrets["project-default-provider-1"]); strings.Contains(text, "sk-project-secret") {
		t.Fatalf("stored project provider secret leaked plaintext: %s", text)
	}
	resolvedProjectSecret, err := service.ResolveAiProviderSecret(ctx, contracts.AiProviderSecretResolveRequest{
		BridgeEnvelope: admin,
		CredentialRef:  "managed:project/default/provider-1",
	})
	if err != nil {
		t.Fatalf("ResolveAiProviderSecret(project) returned error: %v", err)
	}
	if resolvedProjectSecret["value"] != "sk-project-secret" {
		t.Fatalf("resolved project secret = %#v, want submitted value", resolvedProjectSecret)
	}

	companySettings, err := service.GetCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsGetRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
	})
	if err != nil {
		t.Fatalf("GetCompanyAiProviderSettings returned error: %v", err)
	}
	if companySettings["version"] != 1 {
		t.Fatalf("default company provider settings = %#v, want version 1", companySettings)
	}
	companyEffective, ok := companySettings["effective"].(map[string]any)
	if !ok {
		t.Fatalf("default company provider settings effective = %#v, want object", companySettings["effective"])
	}
	if _, ok := companyEffective["missingProviderProfiles"].([]any); !ok {
		t.Fatalf("default company provider settings effective = %#v, want missingProviderProfiles array", companyEffective)
	}
	if companyEffective["missingChatProvider"] != true {
		t.Fatalf("default company provider settings effective = %#v, want missingChatProvider true", companyEffective)
	}
	updatedCompany, err := service.UpdateCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProviderProfile: map[string]any{
			"id":              "company-chat-provider",
			"label":           "OpenAI Chat",
			"providerKind":    "openai",
			"credentialValue": "sk-company-secret",
			"models":          map[string]any{"chat": []any{"gpt-4.1-mini"}},
			"parameters":      map[string]any{},
		},
		ChatModelAlias: map[string]any{
			"id":                "company-chat",
			"name":              "chat",
			"providerProfileId": "company-chat-provider",
			"model":             "gpt-4.1-mini",
			"purpose":           "chat",
			"parameters":        map[string]any{},
		},
		ExpectedVersion: 1,
	})
	if err != nil {
		t.Fatalf("UpdateCompanyAiProviderSettings returned error: %v", err)
	}
	if updatedCompany["version"] != 2 || updatedCompany["providerProfile"] == nil {
		t.Fatalf("updated company provider settings = %#v, want stored chat provider", updatedCompany)
	}
	companyProfile := updatedCompany["providerProfile"].(map[string]any)
	if companyProfile["credentialRef"] != "managed:company/local/company-chat-provider" {
		t.Fatalf("company provider credentialRef = %#v, want managed ref", companyProfile["credentialRef"])
	}
	if companyProfile["ownerScope"] != "company" || companyProfile["ownerId"] != LocalCompanyID {
		t.Fatalf("company provider owner = %#v/%#v, want company/local", companyProfile["ownerScope"], companyProfile["ownerId"])
	}
	resolvedCompanySecret, err := service.ResolveAiProviderSecret(ctx, contracts.AiProviderSecretResolveRequest{
		BridgeEnvelope: admin,
		CredentialRef:  "managed:company/local/company-chat-provider",
	})
	if err != nil {
		t.Fatalf("ResolveAiProviderSecret(company) returned error: %v", err)
	}
	if resolvedCompanySecret["value"] != "sk-company-secret" {
		t.Fatalf("resolved company secret = %#v, want submitted value", resolvedCompanySecret)
	}
}

func TestCompanyAiProviderSettingsAcceptsFrontendManagedSecretPayload(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-company-ai-frontend-payload", localUserID, nil)
	settings, err := service.GetCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsGetRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
	})
	if err != nil {
		t.Fatalf("GetCompanyAiProviderSettings returned error: %v", err)
	}

	updated, err := service.UpdateCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProviderProfile: map[string]any{
			"id":              "company-chat-provider",
			"label":           "Company chat",
			"providerKind":    "openai",
			"baseUrl":         nil,
			"credentialRef":   nil,
			"credentialValue": "sk-from-ui",
			"models":          map[string]any{"chat": []any{"gpt-5-mini"}},
			"parameters":      map[string]any{},
			"timeoutMs":       float64(30000),
			"maxConcurrency":  nil,
			"disabled":        false,
		},
		ChatModelAlias: map[string]any{
			"id":                "company-chat",
			"name":              "chat",
			"providerProfileId": "company-chat-provider",
			"model":             "gpt-5-mini",
			"purpose":           "chat",
			"parameters":        map[string]any{"extras": map[string]any{}},
		},
		ExpectedVersion: settings["version"].(int),
	})
	if err != nil {
		t.Fatalf("UpdateCompanyAiProviderSettings returned error: %v", err)
	}
	profile := updated["providerProfile"].(map[string]any)
	if profile["credentialRef"] != "managed:company/local/company-chat-provider" {
		t.Fatalf("credentialRef = %#v, want managed company ref", profile["credentialRef"])
	}
	if profile["ownerScope"] != "company" || profile["ownerId"] != LocalCompanyID {
		t.Fatalf("provider owner = %#v/%#v, want company/local", profile["ownerScope"], profile["ownerId"])
	}
}

func TestAiProviderManagedSecretsRequireDeploymentEncryptionKeyWhenConfigured(t *testing.T) {
	store := newTestStore()
	service := NewServiceWithOptions(store, fixedNow, ServiceOptions{
		RequireProviderSecretEncryptionKey: true,
	})
	ctx := context.Background()
	admin := localEnvelope("req-ai-providers-key-required", localUserID, nil)

	_, err := service.UpdateCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProviderProfile: map[string]any{
			"id":              "company-chat-provider",
			"label":           "OpenAI Chat",
			"providerKind":    "openai",
			"credentialValue": "sk-company-secret",
			"models":          map[string]any{"chat": []any{"gpt-4.1-mini"}},
			"parameters":      map[string]any{},
		},
		ChatModelAlias: map[string]any{
			"id":                "company-chat",
			"name":              "chat",
			"providerProfileId": "company-chat-provider",
			"model":             "gpt-4.1-mini",
			"purpose":           "chat",
			"parameters":        map[string]any{},
		},
		ExpectedVersion: 1,
	})
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY") {
		t.Fatalf("UpdateCompanyAiProviderSettings error = %v, want encryption key requirement", err)
	}
}

func TestLocalBootstrapRepairsLocalAdminMembership(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-local-admin-repair", localUserID, nil)
	store.memberships[membershipKey(LocalCompanyID, localUserID)] = ports.MembershipRecord{
		UserID:         localUserID,
		OrganizationID: LocalCompanyID,
		Role:           contracts.CompanyRoleUser,
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}

	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("GetViewer returned error: %v", err)
	}
	membership := store.memberships[membershipKey(LocalCompanyID, localUserID)]
	if membership.Role != contracts.CompanyRoleAdmin {
		t.Fatalf("local membership role = %s, want admin", membership.Role)
	}
	_, err := service.UpdateCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsUpdateRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProviderProfile: map[string]any{
			"id":              "company-chat-provider",
			"label":           "OpenAI Chat",
			"providerKind":    "openai",
			"credentialValue": "sk-company-secret",
			"models":          map[string]any{"chat": []any{"gpt-5-mini"}},
			"parameters":      map[string]any{},
		},
		ChatModelAlias: map[string]any{
			"id":                "company-chat",
			"name":              "chat",
			"providerProfileId": "company-chat-provider",
			"model":             "gpt-5-mini",
			"purpose":           "chat",
			"parameters":        map[string]any{},
		},
		ExpectedVersion: 1,
	})
	if err != nil {
		t.Fatalf("UpdateCompanyAiProviderSettings returned error after repair: %v", err)
	}
}

func TestCompanyAiProviderSettingsNormalizesPersistedLegacyEffectiveShape(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-company-ai-legacy", localUserID, ptr(LocalProjectID))
	store.companyAiSettings[LocalCompanyID] = ports.CompanyAiProviderSettingsRecord{
		CompanyID: LocalCompanyID,
		Settings: map[string]any{
			"companyId":           LocalCompanyID,
			"chatProviderProfile": nil,
			"chatModelAlias":      nil,
			"effective": map[string]any{
				"enabled":                    false,
				"warnings":                   []any{"legacy"},
				"missingCredentialRefs":      []any{},
				"disabledProviderProfileIds": []any{},
				"runtimeSource":              "stored",
			},
			"version":         3,
			"updatedAt":       fixedNow(),
			"updatedByUserId": localUserID,
		},
		UpdatedAt:       fixedNow(),
		UpdatedByUserID: localUserID,
		Version:         3,
	}

	settings, err := service.GetCompanyAiProviderSettings(ctx, contracts.CompanyAiProviderSettingsGetRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
	})
	if err != nil {
		t.Fatalf("GetCompanyAiProviderSettings returned error: %v", err)
	}
	effective := settings["effective"].(map[string]any)
	if _, ok := effective["missingProviderProfiles"].([]any); !ok {
		t.Fatalf("effective = %#v, want missingProviderProfiles array", effective)
	}
	if _, ok := effective["disabledProviderProfiles"].([]any); !ok {
		t.Fatalf("effective = %#v, want disabledProviderProfiles array", effective)
	}
	if effective["missingChatProvider"] != true {
		t.Fatalf("effective = %#v, want repaired missingChatProvider true", effective)
	}
	persisted := store.companyAiSettings[LocalCompanyID].Settings["effective"].(map[string]any)
	if _, ok := persisted["missingProviderProfiles"].([]any); !ok {
		t.Fatalf("persisted effective = %#v, want repaired missingProviderProfiles array", persisted)
	}
	if _, ok := persisted["disabledProviderProfiles"].([]any); !ok {
		t.Fatalf("persisted effective = %#v, want repaired disabledProviderProfiles array", persisted)
	}
	if persisted["missingChatProvider"] != true {
		t.Fatalf("persisted effective = %#v, want repaired missingChatProvider true", persisted)
	}
}

func TestAiChatConversationActionsAndCompactionPersistInControlPlane(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-chat", localUserID, ptr(LocalProjectID))

	conversation, err := service.CreateAiChatConversation(ctx, contracts.AiChatConversationCreateRequest{
		BridgeEnvelope:   admin,
		CompanyID:        LocalCompanyID,
		ProjectID:        LocalProjectID,
		UserID:           localUserID,
		FirstUserMessage: "Investigate errors",
	})
	if err != nil {
		t.Fatalf("CreateAiChatConversation returned error: %v", err)
	}
	conversationID := conversation["id"].(string)
	loaded, err := service.GetAiChatConversation(ctx, contracts.AiChatConversationGetRequest{
		BridgeEnvelope: admin,
		ConversationID: conversationID,
	})
	if err != nil {
		t.Fatalf("GetAiChatConversation returned error: %v", err)
	}
	if loaded == nil || len(loaded["messages"].([]any)) != 1 {
		t.Fatalf("loaded conversation = %#v, want persisted first message", loaded)
	}

	run, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      admin,
		ConversationID:      conversationID,
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-1",
		IdempotencyKey:      "idempotency-key-1",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreateAiChatRun returned error: %v", err)
	}
	message, err := service.AppendAiChatMessage(ctx, contracts.AiChatMessageAppendRequest{
		BridgeEnvelope: admin,
		ConversationID: conversationID,
		RunID:          run.ID,
		Role:           "assistant",
		Parts:          []map[string]any{{"type": "text", "text": "Found error spans."}},
	})
	if err != nil {
		t.Fatalf("AppendAiChatMessage returned error: %v", err)
	}
	if message["conversationId"] != conversationID {
		t.Fatalf("message = %#v, want conversationId", message)
	}
	action, err := service.ProposeAiChatAction(ctx, contracts.AiChatActionProposeRequest{
		BridgeEnvelope:   admin,
		ConversationID:   conversationID,
		RunID:            run.ID,
		ProjectID:        LocalProjectID,
		Title:            "Save dashboard",
		Risk:             string(contracts.AiChatActionRiskMedium),
		ActionKind:       "dashboard.save",
		RequiresApproval: true,
		IdempotencyKey:   "proposal-key",
		ExpiresAt:        "2026-05-18T00:15:00Z",
		InputPreview:     map[string]any{"name": "Errors"},
	})
	if err != nil {
		t.Fatalf("ProposeAiChatAction returned error: %v", err)
	}
	actionID := action["id"].(string)
	approved, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   admin,
		ActionProposalID: actionID,
		IdempotencyKey:   "approval-key",
		Approved:         true,
		UserID:           localUserID,
		ExpectedVersion:  1,
	})
	if err != nil {
		t.Fatalf("ApproveAiChatAction returned error: %v", err)
	}
	if approved["status"] != string(contracts.AiChatActionStatusApproved) {
		t.Fatalf("approved action = %#v, want approved", approved)
	}
	compaction, err := service.SaveAiChatCompaction(ctx, contracts.AiChatCompactionSaveRequest{
		BridgeEnvelope:     admin,
		ConversationID:     conversationID,
		Summary:            "Errors investigated.",
		RetainedMessageIDs: []string{message["id"].(string)},
		SourceMessageCount: 1,
		ArtifactSummaries:  []string{},
		PendingActionIDs:   []string{},
	})
	if err != nil {
		t.Fatalf("SaveAiChatCompaction returned error: %v", err)
	}
	if compaction["conversationId"] != conversationID {
		t.Fatalf("compaction = %#v, want conversationId", compaction)
	}
	history, err := service.GetAiChatHistory(ctx, contracts.AiChatHistoryRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		UserID:         localUserID,
		ProjectID:      ptr(LocalProjectID),
	})
	if err != nil {
		t.Fatalf("GetAiChatHistory returned error: %v", err)
	}
	if len(history["projectGroups"].([]any)) != 1 {
		t.Fatalf("history = %#v, want one project group", history)
	}
	group := history["projectGroups"].([]any)[0].(map[string]any)
	if group["projectName"] != "Default project" {
		t.Fatalf("history project group = %#v, want projectName Default project", group)
	}
	otherProjectID := "project-other"
	store.projects[otherProjectID] = ports.ProjectRecord{
		ID:             otherProjectID,
		OrganizationID: LocalCompanyID,
		Name:           "Other project",
		Status:         contracts.ProjectStatusActive,
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}
	store.projectMembers[projectMemberKey(otherProjectID, localUserID)] = ports.ProjectMemberRecord{
		ProjectID: otherProjectID,
		UserID:    localUserID,
		Role:      contracts.ProjectRoleEditor,
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}
	store.aiChatConversations["chat-other-project"] = ports.AiChatConversationRecord{
		ID:            "chat-other-project",
		CompanyID:     LocalCompanyID,
		ProjectID:     otherProjectID,
		UserID:        localUserID,
		Title:         "Other project",
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: fixedNow().Add(time.Second),
		CreatedAt:     fixedNow(),
		UpdatedAt:     fixedNow(),
		Version:       1,
	}
	store.aiChatConversations["chat-other-user"] = ports.AiChatConversationRecord{
		ID:            "chat-other-user",
		CompanyID:     LocalCompanyID,
		ProjectID:     LocalProjectID,
		UserID:        "user-2",
		Title:         "Other user",
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: fixedNow().Add(2 * time.Second),
		CreatedAt:     fixedNow(),
		UpdatedAt:     fixedNow(),
		Version:       1,
	}
	scopedHistory, err := service.GetAiChatHistory(ctx, contracts.AiChatHistoryRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		UserID:         localUserID,
		ProjectID:      ptr(LocalProjectID),
	})
	if err != nil {
		t.Fatalf("GetAiChatHistory scoped returned error: %v", err)
	}
	scopedGroups := scopedHistory["projectGroups"].([]any)
	if len(scopedGroups) != 1 {
		t.Fatalf("scoped history = %#v, want one selected project group", scopedHistory)
	}
	scopedConversations := scopedGroups[0].(map[string]any)["conversations"].([]any)
	for _, item := range scopedConversations {
		conversation := item.(map[string]any)
		if conversation["projectId"] != LocalProjectID || conversation["userId"] != localUserID {
			t.Fatalf("scoped conversation = %#v, want only local user/default project", conversation)
		}
	}
	otherUser := localEnvelope("req-ai-chat-other-user", "user-2", ptr(LocalProjectID))
	if _, err := service.DeleteAiChatConversation(ctx, contracts.AiChatConversationDeleteRequest{
		BridgeEnvelope: otherUser,
		ConversationID: conversationID,
		UserID:         "user-2",
	}); !isForbidden(err) {
		t.Fatalf("DeleteAiChatConversation by other user error = %v, want forbidden", err)
	}
	deleted, err := service.DeleteAiChatConversation(ctx, contracts.AiChatConversationDeleteRequest{
		BridgeEnvelope: admin,
		ConversationID: conversationID,
		UserID:         localUserID,
	})
	if err != nil {
		t.Fatalf("DeleteAiChatConversation returned error: %v", err)
	}
	if !deleted {
		t.Fatalf("DeleteAiChatConversation deleted = false, want true")
	}
	if _, ok := store.aiChatConversations[conversationID]; ok {
		t.Fatalf("conversation still exists after delete")
	}
	if _, ok := store.aiChatMessages[message["id"].(string)]; ok {
		t.Fatalf("message still exists after delete")
	}
	if _, ok := store.aiChatRuns[run.ID]; ok {
		t.Fatalf("run still exists after delete")
	}
	if _, ok := store.aiChatActions[actionID]; ok {
		t.Fatalf("action still exists after delete")
	}
	if _, ok := store.aiChatCompactions[compaction["id"].(string)]; ok {
		t.Fatalf("compaction still exists after delete")
	}
	loadedAfterDelete, err := service.GetAiChatConversation(ctx, contracts.AiChatConversationGetRequest{
		BridgeEnvelope: admin,
		ConversationID: conversationID,
	})
	if err != nil {
		t.Fatalf("GetAiChatConversation after delete returned error: %v", err)
	}
	if loadedAfterDelete != nil {
		t.Fatalf("loaded after delete = %#v, want nil", loadedAfterDelete)
	}
}

func TestAiChatConversationMutationsRequireOwnerAndProjectAccess(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-chat-admin", localUserID, ptr(LocalProjectID))
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap local org: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "user-1@example.test")
	seedOrganizationMember(t, service, LocalCompanyID, "user-2", contracts.CompanyRoleUser, "user-2@example.test")
	store.projectMembers[projectMemberKey(LocalProjectID, "user-1")] = ports.ProjectMemberRecord{
		ProjectID: LocalProjectID,
		UserID:    "user-1",
		Role:      contracts.ProjectRoleEditor,
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}
	owner := ssoEnvelope("req-ai-chat-owner", LocalCompanyID, "user-1", "User One", "user-1@example.test", true)
	otherUser := ssoEnvelope("req-ai-chat-other", LocalCompanyID, "user-2", "User Two", "user-2@example.test", true)

	conversation, err := service.CreateAiChatConversation(ctx, contracts.AiChatConversationCreateRequest{
		BridgeEnvelope:   owner,
		CompanyID:        LocalCompanyID,
		ProjectID:        LocalProjectID,
		UserID:           "user-1",
		FirstUserMessage: "Investigate isolation",
	})
	if err != nil {
		t.Fatalf("CreateAiChatConversation returned error: %v", err)
	}
	conversationID := conversation["id"].(string)
	run, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      owner,
		ConversationID:      conversationID,
		ProjectID:           LocalProjectID,
		UserID:              "user-1",
		UserMessageClientID: "client-message-1",
		IdempotencyKey:      "isolation-run-1",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreateAiChatRun returned error: %v", err)
	}
	action, err := service.ProposeAiChatAction(ctx, contracts.AiChatActionProposeRequest{
		BridgeEnvelope:   owner,
		ConversationID:   conversationID,
		RunID:            run.ID,
		ProjectID:        LocalProjectID,
		Title:            "Persist view",
		Risk:             string(contracts.AiChatActionRiskLow),
		ActionKind:       "dashboard.save",
		RequiresApproval: true,
		IdempotencyKey:   "proposal-key",
		ExpiresAt:        "2026-05-18T00:15:00Z",
		InputPreview:     map[string]any{"name": "Isolation"},
	})
	if err != nil {
		t.Fatalf("ProposeAiChatAction returned error: %v", err)
	}
	actionID := action["id"].(string)

	if _, err := service.GetAiChatConversation(ctx, contracts.AiChatConversationGetRequest{
		BridgeEnvelope: otherUser,
		ConversationID: conversationID,
	}); !isForbidden(err) {
		t.Fatalf("GetAiChatConversation by other user error = %v, want forbidden", err)
	}
	if _, err := service.AppendAiChatMessage(ctx, contracts.AiChatMessageAppendRequest{
		BridgeEnvelope: otherUser,
		ConversationID: conversationID,
		RunID:          run.ID,
		Role:           "assistant",
		Parts:          []map[string]any{{"type": "text", "text": "cross-user message"}},
	}); !isForbidden(err) {
		t.Fatalf("AppendAiChatMessage by other user error = %v, want forbidden", err)
	}
	if _, err := service.ProposeAiChatAction(ctx, contracts.AiChatActionProposeRequest{
		BridgeEnvelope:   otherUser,
		ConversationID:   conversationID,
		RunID:            run.ID,
		ProjectID:        LocalProjectID,
		Title:            "Cross-user proposal",
		Risk:             string(contracts.AiChatActionRiskLow),
		ActionKind:       "dashboard.save",
		RequiresApproval: true,
		IdempotencyKey:   "proposal-key",
		ExpiresAt:        "2026-05-18T00:15:00Z",
		InputPreview:     map[string]any{"name": "Forbidden"},
	}); !isForbidden(err) {
		t.Fatalf("ProposeAiChatAction by other user error = %v, want forbidden", err)
	}
	if _, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   otherUser,
		ActionProposalID: actionID,
		IdempotencyKey:   "approval-key",
		Approved:         true,
		UserID:           "user-2",
		ExpectedVersion:  1,
	}); !isForbidden(err) {
		t.Fatalf("ApproveAiChatAction by other user error = %v, want forbidden", err)
	}
	if _, err := service.FinishAiChatAction(ctx, contracts.AiChatActionFinishRequest{
		BridgeEnvelope:   otherUser,
		ActionProposalID: actionID,
		Status:           string(contracts.AiChatActionStatusSucceeded),
		Result:           map[string]any{"ok": true},
	}); !isForbidden(err) {
		t.Fatalf("FinishAiChatAction by other user error = %v, want forbidden", err)
	}
	if _, err := service.SaveAiChatCompaction(ctx, contracts.AiChatCompactionSaveRequest{
		BridgeEnvelope:     otherUser,
		ConversationID:     conversationID,
		Summary:            "cross-user summary",
		RetainedMessageIDs: []string{},
		SourceMessageCount: 1,
		ArtifactSummaries:  []string{},
		PendingActionIDs:   []string{},
	}); !isForbidden(err) {
		t.Fatalf("SaveAiChatCompaction by other user error = %v, want forbidden", err)
	}

	mismatchedProjectID := "project-2"
	ownerOtherProject := owner
	ownerOtherProjectAuth := *owner.AuthContext
	ownerOtherProjectAuth.ProjectID = &mismatchedProjectID
	ownerOtherProject.AuthContext = &ownerOtherProjectAuth
	if _, err := service.GetAiChatConversation(ctx, contracts.AiChatConversationGetRequest{
		BridgeEnvelope: ownerOtherProject,
		ConversationID: conversationID,
	}); !isForbidden(err) {
		t.Fatalf("GetAiChatConversation with mismatched current project error = %v, want forbidden", err)
	}
	if _, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      ownerOtherProject,
		ConversationID:      conversationID,
		ProjectID:           LocalProjectID,
		UserID:              "user-1",
		UserMessageClientID: "client-message-2",
		IdempotencyKey:      "isolation-run-2",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-4.1-mini",
	}); !isForbidden(err) {
		t.Fatalf("CreateAiChatRun with mismatched current project error = %v, want forbidden", err)
	}

	delete(store.projectMembers, projectMemberKey(LocalProjectID, "user-1"))
	if _, err := service.ArchiveAiChatConversation(ctx, contracts.AiChatConversationArchiveRequest{
		BridgeEnvelope:  owner,
		ConversationID:  conversationID,
		UserID:          "user-1",
		ExpectedVersion: 1,
	}); !isForbidden(err) {
		t.Fatalf("ArchiveAiChatConversation after project access removal error = %v, want forbidden", err)
	}
	if _, err := service.AppendAiChatMessage(ctx, contracts.AiChatMessageAppendRequest{
		BridgeEnvelope: owner,
		ConversationID: conversationID,
		RunID:          run.ID,
		Role:           "assistant",
		Parts:          []map[string]any{{"type": "text", "text": "lost-access message"}},
	}); !isForbidden(err) {
		t.Fatalf("AppendAiChatMessage after project access removal error = %v, want forbidden", err)
	}
	if _, err := service.ProposeAiChatAction(ctx, contracts.AiChatActionProposeRequest{
		BridgeEnvelope:   owner,
		ConversationID:   conversationID,
		RunID:            run.ID,
		ProjectID:        LocalProjectID,
		Title:            "Lost-access proposal",
		Risk:             string(contracts.AiChatActionRiskLow),
		ActionKind:       "dashboard.save",
		RequiresApproval: true,
		IdempotencyKey:   "proposal-key",
		ExpiresAt:        "2026-05-18T00:15:00Z",
		InputPreview:     map[string]any{"name": "Forbidden"},
	}); !isForbidden(err) {
		t.Fatalf("ProposeAiChatAction after project access removal error = %v, want forbidden", err)
	}
	if _, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   owner,
		ActionProposalID: actionID,
		IdempotencyKey:   "approval-key",
		Approved:         true,
		UserID:           "user-1",
		ExpectedVersion:  1,
	}); !isForbidden(err) {
		t.Fatalf("ApproveAiChatAction after project access removal error = %v, want forbidden", err)
	}
	if _, err := service.FinishAiChatAction(ctx, contracts.AiChatActionFinishRequest{
		BridgeEnvelope:   owner,
		ActionProposalID: actionID,
		Status:           string(contracts.AiChatActionStatusSucceeded),
		Result:           map[string]any{"ok": true},
	}); !isForbidden(err) {
		t.Fatalf("FinishAiChatAction after project access removal error = %v, want forbidden", err)
	}
	if _, err := service.SaveAiChatCompaction(ctx, contracts.AiChatCompactionSaveRequest{
		BridgeEnvelope:     owner,
		ConversationID:     conversationID,
		Summary:            "lost-access summary",
		RetainedMessageIDs: []string{},
		SourceMessageCount: 1,
		ArtifactSummaries:  []string{},
		PendingActionIDs:   []string{},
	}); !isForbidden(err) {
		t.Fatalf("SaveAiChatCompaction after project access removal error = %v, want forbidden", err)
	}
}

func TestAdminInvariantDeniesFinalAdminRemovalAndDowngrade(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	if _, err := service.RemoveMember(ctx, contracts.MemberRemoveRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-1",
	}); !isForbidden(err) {
		t.Fatalf("RemoveMember error = %v, want forbidden final-admin error", err)
	}

	if _, err := service.UpdateMember(ctx, contracts.MemberUpdateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-1",
		Role:           contracts.CompanyRoleUser,
	}); !isForbidden(err) {
		t.Fatalf("UpdateMember error = %v, want forbidden final-admin error", err)
	}
}

func TestNonAdminCannotRemoveOrDowngradeUsers(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "")
	user := localEnvelope("req-user", "user-1", nil)

	if _, err := service.RemoveMember(ctx, contracts.MemberRemoveRequest{
		BridgeEnvelope: user,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-1",
	}); !isForbidden(err) {
		t.Fatalf("RemoveMember by user error = %v, want forbidden", err)
	}

	if _, err := service.UpdateMember(ctx, contracts.MemberUpdateRequest{
		BridgeEnvelope: user,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-1",
		Role:           contracts.CompanyRoleUser,
	}); !isForbidden(err) {
		t.Fatalf("UpdateMember by user error = %v, want forbidden", err)
	}
}

func TestAdminCanCreateAndListOrganizationInvitation(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	invitation, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          "  Ada@Example.TEST  ",
	})
	if err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}
	if invitation.OrganizationID != LocalCompanyID {
		t.Fatalf("organizationId = %q, want %q", invitation.OrganizationID, LocalCompanyID)
	}
	if invitation.Email != "ada@example.test" {
		t.Fatalf("email = %q, want normalized email", invitation.Email)
	}
	if invitation.Role != contracts.CompanyRoleUser {
		t.Fatalf("role = %q, want user", invitation.Role)
	}
	if invitation.Status != contracts.OrganizationInvitationStatusPending {
		t.Fatalf("status = %q, want pending", invitation.Status)
	}
	if invitation.InvitedByUserID != "admin-1" {
		t.Fatalf("invitedByUserId = %q, want admin-1", invitation.InvitedByUserID)
	}

	items, err := service.ListInvitations(ctx, contracts.InvitationListRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
	})
	if err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if len(items) != 1 || items[0].ID != invitation.ID {
		t.Fatalf("listed invitations = %#v, want created invitation", items)
	}
}

func TestNonAdminCannotCreateOrRevokeOrganizationInvitations(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "")
	invitation, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          "ada@example.test",
	})
	if err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}
	user := localEnvelope("req-user", "user-1", nil)

	if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: user,
		OrganizationID: LocalCompanyID,
		Email:          "grace@example.test",
	}); !isForbidden(err) {
		t.Fatalf("CreateInvitation by user error = %v, want forbidden", err)
	}
	if _, err := service.RevokeInvitation(ctx, contracts.InvitationRevokeRequest{
		BridgeEnvelope: user,
		InvitationID:   invitation.ID,
	}); !isForbidden(err) {
		t.Fatalf("RevokeInvitation by user error = %v, want forbidden", err)
	}
}

func TestCreateInvitationRejectsDuplicateNormalizedEmailAndExistingMember(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          "Ada@Example.TEST",
	}); err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}

	if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          " ada@example.test ",
	}); !isValidation(err) {
		t.Fatalf("duplicate CreateInvitation error = %v, want validation", err)
	}

	seedOrganizationMember(t, service, LocalCompanyID, "member-1", contracts.CompanyRoleUser, "member@example.test")

	if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          " MEMBER@example.test ",
	}); !isValidation(err) {
		t.Fatalf("existing member CreateInvitation error = %v, want validation", err)
	}
}

func TestSSOAcceptsPendingVerifiedMatchingInvitationAsUser(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	companyID := "company-1"
	admin := ssoEnvelope("req-admin", companyID, "sso-admin", "Admin", "admin@example.test", true)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: companyID,
		Email:          "Ada@Example.TEST",
	}); err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}

	viewer, err := service.GetViewer(ctx, ssoEnvelope("req-invitee", companyID, "sso-ada", "Ada", " ada@example.test ", true))
	if err != nil {
		t.Fatalf("GetViewer invitee returned error: %v", err)
	}
	if len(viewer.Organizations) != 1 {
		t.Fatalf("organizations length = %d, want 1", len(viewer.Organizations))
	}
	if viewer.Organizations[0].Role != contracts.CompanyRoleUser {
		t.Fatalf("accepted role = %q, want user", viewer.Organizations[0].Role)
	}
	items, err := service.ListInvitations(ctx, contracts.InvitationListRequest{BridgeEnvelope: admin, OrganizationID: companyID})
	if err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if len(items) != 1 || items[0].Status != contracts.OrganizationInvitationStatusAccepted || items[0].AcceptedByUserID == nil || *items[0].AcceptedByUserID != "sso-ada" {
		t.Fatalf("accepted invitation = %#v, want accepted by sso-ada", items)
	}
}

func TestProjectInvitationForInactiveEmailAppliesProjectGrantAfterSSOAcceptance(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	companyID := "company-1"
	admin := ssoEnvelope("req-admin", companyID, "sso-admin", "Admin", "admin@example.test", true)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	project, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: companyID,
		Name:           "Checkout",
		Slug:           "checkout",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}

	result, err := service.CreateProjectInvitation(ctx, contracts.ProjectInvitationCreateRequest{
		BridgeEnvelope: admin,
		ProjectID:      project.ID,
		Email:          " Ada@Example.TEST ",
		Role:           contracts.ProjectRoleEditor,
	})
	if err != nil {
		t.Fatalf("CreateProjectInvitation returned error: %v", err)
	}
	if result.Outcome != contracts.ProjectInvitationOutcomeInvitationPending {
		t.Fatalf("outcome = %q, want invitation_pending", result.Outcome)
	}
	if result.Invitation == nil || result.ProjectMember != nil {
		t.Fatalf("result = %#v, want pending invitation without active member", result)
	}
	if len(result.Invitation.ProjectGrants) != 1 {
		t.Fatalf("project grants = %#v, want one pending grant", result.Invitation.ProjectGrants)
	}
	grant := result.Invitation.ProjectGrants[0]
	if grant.ProjectID != project.ID || grant.Role != contracts.ProjectRoleEditor || grant.Status != contracts.InvitationProjectGrantStatusPending {
		t.Fatalf("grant = %#v, want pending editor grant for project", grant)
	}
	if _, ok, err := service.store.GetProjectMember(ctx, project.ID, "sso-ada"); err != nil {
		t.Fatalf("GetProjectMember before acceptance returned error: %v", err)
	} else if ok {
		t.Fatalf("project grant created active membership before acceptance")
	}

	if _, err := service.GetViewer(ctx, ssoEnvelope("req-ada", companyID, "sso-ada", "Ada", "ada@example.test", true)); err != nil {
		t.Fatalf("GetViewer invitee returned error: %v", err)
	}
	member, ok, err := service.store.GetProjectMember(ctx, project.ID, "sso-ada")
	if err != nil {
		t.Fatalf("GetProjectMember after acceptance returned error: %v", err)
	}
	if !ok || member.Role != contracts.ProjectRoleEditor {
		t.Fatalf("project member = %#v, %v; want applied editor membership", member, ok)
	}
	items, err := service.ListInvitations(ctx, contracts.InvitationListRequest{BridgeEnvelope: admin, OrganizationID: companyID})
	if err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if len(items) != 1 || len(items[0].ProjectGrants) != 1 || items[0].ProjectGrants[0].Status != contracts.InvitationProjectGrantStatusApplied || items[0].ProjectGrants[0].AppliedAt == nil {
		t.Fatalf("accepted invitation grants = %#v, want applied grant", items)
	}
}

func TestProjectInvitationForActiveCompanyMemberCreatesDirectMembership(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "member@example.test")

	result, err := service.CreateProjectInvitation(ctx, contracts.ProjectInvitationCreateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Email:          " Member@Example.TEST ",
		Role:           contracts.ProjectRoleViewer,
	})
	if err != nil {
		t.Fatalf("CreateProjectInvitation returned error: %v", err)
	}
	if result.Outcome != contracts.ProjectInvitationOutcomeMembershipCreated {
		t.Fatalf("outcome = %q, want membership_created", result.Outcome)
	}
	if result.ProjectMember == nil || result.Invitation != nil {
		t.Fatalf("result = %#v, want project member without invitation", result)
	}
	if result.ProjectMember.UserID != "user-1" || result.ProjectMember.Role != contracts.ProjectRoleViewer || result.ProjectMember.Source != contracts.ProjectMemberSourceDirect {
		t.Fatalf("project member = %#v, want direct viewer for user-1", result.ProjectMember)
	}
	items, err := service.ListInvitations(ctx, contracts.InvitationListRequest{BridgeEnvelope: admin, OrganizationID: LocalCompanyID})
	if err != nil {
		t.Fatalf("ListInvitations returned error: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("invitations = %#v, want no company invitation for active member", items)
	}
}

func TestInvitationEmailDeliveryCreatesOutboxAndUpdatesStatus(t *testing.T) {
	store := newTestStore()
	transport := &fakeInvitationEmailTransport{}
	service := NewServiceWithOptions(store, fixedNow, ServiceOptions{
		InvitationEmail: InvitationEmailConfig{
			Mode:            InvitationEmailModeSMTP,
			RequireDelivery: true,
			PublicURL:       "https://cloudgrid.example.test",
			From:            "CloudGrid <noreply@example.test>",
			MaxAttempts:     3,
			RetryBase:       time.Minute,
		},
		EmailTransport: transport,
	})
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	invitation, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Email:          "ada@example.test",
	})
	if err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}
	if invitation.DeliveryStatus != contracts.InvitationDeliveryStatusPending || invitation.LastEmailDeliveryID == nil {
		t.Fatalf("invitation delivery = %#v, want pending with delivery ID", invitation)
	}
	if len(store.emailDeliveries) != 1 {
		t.Fatalf("email deliveries = %#v, want one outbox row", store.emailDeliveries)
	}

	if sent, err := service.ProcessDueInvitationEmails(ctx, 10); err != nil || sent != 1 {
		t.Fatalf("ProcessDueInvitationEmails = %d, %v; want 1 nil", sent, err)
	}
	if len(transport.messages) != 1 {
		t.Fatalf("transport messages = %#v, want one message", transport.messages)
	}
	updated, ok, err := service.store.GetInvitation(ctx, invitation.ID)
	if err != nil || !ok {
		t.Fatalf("GetInvitation after send = %#v, %v, %v", updated, ok, err)
	}
	if updated.DeliveryStatus != contracts.InvitationDeliveryStatusSent {
		t.Fatalf("updated delivery status = %q, want sent", updated.DeliveryStatus)
	}
}

func TestSSOWithoutAcceptableInvitationGetsNoMembership(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	companyID := "company-1"
	admin := ssoEnvelope("req-admin", companyID, "sso-admin", "Admin", "admin@example.test", true)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	for _, tc := range []struct {
		name     string
		email    string
		verified bool
	}{
		{name: "no matching invite", email: "nobody@example.test", verified: true},
		{name: "unverified email", email: "pending@example.test", verified: false},
		{name: "missing email", email: "", verified: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.name == "unverified email" {
				if _, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
					BridgeEnvelope: admin,
					OrganizationID: companyID,
					Email:          tc.email,
				}); err != nil {
					t.Fatalf("CreateInvitation returned error: %v", err)
				}
			}
			viewer, err := service.GetViewer(ctx, ssoEnvelope("req-"+tc.name, companyID, "sso-"+normalizeID(tc.name), "User", tc.email, tc.verified))
			if err != nil {
				t.Fatalf("GetViewer returned error: %v", err)
			}
			if len(viewer.Organizations) != 0 {
				t.Fatalf("organizations = %#v, want none", viewer.Organizations)
			}
		})
	}
}

func TestRevokedAndExpiredInvitationsCannotBeAccepted(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	companyID := "company-1"
	admin := ssoEnvelope("req-admin", companyID, "sso-admin", "Admin", "admin@example.test", true)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	revoked, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: companyID,
		Email:          "revoked@example.test",
	})
	if err != nil {
		t.Fatalf("CreateInvitation revoked returned error: %v", err)
	}
	if _, err := service.RevokeInvitation(ctx, contracts.InvitationRevokeRequest{
		BridgeEnvelope: admin,
		InvitationID:   revoked.ID,
	}); err != nil {
		t.Fatalf("RevokeInvitation returned error: %v", err)
	}
	expired, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: companyID,
		Email:          "expired@example.test",
	})
	if err != nil {
		t.Fatalf("CreateInvitation expired returned error: %v", err)
	}
	expired.ExpiresAt = ptr(fixedNow().Add(-time.Hour))
	if err := service.store.PutInvitation(ctx, portsInvitationRecordFromContract(expired)); err != nil {
		t.Fatalf("expire invitation: %v", err)
	}

	for _, email := range []string{"revoked@example.test", "expired@example.test"} {
		viewer, err := service.GetViewer(ctx, ssoEnvelope("req-"+email, companyID, "sso-"+email, "User", email, true))
		if err != nil {
			t.Fatalf("GetViewer %s returned error: %v", email, err)
		}
		if len(viewer.Organizations) != 0 {
			t.Fatalf("organizations for %s = %#v, want none", email, viewer.Organizations)
		}
	}
}

func TestAcceptedInvitationCannotBeRevoked(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	companyID := "company-1"
	admin := ssoEnvelope("req-admin", companyID, "sso-admin", "Admin", "admin@example.test", true)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	invitation, err := service.CreateInvitation(ctx, contracts.InvitationCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: companyID,
		Email:          "ada@example.test",
	})
	if err != nil {
		t.Fatalf("CreateInvitation returned error: %v", err)
	}
	if _, err := service.GetViewer(ctx, ssoEnvelope("req-ada", companyID, "sso-ada", "Ada", "ada@example.test", true)); err != nil {
		t.Fatalf("GetViewer invitee returned error: %v", err)
	}

	if _, err := service.RevokeInvitation(ctx, contracts.InvitationRevokeRequest{
		BridgeEnvelope: admin,
		InvitationID:   invitation.ID,
	}); !isForbidden(err) {
		t.Fatalf("RevokeInvitation accepted error = %v, want forbidden", err)
	}
}

func TestListMembersReturnsActiveMembersOnly(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	items, err := service.ListMembers(ctx, contracts.MemberListRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
	})
	if err != nil {
		t.Fatalf("ListMembers returned error: %v", err)
	}
	if len(items) != 1 || items[0].User.ID != "admin-1" {
		t.Fatalf("members = %#v, want only active admin", items)
	}
}

func TestUpdateMemberRejectsUnknownUser(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	if _, err := service.UpdateMember(ctx, contracts.MemberUpdateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		UserID:         "unknown-user",
		Role:           contracts.CompanyRoleUser,
	}); !isValidation(err) {
		t.Fatalf("UpdateMember unknown user error = %v, want validation", err)
	}
}

func TestProjectCreationStatusSnapshotAndStatusChange(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	project, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Name:           "Backend",
		Slug:           "backend",
	})
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if project.Status != contracts.ProjectStatusActive {
		t.Fatalf("created status = %q, want active", project.Status)
	}

	snapshot, err := service.GetProjectStatusSnapshot(ctx, contracts.ProjectStatusSnapshotRequest{
		BridgeEnvelope: admin,
		CompanyID:      LocalCompanyID,
		ProjectID:      project.ID,
	})
	if err != nil {
		t.Fatalf("GetProjectStatusSnapshot returned error: %v", err)
	}
	if snapshot.CompanyID != LocalCompanyID || snapshot.ProjectID != project.ID || snapshot.Status != contracts.ProjectStatusActive {
		t.Fatalf("snapshot = %#v, want active project snapshot", snapshot)
	}

	readOnly := contracts.ProjectStatusReadOnly
	updated, err := service.UpdateProject(ctx, contracts.ProjectUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      project.ID,
		Status:         &readOnly,
	})
	if err != nil {
		t.Fatalf("UpdateProject returned error: %v", err)
	}
	if updated.Status != readOnly {
		t.Fatalf("updated status = %q, want read_only", updated.Status)
	}
	changes := service.StatusChanges()
	if len(changes) != 1 {
		t.Fatalf("status changes length = %d, want 1", len(changes))
	}
	if changes[0].CompanyID != LocalCompanyID || changes[0].ProjectID != project.ID || changes[0].Status != readOnly {
		t.Fatalf("status change = %#v, want read_only notification", changes[0])
	}
}

func TestSelectProjectValidatesCompanyMembership(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	project, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		Name:           "Default",
		Slug:           "default",
	})
	if err != nil {
		t.Fatalf("create local project: %v", err)
	}

	viewer, err := service.SelectProject(ctx, contracts.ProjectSelectRequest{
		BridgeEnvelope: admin,
		ProjectID:      project.ID,
	})
	if err != nil {
		t.Fatalf("SelectProject returned error: %v", err)
	}
	if viewer.SelectedProject == nil || viewer.SelectedProject.ID != project.ID {
		t.Fatalf("selected project = %#v, want %s", viewer.SelectedProject, project.ID)
	}

	foreignOrg := ports.OrganizationRecord{ID: "foreign", Name: "Foreign", Slug: "foreign"}
	if err := store.PutOrganization(ctx, foreignOrg); err != nil {
		t.Fatalf("seed foreign organization: %v", err)
	}
	foreignProject := ports.ProjectRecord{ID: "project-foreign", OrganizationID: "foreign", Name: "Foreign", Slug: "foreign", Status: contracts.ProjectStatusActive, ChangedAt: fixedNow()}
	if err := store.PutProject(ctx, foreignProject); err != nil {
		t.Fatalf("seed foreign project: %v", err)
	}

	if _, err := service.SelectProject(ctx, contracts.ProjectSelectRequest{
		BridgeEnvelope: admin,
		ProjectID:      foreignProject.ID,
	}); !isForbidden(err) {
		t.Fatalf("SelectProject foreign error = %v, want forbidden", err)
	}
}

func TestProjectMembersIncludeCompanyAdminFallbackAndDirectMembers(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "")

	member, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "user-1",
		Role:           contracts.ProjectRoleViewer,
	})
	if err != nil {
		t.Fatalf("UpdateProjectMember returned error: %v", err)
	}
	if member.Source != contracts.ProjectMemberSourceDirect || member.EffectiveRole != contracts.ProjectRoleViewer {
		t.Fatalf("member = %#v, want direct viewer", member)
	}

	items, err := service.ListProjectMembers(ctx, contracts.ProjectMemberListRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
	})
	if err != nil {
		t.Fatalf("ListProjectMembers returned error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("project members length = %d, want company admin fallback plus direct member: %#v", len(items), items)
	}
	if items[0].UserID != "admin-1" || items[0].Source != contracts.ProjectMemberSourceCompanyAdmin || items[0].EffectiveRole != contracts.ProjectRoleAdmin {
		t.Fatalf("first member = %#v, want company admin fallback", items[0])
	}
	if items[1].UserID != "user-1" || items[1].Source != contracts.ProjectMemberSourceDirect {
		t.Fatalf("second member = %#v, want direct user", items[1])
	}
}

func TestProjectMemberMutationsEnforceLocalPersonalAndFinalAdminInvariants(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "local-user", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap local admin: %v", err)
	}

	if _, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "local-user",
		Role:           contracts.ProjectRoleViewer,
	}); !isForbidden(err) {
		t.Fatalf("demote local personal error = %v, want forbidden", err)
	}
	if _, err := service.RemoveProjectMember(ctx, contracts.ProjectMemberRemoveRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "local-user",
	}); !isForbidden(err) {
		t.Fatalf("remove local personal error = %v, want forbidden", err)
	}

	seedOrganizationMember(t, service, LocalCompanyID, "admin-2", contracts.CompanyRoleAdmin, "")
	if _, err := service.UpdateMember(ctx, contracts.MemberUpdateRequest{
		BridgeEnvelope: admin,
		OrganizationID: LocalCompanyID,
		UserID:         "admin-2",
		Role:           contracts.CompanyRoleUser,
	}); err != nil {
		t.Fatalf("downgrade second company admin to user: %v", err)
	}
	if _, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "admin-2",
		Role:           contracts.ProjectRoleAdmin,
	}); err != nil {
		t.Fatalf("add direct project admin: %v", err)
	}
	if removed, err := service.RemoveProjectMember(ctx, contracts.ProjectMemberRemoveRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		UserID:         "admin-2",
	}); err != nil || !removed {
		t.Fatalf("remove direct admin with company-admin fallback = %v, %v; want true nil", removed, err)
	}
}

func TestRetentionPolicyDefaultsAndFullReplacementValidation(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	policy, err := service.GetRetentionPolicy(ctx, contracts.RetentionGetRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
	})
	if err != nil {
		t.Fatalf("GetRetentionPolicy returned error: %v", err)
	}
	if policy.Version != 1 || len(policy.Rules) != 8 {
		t.Fatalf("default policy = %#v, want version 1 with all data classes", policy)
	}
	if rule := retentionRule(policy, contracts.RetentionDataClassTraces); rule.RetentionDays == nil || *rule.RetentionDays != 30 || rule.Mode != contracts.RetentionModeDelete {
		t.Fatalf("TRACES default = %#v, want delete 30", rule)
	}
	if rule := retentionRule(policy, contracts.RetentionDataClassDatasets); rule.RetentionDays != nil || rule.Mode != contracts.RetentionModeRetain {
		t.Fatalf("DATASETS default = %#v, want retain without retentionDays", rule)
	}

	rules := defaultRetentionInputs()
	rules[0].RetentionDays = ptr(14)
	updated, err := service.UpdateRetentionPolicy(ctx, contracts.RetentionUpdateRequest{
		BridgeEnvelope:  admin,
		ProjectID:       LocalProjectID,
		ExpectedVersion: policy.Version,
		Rules:           rules,
	})
	if err != nil {
		t.Fatalf("UpdateRetentionPolicy returned error: %v", err)
	}
	if updated.Version != 2 || *retentionRule(updated, contracts.RetentionDataClassTraces).RetentionDays != 14 {
		t.Fatalf("updated policy = %#v, want version 2 traces 14 days", updated)
	}
	if _, err := service.UpdateRetentionPolicy(ctx, contracts.RetentionUpdateRequest{
		BridgeEnvelope:  admin,
		ProjectID:       LocalProjectID,
		ExpectedVersion: policy.Version,
		Rules:           rules,
	}); !isForbidden(err) {
		t.Fatalf("stale update error = %v, want ERR-016", err)
	}
	if _, err := service.UpdateRetentionPolicy(ctx, contracts.RetentionUpdateRequest{
		BridgeEnvelope:  admin,
		ProjectID:       LocalProjectID,
		ExpectedVersion: updated.Version,
		Rules:           rules[:7],
	}); !isForbidden(err) {
		t.Fatalf("incomplete update error = %v, want ERR-016", err)
	}
}

func TestAlertRulesSilencesAndHistoryCRUD(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	rule, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
		BridgeEnvelope: admin,
		Input: contracts.AlertRuleCreateInput{
			ProjectID:               LocalProjectID,
			Name:                    "High latency",
			Enabled:                 true,
			Kind:                    contracts.AlertRuleKindTraceLatency,
			Severity:                contracts.AlertSeverityWarning,
			Query:                   map[string]any{"service": "api"},
			Condition:               map[string]any{"operator": "GT", "threshold": float64(500)},
			EvaluationWindowSeconds: 300,
			PendingForSeconds:       60,
			CooldownSeconds:         120,
			NotificationAdapterIDs:  []string{"in_app"},
		},
	})
	if err != nil {
		t.Fatalf("CreateAlertRule returned error: %v", err)
	}
	if rule.Version != 1 || rule.ProjectID != LocalProjectID || rule.UpdatedByUserID != "admin-1" {
		t.Fatalf("created rule = %#v, want project rule version 1", rule)
	}

	enabled := false
	updated, err := service.UpdateAlertRule(ctx, contracts.AlertRuleUpdateRequest{
		BridgeEnvelope: admin,
		Input: contracts.AlertRuleUpdateInput{
			ID:              rule.ID,
			Enabled:         &enabled,
			ExpectedVersion: rule.Version,
		},
	})
	if err != nil {
		t.Fatalf("UpdateAlertRule returned error: %v", err)
	}
	if updated.Enabled || updated.Version != 2 {
		t.Fatalf("updated rule = %#v, want disabled version 2", updated)
	}

	silence, err := service.CreateAlertSilence(ctx, contracts.AlertSilenceCreateRequest{
		BridgeEnvelope: admin,
		Input: contracts.AlertSilenceCreateInput{
			ProjectID: LocalProjectID,
			RuleID:    rule.ID,
			Reason:    "maintenance",
			StartsAt:  fixedNow().Add(-time.Minute),
			EndsAt:    fixedNow().Add(time.Hour),
		},
	})
	if err != nil {
		t.Fatalf("CreateAlertSilence returned error: %v", err)
	}
	if !silence.Active || silence.CreatedByUserID != "admin-1" {
		t.Fatalf("silence = %#v, want active created by admin", silence)
	}

	event, err := service.RecordAlertHistory(ctx, contracts.AlertHistoryRecordRequest{
		BridgeEnvelope: admin,
		Event: contracts.AlertEvent{
			ID:               "alert-event-1",
			ProjectID:        LocalProjectID,
			RuleID:           rule.ID,
			InstanceID:       "instance-1",
			State:            contracts.AlertStateFiring,
			Severity:         contracts.AlertSeverityWarning,
			Summary:          "High latency firing",
			DeduplicationKey: "latency:api",
			StartedAt:        fixedNow(),
			CreatedAt:        fixedNow(),
		},
	})
	if err != nil {
		t.Fatalf("RecordAlertHistory returned error: %v", err)
	}
	if event.ID != "alert-event-1" {
		t.Fatalf("recorded event = %#v", event)
	}

	history, err := service.ListAlertHistory(ctx, contracts.AlertHistoryListRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		RuleID:         &rule.ID,
	})
	if err != nil {
		t.Fatalf("ListAlertHistory returned error: %v", err)
	}
	if len(history.Items) != 1 || history.Items[0].ID != event.ID {
		t.Fatalf("history = %#v, want recorded event", history)
	}

	if deleted, err := service.DeleteAlertSilence(ctx, contracts.AlertSilenceDeleteRequest{BridgeEnvelope: admin, ID: silence.ID}); err != nil || !deleted {
		t.Fatalf("DeleteAlertSilence = %v, %v; want true nil", deleted, err)
	}
	if deleted, err := service.DeleteAlertRule(ctx, contracts.AlertRuleDeleteRequest{BridgeEnvelope: admin, ID: rule.ID}); err != nil || !deleted {
		t.Fatalf("DeleteAlertRule = %v, %v; want true nil", deleted, err)
	}
}

func TestAlertSummaryAggregatesEventsByStateSeverityAndSignal(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	createRule := func(name string, kind contracts.AlertRuleKind, severity contracts.AlertSeverity) contracts.AlertRule {
		t.Helper()
		condition := map[string]any{"minCount": float64(1)}
		if kind == contracts.AlertRuleKindMetricThreshold {
			condition = map[string]any{"operator": "GT", "threshold": float64(90)}
		}
		rule, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
			BridgeEnvelope: admin,
			Input: contracts.AlertRuleCreateInput{
				ProjectID:               LocalProjectID,
				Name:                    name,
				Enabled:                 true,
				Kind:                    kind,
				Severity:                severity,
				Query:                   map[string]any{"service": "api"},
				Condition:               condition,
				EvaluationWindowSeconds: 300,
				PendingForSeconds:       0,
				CooldownSeconds:         300,
				NotificationAdapterIDs:  []string{"in_app"},
			},
		})
		if err != nil {
			t.Fatalf("CreateAlertRule(%s) returned error: %v", name, err)
		}
		return rule
	}

	metricRule := createRule("CPU high", contracts.AlertRuleKindMetricThreshold, contracts.AlertSeverityCritical)
	traceRule := createRule("Trace errors", contracts.AlertRuleKindTraceError, contracts.AlertSeverityError)
	logRule := createRule("Log warnings", contracts.AlertRuleKindLogMatch, contracts.AlertSeverityWarning)
	events := []contracts.AlertEvent{
		{
			ID:               "event-metric",
			ProjectID:        LocalProjectID,
			RuleID:           metricRule.ID,
			InstanceID:       "metric",
			State:            contracts.AlertStateFiring,
			Severity:         contracts.AlertSeverityCritical,
			Summary:          "CPU high firing",
			DeduplicationKey: "metric",
			StartedAt:        fixedNow().Add(-10 * time.Minute),
			CreatedAt:        fixedNow().Add(-10 * time.Minute),
		},
		{
			ID:               "event-trace",
			ProjectID:        LocalProjectID,
			RuleID:           traceRule.ID,
			InstanceID:       "trace",
			State:            contracts.AlertStateFiring,
			Severity:         contracts.AlertSeverityError,
			Summary:          "Trace errors firing",
			DeduplicationKey: "trace",
			StartedAt:        fixedNow().Add(-5 * time.Minute),
			CreatedAt:        fixedNow().Add(-5 * time.Minute),
		},
		{
			ID:               "event-log",
			ProjectID:        LocalProjectID,
			RuleID:           logRule.ID,
			InstanceID:       "log",
			State:            contracts.AlertStateResolved,
			Severity:         contracts.AlertSeverityWarning,
			Summary:          "Log warning resolved",
			DeduplicationKey: "log",
			StartedAt:        fixedNow().Add(-2 * time.Hour),
			CreatedAt:        fixedNow().Add(-2 * time.Hour),
		},
	}
	for _, event := range events {
		if _, err := service.RecordAlertHistory(ctx, contracts.AlertHistoryRecordRequest{BridgeEnvelope: admin, Event: event}); err != nil {
			t.Fatalf("RecordAlertHistory(%s) returned error: %v", event.ID, err)
		}
	}

	state := contracts.AlertStateFiring
	signal := contracts.AlertSignalTrace
	summary, err := service.AlertSummary(ctx, contracts.AlertSummaryRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Input: &contracts.AlertSummaryInput{
			States:     []contracts.AlertState{state},
			Signals:    []contracts.AlertSignal{signal},
			TimeWindow: ptr("PT1H"),
			Limit:      ptr(20),
		},
	})
	if err != nil {
		t.Fatalf("AlertSummary returned error: %v", err)
	}

	if summary.TotalCount != 1 {
		t.Fatalf("summary total = %d, want 1: %#v", summary.TotalCount, summary)
	}
	if len(summary.ByState) != 1 || summary.ByState[0].State != contracts.AlertStateFiring || summary.ByState[0].Count != 1 {
		t.Fatalf("summary by state = %#v, want FIRING 1", summary.ByState)
	}
	if len(summary.BySeverity) != 1 || summary.BySeverity[0].Severity != contracts.AlertSeverityError || summary.BySeverity[0].Count != 1 {
		t.Fatalf("summary by severity = %#v, want ERROR 1", summary.BySeverity)
	}
	if len(summary.BySignal) != 1 || summary.BySignal[0].Signal != contracts.AlertSignalTrace || summary.BySignal[0].Count != 1 {
		t.Fatalf("summary by signal = %#v, want TRACE 1", summary.BySignal)
	}
}

func TestInternalServiceScopedProjectAccess(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	rule, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
		BridgeEnvelope: admin,
		Input: contracts.AlertRuleCreateInput{
			ProjectID:               LocalProjectID,
			Name:                    "Error count",
			Enabled:                 true,
			Kind:                    contracts.AlertRuleKindTraceError,
			Severity:                contracts.AlertSeverityError,
			Query:                   map[string]any{"service": "api"},
			Condition:               map[string]any{"minCount": float64(1)},
			EvaluationWindowSeconds: 300,
		},
	})
	if err != nil {
		t.Fatalf("CreateAlertRule returned error: %v", err)
	}

	projectID := LocalProjectID
	readAllowed := true
	serviceEnvelope := contracts.BridgeEnvelope{
		RequestID: "req-service",
		IssuedAt:  fixedNow(),
		AuthContext: &contracts.AuthContext{
			Mode:        "service",
			PrincipalID: ptr("cloudgrid-alert-evaluator"),
			ProjectID:   &projectID,
			Scopes:      []string{"cloudgrid:alert-evaluator"},
			ReadAllowed: &readAllowed,
			CheckedAt:   ptr(fixedNow()),
		},
	}
	rules, err := service.ListAlertRules(ctx, contracts.AlertRuleListRequest{BridgeEnvelope: serviceEnvelope, ProjectID: LocalProjectID})
	if err != nil {
		t.Fatalf("ListAlertRules with service scope returned error: %v", err)
	}
	if len(rules) != 1 || rules[0].ID != rule.ID {
		t.Fatalf("rules = %#v, want service scoped rule", rules)
	}
	if _, err := service.GetRetentionPolicy(ctx, contracts.RetentionGetRequest{BridgeEnvelope: serviceEnvelope, ProjectID: LocalProjectID}); err != nil {
		t.Fatalf("GetRetentionPolicy with service scope returned error: %v", err)
	}

	foreignProjectID := "other-project"
	serviceEnvelope.AuthContext.ProjectID = &foreignProjectID
	if _, err := service.ListAlertRules(ctx, contracts.AlertRuleListRequest{BridgeEnvelope: serviceEnvelope, ProjectID: LocalProjectID}); !isForbidden(err) {
		t.Fatalf("ListAlertRules with mismatched service project error = %v, want forbidden", err)
	}
}

func TestListProjectsForServicePagesActiveProjectsWithServiceAuth(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	readOnly := contracts.ProjectStatusReadOnly

	if _, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: localEnvelope("req-create-a", "local-user", nil),
		OrganizationID: LocalCompanyID,
		Name:           "Alpha",
		Slug:           "alpha",
	}); err != nil {
		t.Fatalf("CreateProject alpha returned error: %v", err)
	}
	readOnlyProject, err := service.CreateProject(ctx, contracts.ProjectCreateRequest{
		BridgeEnvelope: localEnvelope("req-create-b", "local-user", nil),
		OrganizationID: LocalCompanyID,
		Name:           "Beta",
		Slug:           "beta",
	})
	if err != nil {
		t.Fatalf("CreateProject beta returned error: %v", err)
	}
	if _, err := service.UpdateProject(ctx, contracts.ProjectUpdateRequest{
		BridgeEnvelope: localEnvelope("req-update", "local-user", nil),
		ProjectID:      readOnlyProject.ID,
		Status:         &readOnly,
	}); err != nil {
		t.Fatalf("UpdateProject beta returned error: %v", err)
	}

	limit := 2
	response, err := service.ListProjectsForService(ctx, contracts.ProjectListForServiceRequest{
		BridgeEnvelope: serviceEnvelopeForScope("req-service", "alert_evaluator"),
		ServiceScope:   contracts.ServiceProjectScopeAlertEvaluator,
		Limit:          &limit,
	})
	if err != nil {
		t.Fatalf("ListProjectsForService returned error: %v", err)
	}
	if len(response.Items) != 2 {
		t.Fatalf("items = %#v, want first page of two active projects", response.Items)
	}
	if response.Items[0].ProjectID != LocalSelfObservabilityProjectID || response.Items[1].ProjectID != LocalProjectID {
		t.Fatalf("items order = %#v, want ordered by projectId", response.Items)
	}
	if response.NextCursor == nil || *response.NextCursor != LocalProjectID {
		t.Fatalf("next cursor = %#v, want %q", response.NextCursor, LocalProjectID)
	}
	for _, item := range response.Items {
		if item.CompanyID != LocalCompanyID || item.TenantID != LocalCompanyID || item.Status != contracts.ProjectStatusActive || item.ChangedAt.IsZero() {
			t.Fatalf("service project item = %#v, want company/tenant/status/changedAt", item)
		}
	}

	nextPage, err := service.ListProjectsForService(ctx, contracts.ProjectListForServiceRequest{
		BridgeEnvelope: serviceEnvelopeForScope("req-service-next", "alert_evaluator"),
		ServiceScope:   contracts.ServiceProjectScopeAlertEvaluator,
		Cursor:         response.NextCursor,
	})
	if err != nil {
		t.Fatalf("ListProjectsForService next page returned error: %v", err)
	}
	if len(nextPage.Items) != 1 || nextPage.Items[0].ProjectID != "project-alpha" || nextPage.NextCursor != nil {
		t.Fatalf("next page = %#v cursor=%#v, want remaining active project", nextPage.Items, nextPage.NextCursor)
	}
}

func TestListProjectsForServiceRejectsMismatchedServiceScope(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)

	_, err := service.ListProjectsForService(context.Background(), contracts.ProjectListForServiceRequest{
		BridgeEnvelope: serviceEnvelopeForScope("req-service", "storage_maintenance"),
		ServiceScope:   contracts.ServiceProjectScopeAlertEvaluator,
	})
	if !isForbidden(err) {
		t.Fatalf("ListProjectsForService error = %v, want forbidden for mismatched service scope", err)
	}
}

func TestAlertRuleNotificationAdaptersMustExistInCatalog(t *testing.T) {
	service := NewServiceWithOptions(newTestStore(), fixedNow, ServiceOptions{
		AlertNotificationAdapters: []string{"in_app", "email"},
	})
	ctx := context.Background()

	_, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
		BridgeEnvelope: localEnvelope("req-alert", "local-user", nil),
		Input: contracts.AlertRuleCreateInput{
			ProjectID:               LocalProjectID,
			Name:                    "Unknown adapter",
			Enabled:                 true,
			Kind:                    contracts.AlertRuleKindLogCount,
			Severity:                contracts.AlertSeverityWarning,
			Query:                   map[string]any{"severity": "ERROR"},
			Condition:               map[string]any{"operator": "GTE", "threshold": float64(1)},
			EvaluationWindowSeconds: 300,
			NotificationAdapterIDs:  []string{"in_app", "pagerduty"},
		},
	})
	if !isAlertRuleInvalid(err) {
		t.Fatalf("CreateAlertRule error = %v, want ERR-018 for unknown notification adapter", err)
	}

	rule, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
		BridgeEnvelope: localEnvelope("req-alert-valid", "local-user", nil),
		Input: contracts.AlertRuleCreateInput{
			ProjectID:               LocalProjectID,
			Name:                    "Known adapter",
			Enabled:                 true,
			Kind:                    contracts.AlertRuleKindLogCount,
			Severity:                contracts.AlertSeverityWarning,
			Query:                   map[string]any{"severity": "ERROR"},
			Condition:               map[string]any{"operator": "GTE", "threshold": float64(1)},
			EvaluationWindowSeconds: 300,
			NotificationAdapterIDs:  []string{"email"},
		},
	})
	if err != nil {
		t.Fatalf("CreateAlertRule valid adapter returned error: %v", err)
	}
	unknownAdapters := []string{"email", "pagerduty"}
	_, err = service.UpdateAlertRule(ctx, contracts.AlertRuleUpdateRequest{
		BridgeEnvelope: localEnvelope("req-alert-update", "local-user", nil),
		Input: contracts.AlertRuleUpdateInput{
			ID:                     rule.ID,
			ExpectedVersion:        rule.Version,
			NotificationAdapterIDs: unknownAdapters,
		},
	})
	if !isAlertRuleInvalid(err) {
		t.Fatalf("UpdateAlertRule error = %v, want ERR-018 for unknown notification adapter", err)
	}
}

func TestAlertRulesFilterAndSortDeterministically(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}

	create := func(name string, enabled bool, kind contracts.AlertRuleKind, severity contracts.AlertSeverity, condition map[string]any) contracts.AlertRule {
		rule, err := service.CreateAlertRule(ctx, contracts.AlertRuleCreateRequest{
			BridgeEnvelope: admin,
			Input: contracts.AlertRuleCreateInput{
				ProjectID:               LocalProjectID,
				Name:                    name,
				Enabled:                 enabled,
				Kind:                    kind,
				Severity:                severity,
				Query:                   map[string]any{"service": "api"},
				Condition:               condition,
				EvaluationWindowSeconds: 60,
				PendingForSeconds:       0,
				CooldownSeconds:         60,
				NotificationAdapterIDs:  []string{"in_app"},
			},
		})
		if err != nil {
			t.Fatalf("CreateAlertRule(%s) returned error: %v", name, err)
		}
		return rule
	}

	create("Metric CPU", true, contracts.AlertRuleKindMetricThreshold, contracts.AlertSeverityCritical, map[string]any{"operator": "GT", "threshold": float64(90)})
	traceRule := create("Trace Errors", true, contracts.AlertRuleKindTraceError, contracts.AlertSeverityError, map[string]any{"minCount": float64(1)})
	create("Log Warnings", false, contracts.AlertRuleKindLogMatch, contracts.AlertSeverityWarning, map[string]any{"minCount": float64(1)})
	_, err := service.RecordAlertHistory(ctx, contracts.AlertHistoryRecordRequest{
		BridgeEnvelope: admin,
		Event: contracts.AlertEvent{
			ID:               "event-trace-firing",
			ProjectID:        LocalProjectID,
			RuleID:           traceRule.ID,
			InstanceID:       "instance-trace",
			State:            contracts.AlertStateFiring,
			Severity:         contracts.AlertSeverityError,
			Summary:          "Trace errors firing",
			DeduplicationKey: "trace-errors",
			StartedAt:        fixedNow(),
			CreatedAt:        fixedNow(),
		},
	})
	if err != nil {
		t.Fatalf("RecordAlertHistory returned error: %v", err)
	}

	search := "trace"
	signal := contracts.AlertSignalTrace
	enabled := true
	status := contracts.AlertStateFiring
	sortMode := contracts.AlertRuleSortSeverityDesc
	rules, err := service.ListAlertRules(ctx, contracts.AlertRuleListRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Input: &contracts.AlertRuleSearchInput{
			Search:  &search,
			Signal:  &signal,
			Enabled: &enabled,
			Status:  &status,
			Sort:    &sortMode,
		},
	})
	if err != nil {
		t.Fatalf("ListAlertRules returned error: %v", err)
	}
	if len(rules) != 1 || rules[0].ID != traceRule.ID {
		t.Fatalf("filtered rules = %#v, want only trace firing rule", rules)
	}

	sortMode = contracts.AlertRuleSortNameDesc
	rules, err = service.ListAlertRules(ctx, contracts.AlertRuleListRequest{
		BridgeEnvelope: admin,
		ProjectID:      LocalProjectID,
		Input:          &contracts.AlertRuleSearchInput{Sort: &sortMode},
	})
	if err != nil {
		t.Fatalf("ListAlertRules sort returned error: %v", err)
	}
	got := []string{rules[0].Name, rules[1].Name, rules[2].Name}
	want := []string{"Trace Errors", "Metric CPU", "Log Warnings"}
	if !slices.Equal(got, want) {
		t.Fatalf("sorted rule names = %#v, want %#v", got, want)
	}
}

func TestDashboardsListIncludesBuiltinsProjectPersonalAndPins(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	projectID := LocalProjectID
	admin.AuthContext.ProjectID = &projectID

	projectDashboard, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Latency Overview",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("SaveDashboard project returned error: %v", err)
	}
	personalDashboard, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Personal Latency",
			Visibility: ptr(DashboardVisibilityPersonal),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("SaveDashboard personal returned error: %v", err)
	}
	if _, err := service.SetDashboardPin(ctx, DashboardPinSetRequest{
		BridgeEnvelope: admin,
		DashboardID:    projectDashboard.ID,
		Pinned:         true,
	}); err != nil {
		t.Fatalf("SetDashboardPin returned error: %v", err)
	}

	result, err := service.ListDashboards(ctx, DashboardListRequest{
		BridgeEnvelope: admin,
		Input:          &DashboardListInput{IncludeBuiltins: ptr(true)},
	})
	if err != nil {
		t.Fatalf("ListDashboards returned error: %v", err)
	}
	if len(result.Items) < 2 {
		t.Fatalf("dashboards length = %d, want builtins plus saved dashboards", len(result.Items))
	}
	if result.Items[0].Visibility != DashboardVisibilityBuiltin {
		t.Fatalf("first dashboard visibility = %q, want builtin", result.Items[0].Visibility)
	}
	var foundProject bool
	var foundPersonal bool
	var foundPinnedProject bool
	var foundUnpinnedPersonal bool
	for _, item := range result.Items {
		if item.ID == projectDashboard.ID && item.ProjectID == LocalProjectID && item.Visibility == DashboardVisibilityProject {
			foundProject = true
			foundPinnedProject = item.Pinned
		}
		if item.ID == personalDashboard.ID && item.OwnerUserID != nil && *item.OwnerUserID == "admin-1" && item.Visibility == DashboardVisibilityPersonal {
			foundPersonal = true
			foundUnpinnedPersonal = !item.Pinned
		}
		if item.Visibility == DashboardVisibilityBuiltin && item.Pinned {
			t.Fatalf("builtin dashboard %q was not pinned but returned pinned=true", item.ID)
		}
	}
	if !foundProject || !foundPersonal {
		t.Fatalf("saved dashboards not found in list: project=%v personal=%v items=%#v", foundProject, foundPersonal, result.Items)
	}
	if !foundPinnedProject || !foundUnpinnedPersonal {
		t.Fatalf("dashboard pinned fields are not aligned with pins: project=%v personal=%v items=%#v", foundPinnedProject, foundUnpinnedPersonal, result.Items)
	}
	if len(result.PinnedDashboardIDs) != 1 || result.PinnedDashboardIDs[0] != projectDashboard.ID {
		t.Fatalf("pinnedDashboardIds = %#v, want project dashboard pin", result.PinnedDashboardIDs)
	}
	encoded, err := json.Marshal(DashboardListResponse{
		RequestID: "req-dashboard-list",
		OK:        true,
		Data:      &result,
	})
	if err != nil {
		t.Fatalf("marshal dashboard list response: %v", err)
	}
	responseJSON := string(encoded)
	for _, required := range []string{`"pinned":true`, `"pinned":false`, `"filters":[]`, `"thresholds":[]`} {
		if !strings.Contains(responseJSON, required) {
			t.Fatalf("dashboard list response JSON missing %s: %s", required, responseJSON)
		}
	}
	emptyEncoded, err := json.Marshal(DashboardListResponse{
		RequestID: "req-empty-dashboard-list",
		OK:        true,
		Data:      &DashboardListData{Items: []Dashboard{}, PinnedDashboardIDs: []string{}},
	})
	if err != nil {
		t.Fatalf("marshal empty dashboard list response: %v", err)
	}
	if !strings.Contains(string(emptyEncoded), `"pinnedDashboardIds":[]`) {
		t.Fatalf("empty dashboard list response JSON must include pinnedDashboardIds: %s", string(emptyEncoded))
	}
}

func TestBuiltinDashboardMetricWidgetsMatchDevMetricDescriptors(t *testing.T) {
	project := ports.ProjectRecord{ID: LocalProjectID, OrganizationID: LocalCompanyID}
	attributeKeys := map[string]map[string]bool{
		"http.server.request.duration": {
			"http.route":   true,
			"service.name": true,
		},
		"gen_ai.client.token.usage": {
			"gen_ai.request.model": true,
			"gen_ai.token.type":    true,
			"service.name":         true,
		},
	}

	for _, dashboard := range builtinDashboards(project, fixedNow()) {
		for _, widget := range dashboard.Widgets {
			if widget.Metric == nil {
				continue
			}
			keys, ok := attributeKeys[widget.Metric.MetricName]
			if !ok {
				t.Fatalf("builtin widget %s uses unknown dev metric %q", widget.ID, widget.Metric.MetricName)
			}
			for _, groupBy := range widget.Metric.GroupBy {
				if !keys[groupBy] {
					t.Fatalf("builtin widget %s groups %q by unavailable key %q", widget.ID, widget.Metric.MetricName, groupBy)
				}
			}
		}
	}
}

func TestDashboardSaveEnforcesVisibilityRoleSecretsAndVersionConflicts(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "")
	projectID := LocalProjectID
	admin.AuthContext.ProjectID = &projectID
	user := localEnvelope("req-user", "user-1", &projectID)
	if _, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      projectID,
		UserID:         "user-1",
		Role:           contracts.ProjectRoleViewer,
	}); err != nil {
		t.Fatalf("add project viewer: %v", err)
	}

	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: user,
		Input: DashboardSaveInput{
			Name:       "Team View",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	}); !isForbidden(err) {
		t.Fatalf("SaveDashboard project by user error = %v, want forbidden", err)
	}

	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: user,
		Input: DashboardSaveInput{
			Name:       "User View",
			Visibility: ptr(DashboardVisibilityPersonal),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	}); err != nil {
		t.Fatalf("SaveDashboard personal by user returned error: %v", err)
	}

	secretWidget := validDashboardMetricWidget()
	secretWidget.Metric.Filters = []contracts.AttributeFilter{{Key: "authorization", Operator: contracts.AttributeFilterOperatorEQ, Value: "Bearer token"}}
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Secret View",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{secretWidget},
		},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard with secret filter error = %v, want validation", err)
	}

	saved, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Latency Overview",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("save initial dashboard: %v", err)
	}
	staleVersion := saved.Version
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			ID:         &saved.ID,
			Version:    &staleVersion,
			Name:       "Latency Overview",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	}); err != nil {
		t.Fatalf("save current version: %v", err)
	}
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			ID:         &saved.ID,
			Version:    &staleVersion,
			Name:       "Latency Overview",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard stale version error = %v, want validation", err)
	}
}

func TestDashboardSaveAcceptsAndNormalizesRichMetricWidget(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	projectID := LocalProjectID
	selected := localEnvelope("req-rich-dashboard", "admin-1", &projectID)

	saved, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: selected,
		Input: DashboardSaveInput{
			Name:       "Rich metrics",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardRichMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("SaveDashboard rich metric returned error: %v", err)
	}

	if len(saved.Widgets) != 1 {
		t.Fatalf("saved widgets length = %d, want 1", len(saved.Widgets))
	}
	widget := saved.Widgets[0]
	if widget.Kind != DashboardWidgetKindMetricRich {
		t.Fatalf("widget kind = %q, want metric_rich", widget.Kind)
	}
	if widget.RichMetric == nil || widget.Metric != nil || widget.Logs != nil || widget.Traces != nil || widget.LiveTraces != nil {
		t.Fatalf("widget configs = %#v, want only richMetric", widget)
	}
	if widget.RichMetric.Query.TimeWindow == nil || *widget.RichMetric.Query.TimeWindow != "PT1H" {
		t.Fatalf("rich metric timeWindow = %#v, want PT1H default", widget.RichMetric.Query.TimeWindow)
	}
	if widget.RichMetric.Legend == nil || !*widget.RichMetric.Legend {
		t.Fatalf("rich metric legend = %#v, want true default", widget.RichMetric.Legend)
	}
	if widget.RichMetric.MaxSeries == nil || *widget.RichMetric.MaxSeries != 20 {
		t.Fatalf("rich metric maxSeries = %#v, want 20 default", widget.RichMetric.MaxSeries)
	}
	if got := widget.RichMetric.Query.Queries[0].MaxSeries; got == nil || *got != 20 {
		t.Fatalf("rich query row maxSeries = %#v, want 20 default", got)
	}
	if len(widget.RichMetric.Query.DisplaySeries) != 1 || widget.RichMetric.Query.DisplaySeries[0].Visible == nil || !*widget.RichMetric.Query.DisplaySeries[0].Visible {
		t.Fatalf("rich display series = %#v, want visible default", widget.RichMetric.Query.DisplaySeries)
	}
}

func TestDashboardSaveRejectsInvalidRichMetricWidget(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	projectID := LocalProjectID
	selected := localEnvelope("req-invalid-rich-dashboard", "admin-1", &projectID)

	withUnrelatedConfig := validDashboardRichMetricWidget()
	withUnrelatedConfig.Metric = validDashboardMetricWidget().Metric
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: selected,
		Input:          DashboardSaveInput{Name: "Invalid rich metrics", Visibility: ptr(DashboardVisibilityProject), Widgets: []DashboardWidgetInput{withUnrelatedConfig}},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard rich metric with unrelated config error = %v, want validation", err)
	}

	withDuplicateID := validDashboardRichMetricWidget()
	withDuplicateID.RichMetric.Query.Formulas = []DashboardMetricFormulaInput{{
		ID:    "requests",
		Label: "Duplicate",
		Expression: DashboardMetricFormulaExpressionInput{
			Kind:  DashboardMetricFormulaExpressionKindRef,
			RefID: ptr("requests"),
		},
	}}
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: selected,
		Input:          DashboardSaveInput{Name: "Invalid rich metrics", Visibility: ptr(DashboardVisibilityProject), Widgets: []DashboardWidgetInput{withDuplicateID}},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard rich metric duplicate id error = %v, want validation", err)
	}

	withUnknownRef := validDashboardRichMetricWidget()
	withUnknownRef.RichMetric.Query.Formulas = []DashboardMetricFormulaInput{{
		ID:    "rate",
		Label: "Rate",
		Expression: DashboardMetricFormulaExpressionInput{
			Kind:  DashboardMetricFormulaExpressionKindRef,
			RefID: ptr("missing"),
		},
	}}
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: selected,
		Input:          DashboardSaveInput{Name: "Invalid rich metrics", Visibility: ptr(DashboardVisibilityProject), Widgets: []DashboardWidgetInput{withUnknownRef}},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard rich metric unknown ref error = %v, want validation", err)
	}

	overlapping := validDashboardRichMetricWidget()
	metric := validDashboardMetricWidget()
	metric.ID = "w-overlap"
	if _, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: selected,
		Input:          DashboardSaveInput{Name: "Invalid rich metrics", Visibility: ptr(DashboardVisibilityProject), Widgets: []DashboardWidgetInput{overlapping, metric}},
	}); !isValidation(err) {
		t.Fatalf("SaveDashboard overlapping layout error = %v, want validation", err)
	}
}

func TestDashboardDeleteForbidsBuiltinsRequiresOwnerOrAdminAndRemovesPins(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	projectID := LocalProjectID
	admin.AuthContext.ProjectID = &projectID

	if _, err := service.DeleteDashboard(ctx, DashboardDeleteRequest{
		BridgeEnvelope: admin,
		DashboardID:    "builtin-service-latency",
	}); !isForbidden(err) {
		t.Fatalf("DeleteDashboard builtin error = %v, want forbidden", err)
	}

	saved, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Latency Overview",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("save dashboard: %v", err)
	}
	if _, err := service.SetDashboardPin(ctx, DashboardPinSetRequest{
		BridgeEnvelope: admin,
		DashboardID:    saved.ID,
		Pinned:         true,
	}); err != nil {
		t.Fatalf("pin dashboard: %v", err)
	}
	removed, err := service.DeleteDashboard(ctx, DashboardDeleteRequest{
		BridgeEnvelope: admin,
		DashboardID:    saved.ID,
	})
	if err != nil {
		t.Fatalf("DeleteDashboard returned error: %v", err)
	}
	if !removed {
		t.Fatalf("DeleteDashboard removed = false, want true")
	}
	result, err := service.ListDashboards(ctx, DashboardListRequest{BridgeEnvelope: admin})
	if err != nil {
		t.Fatalf("ListDashboards after delete returned error: %v", err)
	}
	if len(result.PinnedDashboardIDs) != 0 {
		t.Fatalf("pinnedDashboardIds after delete = %#v, want none", result.PinnedDashboardIDs)
	}
}

func TestDashboardPinsSetAndReorderOnlyVisibleDashboards(t *testing.T) {
	service := NewService(newTestStore(), fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-admin", "admin-1", nil)
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap admin: %v", err)
	}
	seedOrganizationMember(t, service, LocalCompanyID, "user-1", contracts.CompanyRoleUser, "")
	projectID := LocalProjectID
	admin.AuthContext.ProjectID = &projectID
	user := localEnvelope("req-user", "user-1", &projectID)
	if _, err := service.UpdateProjectMember(ctx, contracts.ProjectMemberUpdateRequest{
		BridgeEnvelope: admin,
		ProjectID:      projectID,
		UserID:         "user-1",
		Role:           contracts.ProjectRoleViewer,
	}); err != nil {
		t.Fatalf("add project viewer: %v", err)
	}

	projectDashboard, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Team View",
			Visibility: ptr(DashboardVisibilityProject),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("save project dashboard: %v", err)
	}
	personalDashboard, err := service.SaveDashboard(ctx, DashboardSaveRequest{
		BridgeEnvelope: admin,
		Input: DashboardSaveInput{
			Name:       "Admin Personal",
			Visibility: ptr(DashboardVisibilityPersonal),
			Widgets:    []DashboardWidgetInput{validDashboardMetricWidget()},
		},
	})
	if err != nil {
		t.Fatalf("save personal dashboard: %v", err)
	}

	if _, err := service.SetDashboardPin(ctx, DashboardPinSetRequest{
		BridgeEnvelope: user,
		DashboardID:    personalDashboard.ID,
		Pinned:         true,
	}); !isForbidden(err) {
		t.Fatalf("SetDashboardPin invisible personal error = %v, want forbidden", err)
	}

	first, err := service.SetDashboardPin(ctx, DashboardPinSetRequest{
		BridgeEnvelope: user,
		DashboardID:    "builtin-service-latency",
		Pinned:         true,
	})
	if err != nil {
		t.Fatalf("pin builtin: %v", err)
	}
	second, err := service.SetDashboardPin(ctx, DashboardPinSetRequest{
		BridgeEnvelope: user,
		DashboardID:    projectDashboard.ID,
		Pinned:         true,
	})
	if err != nil {
		t.Fatalf("pin project dashboard: %v", err)
	}
	if len(first.PinnedDashboardIDs) != 1 || len(second.PinnedDashboardIDs) != 2 {
		t.Fatalf("pin results = %#v then %#v, want growing ordered pins", first.PinnedDashboardIDs, second.PinnedDashboardIDs)
	}

	reordered, err := service.ReorderDashboardPins(ctx, DashboardPinReorderRequest{
		BridgeEnvelope: user,
		DashboardIDs:   []string{projectDashboard.ID, "builtin-service-latency"},
	})
	if err != nil {
		t.Fatalf("ReorderDashboardPins returned error: %v", err)
	}
	if got := reordered.PinnedDashboardIDs; len(got) != 2 || got[0] != projectDashboard.ID || got[1] != "builtin-service-latency" {
		t.Fatalf("reordered pins = %#v, want project then builtin", got)
	}
}

func TestBridgeErrorMappingUsesContractShapes(t *testing.T) {
	forbidden := BridgeErrorFromError(forbiddenError("not allowed"))
	if forbidden.ID != "ERR-016" || forbidden.Code != "FORBIDDEN" || forbidden.Retryable {
		t.Fatalf("forbidden bridge error = %#v", forbidden)
	}

	validation := BridgeErrorFromError(validationError("bad request"))
	if validation.ID != "ERR-001" || validation.Code != "VALIDATION_FAILED" || validation.Retryable {
		t.Fatalf("validation bridge error = %#v", validation)
	}

	storage := BridgeErrorFromError(errors.New("database unavailable"))
	if storage.ID != "ERR-006" || storage.Code != "STORAGE_UNAVAILABLE" || !storage.Retryable {
		t.Fatalf("storage bridge error = %#v", storage)
	}
}

func validDashboardMetricWidget() DashboardWidgetInput {
	return DashboardWidgetInput{
		ID:    "w-latency",
		Title: "Latency",
		Kind:  DashboardWidgetKindMetricTimeseries,
		Layout: DashboardWidgetLayoutInput{
			X: 0,
			Y: 0,
			W: 6,
			H: 4,
		},
		Metric: &DashboardMetricWidgetInput{
			MetricName:    "http.server.request.duration",
			Aggregation:   contracts.MetricAggregationP95,
			TimeWindow:    ptr("PT1H"),
			Visualization: contracts.MetricChartTypeLine,
		},
	}
}

func validDashboardRichMetricWidget() DashboardWidgetInput {
	return DashboardWidgetInput{
		ID:    "w-rich",
		Title: "Rich metrics",
		Kind:  DashboardWidgetKindMetricRich,
		Layout: DashboardWidgetLayoutInput{
			X:    0,
			Y:    0,
			W:    8,
			H:    5,
			MinW: ptr(5),
			MinH: ptr(3),
		},
		RichMetric: &DashboardRichMetricWidgetInput{
			Query: DashboardMetricQueryInput{
				Queries: []DashboardMetricQueryRowInput{{
					ID:          "requests",
					Label:       "Requests",
					MetricName:  "http.server.requests",
					Aggregation: contracts.MetricAggregationRate,
				}},
				DisplaySeries: []DashboardMetricDisplaySeriesInput{{
					ID:       "requests-line",
					Label:    "Requests",
					SourceID: "requests",
				}},
			},
			Visualization: contracts.MetricChartTypeLine,
		},
	}
}

func defaultRetentionInputs() []contracts.RetentionRuleInput {
	days30 := 30
	days90 := 90
	days365 := 365
	return []contracts.RetentionRuleInput{
		{DataClass: contracts.RetentionDataClassTraces, Mode: contracts.RetentionModeDelete, RetentionDays: &days30},
		{DataClass: contracts.RetentionDataClassLogs, Mode: contracts.RetentionModeDelete, RetentionDays: &days30},
		{DataClass: contracts.RetentionDataClassMetrics, Mode: contracts.RetentionModeDelete, RetentionDays: &days30},
		{DataClass: contracts.RetentionDataClassAIEvals, Mode: contracts.RetentionModeDelete, RetentionDays: &days90},
		{DataClass: contracts.RetentionDataClassDatasets, Mode: contracts.RetentionModeRetain},
		{DataClass: contracts.RetentionDataClassScorers, Mode: contracts.RetentionModeRetain},
		{DataClass: contracts.RetentionDataClassDashboardHistory, Mode: contracts.RetentionModeRetain},
		{DataClass: contracts.RetentionDataClassIngestCredentialAudit, Mode: contracts.RetentionModeDelete, RetentionDays: &days365},
	}
}

func retentionRule(policy contracts.RetentionPolicy, dataClass contracts.RetentionDataClass) contracts.RetentionRule {
	for _, rule := range policy.Rules {
		if rule.DataClass == dataClass {
			return rule
		}
	}
	return contracts.RetentionRule{}
}

func projectByID(projects []contracts.Project, id string) (contracts.Project, bool) {
	for _, project := range projects {
		if project.ID == id {
			return project, true
		}
	}
	return contracts.Project{}, false
}

func seedLocalSelfObservabilityProject(t *testing.T, store *testStore) {
	t.Helper()
	now := fixedNow()
	if err := store.PutProject(context.Background(), ports.ProjectRecord{
		ID:             "cloudgrid-system",
		OrganizationID: LocalCompanyID,
		Name:           "CloudGrid",
		Slug:           "cloudgrid-system",
		Status:         contracts.ProjectStatusActive,
		ChangedAt:      now,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("seed self-observability project: %v", err)
	}
}

func localEnvelope(requestID string, principal string, projectID *string) contracts.BridgeEnvelope {
	companyID := LocalCompanyID
	tenantID := LocalCompanyID
	authMode := "local"
	return contracts.BridgeEnvelope{
		RequestID: requestID,
		IssuedAt:  fixedNow(),
		AuthContext: &contracts.AuthContext{
			Mode:        "anonymous",
			AuthMode:    &authMode,
			PrincipalID: &principal,
			TenantID:    &tenantID,
			CompanyID:   &companyID,
			ProjectID:   projectID,
		},
	}
}

func ssoEnvelope(requestID string, companyID string, principal string, displayName string, email string, verified bool) contracts.BridgeEnvelope {
	tenantID := companyID
	authMode := "sso"
	var emailPtr *string
	if strings.TrimSpace(email) != "" {
		trimmed := strings.TrimSpace(email)
		emailPtr = &trimmed
	}
	return contracts.BridgeEnvelope{
		RequestID: requestID,
		IssuedAt:  fixedNow(),
		AuthContext: &contracts.AuthContext{
			Mode:                   "authenticated",
			AuthMode:               &authMode,
			PrincipalID:            &principal,
			PrincipalName:          &displayName,
			PrincipalEmail:         emailPtr,
			PrincipalEmailVerified: &verified,
			TenantID:               &tenantID,
			CompanyID:              &companyID,
		},
	}
}

func seedOrganizationMember(t *testing.T, service *Service, organizationID string, userID string, role contracts.CompanyRole, email string) {
	t.Helper()
	ctx := context.Background()
	now := fixedNow()
	user := ports.UserRecord{ID: userID, CreatedAt: now, UpdatedAt: now}
	if strings.TrimSpace(email) != "" {
		normalized, err := normalizeEmail(email)
		if err != nil {
			t.Fatalf("normalize seed email: %v", err)
		}
		user.Email = &normalized
	}
	if err := service.store.PutUser(ctx, user); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if err := service.store.PutMembership(ctx, ports.MembershipRecord{
		UserID:         userID,
		OrganizationID: organizationID,
		Role:           role,
		CreatedAt:      now,
		UpdatedAt:      now,
	}); err != nil {
		t.Fatalf("seed membership: %v", err)
	}
}

func portsInvitationRecordFromContract(invitation contracts.OrganizationInvitation) ports.InvitationRecord {
	return ports.InvitationRecord{
		ID:                    invitation.ID,
		OrganizationID:        invitation.OrganizationID,
		Email:                 invitation.Email,
		Role:                  invitation.Role,
		Status:                invitation.Status,
		DeliveryStatus:        invitation.DeliveryStatus,
		LastDeliveryAttemptAt: invitation.LastDeliveryAttemptAt,
		LastDeliveryErrorCode: invitation.LastDeliveryErrorCode,
		LastEmailDeliveryID:   invitation.LastEmailDeliveryID,
		ProjectGrants:         append([]contracts.InvitationProjectGrant{}, invitation.ProjectGrants...),
		InvitedByUserID:       invitation.InvitedByUserID,
		AcceptedByUserID:      invitation.AcceptedByUserID,
		CreatedAt:             invitation.CreatedAt,
		UpdatedAt:             invitation.UpdatedAt,
		AcceptedAt:            invitation.AcceptedAt,
		RevokedAt:             invitation.RevokedAt,
		ExpiresAt:             invitation.ExpiresAt,
	}
}

type fakeInvitationEmailTransport struct {
	messages []InvitationEmailMessage
	err      error
}

func (transport *fakeInvitationEmailTransport) SendInvitationEmail(_ context.Context, message InvitationEmailMessage) error {
	transport.messages = append(transport.messages, message)
	return transport.err
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 11, 8, 0, 0, 0, time.UTC)
}

func isForbidden(err error) bool {
	var coded codedBridgeError
	return errors.As(err, &coded) && coded.bridge.ID == "ERR-016"
}

func isValidation(err error) bool {
	var coded codedBridgeError
	return errors.As(err, &coded) && coded.bridge.ID == "ERR-001"
}

func isAlertRuleInvalid(err error) bool {
	var coded codedBridgeError
	return errors.As(err, &coded) && coded.bridge.ID == "ERR-018"
}

func serviceEnvelopeForScope(requestID string, serviceScope string) contracts.BridgeEnvelope {
	principalID := "cloudgrid-" + strings.ReplaceAll(serviceScope, "_", "-")
	readAllowed := true
	return contracts.BridgeEnvelope{
		RequestID: requestID,
		IssuedAt:  fixedNow(),
		AuthContext: &contracts.AuthContext{
			Mode:        "service",
			PrincipalID: &principalID,
			Scopes:      []string{"cloudgrid:" + strings.ReplaceAll(serviceScope, "_", "-")},
			ReadAllowed: &readAllowed,
			CheckedAt:   ptr(fixedNow()),
		},
	}
}
