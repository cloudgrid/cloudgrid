import type { Dashboard } from "@cloudgrid/ui-contracts";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Braces,
  Building2,
  ChevronDown,
  ChevronRight,
  Command,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  TerminalSquare,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { CommandPalette } from "../features/navigation/command-palette";
import { createAiChatGraphQLClient } from "../features/ai-chat/api";
import {
  aiChatProviderQueryKey,
  isCompanyAiChatProviderConfigured,
} from "../features/ai-chat/view-model";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import {
  buildProjectSwitchTarget,
  firstProjectForOrganization,
  initialOrganizationId,
  organizationProjects,
  resolveAppShellMode,
  selectedProjectOrganization,
} from "../lib/session-state";
import { cn } from "../lib/utils";
import { useAppSession } from "../providers/app-session-provider";
import { useTheme } from "../providers/theme-provider";
import { aiEvalEnabled } from "./ai-eval-route";
import { aiChatEnabled } from "./ai-chat-route";

const projectNavItems = [
  { to: "/traces", label: t("nav.traces"), icon: Activity },
  { to: "/logs", label: t("nav.logs"), icon: TerminalSquare },
  { to: "/metrics", label: t("nav.metrics"), icon: LineChart },
  { to: "/dashboards", label: t("nav.dashboards"), icon: LayoutDashboard },
];

const showGraphQLUiLink =
  import.meta.env.DEV || import.meta.env.VITE_CLOUDGRID_GRAPHQL_UI === "true";
const aiChatClient = createAiChatGraphQLClient(
  import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql",
);

function sidebarLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50",
    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
  );
}

export function AppShell() {
  const { appliedTheme, setTheme } = useTheme();
  const { client, logout, mode, selectProject, viewer } = useAppSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashboardsExpanded, setDashboardsExpanded] = useState(false);
  const [activeOrganizationId, setActiveOrganizationId] = useState(() =>
    initialOrganizationId(viewer),
  );
  const nextTheme = appliedTheme === "dark" ? "light" : "dark";
  const selectedProject = viewer?.selectedProject ?? null;
  const selectedOrganization = selectedProjectOrganization(viewer);
  const fallbackOrganizationId = initialOrganizationId(viewer);
  const currentOrganization =
    viewer?.organizations.find((organization) => organization.id === activeOrganizationId) ??
    selectedOrganization ??
    viewer?.organizations.find((organization) => organization.id === fallbackOrganizationId) ??
    null;
  const showCompanySelector = (viewer?.organizations.length ?? 0) > 1;
  const topbarProjects = organizationProjects(viewer, currentOrganization?.id);
  const currentOrganizationLabel = currentOrganization?.name ?? t("nav.companySelector");
  const selectedProjectLabel = selectedProject?.name ?? t("projects.select");
  const shellMode = resolveAppShellMode({ viewer, pathname: location.pathname });
  const showProjectWorkspace = shellMode === "project-workspace" && selectedProject !== null;
  const showAdminSettings = shellMode === "admin-settings";
  const selectedProjectId = selectedProject?.id ?? "";
  const projectSwitchTarget = (projectId: string) =>
    buildProjectSwitchTarget(location.pathname, location.search, projectId);
  const adminOrganizationId =
    location.pathname.match(/^\/organizations\/([^/]+)/)?.[1] ??
    currentOrganization?.id ??
    fallbackOrganizationId;
  const showAdminMembersLink = !(mode === "local" && adminOrganizationId === "local");
  const dashboardsQuery = useQuery({
    enabled: showProjectWorkspace,
    queryKey: queryKeys.dashboards({ includeBuiltins: true }),
    queryFn: () => client.getDashboards({ includeBuiltins: true }),
  });
  const aiChatProviderQuery = useQuery({
    enabled: aiChatEnabled && showProjectWorkspace && Boolean(selectedOrganization?.id),
    queryKey: aiChatProviderQueryKey(selectedOrganization?.id ?? ""),
    queryFn: () => aiChatClient.getCompanyAiProviderSettings(selectedOrganization?.id ?? ""),
  });
  const showAiChatNav =
    aiChatEnabled &&
    showProjectWorkspace &&
    (selectedOrganization?.role === "admin" ||
      isCompanyAiChatProviderConfigured(aiChatProviderQuery.data));
  const visibleDashboards = dashboardsQuery.data?.items ?? [];
  const pinnedDashboards = (dashboardsQuery.data?.pinnedDashboardIds ?? [])
    .map((dashboardId) => visibleDashboards.find((dashboard) => dashboard.id === dashboardId))
    .filter((dashboard) => dashboard !== undefined)
    .slice(0, 5);
  const customDashboards = visibleDashboards.filter(
    (dashboard) => dashboard.visibility !== "builtin",
  );
  const projectSidebarContext =
    showProjectWorkspace && selectedProject
      ? {
          customDashboards,
          dashboardsExpanded,
          onDashboardsExpandedChange: setDashboardsExpanded,
          pinnedDashboards,
          showAiChatNav,
        }
      : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const nextOrganizationId = selectedOrganization?.id ?? fallbackOrganizationId;
    if (nextOrganizationId && nextOrganizationId !== activeOrganizationId) {
      setActiveOrganizationId(nextOrganizationId);
    }
  }, [activeOrganizationId, fallbackOrganizationId, selectedOrganization?.id]);

  const selectAndNavigateProject = (projectId: string) => {
    if (!projectId) {
      return;
    }
    void selectProject(projectId).then(() => navigate(projectSwitchTarget(projectId)));
  };

  const handleOrganizationChange = (organizationId: string) => {
    setActiveOrganizationId(organizationId);

    if (showProjectWorkspace) {
      const nextProject = firstProjectForOrganization(viewer, organizationId);
      if (nextProject) {
        void selectProject(nextProject.id).then(() =>
          navigate(projectSwitchTarget(nextProject.id)),
        );
        return;
      }
    }

    if (showAdminSettings && organizationId) {
      navigate(`/organizations/${encodeURIComponent(organizationId)}`);
      return;
    }

    navigate("/projects");
  };

  return (
    <TooltipProvider>
      <div
        className="flex h-dvh min-h-screen flex-col overflow-hidden bg-background text-foreground"
        data-shell-mode={shellMode}
      >
        <header className="z-20 h-14 shrink-0 border-b bg-background">
          <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:gap-3 sm:px-4">
            <div className="flex min-w-0 items-center">
              <Link
                className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                to="/projects"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-primary text-primary-foreground">
                  <Activity className="size-4" aria-hidden />
                </span>
                <span className="hidden truncate text-sm font-semibold sm:inline">
                  {t("app.name")}
                </span>
              </Link>
            </div>
            <div className="hidden min-w-[320px] max-w-[560px] items-center justify-center gap-2 md:flex">
              {showCompanySelector ? (
                <Select
                  onValueChange={handleOrganizationChange}
                  value={currentOrganization?.id ?? ""}
                >
                  <SelectTrigger
                    aria-label={t("nav.companySelector")}
                    className="min-w-36 max-w-64"
                    size="sm"
                  >
                    <span className="truncate">{currentOrganizationLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(viewer?.organizations ?? []).map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>
                          {organization.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : null}
              {showCompanySelector ? (
                <span className="sr-only">
                  {(viewer?.organizations ?? []).map((organization) => organization.name).join(" ")}
                </span>
              ) : null}
              <Select onValueChange={selectAndNavigateProject} value={selectedProjectId}>
                <SelectTrigger
                  aria-label={t("nav.projectSelector")}
                  className="min-w-40 max-w-72"
                  size="sm"
                >
                  <span className="truncate">{selectedProjectLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {topbarProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
              <Button
                className="hidden min-w-44 justify-between text-muted-foreground xl:inline-flex"
                onClick={() => setCommandOpen(true)}
                type="button"
                variant="outline"
              >
                <span className="flex items-center gap-2">
                  <Search />
                  {t("nav.command")}
                </span>
                <span className="flex items-center gap-0.5 rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  <Command className="size-3" />K
                </span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("nav.command")}
                    className="xl:hidden"
                    onClick={() => setCommandOpen(true)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Search />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("nav.command")}</TooltipContent>
              </Tooltip>
              {showProjectWorkspace ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("nav.setup")}
                      onClick={() => navigate(`/projects/${selectedProjectId}/settings`)}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <HelpCircle />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.setup")}</TooltipContent>
                </Tooltip>
              ) : null}
              {showGraphQLUiLink ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button aria-label={t("nav.graphql")} asChild size="icon-sm" variant="outline">
                      <a href="/graphql">
                        <Braces />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.graphql")}</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("theme.toggle")}
                    onClick={() => setTheme(nextTheme)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    {appliedTheme === "dark" ? <Sun /> : <Moon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {appliedTheme === "dark" ? t("theme.light") : t("theme.dark")}
                </TooltipContent>
              </Tooltip>
              <Button
                aria-label={viewer?.user.displayName ?? ""}
                className="hidden max-w-40 text-muted-foreground lg:inline-flex"
                type="button"
                variant="outline"
              >
                <UserCircle data-icon="inline-start" />
                <span className="truncate">{viewer?.user.displayName}</span>
              </Button>
              {mode === "deployed" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("nav.logout")}
                      onClick={() => void logout()}
                      size="icon-sm"
                      type="button"
                      variant="outline"
                    >
                      <LogOut />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.logout")}</TooltipContent>
                </Tooltip>
              ) : null}
              <Sheet onOpenChange={setMobileMenuOpen} open={mobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    aria-label={t("nav.projects")}
                    className="lg:hidden"
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[320px] max-w-[88vw]" side="left">
                  <SheetHeader>
                    <SheetTitle>{t("app.name")}</SheetTitle>
                    <SheetDescription>
                      {selectedProject?.name ?? t("projects.select")}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="grid gap-4 px-4">
                    <div className="grid gap-2">
                      {showCompanySelector ? (
                        <Select
                          onValueChange={handleOrganizationChange}
                          value={currentOrganization?.id ?? ""}
                        >
                          <SelectTrigger
                            aria-label={t("nav.companySelector")}
                            className="w-full"
                            size="sm"
                          >
                            <span className="truncate">{currentOrganizationLabel}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {(viewer?.organizations ?? []).map((organization) => (
                                <SelectItem key={organization.id} value={organization.id}>
                                  {organization.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : null}
                      {showCompanySelector ? (
                        <span className="sr-only">
                          {(viewer?.organizations ?? [])
                            .map((organization) => organization.name)
                            .join(" ")}
                        </span>
                      ) : null}
                      <Select onValueChange={selectAndNavigateProject} value={selectedProjectId}>
                        <SelectTrigger
                          aria-label={t("nav.projectSelector")}
                          className="w-full"
                          size="sm"
                        >
                          <span className="truncate">{selectedProjectLabel}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {topbarProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    {projectSidebarContext ? (
                      <ProjectSidebarNav
                        {...projectSidebarContext}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                    ) : showAdminSettings ? (
                      <AdminSidebarNav
                        adminOrganizationId={adminOrganizationId}
                        showAdminMembersLink={showAdminMembersLink}
                      />
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
        <div
          className={cn(
            "grid min-h-0 flex-1",
            showProjectWorkspace || showAdminSettings ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "",
          )}
        >
          {projectSidebarContext ? (
            <aside className="hidden min-h-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
              <nav
                aria-label={t("nav.projectSelector")}
                className="min-h-0 flex-1 overflow-y-auto p-2 pt-3"
              >
                <ProjectSidebarNav {...projectSidebarContext} />
              </nav>
              <div className="border-t p-2">
                <NavLink
                  className={sidebarLinkClass}
                  to={`/projects/${selectedProjectId}/settings`}
                >
                  <Settings className="size-4" aria-hidden />
                  <span className="truncate">{t("projects.settings")}</span>
                </NavLink>
              </div>
            </aside>
          ) : null}
          {showAdminSettings ? (
            <aside className="hidden min-h-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
              <div className="border-b p-3">
                <p className="text-xs text-muted-foreground">{t("nav.company")}</p>
                <p className="truncate text-sm font-semibold">
                  {currentOrganization?.name ?? t("nav.companies")}
                </p>
              </div>
              <nav aria-label={t("nav.companies")} className="min-h-0 flex-1 overflow-y-auto p-2">
                <AdminSidebarNav
                  adminOrganizationId={adminOrganizationId}
                  showAdminMembersLink={showAdminMembersLink}
                />
              </nav>
            </aside>
          ) : null}
          <main
            className={cn(
              "min-h-0 min-w-0 overflow-hidden",
              shellMode === "project-selection" && "overflow-y-auto",
            )}
          >
            <div
              className={cn(
                "h-full min-h-0 w-full p-3 lg:p-4",
                shellMode === "project-selection" && "mx-auto min-h-full max-w-6xl",
              )}
            >
              <Outlet />
            </div>
          </main>
        </div>
        <CommandPalette
          onOpenChange={setCommandOpen}
          open={commandOpen}
          showGraphQLUiLink={showGraphQLUiLink}
        />
      </div>
    </TooltipProvider>
  );
}

function ProjectSidebarNav({
  customDashboards,
  dashboardsExpanded,
  onDashboardsExpandedChange,
  onNavigate,
  pinnedDashboards,
  showAiChatNav,
}: {
  customDashboards: Pick<Dashboard, "id" | "name">[];
  dashboardsExpanded: boolean;
  onDashboardsExpandedChange: (expanded: boolean) => void;
  onNavigate?: () => void;
  pinnedDashboards: Pick<Dashboard, "id" | "name">[];
  showAiChatNav: boolean;
}) {
  const enabledNavItems = [
    ...projectNavItems,
    ...(showAiChatNav ? [{ to: "/ai-chat", label: t("nav.aiChat"), icon: Sparkles }] : []),
    ...(aiEvalEnabled ? [{ to: "/ai-eval", label: t("nav.aiEval"), icon: Bot }] : []),
  ];

  return (
    <div className="flex flex-col gap-1">
      {pinnedDashboards.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1 border-b pb-2">
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("dashboards.pinned")}
          </p>
          {pinnedDashboards.map((dashboard) => (
            <NavLink
              className={sidebarLinkClass}
              key={`pinned-${dashboard.id}`}
              onClick={onNavigate}
              to={`/dashboards?dashboard=${encodeURIComponent(dashboard.id)}`}
            >
              <LayoutDashboard className="size-4" aria-hidden />
              <span className="truncate">{dashboard.name}</span>
            </NavLink>
          ))}
        </div>
      ) : null}
      {enabledNavItems.map((item) => {
        const target = item.to;
        const isDashboardItem = item.to === "/dashboards";
        return (
          <div className="flex flex-col gap-1" key={target}>
            <div className="flex items-center gap-1">
              <NavLink
                className={({ isActive }) =>
                  cn(sidebarLinkClass({ isActive }), isDashboardItem && "min-w-0 flex-1")
                }
                onClick={onNavigate}
                to={target}
              >
                <item.icon className="size-4" aria-hidden />
                <span className="truncate">{item.label}</span>
              </NavLink>
              {isDashboardItem && customDashboards.length > 0 ? (
                <Button
                  aria-expanded={dashboardsExpanded}
                  aria-label={t("nav.dashboards")}
                  className="size-8 shrink-0"
                  onClick={() => onDashboardsExpandedChange(!dashboardsExpanded)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  {dashboardsExpanded ? <ChevronDown /> : <ChevronRight />}
                </Button>
              ) : null}
            </div>
            {isDashboardItem && dashboardsExpanded && customDashboards.length > 0 ? (
              <div className="ml-6 flex flex-col gap-1">
                {customDashboards.map((dashboard) => (
                  <NavLink
                    className={sidebarLinkClass}
                    key={`dashboard-${dashboard.id}`}
                    onClick={onNavigate}
                    to={`/dashboards?dashboard=${encodeURIComponent(dashboard.id)}`}
                  >
                    <LayoutDashboard className="size-4" aria-hidden />
                    <span className="truncate">{dashboard.name}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AdminSidebarNav({
  adminOrganizationId,
  showAdminMembersLink,
}: {
  adminOrganizationId: string;
  showAdminMembersLink: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <NavLink className={sidebarLinkClass} end to="/organizations">
        <Building2 className="size-4" aria-hidden />
        <span className="truncate">{t("nav.companies")}</span>
      </NavLink>
      {adminOrganizationId ? (
        <>
          <NavLink className={sidebarLinkClass} end to={`/organizations/${adminOrganizationId}`}>
            <Building2 className="size-4" aria-hidden />
            <span className="truncate">{t("nav.company")}</span>
          </NavLink>
          <NavLink
            className={sidebarLinkClass}
            to={`/organizations/${adminOrganizationId}/projects`}
          >
            <FolderOpen className="size-4" aria-hidden />
            <span className="truncate">{t("nav.projects")}</span>
          </NavLink>
          {showAdminMembersLink ? (
            <NavLink
              className={sidebarLinkClass}
              to={`/organizations/${adminOrganizationId}/members`}
            >
              <UserCircle className="size-4" aria-hidden />
              <span className="truncate">{t("nav.members")}</span>
            </NavLink>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
