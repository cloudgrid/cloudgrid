import type { CompanyRole, Organization, Project, Viewer } from "@cloudgrid/ui-contracts";
import type { DeploymentMode } from "../../lib/session-state";

export type ProjectPickerPrimaryAction = "create-project" | "select-project";
export type ProjectPickerEmptyReason = "no-projects" | "no-results" | null;

export interface ProjectPickerModel {
  layout: "centered-picker";
  organization: Organization | null;
  projects: Project[];
  primaryAction: ProjectPickerPrimaryAction;
  emptyReason: ProjectPickerEmptyReason;
  showGlobalStats: false;
  showCompanyRail: false;
}

export interface ProjectSettingsSection {
  id: "general" | "ingest" | "retention" | "ai-eval" | "members";
  href: string;
  labelKey:
    | "projects.settings.general"
    | "projects.settings.apiKeys"
    | "projects.settings.retention"
    | "projects.settings.aiEval"
    | "projects.settings.members";
}

export interface AdminSettingsModel {
  layout: "admin-settings";
  organizationName: string;
  sidebarItems: Array<{
    id: "organization" | "projects" | "members" | "ai-provider";
    href: string;
    labelKey: "companies.title" | "nav.projects" | "companies.members.title" | "nav.aiProvider";
  }>;
  showMemberAdministration: boolean;
}

export function buildProjectPickerModel({
  viewer,
  organizationId,
  search,
}: {
  viewer: Viewer | null;
  organizationId: string;
  search: string;
}): ProjectPickerModel {
  const organization =
    viewer?.organizations.find((candidate) => candidate.id === organizationId) ??
    viewer?.organizations[0] ??
    null;
  const normalizedSearch = search.trim().toLowerCase();
  const projects =
    organization?.projects.filter((project) => {
      if (!normalizedSearch) {
        return true;
      }
      return (
        project.name.toLowerCase().includes(normalizedSearch) ||
        project.slug.toLowerCase().includes(normalizedSearch) ||
        project.status.toLowerCase().includes(normalizedSearch)
      );
    }) ?? [];

  return {
    layout: "centered-picker",
    organization,
    projects,
    primaryAction: organization?.projects.length ? "select-project" : "create-project",
    emptyReason: organization?.projects.length
      ? projects.length === 0
        ? "no-results"
        : null
      : "no-projects",
    showGlobalStats: false,
    showCompanyRail: false,
  };
}

export function buildProjectSettingsSections(
  projectId: string,
  options: { aiEvalEnabled?: boolean } = {},
): ProjectSettingsSection[] {
  const encodedProjectId = encodeURIComponent(projectId);
  const base = `/projects/${encodedProjectId}/settings`;
  const sections: ProjectSettingsSection[] = [
    {
      id: "general",
      href: base,
      labelKey: "projects.settings.general",
    },
    {
      id: "ingest",
      href: `${base}/ingest`,
      labelKey: "projects.settings.apiKeys",
    },
    {
      id: "retention",
      href: `${base}/retention`,
      labelKey: "projects.settings.retention",
    },
  ];

  if (options.aiEvalEnabled) {
    sections.push({
      id: "ai-eval",
      href: `${base}/ai-eval`,
      labelKey: "projects.settings.aiEval",
    });
  }

  sections.push({
    id: "members",
    href: `${base}/members`,
    labelKey: "projects.settings.members",
  });

  return sections;
}

export function buildAdminSettingsModel({
  mode,
  organization,
}: {
  mode: DeploymentMode;
  organization: Organization;
}): AdminSettingsModel {
  const isLocalPersonal = isLocalPersonalOrganization(mode, organization);
  const encodedOrganizationId = encodeURIComponent(organization.id);
  const sidebarItems: AdminSettingsModel["sidebarItems"] = [
    {
      id: "organization",
      href: `/organizations/${encodedOrganizationId}`,
      labelKey: "companies.title",
    },
    {
      id: "projects",
      href: `/organizations/${encodedOrganizationId}/projects`,
      labelKey: "nav.projects",
    },
  ];

  if (!isLocalPersonal) {
    sidebarItems.push({
      id: "members",
      href: `/organizations/${encodedOrganizationId}/members`,
      labelKey: "companies.members.title",
    });
  }

  if (organization.role === "admin") {
    sidebarItems.push({
      id: "ai-provider",
      href: `/organizations/${encodedOrganizationId}/ai-provider`,
      labelKey: "nav.aiProvider",
    });
  }

  return {
    layout: "admin-settings",
    organizationName: displayCompanyName(organization),
    sidebarItems,
    showMemberAdministration: !isLocalPersonal,
  };
}

export function canMutateOrganizationMember({
  mode,
  mutation,
  organization,
  targetUserId,
  viewerUserId,
}: {
  mode: DeploymentMode;
  mutation: "promote" | "demote" | "remove";
  organization: Organization;
  targetUserId: string;
  viewerUserId: string;
}): { allowed: true } | { allowed: false; reason: "local-personal-single-admin" } {
  if (
    isLocalPersonalOrganization(mode, organization) &&
    targetUserId === viewerUserId &&
    (mutation === "demote" || mutation === "remove")
  ) {
    return {
      allowed: false,
      reason: "local-personal-single-admin",
    };
  }

  return { allowed: true };
}

export function displayCompanyName(organization: Organization): string {
  return organization.id === "local" ? "Personal" : organization.name;
}

export function displayRole(role: CompanyRole): string {
  return role;
}

function isLocalPersonalOrganization(mode: DeploymentMode, organization: Organization): boolean {
  return mode === "local" && organization.id === "local";
}
