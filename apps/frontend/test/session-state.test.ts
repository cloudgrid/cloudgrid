import { describe, expect, test } from "bun:test";
import type { Viewer } from "@cloudgrid/ui-contracts";
import { CloudGridGraphQLError } from "../src/lib/graphql-client";
import {
  buildLoginUrl,
  buildProjectSwitchTarget,
  canAdministerMembers,
  createLocalViewer,
  firstProjectForOrganization,
  getTelemetryProjectState,
  initialOrganizationId,
  memberMutationProblemDetails,
  organizationProjectSummaries,
  organizationProjects,
  projectOptionsFromViewer,
  resolveAppShellMode,
  resolveRootRedirect,
  selectedProjectOrganization,
} from "../src/lib/session-state";

const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Checkout",
  slug: "checkout",
  status: "active" as const,
  telemetry: {
    lastIngestAt: null,
    traceCount: 0,
    logCount: 0,
    metricCount: 0,
    serviceCount: 0,
  },
};

const viewer: Viewer = {
  user: {
    id: "user-1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
  },
  organizations: [
    {
      id: "org-1",
      name: "Example Co",
      slug: "example",
      role: "admin",
      projects: [project],
    },
  ],
  selectedProject: project,
};

describe("session state helpers", () => {
  test("routes local and deployed root requests without storing browser tokens", () => {
    expect(resolveRootRedirect({ mode: "local", viewer: null })).toBe("/projects");
    expect(resolveRootRedirect({ mode: "deployed", viewer: null })).toBe("/login");
    expect(resolveRootRedirect({ mode: "deployed", viewer })).toBe("/projects");
  });

  test("builds a BFF login URL with only a relative return target", () => {
    expect(buildLoginUrl("/logs?service=checkout")).toBe(
      "/auth/login?returnTo=%2Flogs%3Fservice%3Dcheckout",
    );
    expect(buildLoginUrl("https://issuer.example.com/callback")).toBe(
      "/auth/login?returnTo=%2Fprojects",
    );
  });

  test("creates the local-mode company and admin viewer shell", () => {
    const localViewer = createLocalViewer();

    expect(localViewer.organizations).toHaveLength(1);
    expect(localViewer.organizations[0]?.id).toBe("local");
    expect(localViewer.organizations[0]?.role).toBe("admin");
    expect(localViewer.organizations[0]?.projects[0]?.id).toBe("default");
    expect(localViewer.selectedProject).toBeNull();
  });

  test("surfaces project selection and project-required telemetry states", () => {
    expect(projectOptionsFromViewer(viewer)).toEqual([
      {
        id: "project-1",
        name: "Checkout",
        organizationId: "org-1",
        organizationName: "Example Co",
        status: "active",
      },
    ]);
    expect(getTelemetryProjectState(viewer)).toEqual({
      kind: "selected",
      project,
    });
    expect(getTelemetryProjectState({ ...viewer, selectedProject: null })).toEqual({
      kind: "required",
    });
  });

  test("derives company scoped project selection state without inventing frontend records", () => {
    expect(selectedProjectOrganization(viewer)?.id).toBe("org-1");
    expect(initialOrganizationId(viewer)).toBe("org-1");
    expect(organizationProjects(viewer, "org-1")).toEqual([project]);
    expect(firstProjectForOrganization(viewer, "org-1")).toEqual(project);
    expect(organizationProjectSummaries(viewer)).toEqual([
      {
        organization: viewer.organizations[0],
        projectCount: 1,
        activeProjectCount: 1,
        traceCount: 0,
        logCount: 0,
        serviceCount: 0,
      },
    ]);
  });

  test("uses project selection shell mode before project workspace routes", () => {
    expect(resolveAppShellMode({ viewer: null, pathname: "/projects" })).toBe("project-selection");
    expect(resolveAppShellMode({ viewer, pathname: "/projects" })).toBe("project-selection");
    expect(resolveAppShellMode({ viewer, pathname: "/organizations/org-1/members" })).toBe(
      "admin-settings",
    );
    expect(resolveAppShellMode({ viewer, pathname: "/projects/project-1" })).toBe(
      "project-workspace",
    );
    expect(resolveAppShellMode({ viewer, pathname: "/traces" })).toBe("project-workspace");
  });

  test("builds safe project switch targets from the current route", () => {
    expect(buildProjectSwitchTarget("/traces", "?service=api", "project-2")).toBe(
      "/traces?service=api",
    );
    expect(buildProjectSwitchTarget("/projects/project-1/settings", "", "project-2")).toBe(
      "/projects/project-2/settings",
    );
    expect(buildProjectSwitchTarget("/projects/project-1/settings/ingest", "", "project-2")).toBe(
      "/projects/project-2/settings/ingest",
    );
    expect(buildProjectSwitchTarget("/organizations/org-1/members", "", "project-2")).toBe(
      "/traces",
    );
    expect(buildProjectSwitchTarget("/projects", "?organizationId=org-1", "project-2")).toBe(
      "/traces",
    );
    expect(buildProjectSwitchTarget("/projects/project-1", "", "project-2")).toBe("/traces");
  });

  test("shows member administration controls only for company admins", () => {
    expect(canAdministerMembers("admin")).toBe(true);
    expect(canAdministerMembers("user")).toBe(false);
  });

  test("extracts stable problem details for last-admin mutation failures", () => {
    const error = new CloudGridGraphQLError("Cannot remove final admin", {
      type: "https://cloudgrid.dev/problems/forbidden",
      title: "Company admin required",
      status: 403,
      detail: "A company must keep at least one admin.",
      id: "ERR-016",
      code: "FORBIDDEN",
      retryable: false,
    });

    expect(memberMutationProblemDetails(error)).toEqual({
      code: "FORBIDDEN",
      detail: "A company must keep at least one admin.",
      id: "ERR-016",
      retryable: false,
      status: 403,
      title: "Company admin required",
    });
  });
});
