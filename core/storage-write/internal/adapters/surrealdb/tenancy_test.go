//go:build surrealdb

package surrealdb

import (
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestResolveTelemetryTargetDefaultsLocalAuthContext(t *testing.T) {
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		t.Fatalf("ResolveTelemetryTarget() error = %v", err)
	}

	if target.Namespace != "cloudgrid_local" || target.Database != "project_default" {
		t.Fatalf("target = %#v, want local default namespace/database", target)
	}
	if target.TenantID != "local" || target.CompanyID != "local" || target.ProjectID != "default" {
		t.Fatalf("target ownership = %#v, want local/local/default", target)
	}
}

func TestResolveTelemetryTargetUsesTenantNamespaceAndProjectDatabase(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"

	target, err := ResolveTelemetryTarget(&contracts.AuthContext{
		Mode:      "authenticated",
		AuthMode:  &authMode,
		TenantID:  &tenantID,
		CompanyID: &companyID,
		ProjectID: &projectID,
	})
	if err != nil {
		t.Fatalf("ResolveTelemetryTarget() error = %v", err)
	}

	if target.Namespace != "cg_tenant_tenant_1" || target.Database != "project_project_1" {
		t.Fatalf("target = %#v, want tenant namespace/project database", target)
	}
	if target.TenantID != tenantID || target.CompanyID != companyID || target.ProjectID != projectID {
		t.Fatalf("target ownership = %#v", target)
	}
}

func TestResolveTelemetryTargetRejectsUnsafeTenantIdentifiers(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant;REMOVE TABLE trace"
	projectID := "project_1"

	_, err := ResolveTelemetryTarget(&contracts.AuthContext{
		Mode:      "authenticated",
		AuthMode:  &authMode,
		TenantID:  &tenantID,
		ProjectID: &projectID,
	})
	if err == nil {
		t.Fatal("ResolveTelemetryTarget accepted unsafe tenant id")
	}
}
