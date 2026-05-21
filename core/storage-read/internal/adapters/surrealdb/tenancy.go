//go:build surrealdb

package surrealdb

import (
	"fmt"
	"regexp"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	localTenantID    = "local"
	localCompanyID   = "local"
	localProjectID   = "default"
	localNamespace   = "cloudgrid_local"
	localAuthMode    = "local"
	deployedAuthMode = "sso"
)

var safeIdentifierPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type TelemetryTarget struct {
	Namespace string
	Database  string
	TenantID  string
	CompanyID string
	ProjectID string
	AuthMode  string
}

func ResolveProjectTelemetryTarget(target contracts.ProjectTelemetryOverviewTarget, auth *contracts.AuthContext) (TelemetryTarget, error) {
	tenantID := strings.TrimSpace(pointerString(target.TenantID))
	if tenantID == "" {
		tenantID = strings.TrimSpace(pointerString(authTenantID(auth)))
	}
	if tenantID == "" {
		tenantID = localTenantID
	}
	authMode := localAuthMode
	namespace := localNamespace
	if auth != nil && strings.TrimSpace(pointerString(auth.AuthMode)) == deployedAuthMode {
		authMode = deployedAuthMode
		namespace = "cg_tenant_" + tenantID
		authTenantID := strings.TrimSpace(pointerString(auth.TenantID))
		if authTenantID != "" && tenantID != authTenantID {
			return TelemetryTarget{}, fmt.Errorf("ERR-016 FORBIDDEN: tenant mismatch")
		}
	}
	companyID := strings.TrimSpace(target.CompanyID)
	projectID := strings.TrimSpace(target.ProjectID)
	if companyID == "" {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: companyId is required")
	}
	if projectID == "" {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: projectId is required")
	}
	if err := validateTelemetryIdentifier("tenantId", tenantID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateTelemetryIdentifier("companyId", companyID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateTelemetryIdentifier("projectId", projectID); err != nil {
		return TelemetryTarget{}, err
	}
	return TelemetryTarget{
		Namespace: namespace,
		Database:  "project_" + projectID,
		TenantID:  tenantID,
		CompanyID: companyID,
		ProjectID: projectID,
		AuthMode:  authMode,
	}, nil
}

func authTenantID(auth *contracts.AuthContext) *string {
	if auth == nil {
		return nil
	}
	return auth.TenantID
}

func ResolveTelemetryTarget(auth *contracts.AuthContext) (TelemetryTarget, error) {
	if auth == nil || pointerString(auth.AuthMode) == "" || pointerString(auth.AuthMode) == localAuthMode {
		return localTelemetryTarget(auth)
	}
	if pointerString(auth.AuthMode) != deployedAuthMode {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: authMode is invalid")
	}

	tenantID := strings.TrimSpace(pointerString(auth.TenantID))
	companyID := strings.TrimSpace(pointerString(auth.CompanyID))
	projectID := strings.TrimSpace(pointerString(auth.ProjectID))
	if tenantID == "" {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: tenantId is required")
	}
	if companyID == "" {
		companyID = tenantID
	}
	if projectID == "" {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: projectId is required")
	}
	if err := validateTelemetryIdentifier("tenantId", tenantID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateTelemetryIdentifier("companyId", companyID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateTelemetryIdentifier("projectId", projectID); err != nil {
		return TelemetryTarget{}, err
	}

	return TelemetryTarget{
		Namespace: "cg_tenant_" + tenantID,
		Database:  "project_" + projectID,
		TenantID:  tenantID,
		CompanyID: companyID,
		ProjectID: projectID,
		AuthMode:  deployedAuthMode,
	}, nil
}

func localTelemetryTarget(auth *contracts.AuthContext) (TelemetryTarget, error) {
	tenantID := localTenantID
	companyID := localCompanyID
	projectID := localProjectID
	if auth != nil {
		if value := strings.TrimSpace(pointerString(auth.TenantID)); value != "" {
			tenantID = value
		}
		if value := strings.TrimSpace(pointerString(auth.CompanyID)); value != "" {
			companyID = value
		}
		if value := strings.TrimSpace(pointerString(auth.ProjectID)); value != "" {
			projectID = value
		}
	}
	for field, value := range map[string]string{"tenantId": tenantID, "companyId": companyID, "projectId": projectID} {
		if err := validateTelemetryIdentifier(field, value); err != nil {
			return TelemetryTarget{}, err
		}
	}
	return TelemetryTarget{
		Namespace: localNamespace,
		Database:  "project_" + projectID,
		TenantID:  tenantID,
		CompanyID: companyID,
		ProjectID: projectID,
		AuthMode:  localAuthMode,
	}, nil
}

func validateTelemetryIdentifier(name string, value string) error {
	if !safeIdentifierPattern.MatchString(value) {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s contains unsupported characters", name)
	}
	return nil
}

func pointerString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func addOwnershipParams(params map[string]any, target TelemetryTarget) {
	params["tenantId"] = target.TenantID
	params["companyId"] = target.CompanyID
	params["projectId"] = target.ProjectID
}

func ownershipConditions() []string {
	return []string{"tenantId = $tenantId", "companyId = $companyId", "projectId = $projectId"}
}
