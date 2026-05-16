import type {
  CompanyRole,
  Organization,
  Project,
  ProjectStatus,
  Viewer,
} from "@cloudgrid/ui-contracts";
import type { CloudGridGraphQLError } from "./graphql-client";

export type DeploymentMode = "local" | "deployed";
export type AppShellMode = "project-selection" | "project-workspace" | "admin-settings";

export interface ProjectOption {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  status: ProjectStatus;
}

export interface StableProblemDetails {
  title: string;
  detail: string;
  status: number;
  id: string;
  code: string;
  retryable: boolean;
}

export interface OrganizationProjectSummary {
  organization: Organization;
  projectCount: number;
  activeProjectCount: number;
  traceCount: number;
  logCount: number;
  serviceCount: number;
}

export function deploymentModeFromEnv(value: string | undefined): DeploymentMode {
  return value === "deployed" ? "deployed" : "local";
}

export function resolveRootRedirect({
  mode,
  viewer,
}: {
  mode: DeploymentMode;
  viewer: Viewer | null;
}) {
  if (mode === "deployed" && !viewer) {
    return "/login";
  }
  return "/projects";
}

export type LoginProvider = "github" | "google" | "azure";

export function buildLoginUrl(returnTo: string, provider?: LoginProvider) {
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/projects";
  const params = new URLSearchParams({ returnTo: safeReturnTo });
  if (provider) {
    params.set("provider", provider);
  }
  return `/auth/login?${params.toString()}`;
}

export function createLocalViewer(): Viewer {
  const defaultProject: Project = {
    id: "default",
    organizationId: "local",
    name: "Default project",
    slug: "default",
    status: "active",
    telemetry: {
      lastIngestAt: null,
      traceCount: 0,
      logCount: 0,
      metricCount: 0,
      serviceCount: 0,
    },
  };

  return {
    user: {
      id: "local",
      displayName: "Local user",
      email: null,
    },
    organizations: [
      {
        id: "local",
        name: "Personal",
        slug: "local",
        role: "admin",
        projects: [defaultProject],
      },
    ],
    selectedProject: null,
  };
}

export function projectOptionsFromViewer(viewer: Viewer | null): ProjectOption[] {
  if (!viewer) {
    return [];
  }

  return viewer.organizations.flatMap((organization) =>
    organization.projects.map((project) => ({
      id: project.id,
      name: project.name,
      organizationId: organization.id,
      organizationName: organization.name,
      status: project.status,
    })),
  );
}

export function selectedProjectOrganization(viewer: Viewer | null): Organization | null {
  const selectedProject = viewer?.selectedProject;
  if (!selectedProject) {
    return null;
  }
  return (
    viewer.organizations.find(
      (organization) => organization.id === selectedProject.organizationId,
    ) ?? null
  );
}

export function organizationProjects(
  viewer: Viewer | null,
  organizationId: string | null | undefined,
): Project[] {
  if (!organizationId) {
    return [];
  }
  return (
    viewer?.organizations.find((organization) => organization.id === organizationId)?.projects ?? []
  );
}

export function firstProjectForOrganization(
  viewer: Viewer | null,
  organizationId: string | null | undefined,
): Project | null {
  return organizationProjects(viewer, organizationId)[0] ?? null;
}

export function resolveAppShellMode({
  viewer,
  pathname,
}: {
  viewer: Viewer | null;
  pathname: string;
}): AppShellMode {
  if (
    pathname === "/organizations" ||
    /^\/organizations\/[^/]+(?:\/projects|\/members)?\/?$/.test(pathname)
  ) {
    return "admin-settings";
  }

  if (!viewer?.selectedProject) {
    return "project-selection";
  }

  if (pathname === "/projects") {
    return "project-selection";
  }

  return "project-workspace";
}

export function buildProjectSwitchTarget(
  pathname: string,
  search: string,
  nextProjectId: string,
): string {
  const normalizedSearch = search.startsWith("?") ? search : "";
  const encodedProjectId = encodeURIComponent(nextProjectId);
  const projectRouteMatch = pathname.match(/^\/projects\/[^/]+(?<suffix>\/settings(?:\/.*)?)/);

  if (projectRouteMatch) {
    return `/projects/${encodedProjectId}${projectRouteMatch.groups?.suffix ?? ""}`;
  }

  if (
    pathname.startsWith("/traces") ||
    pathname === "/logs" ||
    pathname === "/metrics" ||
    pathname === "/dashboards" ||
    pathname === "/ai-eval"
  ) {
    return `${pathname}${normalizedSearch}`;
  }

  return "/traces";
}

export function initialOrganizationId(viewer: Viewer | null): string {
  return (
    selectedProjectOrganization(viewer)?.id ??
    viewer?.organizations.find((organization) => organization.projects.length > 0)?.id ??
    viewer?.organizations[0]?.id ??
    ""
  );
}

export function organizationProjectSummaries(viewer: Viewer | null): OrganizationProjectSummary[] {
  return (viewer?.organizations ?? []).map((organization) => ({
    organization,
    projectCount: organization.projects.length,
    activeProjectCount: organization.projects.filter((project) => project.status === "active")
      .length,
    traceCount: organization.projects.reduce(
      (total, project) => total + project.telemetry.traceCount,
      0,
    ),
    logCount: organization.projects.reduce(
      (total, project) => total + project.telemetry.logCount,
      0,
    ),
    serviceCount: organization.projects.reduce(
      (total, project) => total + project.telemetry.serviceCount,
      0,
    ),
  }));
}

export function getTelemetryProjectState(
  viewer: Viewer | null,
): { kind: "selected"; project: Project } | { kind: "required" } {
  if (viewer?.selectedProject) {
    return {
      kind: "selected",
      project: viewer.selectedProject,
    };
  }
  return { kind: "required" };
}

export function canAdministerMembers(role: CompanyRole | undefined) {
  return role === "admin";
}

export function organizationRole(viewer: Viewer | null, organizationId: string) {
  return viewer?.organizations.find((organization) => organization.id === organizationId)?.role;
}

export function memberMutationProblemDetails(error: unknown): StableProblemDetails | null {
  const problem = (error as Partial<CloudGridGraphQLError> | undefined)?.problem;
  if (!problem) {
    return null;
  }

  return {
    title: problem.title,
    detail: problem.detail,
    status: problem.status,
    id: problem.id,
    code: problem.code,
    retryable: problem.retryable,
  };
}
