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

func ResolveTelemetryTarget(auth *contracts.AuthContext) (TelemetryTarget, error) {
	if auth == nil || stringValue(auth.AuthMode) == "" || stringValue(auth.AuthMode) == localAuthMode {
		return localTelemetryTarget(auth)
	}
	if stringValue(auth.AuthMode) != deployedAuthMode {
		return TelemetryTarget{}, fmt.Errorf("ERR-001 VALIDATION_FAILED: authMode is invalid")
	}

	tenantID := strings.TrimSpace(stringValue(auth.TenantID))
	companyID := strings.TrimSpace(stringValue(auth.CompanyID))
	projectID := strings.TrimSpace(stringValue(auth.ProjectID))
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
		if value := strings.TrimSpace(stringValue(auth.TenantID)); value != "" {
			tenantID = value
		}
		if value := strings.TrimSpace(stringValue(auth.CompanyID)); value != "" {
			companyID = value
		}
		if value := strings.TrimSpace(stringValue(auth.ProjectID)); value != "" {
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

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func addOwnership(record map[string]any, target TelemetryTarget) {
	record["tenantId"] = target.TenantID
	record["companyId"] = target.CompanyID
	record["projectId"] = target.ProjectID
}
