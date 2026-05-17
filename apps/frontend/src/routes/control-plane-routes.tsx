import type {
  CreatedIngestCredential,
  IngestCredentialListResult,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  Project,
  ProjectAiSettings,
  ProjectMember,
  ProjectRole,
  RetentionDataClass,
  RetentionMode,
  RetentionRule,
  UpdateProjectAiSettingsInput,
} from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FolderOpen,
  KeyRound,
  LineChart,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { CodeBlock } from "../components/code-block";
import { CopyButton } from "../components/copy-button";
import { SearchInput } from "../components/search-input";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  buildAdminSettingsModel,
  buildProjectPickerModel,
  buildProjectSettingsSections,
  canMutateOrganizationMember,
} from "../features/projects/project-view-model";
import { formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import {
  canAdministerMembers,
  initialOrganizationId,
  memberMutationProblemDetails,
} from "../lib/session-state";
import { cn } from "../lib/utils";
import { useAppSession } from "../providers/app-session-provider";
import { aiEvalEnabled } from "./ai-eval-route";

export function OrganizationsRoute() {
  const { mode, viewer } = useAppSession();
  const organizations = viewer?.organizations ?? [];

  if (mode === "local") {
    return <Navigate replace to="/projects" />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <RouteHeader title={t("companies.title")} description={t("companies.description")} />
      <div className="min-h-0 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nav.company")}</TableHead>
              <TableHead>{t("value.slug")}</TableHead>
              <TableHead>{t("companies.members.role")}</TableHead>
              <TableHead>{t("nav.projects")}</TableHead>
              <TableHead>{t("companies.members.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((organization) => (
              <TableRow key={organization.id}>
                <TableCell className="font-medium">{companyName(organization)}</TableCell>
                <TableCell className="font-mono text-xs">{organization.slug}</TableCell>
                <TableCell>
                  <RoleBadge role={organization.role} />
                </TableCell>
                <TableCell>{organization.projects.length}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/organizations/${organization.id}`}>
                      <Settings data-icon="inline-start" />
                      {t("projects.settings.open")}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export function OrganizationOverviewRoute() {
  const { organizationId } = useParams();
  const { mode, viewer } = useAppSession();
  const organization = findOrganization(viewer?.organizations, organizationId);

  if (!organization) {
    return <NotFoundState title={t("companies.notFound.title")} />;
  }

  return (
    <AdminSettingsShell activeItem="organization" organization={organization}>
      <RouteHeader
        title={companyName(organization)}
        description={t("companies.settings.overviewDescription")}
      />
      {mode === "local" ? (
        <Alert>
          <Shield aria-hidden />
          <AlertTitle>{t("companies.personal")}</AlertTitle>
          <AlertDescription>{t("companies.personal.localAdminLimited")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-lg border">
        <div className="grid gap-0 divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          <ReadOnlyField label={t("nav.company")} value={companyName(organization)} />
          <ReadOnlyField label={t("companies.slug")} value={organization.slug} />
          <ReadOnlyField label={t("companies.members.role")} value={organization.role} />
        </div>
      </div>
      <div className="min-h-0 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("projects.title")}</TableHead>
              <TableHead>{t("projects.status")}</TableHead>
              <TableHead>{t("projects.lastIngest")}</TableHead>
              <TableHead>{t("projects.servicesLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organization.projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <ProjectStatusBadge status={project.status} />
                </TableCell>
                <TableCell>{formatNullableDate(project.telemetry.lastIngestAt)}</TableCell>
                <TableCell>{project.telemetry.serviceCount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminSettingsShell>
  );
}

export function OrganizationMembersRoute() {
  const { organizationId } = useParams();
  const { client, mode, refetchViewer, viewer } = useAppSession();
  const queryClient = useQueryClient();
  const organization = findOrganization(viewer?.organizations, organizationId);
  const adminModel = organization ? buildAdminSettingsModel({ mode, organization }) : null;
  const canAdminister =
    !!adminModel?.showMemberAdministration && canAdministerMembers(organization?.role);
  const [pendingAction, setPendingAction] = useState<{
    action: "demote" | "remove";
    member: OrganizationMember;
  } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const membersQuery = useQuery({
    enabled: !!organization && !!adminModel?.showMemberAdministration,
    queryKey: organization
      ? queryKeys.organizationMembers(organization.id)
      : ["OrganizationMembers"],
    queryFn: () => client.getOrganizationMembers(organization?.id ?? ""),
  });
  const invitationsQuery = useQuery({
    enabled: canAdminister,
    queryKey: organization
      ? queryKeys.organizationInvitations(organization.id)
      : ["OrganizationInvitations"],
    queryFn: () => client.getOrganizationInvitations(organization?.id ?? ""),
  });
  const updateMember = useMutation({
    mutationFn: client.updateOrganizationMember,
    onSuccess: async () => {
      await Promise.all([
        refetchViewer(),
        organization
          ? queryClient.invalidateQueries({
              queryKey: queryKeys.organizationMembers(organization.id),
            })
          : Promise.resolve(),
      ]);
    },
  });
  const removeMember = useMutation({
    mutationFn: client.removeOrganizationMember,
    onSuccess: async () => {
      await Promise.all([
        refetchViewer(),
        organization
          ? queryClient.invalidateQueries({
              queryKey: queryKeys.organizationMembers(organization.id),
            })
          : Promise.resolve(),
      ]);
    },
  });
  const inviteMember = useMutation({
    mutationFn: client.inviteOrganizationMember,
    onSuccess: async () => {
      if (organization) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.organizationInvitations(organization.id),
        });
      }
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: client.revokeOrganizationInvitation,
    onSuccess: async () => {
      if (organization) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.organizationInvitations(organization.id),
        });
      }
    },
  });
  const problem = memberMutationProblemDetails(
    updateMember.error ?? removeMember.error ?? inviteMember.error ?? revokeInvitation.error,
  );

  if (!organization || !viewer) {
    return <NotFoundState title={t("companies.notFound.title")} />;
  }

  const currentOrganization = organization;
  const currentViewer = viewer;
  const activeMembers = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const loadError = membersQuery.error ?? invitationsQuery.error;

  async function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }
    if (pendingAction.action === "demote") {
      await updateMember.mutateAsync({
        organizationId: currentOrganization.id,
        userId: pendingAction.member.user.id,
        role: "user",
      });
    } else {
      await removeMember.mutateAsync({
        organizationId: currentOrganization.id,
        userId: pendingAction.member.user.id,
      });
    }
    setPendingAction(null);
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError(t("companies.members.emailValidation"));
      return;
    }
    setInviteError(null);
    try {
      await inviteMember.mutateAsync({
        organizationId: currentOrganization.id,
        email,
      });
      setInviteEmail("");
      setInviteOpen(false);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : t("companies.members.inviteError"));
    }
  }

  return (
    <AdminSettingsShell activeItem="members" organization={currentOrganization}>
      <RouteHeader
        action={
          canAdminister ? (
            <Button onClick={() => setInviteOpen(true)} type="button">
              <Plus data-icon="inline-start" />
              {t("companies.members.invite")}
            </Button>
          ) : null
        }
        title={t("companies.members.title")}
        description={t("companies.members.description")}
      />
      {problem ? <ProblemDetailsAlert problem={problem} /> : null}
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("companies.members.loadError")}</AlertTitle>
          <AlertDescription>
            {loadError instanceof Error ? loadError.message : t("companies.members.loadError")}
          </AlertDescription>
        </Alert>
      ) : null}
      {!adminModel?.showMemberAdministration ? (
        <Alert>
          <Shield aria-hidden />
          <AlertTitle>{t("companies.personal")}</AlertTitle>
          <AlertDescription>{t("companies.personal.localAdminLimited")}</AlertDescription>
        </Alert>
      ) : null}
      <section className="flex min-h-0 flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">
            {t("companies.members.activeTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("companies.members.activeDescription")}
          </p>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("companies.members.user")}</TableHead>
                <TableHead>{t("companies.members.role")}</TableHead>
                {canAdminister ? <TableHead>{t("companies.members.actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.isPending ? (
                <TableRow>
                  <TableCell colSpan={canAdminister ? 3 : 2}>{t("state.loading")}</TableCell>
                </TableRow>
              ) : activeMembers.length ? (
                activeMembers.map((member) => {
                  const demoteSafety = canMutateOrganizationMember({
                    mode,
                    organization: currentOrganization,
                    viewerUserId: currentViewer.user.id,
                    targetUserId: member.user.id,
                    mutation: "demote",
                  });
                  const removeSafety = canMutateOrganizationMember({
                    mode,
                    organization: currentOrganization,
                    viewerUserId: currentViewer.user.id,
                    targetUserId: member.user.id,
                    mutation: "remove",
                  });

                  return (
                    <TableRow key={member.user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {member.user.displayName ?? member.user.id}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {member.user.email ?? member.user.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={member.role} />
                      </TableCell>
                      {canAdminister ? (
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={updateMember.isPending || member.role === "admin"}
                              onClick={() =>
                                updateMember.mutate({
                                  organizationId: currentOrganization.id,
                                  userId: member.user.id,
                                  role: "admin",
                                })
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Shield data-icon="inline-start" />
                              {t("companies.members.makeAdmin")}
                            </Button>
                            <Button
                              disabled={
                                updateMember.isPending ||
                                member.role === "user" ||
                                !demoteSafety.allowed
                              }
                              onClick={() => setPendingAction({ action: "demote", member })}
                              size="sm"
                              title={
                                !demoteSafety.allowed
                                  ? t("companies.members.demoteBlocked")
                                  : undefined
                              }
                              type="button"
                              variant="outline"
                            >
                              <Shield data-icon="inline-start" />
                              {t("companies.members.makeUser")}
                            </Button>
                            <Button
                              disabled={removeMember.isPending || !removeSafety.allowed}
                              onClick={() => setPendingAction({ action: "remove", member })}
                              size="sm"
                              title={
                                !removeSafety.allowed
                                  ? t("companies.members.demoteBlocked")
                                  : undefined
                              }
                              type="button"
                              variant="outline"
                            >
                              <Trash2 data-icon="inline-start" />
                              {t("companies.members.remove")}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={canAdminister ? 3 : 2}>
                    {t("companies.members.activeMembersEmpty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      {canAdminister ? (
        <section className="flex min-h-0 flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-normal">
              {t("companies.members.invitationsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("companies.members.invitationsDescription")}
            </p>
          </div>
          <div className="min-h-0 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("companies.members.email")}</TableHead>
                  <TableHead>{t("companies.members.role")}</TableHead>
                  <TableHead>{t("companies.members.status")}</TableHead>
                  <TableHead>{t("companies.members.invited")}</TableHead>
                  <TableHead>{t("companies.members.expires")}</TableHead>
                  <TableHead>{t("companies.members.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitationsQuery.isPending ? (
                  <TableRow>
                    <TableCell colSpan={6}>{t("state.loading")}</TableCell>
                  </TableRow>
                ) : invitations.length ? (
                  invitations.map((invitation) => (
                    <InvitationRow
                      invitation={invitation}
                      isRevoking={revokeInvitation.isPending}
                      key={invitation.id}
                      onRevoke={(id) => revokeInvitation.mutate(id)}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6}>{t("companies.members.pendingInvitesEmpty")}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
      <Dialog onOpenChange={(open) => !open && setPendingAction(null)} open={!!pendingAction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.action === "remove"
                ? t("companies.members.confirmRemoveTitle")
                : t("companies.members.confirmDemoteTitle")}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.action === "remove"
                ? t("companies.members.confirmRemoveDescription")
                : t("companies.members.confirmDemoteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                <X data-icon="inline-start" />
                {t("actions.cancel")}
              </Button>
            </DialogClose>
            <Button
              disabled={updateMember.isPending || removeMember.isPending}
              onClick={() => void confirmPendingAction()}
              type="button"
              variant={pendingAction?.action === "remove" ? "destructive" : "default"}
            >
              {pendingAction?.action === "remove" ? (
                <Trash2 data-icon="inline-start" />
              ) : (
                <Shield data-icon="inline-start" />
              )}
              {pendingAction?.action === "remove"
                ? t("companies.members.remove")
                : t("companies.members.makeUser")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet onOpenChange={setInviteOpen} open={inviteOpen}>
        <SheetContent>
          <form className="flex h-full flex-col gap-6" onSubmit={submitInvitation}>
            <SheetHeader>
              <SheetTitle>{t("companies.members.invite")}</SheetTitle>
              <SheetDescription>{t("companies.members.inviteDescription")}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-2">
              <Label htmlFor="organization-invite-email">{t("companies.members.email")}</Label>
              <Input
                autoComplete="email"
                id="organization-invite-email"
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setInviteError(null);
                }}
                placeholder={t("companies.members.emailPlaceholder")}
                type="email"
                value={inviteEmail}
              />
              <p className="text-sm text-muted-foreground">
                {t("companies.members.invitationsDescription")}
              </p>
              {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
            </div>
            <SheetFooter className="mt-auto">
              <Button onClick={() => setInviteOpen(false)} type="button" variant="outline">
                <X data-icon="inline-start" />
                {t("actions.cancel")}
              </Button>
              <Button disabled={inviteMember.isPending} type="submit">
                <Plus data-icon="inline-start" />
                {t("companies.members.invite")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </AdminSettingsShell>
  );
}

export function OrganizationProjectsRoute() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const { createProject, mode, selectProject, viewer } = useAppSession();
  const organization = findOrganization(viewer?.organizations, organizationId);
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  if (!organization) {
    return <NotFoundState title={t("companies.notFound.title")} />;
  }

  const currentOrganization = organization;

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    const slug = normalizeProjectSlug(projectSlug || projectName);
    if (!name || !slug) {
      setProjectError(t("projects.create.validation"));
      return;
    }
    setProjectError(null);
    setCreatingProject(true);
    try {
      const project = await createProject({
        organizationId: currentOrganization.id,
        name,
        slug,
      });
      setProjectName("");
      setProjectSlug("");
      setCreateProjectOpen(false);
      await selectProject(project.id);
      navigate("/traces");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : t("projects.create.error"));
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <AdminSettingsShell activeItem="projects" organization={currentOrganization}>
      <RouteHeader
        action={
          canAdministerMembers(currentOrganization.role) ? (
            <Button onClick={() => setCreateProjectOpen(true)} type="button">
              <Plus data-icon="inline-start" />
              {t("projects.create.submit")}
            </Button>
          ) : null
        }
        title={t("projects.title")}
        description={t("projects.organizationDescription")}
      />
      <div className="min-h-0 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("projects.title")}</TableHead>
              <TableHead>{t("value.slug")}</TableHead>
              <TableHead>{t("projects.status")}</TableHead>
              <TableHead>{t("projects.lastIngest")}</TableHead>
              <TableHead>{t("companies.members.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentOrganization.projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="font-mono text-xs">{project.slug}</TableCell>
                <TableCell>
                  <ProjectStatusBadge status={project.status} />
                </TableCell>
                <TableCell>{formatNullableDate(project.telemetry.lastIngestAt)}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/projects/${project.id}`}>
                      <FolderOpen data-icon="inline-start" />
                      {t("projects.open")}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {mode === "local" ? (
        <Alert>
          <Shield aria-hidden />
          <AlertTitle>{t("companies.personal")}</AlertTitle>
          <AlertDescription>{t("companies.personal.localAdminLimited")}</AlertDescription>
        </Alert>
      ) : null}
      <CreateProjectSheet
        creatingProject={creatingProject}
        onCreateProject={submitProject}
        onOpenChange={setCreateProjectOpen}
        open={createProjectOpen}
        projectError={projectError}
        projectName={projectName}
        projectSlug={projectSlug}
        setProjectName={(value) => {
          setProjectName(value);
          setProjectSlug((current) => current || normalizeProjectSlug(value));
        }}
        setProjectSlug={setProjectSlug}
      />
    </AdminSettingsShell>
  );
}

export function ProjectsRoute() {
  const navigate = useNavigate();
  const { createProject, mode, selectProject, viewer } = useAppSession();
  const [organizationId, setOrganizationId] = useState(() => initialOrganizationId(viewer));
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [search, setSearch] = useState("");
  const picker = useMemo(
    () => buildProjectPickerModel({ viewer, organizationId, search }),
    [organizationId, search, viewer],
  );
  const selectedOrganization = picker.organization;

  useEffect(() => {
    if (
      !organizationId ||
      !viewer?.organizations.some((organization) => organization.id === organizationId)
    ) {
      setOrganizationId(initialOrganizationId(viewer));
    }
  }, [organizationId, viewer]);

  async function openProject(project: Project) {
    await selectProject(project.id);
    navigate("/traces");
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganization) {
      return;
    }
    const name = projectName.trim();
    const slug = normalizeProjectSlug(projectSlug || projectName);
    if (!name || !slug) {
      setProjectError(t("projects.create.validation"));
      return;
    }
    setProjectError(null);
    setCreatingProject(true);
    try {
      const project = await createProject({
        organizationId: selectedOrganization.id,
        name,
        slug,
      });
      setProjectName("");
      setProjectSlug("");
      setCreateProjectOpen(false);
      await selectProject(project.id);
      navigate("/traces");
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : t("projects.create.error"));
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-8rem)] w-full items-start justify-center px-2 py-6">
      <div className="flex w-full max-w-5xl flex-col gap-5">
        <div className="flex flex-col gap-4 text-center">
          <div className="mx-auto flex items-center gap-2">
            <Badge variant="outline">{t("projects.workspaceLabel")}</Badge>
            {mode === "local" ? <Badge variant="secondary">{t("companies.personal")}</Badge> : null}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-normal">
              {viewer?.selectedProject ? t("projects.switchTitle") : t("projects.selectTitle")}
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("projects.selectDescription")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
          {viewer && viewer.organizations.length > 1 ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <Select
                aria-label={t("nav.companySelector")}
                onValueChange={setOrganizationId}
                value={selectedOrganization?.id ?? ""}
              >
                <SelectTrigger className="w-full min-w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {viewer.organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>
                        {companyName(organization)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <Building2 className="size-4 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">
                {selectedOrganization ? companyName(selectedOrganization) : t("companies.title")}
              </span>
            </div>
          )}
          <SearchInput
            aria-label={t("projects.searchPlaceholder")}
            containerClassName="min-w-0 flex-1"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("projects.searchPlaceholder")}
            value={search}
          />
          <Button onClick={() => setCreateProjectOpen(true)} type="button">
            <Plus data-icon="inline-start" />
            {t("projects.create.submit")}
          </Button>
        </div>

        {selectedOrganization ? (
          <ProjectPickerSurface
            onCreateProject={() => setCreateProjectOpen(true)}
            onOpenProject={(project) => void openProject(project)}
            picker={picker}
            selectedProjectId={viewer?.selectedProject?.id ?? null}
          />
        ) : (
          <Alert>
            <AlertTitle>{t("companies.notFound.title")}</AlertTitle>
            <AlertDescription>{t("state.notFound.description")}</AlertDescription>
          </Alert>
        )}

        {mode === "local" ? (
          <p className="text-center text-xs text-muted-foreground">
            {t("companies.personal")}: {t("projects.checklist.telemetry.description")}
          </p>
        ) : null}
      </div>
      <CreateProjectSheet
        creatingProject={creatingProject}
        onCreateProject={submitProject}
        onOpenChange={setCreateProjectOpen}
        open={createProjectOpen}
        projectError={projectError}
        projectName={projectName}
        projectSlug={projectSlug}
        setProjectName={(value) => {
          setProjectName(value);
          setProjectSlug((current) => current || normalizeProjectSlug(value));
        }}
        setProjectSlug={setProjectSlug}
      />
    </section>
  );
}

export function ProjectWorkspaceRedirectRoute() {
  const { projectId } = useParams();
  const { selectProject, viewer } = useAppSession();
  const project = findProject(viewer?.organizations, projectId);
  const isSelected = project ? viewer?.selectedProject?.id === project.id : false;

  useEffect(() => {
    if (project && !isSelected) {
      void selectProject(project.id);
    }
  }, [isSelected, project, selectProject]);

  if (!project) {
    return <NotFoundState title={t("projects.notFound.title")} />;
  }

  return isSelected ? <Navigate replace to="/traces" /> : null;
}

export function ProjectSettingsRoute() {
  const { projectId } = useParams();
  const location = useLocation();
  const { viewer } = useAppSession();
  const project = findProject(viewer?.organizations, projectId);
  const organization = viewer?.organizations.find(
    (candidate) => candidate.id === project?.organizationId,
  );

  if (!project) {
    return <NotFoundState title={t("projects.notFound.title")} />;
  }

  const activeSection = projectSettingsSectionFromPath(location.pathname);

  return (
    <ProjectSettingsShell activeSection={activeSection} project={project}>
      <RouteHeader
        title={projectSettingsTitle(activeSection)}
        description={projectSettingsDescription(activeSection)}
        eyebrow={<ProjectSettingsBreadcrumb activeSection={activeSection} project={project} />}
      />
      <ProjectSettingsContent
        activeSection={activeSection}
        organization={organization ?? null}
        project={project}
      />
    </ProjectSettingsShell>
  );
}

function ProjectPickerSurface({
  onCreateProject,
  onOpenProject,
  picker,
  selectedProjectId,
}: {
  onCreateProject: () => void;
  onOpenProject: (project: Project) => void;
  picker: ReturnType<typeof buildProjectPickerModel>;
  selectedProjectId: string | null;
}) {
  if (picker.emptyReason) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {picker.emptyReason === "no-projects"
              ? t("projects.empty.title")
              : t("projects.noFilterResults")}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {picker.emptyReason === "no-projects"
              ? t("projects.empty.description")
              : t("state.empty.filtered.description")}
          </p>
        </div>
        <Button onClick={onCreateProject} type="button">
          <Plus data-icon="inline-start" />
          {t("projects.create.submit")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {picker.projects.map((project) => (
        <SelectableProjectCard
          key={project.id}
          onOpenProject={onOpenProject}
          project={project}
          selected={project.id === selectedProjectId}
        />
      ))}
      <Button
        className="flex h-auto min-h-52 flex-col items-center justify-center gap-3 whitespace-normal rounded-lg border-dashed p-6 text-center"
        onClick={onCreateProject}
        type="button"
        variant="outline"
      >
        <span className="flex size-10 items-center justify-center rounded-md border bg-background">
          <Plus aria-hidden />
        </span>
        <span className="max-w-64 space-y-1">
          <span className="block font-medium">{t("projects.create.submit")}</span>
          <span className="block text-sm text-muted-foreground">
            {t("projects.create.description")}
          </span>
        </span>
      </Button>
    </div>
  );
}

function SelectableProjectCard({
  onOpenProject,
  project,
  selected,
}: {
  onOpenProject: (project: Project) => void;
  project: Project;
  selected: boolean;
}) {
  return (
    <Button
      className={cn(
        "group flex h-auto min-h-52 cursor-pointer flex-col items-stretch justify-start whitespace-normal rounded-lg text-left hover:border-ring hover:bg-accent/40",
        selected && "border-ring",
      )}
      onClick={() => onOpenProject(project)}
      type="button"
      variant="outline"
    >
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{project.name}</h2>
            <p className="truncate text-sm text-muted-foreground">{project.slug}</p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-2">
        <div className="grid gap-2 text-sm">
          <ProjectMetadataRow label={t("projects.traces")} value={project.telemetry.traceCount} />
          <ProjectMetadataRow label={t("projects.logs")} value={project.telemetry.logCount} />
          <ProjectMetadataRow
            label={t("projects.servicesLabel")}
            value={project.telemetry.serviceCount}
          />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {formatProjectCardLastIngest(project.telemetry.lastIngestAt)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground">
            {selected ? t("projects.openTelemetry") : t("projects.selectAndOpen")}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Button>
  );
}

function _ProjectOnboardingChecklist({
  companyName,
  isSelected,
  onConfirmProject,
  project,
}: {
  companyName: string;
  isSelected: boolean;
  onConfirmProject: () => Promise<void>;
  project: Project;
}) {
  const hasTelemetry =
    project.telemetry.traceCount > 0 ||
    project.telemetry.logCount > 0 ||
    project.telemetry.metricCount > 0 ||
    project.telemetry.serviceCount > 0;
  const steps = [
    {
      title: t("projects.checklist.confirm.title"),
      description: companyName
        ? `${t("projects.checklist.confirm.description")} ${companyName} / ${project.name}.`
        : `${t("projects.checklist.confirm.description")} ${project.name}.`,
      complete: isSelected,
      icon: CheckCircle2,
      action: (
        <Button
          onClick={() => void onConfirmProject()}
          size="sm"
          type="button"
          variant={isSelected ? "outline" : "default"}
        >
          <FolderOpen data-icon="inline-start" />
          {isSelected ? t("projects.selected") : t("projects.select")}
        </Button>
      ),
      secondaryAction: (
        <Button asChild size="sm" variant="ghost">
          <Link to="/projects">
            <FolderOpen data-icon="inline-start" />
            {t("projects.checklist.confirm.action")}
          </Link>
        </Button>
      ),
    },
    {
      title: t("projects.checklist.copy.title"),
      description: t("projects.checklist.copy.description"),
      complete: false,
      icon: ClipboardCopy,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link to={`/projects/${project.id}/settings/ingest`}>
            <ClipboardCopy data-icon="inline-start" />
            {t("projects.checklist.copy.action")}
          </Link>
        </Button>
      ),
    },
    {
      title: t("projects.checklist.telemetry.title"),
      description: hasTelemetry
        ? t("projects.checklist.telemetry.complete")
        : t("projects.checklist.telemetry.description"),
      complete: hasTelemetry,
      icon: TerminalSquare,
      action: (
        <Button asChild size="sm" variant="outline">
          <a href="/docs/03-operations/" rel="noreferrer" target="_blank">
            <TerminalSquare data-icon="inline-start" />
            {t("projects.checklist.telemetry.action")}
          </a>
        </Button>
      ),
    },
    {
      title: t("projects.checklist.investigate.title"),
      description: t("projects.checklist.investigate.description"),
      complete: hasTelemetry,
      icon: PlayCircle,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link to="/traces?mode=live">
            <PlayCircle data-icon="inline-start" />
            {t("projects.checklist.investigate.action")}
          </Link>
        </Button>
      ),
    },
    {
      title: t("projects.checklist.metrics.title"),
      description: t("projects.checklist.metrics.description"),
      complete: false,
      icon: LineChart,
      action: (
        <Button asChild size="sm" variant="outline">
          <Link to="/metrics">
            <LineChart data-icon="inline-start" />
            {t("projects.checklist.metrics.action")}
          </Link>
        </Button>
      ),
    },
    ...(aiEvalEnabled
      ? [
          {
            title: t("projects.checklist.aiEval.title"),
            description: t("projects.checklist.aiEval.description"),
            complete: false,
            icon: Activity,
            action: (
              <Button asChild size="sm" variant="outline">
                <Link to="/ai-eval">
                  <Activity data-icon="inline-start" />
                  {t("projects.checklist.aiEval.action")}
                </Link>
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <section className="flex min-h-0 flex-col gap-4 border-t pt-4">
      <RouteHeader
        title={t("projects.checklist.title")}
        description={t("projects.checklist.description")}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              className="grid min-h-32 grid-cols-[auto_minmax(0,1fr)] gap-3 border-b pb-3"
              key={step.title}
            >
              <span
                className={cn(
                  "mt-1 flex size-8 items-center justify-center rounded-md border",
                  step.complete && "border-success text-success",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-medium">{step.title}</h2>
                    {step.complete ? (
                      <Badge variant="secondary">{t("projects.checklist.complete")}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {step.action}
                  {"secondaryAction" in step ? (
                    step.secondaryAction
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <a href="/docs/03-operations/" rel="noreferrer" target="_blank">
                        <ExternalLink data-icon="inline-start" />
                        {t("projects.checklist.docs")}
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectSettingsShell({
  activeSection,
  children,
  project,
}: {
  activeSection: ReturnType<typeof projectSettingsSectionFromPath>;
  children: ReactNode;
  project: Project;
}) {
  const sections = buildProjectSettingsSections(project.id, { aiEvalEnabled });

  return (
    <section className="grid h-full min-h-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r pr-3">
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground">{t("projects.settings")}</p>
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
        </div>
        <nav className="grid gap-1" aria-label={t("projects.settings")}>
          {sections.map((section) => (
            <Link
              className={cn(
                "rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                section.id === activeSection && "bg-accent font-medium",
              )}
              key={section.id}
              to={section.href}
            >
              {projectSettingsNavLabel(section.id)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto">{children}</div>
    </section>
  );
}

function ProjectSettingsContent({
  activeSection,
  organization,
  project,
}: {
  activeSection: ReturnType<typeof projectSettingsSectionFromPath>;
  organization: Organization | null;
  project: Project;
}) {
  const { client } = useAppSession();
  if (activeSection === "general") {
    return (
      <SettingsFormSurface>
        <ReadOnlyField label={t("projects.create.name")} value={project.name} />
        <ReadOnlyField label={t("value.slug")} value={project.slug} />
        <ReadOnlyField
          label={t("nav.company")}
          value={organization ? companyName(organization) : t("value.unknown")}
        />
      </SettingsFormSurface>
    );
  }

  if (activeSection === "ingest") {
    return <ProjectIngestSettings client={client} project={project} />;
  }

  if (activeSection === "retention") {
    return <ProjectRetentionSettings client={client} project={project} />;
  }

  if (activeSection === "ai-eval") {
    return <ProjectAiEvalSettings client={client} project={project} />;
  }

  if (activeSection === "members") {
    return <ProjectMembersSettings client={client} project={project} />;
  }

  return null;
}

function ProjectAiEvalSettings({
  client,
  project,
}: {
  client: ReturnType<typeof useAppSession>["client"];
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const settingsQuery = useQuery({
    queryKey: queryKeys.projectAiSettings(project.id),
    queryFn: () => client.getProjectAiSettings(project.id),
  });
  const updateMutation = useMutation({
    mutationFn: client.updateProjectAiSettings,
    async onSuccess(settings) {
      setSaved(true);
      queryClient.setQueryData(queryKeys.projectAiSettings(project.id), settings);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectAiSettings(project.id) });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaved(false);
    updateMutation.mutate(toProjectAiSettingsInput(settings, form.get("enabled") === "on"));
  }

  return (
    <SettingsFormSurface>
      {settingsQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{t("projects.settings.aiEvalLoadError")}</p>
          <Button
            onClick={() => void settingsQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw data-icon="inline-start" />
            {t("actions.retry")}
          </Button>
        </div>
      ) : null}
      <form className="grid max-w-4xl gap-5" onSubmit={submit}>
        <div className="flex items-start gap-3 border-b pb-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
            <Bot className="size-4" aria-hidden />
          </span>
          <div className="grid gap-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <input
                className="size-4 accent-primary"
                defaultChecked={settingsQuery.data?.enabled ?? false}
                disabled={!settingsQuery.data || updateMutation.isPending}
                name="enabled"
                type="checkbox"
              />
              {t("projects.settings.aiEvalEnabled")}
            </Label>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("projects.settings.aiEvalEnabledDescription")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReadOnlyField
            label={t("projects.settings.aiEvalProviders")}
            value={
              settingsQuery.data
                ? String(settingsQuery.data.providerProfiles.length)
                : t("state.loading")
            }
          />
          <ReadOnlyField
            label={t("projects.settings.aiEvalModelAliases")}
            value={
              settingsQuery.data
                ? String(settingsQuery.data.modelAliases.length)
                : t("state.loading")
            }
          />
          <ReadOnlyField
            label={t("projects.settings.aiEvalOnlinePolicies")}
            value={
              settingsQuery.data
                ? String(settingsQuery.data.onlinePolicies.length)
                : t("state.loading")
            }
          />
          <ReadOnlyField
            label={t("projects.settings.aiEvalBudget")}
            value={
              settingsQuery.data
                ? `${formatUsd(settingsQuery.data.budget.spentTodayUsd)} / ${formatUsd(
                    settingsQuery.data.budget.dailyUsd,
                  )}`
                : t("state.loading")
            }
          />
        </div>

        {settingsQuery.data?.effective.warnings.length ? (
          <Alert>
            <AlertTitle>{t("projects.settings.aiEvalWarnings")}</AlertTitle>
            <AlertDescription>{settingsQuery.data.effective.warnings.join(", ")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!settingsQuery.data || updateMutation.isPending} type="submit">
            <Save data-icon="inline-start" />
            {t("projects.settings.aiEvalSave")}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/ai-eval">
              <ArrowRight data-icon="inline-start" />
              {t("projects.settings.aiEvalOpenWorkspace")}
            </Link>
          </Button>
          {saved ? (
            <span className="text-sm text-muted-foreground">
              {t("projects.settings.aiEvalSaved")}
            </span>
          ) : null}
          {updateMutation.isError ? (
            <span className="text-sm text-destructive">{t("projects.settings.aiEvalError")}</span>
          ) : null}
        </div>
      </form>
    </SettingsFormSurface>
  );
}

function ProjectRetentionSettings({
  client,
  project,
}: {
  client: ReturnType<typeof useAppSession>["client"];
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const policyQuery = useQuery({
    queryKey: queryKeys.retentionPolicy(project.id),
    queryFn: () => client.getRetentionPolicy(project.id),
  });
  const updateMutation = useMutation({
    mutationFn: client.updateRetentionPolicy,
    async onSuccess(policy) {
      setSaved(true);
      queryClient.setQueryData(queryKeys.retentionPolicy(project.id), policy);
      await queryClient.invalidateQueries({ queryKey: queryKeys.retentionPolicy(project.id) });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const policy = policyQuery.data;
    if (!policy) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const rules = policy.rules.map((rule) => {
      const dataClass = rule.dataClass;
      const mode = String(form.get(`${dataClass}:mode`) ?? rule.mode) as RetentionMode;
      const retentionDays = numberField(form.get(`${dataClass}:retentionDays`));
      const softDeleteDays = numberField(form.get(`${dataClass}:softDeleteDays`));
      return {
        dataClass,
        mode,
        ...(mode !== "retain" && retentionDays ? { retentionDays } : {}),
        ...(mode === "soft_delete_then_delete" && softDeleteDays ? { softDeleteDays } : {}),
      };
    });
    setSaved(false);
    updateMutation.mutate({
      projectId: project.id,
      expectedVersion: policy.version,
      rules,
    });
  }

  return (
    <SettingsFormSurface>
      {policyQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{t("projects.settings.retentionLoadError")}</p>
          <Button
            onClick={() => void policyQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw data-icon="inline-start" />
            {t("actions.retry")}
          </Button>
        </div>
      ) : null}
      <form className="grid gap-4" onSubmit={submit}>
        <div className="min-h-0 overflow-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("projects.settings.retentionDataClass")}</TableHead>
                <TableHead>{t("projects.settings.retentionMode")}</TableHead>
                <TableHead>{t("projects.settings.retentionDays")}</TableHead>
                <TableHead>{t("projects.settings.softDeleteDays")}</TableHead>
                <TableHead>{t("projects.settings.policyVersion")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policyQuery.isLoading ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-sm text-muted-foreground" colSpan={5}>
                    {t("state.loading")}
                  </TableCell>
                </TableRow>
              ) : null}
              {(policyQuery.data?.rules ?? []).map((rule) => (
                <RetentionRuleRow key={rule.dataClass} rule={rule} />
              ))}
              {policyQuery.isSuccess && policyQuery.data.rules.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-sm text-muted-foreground" colSpan={5}>
                    {t("value.none")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!policyQuery.data?.rules.length || updateMutation.isPending}
            type="submit"
          >
            <Save data-icon="inline-start" />
            {t("projects.settings.retentionSave")}
          </Button>
          {saved ? (
            <span className="text-sm text-muted-foreground">
              {t("projects.settings.retentionSaved")}
            </span>
          ) : null}
          {updateMutation.isError ? (
            <span className="text-sm text-destructive">
              {t("projects.settings.retentionError")}
            </span>
          ) : null}
        </div>
      </form>
    </SettingsFormSurface>
  );
}

function RetentionRuleRow({ rule }: { rule: RetentionRule }) {
  const [mode, setMode] = useState<RetentionMode>(rule.mode);
  const retentionDaysDisabled = mode === "retain";
  const softDeleteDaysDisabled = mode !== "soft_delete_then_delete";

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{retentionDataClassLabel(rule.dataClass)}</span>
          <span className="font-mono text-xs text-muted-foreground">{rule.dataClass}</span>
        </div>
      </TableCell>
      <TableCell>
        <Select
          aria-label={`${retentionDataClassLabel(rule.dataClass)} ${t(
            "projects.settings.retentionMode",
          )}`}
          name={`${rule.dataClass}:mode`}
          onValueChange={(value) => setMode(value as RetentionMode)}
          value={mode}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {retentionModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {retentionModeLabel(mode)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${retentionDataClassLabel(rule.dataClass)} ${t(
            "projects.settings.retentionDays",
          )}`}
          className="w-28"
          defaultValue={rule.retentionDays ?? ""}
          disabled={retentionDaysDisabled}
          min={1}
          max={365}
          name={`${rule.dataClass}:retentionDays`}
          type="number"
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${retentionDataClassLabel(rule.dataClass)} ${t(
            "projects.settings.softDeleteDays",
          )}`}
          className="w-28"
          defaultValue={rule.softDeleteDays ?? ""}
          disabled={softDeleteDaysDisabled}
          min={1}
          max={90}
          name={`${rule.dataClass}:softDeleteDays`}
          type="number"
        />
      </TableCell>
      <TableCell className="font-mono text-xs">{rule.version}</TableCell>
    </TableRow>
  );
}

function ProjectMembersSettings({
  client,
  project,
}: {
  client: ReturnType<typeof useAppSession>["client"];
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(project.id),
    queryFn: () => client.getProjectMembers(project.id),
  });
  const updateMutation = useMutation({
    mutationFn: client.updateProjectMember,
    async onSuccess() {
      setUserId("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) });
    },
  });
  const removeMutation = useMutation({
    mutationFn: ({ projectId, memberUserId }: { projectId: string; memberUserId: string }) =>
      client.removeProjectMember(projectId, memberUserId),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      return;
    }
    updateMutation.mutate({ projectId: project.id, userId: trimmedUserId, role });
  }

  const hasLocalPersonalMember = membersQuery.data?.some(
    (member) => member.source === "local_personal",
  );

  return (
    <SettingsFormSurface>
      {hasLocalPersonalMember ? (
        <Alert>
          <Shield aria-hidden />
          <AlertTitle>{t("projects.settings.localPersonalAdmin")}</AlertTitle>
          <AlertDescription>{t("projects.settings.localPersonalRestriction")}</AlertDescription>
        </Alert>
      ) : null}
      {!hasLocalPersonalMember ? (
        <form
          className="grid gap-2 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
          onSubmit={submit}
        >
          <div className="grid gap-1">
            <Label htmlFor="project-member-user-id">{t("projects.settings.userId")}</Label>
            <Input
              id="project-member-user-id"
              onChange={(event) => setUserId(event.currentTarget.value)}
              placeholder={t("projects.settings.userIdPlaceholder")}
              value={userId}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="project-member-role">{t("companies.members.role")}</Label>
            <Select onValueChange={(value) => setRole(value as ProjectRole)} value={role}>
              <SelectTrigger id="project-member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {projectRoles.map((candidateRole) => (
                    <SelectItem key={candidateRole} value={candidateRole}>
                      {candidateRole}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="self-end"
            disabled={!userId.trim() || updateMutation.isPending}
            type="submit"
          >
            <Save data-icon="inline-start" />
            {t("projects.settings.saveMember")}
          </Button>
        </form>
      ) : null}
      {membersQuery.isError ? (
        <p className="text-sm text-destructive">{t("projects.settings.membersLoadError")}</p>
      ) : null}
      {updateMutation.isError || removeMutation.isError ? (
        <p className="text-sm text-destructive">{t("projects.settings.membersError")}</p>
      ) : null}
      <div className="min-h-0 overflow-auto border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("projects.settings.memberUser")}</TableHead>
              <TableHead>{t("companies.members.role")}</TableHead>
              <TableHead>{t("projects.settings.effectiveRole")}</TableHead>
              <TableHead>{t("projects.settings.memberSource")}</TableHead>
              <TableHead>{t("companies.members.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(membersQuery.data ?? []).map((member) => (
              <ProjectMemberRow
                key={`${member.source}:${member.userId}`}
                member={member}
                onRemove={() =>
                  removeMutation.mutate({ projectId: project.id, memberUserId: member.userId })
                }
                onRoleChange={(nextRole) =>
                  updateMutation.mutate({
                    projectId: project.id,
                    userId: member.userId,
                    role: nextRole,
                  })
                }
                pending={updateMutation.isPending || removeMutation.isPending}
              />
            ))}
            {membersQuery.isSuccess && membersQuery.data.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-sm text-muted-foreground" colSpan={5}>
                  {t("value.none")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </SettingsFormSurface>
  );
}

function ProjectMemberRow({
  member,
  onRemove,
  onRoleChange,
  pending,
}: {
  member: ProjectMember;
  onRemove: () => void;
  onRoleChange: (role: ProjectRole) => void;
  pending: boolean;
}) {
  const isImplied = member.source !== "direct";
  const restriction =
    member.source === "local_personal"
      ? t("projects.settings.localPersonalRestriction")
      : t("projects.settings.impliedMemberRestriction");

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{member.displayName ?? member.userId}</span>
          <span className="truncate text-sm text-muted-foreground">
            {member.email ?? member.userId}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Select
          aria-label={`${member.userId} ${t("companies.members.role")}`}
          disabled={isImplied || pending}
          onValueChange={(value) => onRoleChange(value as ProjectRole)}
          value={member.role}
        >
          <SelectTrigger title={isImplied ? restriction : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {projectRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <RoleBadge role={member.effectiveRole} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-xs">{member.source}</span>
          {member.source === "local_personal" ? (
            <span className="text-xs text-muted-foreground">
              {t("projects.settings.localPersonalAdmin")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Button
          disabled={isImplied || pending}
          onClick={onRemove}
          size="sm"
          title={isImplied ? restriction : undefined}
          type="button"
          variant="outline"
        >
          <Trash2 data-icon="inline-start" />
          {t("projects.settings.removeMember")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProjectIngestSettings({
  client,
  project,
}: {
  client: ReturnType<typeof useAppSession>["client"];
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<CreatedIngestCredential | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{
    id: string;
    title: string;
    secretPreview: string;
  } | null>(null);
  const credentialsQuery = useQuery({
    queryKey: ["IngestCredentials", project.id],
    queryFn: () => client.getIngestCredentials(project.id),
  });
  const createMutation = useMutation({
    mutationFn: client.createIngestCredential,
    async onSuccess(result) {
      setCreated(result);
      setTitle("");
      queryClient.setQueryData<IngestCredentialListResult>(
        ["IngestCredentials", project.id],
        (current) => mergeCreatedIngestCredential(current, result),
      );
      await queryClient.invalidateQueries({ queryKey: ["IngestCredentials", project.id] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: client.revokeIngestCredential,
    async onSuccess() {
      setPendingRevoke(null);
      await queryClient.invalidateQueries({ queryKey: ["IngestCredentials", project.id] });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    createMutation.mutate({ projectId: project.id, title: trimmed });
  };

  return (
    <SettingsFormSurface>
      <ProjectSetupSummary project={project} secret={created?.secret ?? null} />
      {created ? (
        <Alert>
          <KeyRound aria-hidden />
          <AlertTitle>{t("projects.credentials.createdTitle")}</AlertTitle>
          <AlertDescription>{t("projects.credentials.createdDescription")}</AlertDescription>
        </Alert>
      ) : null}
      <section className="grid gap-3 border-t pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("projects.credentials.title")}</h2>
          <Button
            aria-label={t("actions.retry")}
            onClick={() => void credentialsQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
        <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submit}>
          <div className="grid gap-1">
            <Label htmlFor="ingest-key-title">{t("projects.credentials.titleLabel")}</Label>
            <Input
              id="ingest-key-title"
              maxLength={80}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder={t("projects.credentials.titlePlaceholder")}
              value={title}
            />
          </div>
          <Button
            className="self-end"
            disabled={!title.trim() || createMutation.isPending}
            type="submit"
          >
            <Plus data-icon="inline-start" />
            {t("projects.credentials.create")}
          </Button>
        </form>
        {createMutation.isError ? (
          <p className="text-sm text-destructive">{t("projects.credentials.createError")}</p>
        ) : null}
        {revokeMutation.isError ? (
          <p className="text-sm text-destructive">{t("projects.credentials.revokeError")}</p>
        ) : null}
        <div className="overflow-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("projects.credentials.table.title")}</TableHead>
                <TableHead>{t("projects.credentials.table.preview")}</TableHead>
                <TableHead>{t("projects.credentials.table.created")}</TableHead>
                <TableHead>{t("projects.credentials.table.lastUsed")}</TableHead>
                <TableHead>{t("projects.credentials.table.status")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentialsQuery.data?.items.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell className="font-medium">{credential.title}</TableCell>
                  <TableCell className="font-mono text-xs">{credential.secretPreview}</TableCell>
                  <TableCell>{formatNullableDate(credential.createdAt)}</TableCell>
                  <TableCell>{formatNullableDate(credential.lastUsedAt ?? null)}</TableCell>
                  <TableCell>
                    {credential.revokedAt
                      ? t("projects.credentials.revoked")
                      : t("projects.credentials.active")}
                  </TableCell>
                  <TableCell>
                    <Button
                      aria-label={t("projects.credentials.revoke")}
                      disabled={Boolean(credential.revokedAt) || revokeMutation.isPending}
                      onClick={() =>
                        setPendingRevoke({
                          id: credential.id,
                          title: credential.title,
                          secretPreview: credential.secretPreview,
                        })
                      }
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {credentialsQuery.isSuccess && credentialsQuery.data.items.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-sm text-muted-foreground" colSpan={6}>
                    {t("projects.credentials.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <Dialog
          onOpenChange={(open) => !open && setPendingRevoke(null)}
          open={pendingRevoke !== null}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("projects.credentials.revoke")}</DialogTitle>
              <DialogDescription>
                {pendingRevoke
                  ? `${pendingRevoke.title} · ${pendingRevoke.secretPreview}. ${t(
                      "projects.settings.storedSecretsHidden",
                    )}`
                  : t("projects.settings.storedSecretsHidden")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  <X data-icon="inline-start" />
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={revokeMutation.isPending}
                onClick={() => pendingRevoke && revokeMutation.mutate(pendingRevoke.id)}
                type="button"
                variant="destructive"
              >
                <Trash2 data-icon="inline-start" />
                {t("projects.credentials.revoke")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </SettingsFormSurface>
  );
}

function AdminSettingsShell({
  activeItem,
  children,
  organization,
}: {
  activeItem: "organization" | "projects" | "members";
  children: ReactNode;
  organization: Organization;
}) {
  return (
    <section
      aria-label={`${companyName(organization)} ${adminNavLabel(activeItem)}`}
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-auto"
    >
      {children}
    </section>
  );
}

function CreateProjectSheet({
  creatingProject,
  onCreateProject,
  onOpenChange,
  open,
  projectError,
  projectName,
  projectSlug,
  setProjectName,
  setProjectSlug,
}: {
  creatingProject: boolean;
  onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectError: string | null;
  projectName: string;
  projectSlug: string;
  setProjectName: (value: string) => void;
  setProjectSlug: (value: string) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full sm:max-w-[420px]" side="right">
        <SheetHeader>
          <SheetTitle>{t("projects.create.title")}</SheetTitle>
          <SheetDescription>{t("projects.create.description")}</SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-4 px-4" onSubmit={onCreateProject}>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">{t("projects.create.name")}</Label>
            <Input
              id="project-name"
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={t("projects.create.namePlaceholder")}
              value={projectName}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-slug">{t("projects.create.slug")}</Label>
            <Input
              id="project-slug"
              onChange={(event) => setProjectSlug(normalizeProjectSlug(event.target.value))}
              placeholder={t("projects.create.slugPlaceholder")}
              value={projectSlug}
            />
          </div>
          {projectError ? <p className="text-xs text-destructive">{projectError}</p> : null}
          <SheetFooter className="mt-auto px-0">
            <Button className="w-full" disabled={creatingProject} type="submit">
              <FolderOpen data-icon="inline-start" />
              {creatingProject ? t("projects.create.creating") : t("projects.create.submit")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function mergeCreatedIngestCredential(
  current: IngestCredentialListResult | undefined,
  created: CreatedIngestCredential,
): IngestCredentialListResult {
  const items = current?.items.filter((item) => item.id !== created.credential.id) ?? [];
  return { items: [created.credential, ...items] };
}

function ProjectSetupSummary({ project, secret }: { project: Project; secret?: string | null }) {
  const endpoint = "http://localhost:4318";
  const setupSnippet = buildProjectSetupSnippet(endpoint, secret);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 border-b pb-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <ReadOnlyField label={t("projects.settings.endpoint")} value={endpoint} />
          <CopyButton aria-label={t("projects.settings.copyEndpoint")} value={endpoint} />
        </div>
        <ReadOnlyField label={t("projects.title")} value={project.name} />
      </div>
      {secret ? (
        <div className="grid gap-2 border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label>{t("projects.credentials.oneTimeSecret")}</Label>
            <CopyButton aria-label={t("actions.copy")} value={secret} />
          </div>
          <CodeBlock
            code={secret}
            language="bash"
            maxHeightClassName="max-h-28"
            title={t("projects.credentials.oneTimeSecret")}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Label>{t("projects.checklist.copy.title")}</Label>
          <CopyButton aria-label={t("actions.copy")} value={setupSnippet} />
        </div>
        <CodeBlock
          code={setupSnippet}
          language="bash"
          maxHeightClassName="max-h-56"
          title={t("projects.checklist.copy.title")}
        />
      </div>
    </div>
  );
}

export function buildProjectSetupSnippet(endpoint: string, secret?: string | null) {
  return secret
    ? `export CLOUDGRID_PROJECT_API_KEY='${secret}'
export OTEL_EXPORTER_OTLP_ENDPOINT='${endpoint}'`
    : `export OTEL_EXPORTER_OTLP_ENDPOINT='${endpoint}'`;
}

function SettingsFormSurface({ children }: { children: ReactNode }) {
  return <div className="grid gap-4">{children}</div>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function ProjectMetadataRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value.toLocaleString()}</span>
    </div>
  );
}

function RouteHeader({
  action,
  eyebrow,
  title,
  description,
}: {
  action?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function ProjectSettingsBreadcrumb({
  activeSection,
  project,
}: {
  activeSection: ReturnType<typeof projectSettingsSectionFromPath>;
  project: Project;
}) {
  const parentHref = activeSection === "general" ? "/projects" : `/projects/${project.id}/settings`;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Button aria-label="Back" asChild size="icon-sm" variant="ghost">
        <Link to={parentHref}>
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <nav aria-label={t("projects.settings")} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1">
          <li>
            <Link className="hover:text-foreground" to="/projects">
              {t("nav.projects")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="min-w-0">
            <Link className="block truncate hover:text-foreground" to={`/projects/${project.id}`}>
              {project.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link className="hover:text-foreground" to={`/projects/${project.id}/settings`}>
              {t("projects.settings")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="truncate text-foreground">{projectSettingsTitle(activeSection)}</li>
        </ol>
      </nav>
    </div>
  );
}

const projectRoles: ProjectRole[] = ["viewer", "editor", "admin"];
const retentionModes: RetentionMode[] = ["retain", "delete", "soft_delete_then_delete"];

function RoleBadge({ role }: { role: "admin" | "user" | "viewer" | "editor" }) {
  return <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>;
}

function InvitationRow({
  invitation,
  isRevoking,
  onRevoke,
}: {
  invitation: OrganizationInvitation;
  isRevoking: boolean;
  onRevoke: (id: string) => void;
}) {
  const canRevoke = invitation.status === "pending";

  return (
    <TableRow>
      <TableCell className="font-medium">{invitation.email}</TableCell>
      <TableCell>
        <RoleBadge role={invitation.role} />
      </TableCell>
      <TableCell>
        <Badge variant={canRevoke ? "secondary" : "outline"}>{invitation.status}</Badge>
      </TableCell>
      <TableCell>{formatNullableDate(invitation.createdAt)}</TableCell>
      <TableCell>{formatNullableDate(invitation.expiresAt)}</TableCell>
      <TableCell>
        <Button
          disabled={!canRevoke || isRevoking}
          onClick={() => onRevoke(invitation.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Trash2 data-icon="inline-start" />
          {t("companies.members.revokeInvite")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  return <Badge variant={status === "active" ? "secondary" : "outline"}>{status}</Badge>;
}

function ProblemDetailsAlert({
  problem,
}: {
  problem: NonNullable<ReturnType<typeof memberMutationProblemDetails>>;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{problem.title}</AlertTitle>
      <AlertDescription>
        <span>{problem.detail}</span>
        <span className="block text-xs">
          {problem.id} · {problem.code} · {problem.status}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function NotFoundState({ title }: { title: string }) {
  return (
    <section className="max-w-2xl">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{t("state.notFound.description")}</AlertDescription>
      </Alert>
    </section>
  );
}

function findOrganization(
  organizations: Organization[] | undefined,
  organizationId: string | undefined,
) {
  return organizations?.find((organization) => organization.id === organizationId);
}

function findProject(organizations: Organization[] | undefined, projectId: string | undefined) {
  return organizations
    ?.flatMap((organization) => organization.projects)
    .find((project) => project.id === projectId);
}

function normalizeProjectSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function companyName(organization: Organization) {
  return organization.id === "local" ? t("companies.personal") : organization.name;
}

function formatNullableDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : t("value.none");
}

function formatProjectCardLastIngest(value: string | null | undefined) {
  return value ? formatDateTime(value) : t("projects.noIngestYet");
}

function numberField(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toProjectAiSettingsInput(
  settings: ProjectAiSettings,
  enabled: boolean,
): UpdateProjectAiSettingsInput {
  return {
    projectId: settings.projectId,
    enabled,
    defaultProviderProfileId: settings.defaultProviderProfileId ?? null,
    defaultJudgeProfileId: settings.defaultJudgeProfileId ?? null,
    defaultOptimizerProfileId: settings.defaultOptimizerProfileId ?? null,
    defaultEmbeddingProfileId: settings.defaultEmbeddingProfileId ?? null,
    providerProfiles: settings.providerProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      providerKind: profile.providerKind,
      baseUrl: profile.baseUrl ?? null,
      credentialRef: profile.credentialRef ?? null,
      models: profile.models,
      timeoutMs: profile.timeoutMs,
      maxConcurrency: profile.maxConcurrency ?? null,
      disabled: Boolean(profile.disabledAt),
    })),
    modelAliases: settings.modelAliases.map((alias) => ({
      id: alias.id,
      name: alias.name,
      providerProfileId: alias.providerProfileId,
      model: alias.model,
      purpose: alias.purpose,
      parameters: alias.parameters,
    })),
    onlinePolicies: settings.onlinePolicies.map((policy) => ({
      id: policy.id,
      enabled: policy.enabled,
      name: policy.name,
      target: policy.target,
      scorerIds: policy.scorerIds,
      sampleRate: policy.sampleRate,
      maxDailyRuns: policy.maxDailyRuns ?? null,
      annotationRules: policy.annotationRules.map((rule) => ({
        reason: rule.reason,
        threshold: rule.threshold ?? null,
        assignTo: rule.assignTo ?? null,
        datasetId: rule.datasetId ?? null,
      })),
    })),
    budget: {
      dailyUsd: settings.budget.dailyUsd,
      perRunUsd: settings.budget.perRunUsd ?? null,
      deterministicOnly: settings.budget.deterministicOnly,
    },
    sampling: settings.sampling,
    datasetDefaults: settings.datasetDefaults,
    expectedVersion: settings.version,
  };
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function retentionDataClassLabel(dataClass: RetentionDataClass) {
  const labels: Record<RetentionDataClass, string> = {
    TRACES: "Traces",
    LOGS: "Logs",
    METRICS: "Metrics",
    AI_EVALS: "AI evals",
    DATASETS: "Datasets",
    SCORERS: "Scorers",
    DASHBOARD_HISTORY: "Dashboard history",
    INGEST_CREDENTIAL_AUDIT: "Ingest credential audit",
  };
  return labels[dataClass];
}

function retentionModeLabel(mode: RetentionMode) {
  const labels: Record<RetentionMode, string> = {
    retain: "Retain",
    delete: "Delete",
    soft_delete_then_delete: "Soft delete, then delete",
  };
  return labels[mode];
}

function adminNavLabel(id: "organization" | "projects" | "members") {
  if (id === "projects") {
    return t("nav.projects");
  }
  if (id === "members") {
    return t("companies.members.title");
  }
  return t("companies.title");
}

function projectSettingsNavLabel(id: "general" | "ingest" | "retention" | "ai-eval" | "members") {
  if (id === "general") {
    return t("projects.settings.general");
  }
  if (id === "ingest") {
    return t("projects.settings.apiKeys");
  }
  if (id === "retention") {
    return t("projects.settings.retention");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEval");
  }
  if (id === "members") {
    return t("projects.settings.members");
  }
  return t("projects.settings.general");
}

function projectSettingsTitle(id: "general" | "ingest" | "retention" | "ai-eval" | "members") {
  if (id === "general") {
    return t("projects.settings.general");
  }
  if (id === "ingest") {
    return t("projects.settings.apiKeys");
  }
  if (id === "retention") {
    return t("projects.settings.retention");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEval");
  }
  if (id === "members") {
    return t("projects.settings.members");
  }
  return t("projects.settings.general");
}

function projectSettingsDescription(
  id: "general" | "ingest" | "retention" | "ai-eval" | "members",
) {
  if (id === "ingest") {
    return t("projects.settings.setupDescription");
  }
  if (id === "retention") {
    return t("projects.settings.retentionDescription");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEvalDescription");
  }
  if (id === "members") {
    return t("projects.settings.projectMembersDescription");
  }
  return t("projects.settingsDescription");
}

function projectSettingsSectionFromPath(pathname: string) {
  if (pathname.endsWith("/general")) {
    return "general" as const;
  }
  if (pathname.endsWith("/ingest")) {
    return "ingest" as const;
  }
  if (pathname.endsWith("/retention")) {
    return "retention" as const;
  }
  if (pathname.endsWith("/ai-eval")) {
    return "ai-eval" as const;
  }
  if (pathname.endsWith("/members")) {
    return "members" as const;
  }
  return "general" as const;
}
