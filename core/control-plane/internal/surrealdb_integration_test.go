package internal

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	controlsurreal "github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/adapters/surrealdb"
	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestSurrealDBControlStoreBootstrapsViewer(t *testing.T) {
	if os.Getenv("CLOUDGRID_ENABLE_SURREALDB_CONTROL_TESTS") != "true" {
		t.Skip("set CLOUDGRID_ENABLE_SURREALDB_CONTROL_TESTS=true to run SurrealDB control-plane integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := controlsurreal.Connect(ctx, controlsurreal.Config{
		URL:       integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), "http://localhost:8000/rpc"),
		Namespace: integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_NAMESPACE"), "observability"),
		Database:  fmt.Sprintf("control_test_%d", time.Now().UnixNano()),
		Username:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), "root"),
		Password:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), "root"),
	})
	if err != nil {
		t.Fatalf("connect SurrealDB: %v", err)
	}
	defer func() {
		_ = client.Close(context.Background())
	}()
	if err := client.ApplySchema(ctx); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	if err := client.CheckReadiness(ctx); err != nil {
		t.Fatalf("check readiness: %v", err)
	}

	store := controlsurreal.NewStore(client)
	if _, _, err := store.GetUser(ctx, "local-user"); err != nil {
		t.Fatalf("GetUser before bootstrap returned error: %v", err)
	}
	if err := store.PutUser(ctx, ports.UserRecord{
		ID:        "probe-user",
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}); err != nil {
		t.Fatalf("PutUser probe returned error: %v", err)
	}
	if _, _, err := store.GetUser(ctx, "probe-user"); err != nil {
		t.Fatalf("GetUser probe returned error: %v", err)
	}
	if _, _, err := store.GetOrganization(ctx, "probe-org"); err != nil {
		t.Fatalf("GetOrganization before bootstrap returned error: %v", err)
	}
	if err := store.PutOrganization(ctx, ports.OrganizationRecord{
		ID:        "probe-org",
		Name:      "Personal",
		Slug:      "probe-org",
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}); err != nil {
		t.Fatalf("PutOrganization probe returned error: %v", err)
	}
	if _, _, err := store.GetOrganization(ctx, "probe-org"); err != nil {
		t.Fatalf("GetOrganization probe returned error: %v", err)
	}
	if err := store.PutMembership(ctx, ports.MembershipRecord{
		UserID:         "probe-user",
		OrganizationID: "probe-org",
		Role:           contracts.CompanyRoleAdmin,
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}); err != nil {
		t.Fatalf("PutMembership probe returned error: %v", err)
	}
	if _, _, err := store.GetMembership(ctx, "probe-org", "probe-user"); err != nil {
		t.Fatalf("GetMembership probe returned error: %v", err)
	}
	if _, err := store.ListMemberships(ctx, "probe-org"); err != nil {
		t.Fatalf("ListMemberships probe returned error: %v", err)
	}
	if _, _, err := store.GetProject(ctx, "probe-project"); err != nil {
		t.Fatalf("GetProject before bootstrap returned error: %v", err)
	}
	if err := store.PutProject(ctx, ports.ProjectRecord{
		ID:             "probe-project",
		OrganizationID: "probe-org",
		Name:           "Default project",
		Slug:           "probe-project",
		Status:         contracts.ProjectStatusActive,
		ChangedAt:      fixedNow(),
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}); err != nil {
		t.Fatalf("PutProject probe returned error: %v", err)
	}
	if _, err := store.ListInvitations(ctx, LocalCompanyID); err != nil {
		t.Fatalf("ListInvitations before bootstrap returned error: %v", err)
	}
	if err := store.PutUser(ctx, ports.UserRecord{
		ID:        "local-user",
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}); err != nil {
		t.Fatalf("PutUser local returned error: %v", err)
	}
	if err := store.PutOrganization(ctx, ports.OrganizationRecord{
		ID:        LocalCompanyID,
		Name:      "Personal",
		Slug:      LocalCompanyID,
		CreatedAt: fixedNow(),
		UpdatedAt: fixedNow(),
	}); err != nil {
		t.Fatalf("PutOrganization local returned error: %v", err)
	}
	if err := store.PutMembership(ctx, ports.MembershipRecord{
		UserID:         "local-user",
		OrganizationID: LocalCompanyID,
		Role:           contracts.CompanyRoleAdmin,
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}); err != nil {
		t.Fatalf("PutMembership local returned error: %v", err)
	}
	if err := store.PutProject(ctx, ports.ProjectRecord{
		ID:             LocalProjectID,
		OrganizationID: LocalCompanyID,
		Name:           "Default project",
		Slug:           LocalProjectID,
		Status:         contracts.ProjectStatusActive,
		ChangedAt:      fixedNow(),
		CreatedAt:      fixedNow(),
		UpdatedAt:      fixedNow(),
	}); err != nil {
		t.Fatalf("PutProject local returned error: %v", err)
	}
	if _, err := store.ListMembershipsForUser(ctx, "local-user"); err != nil {
		t.Fatalf("ListMembershipsForUser local returned error: %v", err)
	}
	localCompanyID := LocalCompanyID
	if _, err := store.ListProjects(ctx, &localCompanyID, nil); err != nil {
		t.Fatalf("ListProjects local returned error: %v", err)
	}
	dashboardID := "dashboard:default_personal_local-user_latency"
	if err := store.PutDashboard(ctx, ports.DashboardRecord{
		ID:                dashboardID,
		ProjectID:         LocalProjectID,
		OrganizationID:    LocalCompanyID,
		Slug:              "latency",
		Name:              "Latency",
		Tags:              []string{"integration"},
		Version:           1,
		Visibility:        ports.DashboardVisibilityPersonal,
		DefaultTimeWindow: "PT1H",
		OwnerUserID:       ptr("local-user"),
		Widgets:           []byte(`[{"id":"widget-1","title":"Latency","kind":"metric_timeseries","layout":{"x":0,"y":0,"w":6,"h":4,"minW":3,"minH":2}}]`),
		CreatedAt:         fixedNow(),
		UpdatedAt:         fixedNow(),
		CreatedBy:         ptr("local-user"),
		UpdatedBy:         ptr("local-user"),
	}); err != nil {
		t.Fatalf("PutDashboard local returned error: %v", err)
	}
	dashboard, ok, err := store.GetDashboard(ctx, dashboardID)
	if err != nil || !ok {
		t.Fatalf("GetDashboard local returned ok=%v error=%v", ok, err)
	}
	if dashboard.ID != dashboardID {
		t.Fatalf("GetDashboard ID = %q, want %q", dashboard.ID, dashboardID)
	}
	dashboards, err := store.ListDashboards(ctx, LocalProjectID)
	if err != nil {
		t.Fatalf("ListDashboards local returned error: %v", err)
	}
	if len(dashboards) != 1 || dashboards[0].ID != dashboardID {
		t.Fatalf("ListDashboards local = %#v, want saved dashboard", dashboards)
	}
	if err := store.PutDashboardPin(ctx, ports.DashboardPinRecord{
		UserID:      "local-user",
		ProjectID:   LocalProjectID,
		DashboardID: dashboardID,
		Position:    0,
		CreatedAt:   fixedNow(),
		UpdatedAt:   fixedNow(),
	}); err != nil {
		t.Fatalf("PutDashboardPin local returned error: %v", err)
	}
	pins, err := store.ListDashboardPins(ctx, "local-user", LocalProjectID)
	if err != nil {
		t.Fatalf("ListDashboardPins local returned error: %v", err)
	}
	if len(pins) != 1 || pins[0].DashboardID != dashboardID {
		t.Fatalf("ListDashboardPins local = %#v, want saved dashboard pin", pins)
	}

	service := NewService(store, fixedNow)
	viewer, err := service.GetViewer(ctx, localEnvelope("req-1", "local-user", nil))
	if err != nil {
		t.Fatalf("GetViewer returned error: %v", err)
	}
	if viewer.User.ID != "local-user" {
		t.Fatalf("viewer user ID = %q, want local-user", viewer.User.ID)
	}
	if len(viewer.Organizations) != 1 || len(viewer.Organizations[0].Projects) != 1 {
		t.Fatalf("viewer organizations = %#v, want local organization with default project", viewer.Organizations)
	}
	selected, err := service.SelectProject(ctx, contracts.ProjectSelectRequest{
		BridgeEnvelope: localEnvelope("req-2", "local-user", nil),
		ProjectID:      LocalProjectID,
	})
	if err != nil {
		t.Fatalf("SelectProject returned error: %v", err)
	}
	if selected.SelectedProject == nil || selected.SelectedProject.ID != LocalProjectID {
		t.Fatalf("selected project = %#v, want %s", selected.SelectedProject, LocalProjectID)
	}
}

func integrationValueOrDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
