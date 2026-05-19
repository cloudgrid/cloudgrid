//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

func TestBuildPolicyQueryLoadsControlPlanePolicyByProject(t *testing.T) {
	stmt := BuildPolicyQuery("project-a")

	assertContains(t, stmt.SQL, "FROM retention_policy")
	assertContains(t, stmt.SQL, "projectId = $projectId")
	assertNoMutation(t, stmt.SQL)
	if stmt.Params["projectId"] != "project-a" {
		t.Fatalf("params = %#v, want projectId", stmt.Params)
	}
}

func TestPolicyRecordMapsRequestedDataClassRule(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	softDays := 7
	policy, ok := retentionPolicyRecord{
		ProjectID:       "project-a",
		UpdatedAt:       now,
		UpdatedByUserID: "admin",
		Version:         4,
		Rules: []retentionRuleRecord{{
			DataClass:       contracts.RetentionDataClassLogs,
			Mode:            contracts.RetentionModeSoftDeleteThenDelete,
			RetentionDays:   ptr(30),
			SoftDeleteDays:  &softDays,
			UpdatedAt:       now,
			UpdatedByUserID: "admin",
			Version:         5,
		}},
	}.policyFor(contracts.RetentionDataClassLogs)

	if !ok {
		t.Fatal("policyFor returned false")
	}
	if policy.ProjectID != "project-a" ||
		policy.DataClass != contracts.RetentionDataClassLogs ||
		policy.Mode != contracts.RetentionModeSoftDeleteThenDelete ||
		policy.RetentionDays != 30 ||
		policy.SoftDeleteDays == nil ||
		*policy.SoftDeleteDays != 7 ||
		policy.Version != 5 ||
		policy.PolicyID != "retention_policy:project-a:LOGS:v5" ||
		policy.UpdatedAt != now ||
		policy.UpdatedByUserID != "admin" {
		t.Fatalf("policy = %#v", policy)
	}
}

func TestBuildRetentionQueriesKeepProjectScopeAndDeletionOrder(t *testing.T) {
	plan := retention.RetentionExecutionPlan{
		ProjectID:   "project-a",
		DataClass:   contracts.RetentionDataClassTraces,
		Mode:        contracts.RetentionModeDelete,
		PolicyID:    "policy-1",
		RequestedAt: time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC),
		Cutoff:      time.Date(2026, 4, 18, 12, 0, 0, 0, time.UTC),
		Limit:       ptr(10),
	}
	target := TelemetryTarget{TenantID: "tenant-a", CompanyID: "company-a", ProjectID: "project-a"}

	queries, err := BuildRetentionQueries(plan, target)
	if err != nil {
		t.Fatalf("BuildRetentionQueries returned error: %v", err)
	}
	sql := strings.Join(querySQL(queries), "\n")

	for _, want := range []string{
		"LET $root = SELECT VALUE traceId FROM trace",
		"tenantId = $tenantId",
		"companyId = $companyId",
		"projectId = $projectId",
		"ORDER BY endedAt ASC, startedAt ASC, traceId ASC",
		"LIMIT $limit",
		"DELETE span",
		"DELETE log_event",
		"DELETE trace",
	} {
		assertContains(t, sql, want)
	}
	assertOrder(t, sql, "DELETE span", "DELETE log_event", "DELETE trace")
	if queries[0].Params["tenantId"] != "tenant-a" ||
		queries[0].Params["companyId"] != "company-a" ||
		queries[0].Params["projectId"] != "project-a" ||
		queries[0].Params["limit"] != 10 {
		t.Fatalf("params = %#v, want ownership and limit", queries[0].Params)
	}
}

func TestBuildRetentionQueriesSoftDeleteFinalDeletesBeforeMarking(t *testing.T) {
	plan := retention.RetentionExecutionPlan{
		ProjectID:      "project-a",
		DataClass:      contracts.RetentionDataClassLogs,
		Mode:           contracts.RetentionModeSoftDeleteThenDelete,
		PolicyID:       "policy-1",
		RequestedAt:    time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC),
		Cutoff:         time.Date(2026, 4, 18, 12, 0, 0, 0, time.UTC),
		SoftDeleteDays: 7,
	}
	target := TelemetryTarget{TenantID: "tenant-a", CompanyID: "company-a", ProjectID: "project-a"}

	queries, err := BuildRetentionQueries(plan, target)
	if err != nil {
		t.Fatalf("BuildRetentionQueries returned error: %v", err)
	}
	sql := strings.Join(querySQL(queries), "\n")

	assertContains(t, sql, "DELETE log_event WHERE")
	assertContains(t, sql, "finalDeleteAfter <= $requestedAt")
	assertContains(t, sql, "UPDATE log_event SET deletedAt = $requestedAt")
	assertContains(t, sql, "deletedByRetentionPolicyId = $policyId")
	assertContains(t, sql, "finalDeleteAfter = $finalDeleteAfter")
	assertContains(t, sql, "deletedAt = NONE")
	assertOrder(t, sql, "finalDeleteAfter <= $requestedAt", "UPDATE log_event SET")
}

func TestBuildRetentionQueriesHardDeletesMappedMetricTablesInOrder(t *testing.T) {
	queries, err := BuildRetentionQueries(retention.RetentionExecutionPlan{
		ProjectID: "project-a",
		DataClass: contracts.RetentionDataClassMetrics,
		Mode:      contracts.RetentionModeDelete,
		Cutoff:    time.Date(2026, 4, 18, 12, 0, 0, 0, time.UTC),
	}, TelemetryTarget{TenantID: "tenant-a", CompanyID: "company-a", ProjectID: "project-a"})
	if err != nil {
		t.Fatalf("BuildRetentionQueries returned error: %v", err)
	}
	sql := strings.Join(querySQL(queries), "\n")

	assertOrder(t, sql, "DELETE metric_point", "DELETE metric_ingest_cardinality", "DELETE metric_descriptor")
	for _, want := range []string{"timestamp < $cutoff", "windowStart < $cutoff", "lastSeenAt < $cutoff"} {
		assertContains(t, sql, want)
	}
}

func TestBuildRetentionQueriesDashboardHistoryNoops(t *testing.T) {
	queries, err := BuildRetentionQueries(retention.RetentionExecutionPlan{
		ProjectID: "project-a",
		DataClass: contracts.RetentionDataClassDashboardHistory,
		Mode:      contracts.RetentionModeDelete,
	}, TelemetryTarget{TenantID: "tenant-a", CompanyID: "company-a", ProjectID: "project-a"})
	if err != nil {
		t.Fatalf("BuildRetentionQueries returned error: %v", err)
	}
	if len(queries) != 1 || queries[0].Kind != queryKindNoop {
		t.Fatalf("queries = %#v, want one no-op query", queries)
	}
}

func TestBuildLeaseAcquireQueryUsesCompareAndSet(t *testing.T) {
	stmt := BuildAcquireLeaseQuery(retention.RetentionLease{Key: "retention:project-a:LOGS"})

	assertContains(t, stmt.SQL, "BEGIN TRANSACTION")
	assertContains(t, stmt.SQL, "retention_lease")
	assertContains(t, stmt.SQL, "expiresAt <= $acquiredAt")
	assertContains(t, stmt.SQL, "UPSERT type::record('retention_lease', $leaseId)")
	assertContains(t, stmt.SQL, "COMMIT TRANSACTION")
}

func querySQL(queries []RetentionQuery) []string {
	out := make([]string, 0, len(queries))
	for _, query := range queries {
		out = append(out, query.SQL)
	}
	return out
}

func assertContains(t *testing.T, got string, want string) {
	t.Helper()
	if !strings.Contains(got, want) {
		t.Fatalf("missing %q in:\n%s", want, got)
	}
}

func assertNoMutation(t *testing.T, got string) {
	t.Helper()
	for _, forbidden := range []string{"DELETE ", "UPDATE ", "UPSERT ", "CREATE "} {
		if strings.Contains(strings.ToUpper(got), forbidden) {
			t.Fatalf("query contains mutation %q:\n%s", forbidden, got)
		}
	}
}

func assertOrder(t *testing.T, got string, ordered ...string) {
	t.Helper()
	last := -1
	for _, item := range ordered {
		index := strings.Index(got, item)
		if index < 0 {
			t.Fatalf("missing %q in:\n%s", item, got)
		}
		if index <= last {
			t.Fatalf("%q appears out of order in:\n%s", item, got)
		}
		last = index
	}
}

func ptr[T any](value T) *T {
	return &value
}
