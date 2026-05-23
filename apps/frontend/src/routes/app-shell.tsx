import type { Dashboard, Organization } from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Command,
  Database,
  FlaskConical,
  FolderOpen,
  Gauge,
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
  Trophy,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
import { createAiChatGraphQLClient } from "../features/ai-chat/api";
import {
  aiChatProviderQueryKey,
  isCompanyAiChatProviderConfigured,
} from "../features/ai-chat/view-model";
import { CommandPalette } from "../features/navigation/command-palette";
import { notifyMutationError, notifyMutationSuccess } from "../lib/feedback";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import {
  buildProjectSwitchTarget,
  firstProjectForOrganization,
  initialOrganizationId,
  resolveAppShellMode,
  selectedProjectOrganization,
} from "../lib/session-state";
import { cn } from "../lib/utils";
import { useAppSession } from "../providers/app-session-provider";
import { useTheme } from "../providers/theme-provider";
import { aiChatEnabled } from "./ai-chat-route";
import { aiEvalEnabled } from "./ai-eval-route";

const projectNavItems = [
  { to: "/traces", label: t("nav.traces"), icon: Activity },
  { to: "/logs", label: t("nav.logs"), icon: TerminalSquare },
  { to: "/metrics", label: t("nav.metrics"), icon: LineChart },
  { to: "/dashboards", label: t("nav.dashboards"), icon: LayoutDashboard },
];

const aiChatClient = createAiChatGraphQLClient(
  import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql",
);

function sidebarLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex h-9 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50",
    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
  );
}

function ProjectSelectGroups({ organizations }: { organizations: Organization[] }) {
  return (
    <>
      {organizations.map((organization, index) => (
        <SelectGroup key={organization.id}>
          {index > 0 ? <SelectSeparator /> : null}
          <SelectLabel>{organization.name}</SelectLabel>
          {organization.projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="truncate">{project.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

export function AppShell() {
  const { appliedTheme, setTheme } = useTheme();
  const { client, isBackendUnavailable, logout, refetchViewer, selectProject, viewer } =
    useAppSession();
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
  const routeOrganizationId = location.pathname.match(/^\/organizations\/([^/]+)/)?.[1] ?? null;
  const decodedRouteOrganizationId = routeOrganizationId
    ? decodeURIComponent(routeOrganizationId)
    : null;
  const routeOrganization =
    viewer?.organizations.find((organization) => organization.id === decodedRouteOrganizationId) ??
    null;
  const activeOrganizationExists = Boolean(
    viewer?.organizations.some((organization) => organization.id === activeOrganizationId),
  );
  const currentOrganization =
    routeOrganization ??
    viewer?.organizations.find((organization) => organization.id === activeOrganizationId) ??
    selectedOrganization ??
    viewer?.organizations.find((organization) => organization.id === fallbackOrganizationId) ??
    null;
  const showCompanySelector = (viewer?.organizations.length ?? 0) > 1;
  const topbarProjectOrganizations =
    viewer?.organizations.filter((organization) => organization.projects.length > 0) ?? [];
  const currentOrganizationLabel = currentOrganization?.name ?? t("nav.companySelector");
  const selectedProjectOrganizationName = selectedOrganization?.name ?? currentOrganization?.name;
  const selectedProjectLabel =
    selectedProject && selectedOrganization
      ? showCompanySelector
        ? `${selectedProjectOrganizationName} / ${selectedProject.name}`
        : selectedProject.name
      : t("projects.select");
  const shellMode = resolveAppShellMode({ viewer, pathname: location.pathname });
  const showProjectWorkspace = shellMode === "project-workspace" && selectedProject !== null;
  const showAdminSettings = shellMode === "admin-settings";
  const selectedProjectId = selectedProject ? selectedProject.id : "";
  const projectSwitchTarget = (projectId: string) =>
    buildProjectSwitchTarget(location.pathname, location.search, projectId);
  const adminOrganizationId =
    decodedRouteOrganizationId ?? currentOrganization?.id ?? fallbackOrganizationId;
  const adminOrganization =
    viewer?.organizations.find((organization) => organization.id === adminOrganizationId) ?? null;
  const showAdminMembersLink = adminOrganization?.role === "admin";
  const showAdminAiProviderLink = aiChatEnabled && adminOrganization?.role === "admin";
  const companySettingsOrganization = currentOrganization ?? selectedOrganization;
  const showCompanySettingsTopbarAction = companySettingsOrganization?.role === "admin";
  const companySettingsTarget = companySettingsOrganization
    ? `/organizations/${encodeURIComponent(companySettingsOrganization.id)}/projects`
    : "/organizations";
  const dashboardsQuery = useQuery({
    enabled: showProjectWorkspace,
    queryKey: queryKeys.dashboards({ includeBuiltins: true }),
    queryFn: () => client.getDashboards({ includeBuiltins: true }),
  });
  const aiChatProviderQuery = useQuery({
    enabled:
      aiChatEnabled &&
      showProjectWorkspace &&
      Boolean(selectedOrganization?.id) &&
      !isBackendUnavailable,
    queryKey: aiChatProviderQueryKey(selectedOrganization?.id ?? ""),
    queryFn: () => aiChatClient.getCompanyAiProviderSettings(selectedOrganization?.id ?? ""),
  });
  const showAiChatNav =
    aiChatEnabled &&
    showProjectWorkspace &&
    (selectedOrganization?.role === "admin" ||
      isCompanyAiChatProviderConfigured(aiChatProviderQuery.data));
  const queryClient = useQueryClient();
  const reorderPinsMutation = useMutation({
    mutationFn: client.reorderDashboardPins,
    onSuccess: () => {
      notifyMutationSuccess(t("dashboards.pinOrder.updated"));
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboards({ includeBuiltins: true }),
      });
    },
    onError: (error) => {
      notifyMutationError(error, t("dashboards.pinOrder.error"));
    },
  });
  const visibleDashboards = dashboardsQuery.data?.items ?? [];
  const pinnedDashboardIds = dashboardsQuery.data?.pinnedDashboardIds ?? [];
  const pinnedDashboards = pinnedDashboardIds
    .map((dashboardId) => visibleDashboards.find((dashboard) => dashboard.id === dashboardId))
    .filter((dashboard) => dashboard !== undefined)
    .slice(0, 5);
  const customDashboards = visibleDashboards.filter(
    (dashboard) => dashboard.visibility !== "builtin",
  );
  const handleReorderPin = (dashboardId: string, direction: "up" | "down") => {
    const index = pinnedDashboardIds.indexOf(dashboardId);
    if (index === -1) return;
    const next = [...pinnedDashboardIds];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const aId = next[index] as string;
    const bId = next[swapIndex] as string;
    next[index] = bId;
    next[swapIndex] = aId;
    void reorderPinsMutation.mutate({ dashboardIds: next });
  };
  const projectSidebarContext =
    showProjectWorkspace && selectedProject
      ? {
          customDashboards,
          dashboardsExpanded,
          onDashboardsExpandedChange: setDashboardsExpanded,
          onReorderPin: handleReorderPin,
          pinnedDashboards,
          pinnedDashboardIds,
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
    const nextOrganizationId =
      decodedRouteOrganizationId ??
      (shellMode === "project-workspace" ? selectedOrganization?.id : null) ??
      (activeOrganizationExists ? activeOrganizationId : fallbackOrganizationId);
    if (nextOrganizationId && nextOrganizationId !== activeOrganizationId) {
      setActiveOrganizationId(nextOrganizationId);
    }
  }, [
    activeOrganizationExists,
    activeOrganizationId,
    fallbackOrganizationId,
    decodedRouteOrganizationId,
    selectedOrganization?.id,
    shellMode,
  ]);

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
      navigate(`/organizations/${encodeURIComponent(organizationId)}/projects`);
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
                  <SelectContent position="popper">
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
                <SelectContent position="popper">
                  <ProjectSelectGroups organizations={topbarProjectOrganizations} />
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
              {showCompanySettingsTopbarAction ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("nav.companySettings")}
                      asChild
                      size="icon-sm"
                      variant="outline"
                    >
                      <Link to={companySettingsTarget}>
                        <Building2 />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.companySettings")}</TooltipContent>
                </Tooltip>
              ) : null}
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
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t("nav.userMenu")}
                        className="hidden max-w-48 text-muted-foreground lg:inline-flex"
                        type="button"
                        variant="outline"
                      >
                        <UserCircle data-icon="inline-start" />
                        <span className="truncate">{viewer?.user.displayName}</span>
                        <ChevronDown className="size-3.5" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.userMenu")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="grid gap-0.5">
                    <span className="truncate">{viewer?.user.displayName}</span>
                    {viewer?.user.email ? (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {viewer.user.email}
                      </span>
                    ) : null}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void logout()}>
                    <LogOut />
                    <span>{t("nav.logout")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t("nav.userMenu")}
                    className="lg:hidden"
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <UserCircle />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="grid gap-0.5">
                    <span className="truncate">{viewer?.user.displayName}</span>
                    {viewer?.user.email ? (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {viewer.user.email}
                      </span>
                    ) : null}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void logout()}>
                    <LogOut />
                    <span>{t("nav.logout")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                          <SelectContent position="popper">
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
                        <SelectContent position="popper">
                          <ProjectSelectGroups organizations={topbarProjectOrganizations} />
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
                        showAdminAiProviderLink={showAdminAiProviderLink}
                        showAdminMembersLink={showAdminMembersLink}
                      />
                    ) : null}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
        {isBackendUnavailable ? (
          <div
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:px-4"
            role="alert"
          >
            <div className="min-w-0">
              <p className="font-medium">{t("backend.unavailable.title")}</p>
              <p className="text-xs text-destructive/90">{t("backend.unavailable.description")}</p>
            </div>
            <Button
              className="shrink-0"
              onClick={() => void refetchViewer()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Search data-icon="inline-start" />
              {t("actions.retry")}
            </Button>
          </div>
        ) : null}
        <div
          className={cn(
            "grid min-h-0 flex-1",
            showProjectWorkspace || showAdminSettings ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "",
          )}
        >
          {projectSidebarContext ? (
            <aside className="hidden min-h-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
              <nav
                aria-label={t("nav.projectNavigation")}
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
              <nav aria-label={t("nav.companies")} className="min-h-0 flex-1 overflow-y-auto p-2">
                <AdminSidebarNav
                  adminOrganizationId={adminOrganizationId}
                  showAdminAiProviderLink={showAdminAiProviderLink}
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
        <CommandPalette onOpenChange={setCommandOpen} open={commandOpen} />
      </div>
    </TooltipProvider>
  );
}

function ProjectSidebarNav({
  customDashboards,
  dashboardsExpanded,
  onDashboardsExpandedChange,
  onNavigate,
  onReorderPin,
  pinnedDashboards,
  pinnedDashboardIds,
  showAiChatNav,
}: {
  customDashboards: Pick<Dashboard, "id" | "name">[];
  dashboardsExpanded: boolean;
  onDashboardsExpandedChange: (expanded: boolean) => void;
  onNavigate?: () => void;
  onReorderPin: (dashboardId: string, direction: "up" | "down") => void;
  pinnedDashboards: Pick<Dashboard, "id" | "name">[];
  pinnedDashboardIds: string[];
  showAiChatNav: boolean;
}) {
  const location = useLocation();
  const aiEvalTab =
    location.pathname === "/ai-eval"
      ? (new URLSearchParams(location.search).get("tab") ?? "datasets")
      : null;
  const aiChatNavItem = showAiChatNav
    ? { to: "/ai-chat", label: t("nav.aiChat"), icon: Sparkles }
    : null;
  const aiEvalSubItems: Array<{ tab: string; label: string; icon: typeof Database }> = [
    { tab: "datasets", label: t("nav.aiEvalDatasets"), icon: Database },
    { tab: "scorers", label: t("nav.aiEvalScorers"), icon: FlaskConical },
    { tab: "experiments", label: t("nav.aiEvalExperiments"), icon: Trophy },
    { tab: "production", label: t("nav.aiEvalProduction"), icon: Gauge },
  ];
  const enabledNavItems = [...projectNavItems];

  return (
    <div className="flex flex-col gap-1">
      {aiChatNavItem ? (
        <div className="mb-2 flex flex-col gap-1 border-b pb-2">
          <NavLink className={sidebarLinkClass} onClick={onNavigate} to={aiChatNavItem.to}>
            <aiChatNavItem.icon className="size-4" aria-hidden />
            <span className="truncate">{aiChatNavItem.label}</span>
          </NavLink>
        </div>
      ) : null}
      {pinnedDashboards.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1 border-b pb-2">
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("dashboards.pinned")}
          </p>
          {pinnedDashboards.map((dashboard, index) => {
            const fullIndex = pinnedDashboardIds.indexOf(dashboard.id);
            return (
              <div className="flex items-center gap-1" key={`pinned-${dashboard.id}`}>
                <NavLink
                  className={cn(sidebarLinkClass({ isActive: false }), "min-w-0 flex-1")}
                  onClick={onNavigate}
                  to={`/dashboards?dashboard=${encodeURIComponent(dashboard.id)}`}
                >
                  <LayoutDashboard className="size-4" aria-hidden />
                  <span className="truncate">{dashboard.name}</span>
                </NavLink>
                <div className="flex shrink-0 flex-col">
                  <Button
                    aria-label={t("dashboards.pin.moveUp")}
                    className="size-4"
                    disabled={index === 0}
                    onClick={() => onReorderPin(dashboard.id, "up")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    aria-label={t("dashboards.pin.moveDown")}
                    className="size-4"
                    disabled={fullIndex >= pinnedDashboardIds.length - 1}
                    onClick={() => onReorderPin(dashboard.id, "down")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
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
      {aiEvalEnabled ? (
        <div className="flex flex-col gap-1">
          <NavLink
            className={({ isActive }) => sidebarLinkClass({ isActive })}
            end
            onClick={onNavigate}
            to="/ai-eval"
          >
            <Bot className="size-4" aria-hidden />
            <span className="truncate">{t("nav.aiEval")}</span>
          </NavLink>
          <div className="ml-6 flex flex-col gap-1">
            {aiEvalSubItems.map((subItem) => (
              <Link
                className={sidebarLinkClass({ isActive: aiEvalTab === subItem.tab })}
                key={subItem.tab}
                onClick={onNavigate}
                to={`/ai-eval?tab=${subItem.tab}`}
              >
                <subItem.icon className="size-4" aria-hidden />
                <span className="truncate">{subItem.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminSidebarNav({
  adminOrganizationId,
  showAdminAiProviderLink,
  showAdminMembersLink,
}: {
  adminOrganizationId: string;
  showAdminAiProviderLink: boolean;
  showAdminMembersLink: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {adminOrganizationId ? (
        <>
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
          {showAdminAiProviderLink ? (
            <NavLink
              className={sidebarLinkClass}
              to={`/organizations/${adminOrganizationId}/ai-provider`}
            >
              <Bot className="size-4" aria-hidden />
              <span className="truncate">{t("nav.aiProvider")}</span>
            </NavLink>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
