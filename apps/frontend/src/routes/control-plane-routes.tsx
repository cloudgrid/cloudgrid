import type {
  AiModelAlias,
  AiModelPurpose,
  AiProviderKind,
  AiProviderProfile,
  CompanyAiProviderSettings,
  CreatedIngestCredential,
  IngestCredentialListResult,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  Project,
  ProjectAiProviderSettings,
  ProjectAiSettings,
  ProjectMember,
  ProjectRole,
  RetentionDataClass,
  RetentionMode,
  RetentionRule,
  UpdateCompanyAiProviderSettingsInput,
  UpdateProjectAiProviderSettingsInput,
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
  SlidersHorizontal,
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
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "../components/ui/field";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { aiChatProviderQueryKey } from "../features/ai-chat/view-model";
import {
  buildAdminSettingsModel,
  buildProjectPickerModel,
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
import { useBrand } from "../providers/brand-provider";
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
  const { productName } = useBrand();
  const { organizationId } = useParams();
  const { client, isBackendUnavailable, mode, refetchViewer, viewer } = useAppSession();
  const queryClient = useQueryClient();
  const organization = findOrganization(viewer?.organizations, organizationId);
  const adminModel = organization ? buildAdminSettingsModel({ mode, organization }) : null;
  const canAdminister =
    !!adminModel?.showMemberAdministration && canAdministerMembers(organization?.role);
  const canMutateMembers = canAdminister && !isBackendUnavailable;
  const [pendingAction, setPendingAction] = useState<{
    action: "demote" | "remove";
    member: OrganizationMember;
  } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const membersQuery = useQuery({
    enabled: !!organization && !!adminModel?.showMemberAdministration && !isBackendUnavailable,
    queryKey: organization
      ? queryKeys.organizationMembers(organization.id)
      : ["OrganizationMembers"],
    queryFn: () => client.getOrganizationMembers(organization?.id ?? ""),
  });
  const invitationsQuery = useQuery({
    enabled: canMutateMembers,
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
          canMutateMembers ? (
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
      {isBackendUnavailable ? (
        <Alert variant="destructive">
          <Shield aria-hidden />
          <AlertTitle>{t("companies.members.loadError")}</AlertTitle>
          <AlertDescription>
            {t("backend.unavailable.description", { productName })}
          </AlertDescription>
          <Button onClick={() => void refetchViewer()} size="sm" type="button" variant="outline">
            <RefreshCw data-icon="inline-start" />
            {t("actions.retry")}
          </Button>
        </Alert>
      ) : null}
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
      {!isBackendUnavailable ? (
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
                  {canMutateMembers ? (
                    <TableHead>{t("companies.members.actions")}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isBackendUnavailable && membersQuery.isPending ? (
                  <TableRow>
                    <TableCell colSpan={canMutateMembers ? 3 : 2}>{t("state.loading")}</TableCell>
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
                        {canMutateMembers ? (
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
                    <TableCell colSpan={canMutateMembers ? 3 : 2}>
                      {t("companies.members.activeMembersEmpty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
      {canMutateMembers ? (
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
                {!isBackendUnavailable && invitationsQuery.isPending ? (
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

export function OrganizationAiProviderRoute() {
  const { productName } = useBrand();
  const { organizationId } = useParams();
  const { client, isBackendUnavailable, refetchViewer, viewer } = useAppSession();
  const queryClient = useQueryClient();
  const organization = findOrganization(viewer?.organizations, organizationId);
  const [saved, setSaved] = useState(false);
  const [providerKind, setProviderKind] = useState<AiProviderKind>("openai");
  const [formError, setFormError] = useState<string | null>(null);
  const settingsQuery = useQuery({
    enabled: !!organization && !isBackendUnavailable,
    queryKey: organization
      ? aiChatProviderQueryKey(organization.id)
      : ["CompanyAiProviderSettings"],
    queryFn: () => client.getCompanyAiProviderSettings(organization?.id ?? ""),
  });
  const updateMutation = useMutation({
    mutationFn: client.updateCompanyAiProviderSettings,
    async onSuccess(settings) {
      setSaved(true);
      queryClient.setQueryData(aiChatProviderQueryKey(settings.companyId), settings);
      await queryClient.invalidateQueries({ queryKey: aiChatProviderQueryKey(settings.companyId) });
    },
  });

  useEffect(() => {
    const nextKind = settingsQuery.data?.providerProfile?.providerKind;
    if (nextKind) {
      setProviderKind(nextKind);
    }
  }, [settingsQuery.data?.providerProfile?.providerKind]);

  if (!organization) {
    return <NotFoundState title={t("companies.notFound.title")} />;
  }

  if (organization.role !== "admin") {
    return (
      <AdminSettingsShell activeItem="ai-provider" organization={organization}>
        <RouteHeader
          title={t("companies.aiProvider.title")}
          description={t("companies.aiProvider.description")}
        />
        <Alert variant="destructive">
          <Shield aria-hidden />
          <AlertTitle>{t("companies.aiProvider.forbiddenTitle")}</AlertTitle>
          <AlertDescription>{t("companies.aiProvider.forbiddenDescription")}</AlertDescription>
        </Alert>
      </AdminSettingsShell>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const input = toCompanyAiProviderSettingsInput(settings, form, providerKind);
    if (!input) {
      setFormError(t("companies.aiProvider.validation"));
      return;
    }
    setFormError(null);
    setSaved(false);
    updateMutation.mutate(input);
  }

  const settings = settingsQuery.data;
  const profile = settings?.providerProfile ?? null;
  const alias = settings?.chatModelAlias ?? null;
  const preservedCredentialRef =
    profile?.credentialRef && isAllowedAiCredentialRef(profile.credentialRef)
      ? profile.credentialRef
      : "";
  const profileParameters = readJsonObject(profile?.parameters);
  const region = readString(profileParameters.region);
  const deployment = readString(profileParameters.deployment);

  return (
    <AdminSettingsShell activeItem="ai-provider" organization={organization}>
      <RouteHeader
        title={t("companies.aiProvider.title")}
        description={t("companies.aiProvider.description")}
      />
      <SettingsFormSurface>
        {isBackendUnavailable ? (
          <Alert variant="destructive">
            <Shield aria-hidden />
            <AlertTitle>{t("companies.aiProvider.loadError")}</AlertTitle>
            <AlertDescription>
              {t("backend.unavailable.description", { productName })}
            </AlertDescription>
            <Button onClick={() => void refetchViewer()} size="sm" type="button" variant="outline">
              <RefreshCw data-icon="inline-start" />
              {t("actions.retry")}
            </Button>
          </Alert>
        ) : null}
        {!isBackendUnavailable && settingsQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">{t("companies.aiProvider.loadError")}</p>
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
        {!isBackendUnavailable ? (
          <form className="grid max-w-4xl gap-5" onSubmit={submit}>
            <div className="grid gap-3 border-y py-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="company-ai-label">
                  {t("companies.aiProvider.label")}
                </FieldLabel>
                <Input
                  defaultValue={profile?.label ?? t("companies.aiProvider.defaultLabel")}
                  disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                  id="company-ai-label"
                  name="label"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="company-ai-kind">
                  {t("companies.aiProvider.providerKind")}
                </FieldLabel>
                <Select
                  disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                  onValueChange={(value) => setProviderKind(value as AiProviderKind)}
                  value={providerKind}
                >
                  <SelectTrigger id="company-ai-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {aiProviderKinds.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {aiProviderKindLabel(kind)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="company-ai-credential-value">
                  {t("companies.aiProvider.credentialValue")}
                </FieldLabel>
                <Input
                  autoComplete="off"
                  disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                  id="company-ai-credential-value"
                  name="credentialValue"
                  placeholder={
                    preservedCredentialRef
                      ? t("companies.aiProvider.credentialValuePlaceholderExisting")
                      : "sk-..."
                  }
                  type="password"
                />
                <input name="credentialRef" type="hidden" value={preservedCredentialRef} />
                <FieldDescription>
                  {t("companies.aiProvider.credentialRefDescription")}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="company-ai-model">
                  {t("companies.aiProvider.chatModel")}
                </FieldLabel>
                <Input
                  defaultValue={alias?.model ?? firstChatModel(profile) ?? "gpt-5-mini"}
                  disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                  id="company-ai-model"
                  name="model"
                  placeholder="gpt-5-mini"
                />
              </Field>
              {providerKind === "azure_foundry" || providerKind === "openai_compatible" ? (
                <Field>
                  <FieldLabel htmlFor="company-ai-base-url">
                    {t("companies.aiProvider.baseUrl")}
                  </FieldLabel>
                  <Input
                    defaultValue={profile?.baseUrl ?? ""}
                    disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                    id="company-ai-base-url"
                    name="baseUrl"
                    placeholder="https://example.openai.azure.com"
                    type="url"
                  />
                </Field>
              ) : null}
              {providerKind === "azure_foundry" ? (
                <Field>
                  <FieldLabel htmlFor="company-ai-deployment">
                    {t("companies.aiProvider.deployment")}
                  </FieldLabel>
                  <Input
                    defaultValue={deployment}
                    disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                    id="company-ai-deployment"
                    name="deployment"
                  />
                </Field>
              ) : null}
              {providerKind === "aws_bedrock" ? (
                <Field>
                  <FieldLabel htmlFor="company-ai-region">
                    {t("companies.aiProvider.region")}
                  </FieldLabel>
                  <Input
                    defaultValue={region}
                    disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                    id="company-ai-region"
                    name="region"
                    placeholder="us-east-1"
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="company-ai-timeout">
                  {t("companies.aiProvider.timeoutMs")}
                </FieldLabel>
                <Input
                  defaultValue={profile?.timeoutMs ?? 30000}
                  disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                  id="company-ai-timeout"
                  min="1000"
                  name="timeoutMs"
                  step="1000"
                  type="number"
                />
              </Field>
            </div>

            {settings?.effective.warnings.length ? (
              <Alert>
                <AlertTitle>{t("companies.aiProvider.warnings")}</AlertTitle>
                <AlertDescription>{settings.effective.warnings.join(", ")}</AlertDescription>
              </Alert>
            ) : null}
            {settings?.effective.missingChatProvider ? (
              <Alert>
                <Bot aria-hidden />
                <AlertTitle>{t("companies.aiProvider.missingTitle")}</AlertTitle>
                <AlertDescription>{t("companies.aiProvider.missingDescription")}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!settings || updateMutation.isPending || isBackendUnavailable}
                type="submit"
              >
                <Save data-icon="inline-start" />
                {t("companies.aiProvider.save")}
              </Button>
              {!isBackendUnavailable ? (
                <Button asChild type="button" variant="outline">
                  <Link to="/ai-chat">
                    <Bot data-icon="inline-start" />
                    {t("companies.aiProvider.openChat")}
                  </Link>
                </Button>
              ) : null}
              {saved ? (
                <span className="text-sm text-muted-foreground">
                  {t("companies.aiProvider.saved")}
                </span>
              ) : null}
              {formError ? <span className="text-sm text-destructive">{formError}</span> : null}
              {updateMutation.isError ? (
                <span className="text-sm text-destructive">
                  {t("companies.aiProvider.saveError")}
                </span>
              ) : null}
            </div>
          </form>
        ) : null}
      </SettingsFormSurface>
    </AdminSettingsShell>
  );
}

export function OrganizationProjectsRoute() {
  const { organizationId } = useParams();
  const { mode, viewer } = useAppSession();
  const organization = findOrganization(viewer?.organizations, organizationId);

  if (!organization) {
    return <NotFoundState title={t("companies.notFound.title")} />;
  }

  const currentOrganization = organization;

  return (
    <AdminSettingsShell activeItem="projects" organization={currentOrganization}>
      <RouteHeader
        action={
          canAdministerMembers(currentOrganization.role) ? (
            <Button asChild type="button">
              <Link
                to={`/projects/new?organizationId=${encodeURIComponent(currentOrganization.id)}`}
              >
                <Plus data-icon="inline-start" />
                {t("projects.create.submit")}
              </Link>
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
    </AdminSettingsShell>
  );
}

export function ProjectsRoute() {
  const navigate = useNavigate();
  const { mode, selectProject, viewer } = useAppSession();
  const [organizationId, setOrganizationId] = useState(() => initialOrganizationId(viewer));
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
          <Button asChild type="button">
            <Link
              to={
                selectedOrganization
                  ? `/projects/new?organizationId=${encodeURIComponent(selectedOrganization.id)}`
                  : "/projects/new"
              }
            >
              <Plus data-icon="inline-start" />
              {t("projects.create.submit")}
            </Link>
          </Button>
        </div>

        {selectedOrganization ? (
          <ProjectPickerSurface
            createProjectHref={`/projects/new?organizationId=${encodeURIComponent(
              selectedOrganization.id,
            )}`}
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
    </section>
  );
}

export function ProjectCreateRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createProject, selectProject, viewer } = useAppSession();
  const searchParams = new URLSearchParams(location.search);
  const requestedOrganizationId =
    searchParams.get("organizationId") ?? initialOrganizationId(viewer);
  const fallbackOrganization = viewer?.organizations[0] ?? null;
  const requestedOrganization =
    viewer?.organizations.find((organization) => organization.id === requestedOrganizationId) ??
    fallbackOrganization;
  const [activeTab, setActiveTab] = useState<ProjectCreateTab>("identity");
  const [projectName, setProjectName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [organizationId, setOrganizationId] = useState(requestedOrganization?.id ?? "");
  const [fieldErrors, setFieldErrors] = useState<ProjectCreateFieldErrors>({});
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const selectedOrganization =
    viewer?.organizations.find((organization) => organization.id === organizationId) ??
    requestedOrganization;
  const validation = validateProjectCreateDraft({
    name: projectName,
    organizationId: organizationId || selectedOrganization?.id || "",
    slug: projectSlug,
  });

  useEffect(() => {
    if (!organizationId && requestedOrganization?.id) {
      setOrganizationId(requestedOrganization.id);
    }
  }, [organizationId, requestedOrganization]);

  useEffect(() => {
    const hasDraft = projectName.trim() || projectSlug.trim();
    if (!hasDraft) {
      return;
    }
    function confirmUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", confirmUnload);
    return () => window.removeEventListener("beforeunload", confirmUnload);
  }, [projectName, projectSlug]);

  function applyValidation(errors = validation) {
    setFieldErrors(errors.fields);
    setSummaryError(errors.valid ? null : t("projects.create.validation"));
    return errors.valid;
  }

  function goToTab(tab: ProjectCreateTab) {
    if (projectCreateTabIndex(tab) > projectCreateTabIndex(activeTab) && !applyValidation()) {
      setActiveTab(projectCreateFirstInvalidTab(validation));
      return;
    }
    setActiveTab(tab);
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateProjectCreateDraft({
      name: projectName,
      organizationId: organizationId || selectedOrganization?.id || "",
      slug: projectSlug,
    });
    if (!applyValidation(errors)) {
      setActiveTab(projectCreateFirstInvalidTab(errors));
      return;
    }
    setCreatingProject(true);
    try {
      const project = await createProject({
        organizationId: organizationId || selectedOrganization?.id || "",
        name: projectName.trim(),
        slug: normalizeProjectSlug(projectSlug),
      });
      await selectProject(project.id);
      navigate("/traces");
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : t("projects.create.error"));
    } finally {
      setCreatingProject(false);
    }
  }

  const tabErrors = validation.tabs;
  const cancelHref = selectedOrganization
    ? `/organizations/${selectedOrganization.id}/projects`
    : "/projects";

  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-auto px-2 py-4">
      <RouteHeader
        eyebrow={<ProjectCreateBreadcrumb organizationId={selectedOrganization?.id ?? null} />}
        title={t("projects.create.submit")}
        description={t("projects.create.description")}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button asChild size="sm" type="button" variant="outline">
              <Link to={cancelHref}>
                <ArrowLeft data-icon="inline-start" />
                {t("actions.cancel")}
              </Link>
            </Button>
            <Button
              disabled={activeTab === "identity" || creatingProject}
              onClick={() => setActiveTab(projectCreatePreviousTab(activeTab))}
              size="sm"
              type="button"
              variant="outline"
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
            {activeTab === projectCreateTabs.at(-1)?.id ? (
              <Button disabled={creatingProject} form="project-create-form" size="sm" type="submit">
                <Plus data-icon="inline-start" />
                {t("projects.create.submit")}
              </Button>
            ) : (
              <Button
                disabled={creatingProject}
                onClick={() => goToTab(projectCreateNextTab(activeTab))}
                size="sm"
                type="button"
              >
                <ArrowRight data-icon="inline-start" />
                Continue
              </Button>
            )}
          </div>
        }
      />
      <form
        className="flex min-h-0 flex-col gap-4"
        id="project-create-form"
        onSubmit={submitProject}
      >
        {summaryError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("state.error.title")}</AlertTitle>
            <AlertDescription>{summaryError}</AlertDescription>
          </Alert>
        ) : null}
        <Tabs
          className="flex min-h-0 flex-col gap-4"
          onValueChange={(value) => goToTab(value as ProjectCreateTab)}
          value={activeTab}
        >
          <TabsList className="grid h-auto grid-cols-2 lg:grid-cols-4">
            {projectCreateTabs.map((tab) => (
              <TabsTrigger
                aria-invalid={tabErrors[tab.id] ? true : undefined}
                key={tab.id}
                value={tab.id}
              >
                {tabErrors[tab.id] ? <Shield className="text-destructive" aria-hidden /> : null}
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent className="m-0" value="identity">
            <SettingsFormSurface>
              <Field>
                <FieldLabel htmlFor="project-create-name">
                  {t("projects.create.name")} <span aria-hidden>*</span>
                </FieldLabel>
                <Input
                  aria-invalid={fieldErrors.name ? true : undefined}
                  id="project-create-name"
                  onChange={(event) => {
                    const value = event.target.value;
                    setProjectName(value);
                    setProjectSlug((current) => current || normalizeProjectSlug(value));
                  }}
                  value={projectName}
                />
                {fieldErrors.name ? (
                  <FieldDescription className="text-destructive">
                    {fieldErrors.name}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    {t("projects.create.nameDescription")}
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="project-create-slug">
                  {t("value.slug")} <span aria-hidden>*</span>
                </FieldLabel>
                <Input
                  aria-invalid={fieldErrors.slug ? true : undefined}
                  id="project-create-slug"
                  onChange={(event) => setProjectSlug(normalizeProjectSlug(event.target.value))}
                  value={projectSlug}
                />
                <FieldDescription className={fieldErrors.slug ? "text-destructive" : undefined}>
                  {fieldErrors.slug ??
                    t("projects.create.slugDescription")}
                </FieldDescription>
              </Field>
            </SettingsFormSurface>
          </TabsContent>
          <TabsContent className="m-0" value="access">
            <SettingsFormSurface>
              <Field>
                <FieldLabel htmlFor="project-create-organization">
                  {t("nav.company")} <span aria-hidden>*</span>
                </FieldLabel>
                <Select
                  onValueChange={(value) => {
                    setOrganizationId(value);
                    navigate(`/projects/new?organizationId=${encodeURIComponent(value)}`, {
                      replace: true,
                    });
                  }}
                  value={organizationId}
                >
                  <SelectTrigger
                    aria-invalid={fieldErrors.organizationId ? true : undefined}
                    id="project-create-organization"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(viewer?.organizations ?? []).map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>
                          {companyName(organization)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription
                  className={fieldErrors.organizationId ? "text-destructive" : undefined}
                >
                  {fieldErrors.organizationId ??
                    t("projects.create.organizationDescription")}
                </FieldDescription>
              </Field>
            </SettingsFormSurface>
          </TabsContent>
        </Tabs>
      </form>
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

  if (projectId === "new") {
    return <ProjectCreateRoute />;
  }

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
  createProjectHref,
  onOpenProject,
  picker,
  selectedProjectId,
}: {
  createProjectHref: string;
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
        <Button asChild type="button">
          <Link to={createProjectHref}>
            <Plus data-icon="inline-start" />
            {t("projects.create.submit")}
          </Link>
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
        asChild
        className="flex h-auto min-h-52 flex-col items-center justify-center gap-3 whitespace-normal rounded-lg border-dashed p-6 text-center"
        type="button"
        variant="outline"
      >
        <Link to={createProjectHref}>
          <span className="flex size-10 items-center justify-center rounded-md border bg-background">
            <Plus aria-hidden />
          </span>
          <span className="max-w-64 space-y-1">
            <span className="block font-medium">{t("projects.create.submit")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("projects.create.description")}
            </span>
          </span>
        </Link>
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
          <a href="/handbook/guides/ingest-otlp" rel="noreferrer" target="_blank">
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
                      <a href="/handbook/operations" rel="noreferrer" target="_blank">
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
  const base = `/projects/${encodeURIComponent(project.id)}/settings`;
  const sections: Array<{ id: ProjectSettingsSectionId; href: string }> = [
    { id: "identity", href: base },
    { id: "access", href: `${base}/members` },
    { id: "setup", href: `${base}/setup` },
    { id: "ingest", href: `${base}/ingest` },
    { id: "retention", href: `${base}/retention` },
    { id: "ai-providers", href: `${base}/ai-providers` },
    ...(aiEvalEnabled ? ([{ id: "ai-eval", href: `${base}/ai-eval` }] as const) : []),
  ];

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid gap-3 border-b pb-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("projects.settings")}</p>
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
        </div>
        <div
          aria-label={t("projects.settings")}
          className="flex gap-1 overflow-x-auto"
          role="tablist"
        >
          {sections.map((section) => (
            <Link
              aria-selected={section.id === activeSection}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                section.id === activeSection && "bg-accent font-medium",
              )}
              key={section.id}
              role="tab"
              to={section.href}
            >
              {projectSettingsNavLabel(section.id)}
            </Link>
          ))}
        </div>
      </div>
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
  if (activeSection === "identity") {
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

  if (activeSection === "access") {
    return <ProjectMembersSettings client={client} project={project} />;
  }

  if (activeSection === "setup") {
    return <ProjectSetupSettings project={project} />;
  }

  if (activeSection === "ingest") {
    return <ProjectIngestSettings client={client} project={project} />;
  }

  if (activeSection === "retention") {
    return <ProjectRetentionSettings client={client} project={project} />;
  }

  if (activeSection === "ai-providers") {
    return <ProjectAiProviderSettingsEditor client={client} project={project} />;
  }

  if (activeSection === "ai-eval") {
    return <ProjectAiEvalSettings client={client} project={project} />;
  }

  return null;
}

function ProjectSetupSettings({ project }: { project: Project }) {
  return (
    <SettingsFormSurface>
      <ReadOnlyField label={t("projects.settings.endpoint")} value="/otlp/v1/traces" />
      <div className="flex flex-wrap gap-2">
        <Button asChild type="button" variant="outline">
          <Link to={`/projects/${project.id}/settings/ingest`}>
            <KeyRound data-icon="inline-start" />
            {t("projects.settings.apiKeys")}
          </Link>
        </Button>
        <Button asChild type="button" variant="outline">
          <Link to="/traces?mode=live">
            <PlayCircle data-icon="inline-start" />
            {t("projects.checklist.investigate.action")}
          </Link>
        </Button>
      </div>
    </SettingsFormSurface>
  );
}

type ProjectAiProviderProfileDraft = {
  draftId: string;
  id: string;
  label: string;
  providerKind: AiProviderKind;
  baseUrl: string;
  credentialRef: string;
  credentialValue: string;
  deployment: string;
  region: string;
  timeoutMs: string;
  maxConcurrency: string;
  disabled: boolean;
};

type ProjectAiModelAliasDraft = {
  draftId: string;
  id: string;
  name: string;
  providerProfileId: string;
  model: string;
  purpose: AiModelPurpose;
  temperature: string;
  maxOutputTokens: string;
};

function ProjectAiProviderSettingsEditor({
  client,
  project,
}: {
  client: ReturnType<typeof useAppSession>["client"];
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftsLoadedVersion, setDraftsLoadedVersion] = useState<number | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<ProjectAiProviderProfileDraft[]>([]);
  const [aliasDrafts, setAliasDrafts] = useState<ProjectAiModelAliasDraft[]>([]);
  const settingsQuery = useQuery({
    queryKey: projectAiProviderSettingsQueryKey(project.id),
    queryFn: () => client.getProjectAiProviderSettings(project.id),
  });
  const updateMutation = useMutation({
    mutationFn: client.updateProjectAiProviderSettings,
    async onSuccess(settings) {
      setSaved(true);
      queryClient.setQueryData(projectAiProviderSettingsQueryKey(settings.projectId), settings);
      await queryClient.invalidateQueries({
        queryKey: projectAiProviderSettingsQueryKey(settings.projectId),
      });
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    setProfileDrafts(settingsQuery.data.providerProfiles.map(toProjectProviderProfileDraft));
    setAliasDrafts(settingsQuery.data.modelAliases.map(toProjectModelAliasDraft));
    setDraftsLoadedVersion(settingsQuery.data.version);
  }, [settingsQuery.data]);

  const profileRows =
    settingsQuery.data && draftsLoadedVersion !== settingsQuery.data.version
      ? settingsQuery.data.providerProfiles.map(toProjectProviderProfileDraft)
      : profileDrafts;
  const aliasRows =
    settingsQuery.data && draftsLoadedVersion !== settingsQuery.data.version
      ? settingsQuery.data.modelAliases.map(toProjectModelAliasDraft)
      : aliasDrafts;

  function addProfile() {
    const id = `provider-${profileRows.length + 1}`;
    setProfileDrafts((drafts) => [
      ...drafts,
      {
        draftId: `new-profile-${Date.now()}`,
        id,
        label: t("projects.aiProviders.newProvider"),
        providerKind: "openai",
        baseUrl: "",
        credentialRef: "",
        credentialValue: "",
        deployment: "",
        region: "",
        timeoutMs: "30000",
        maxConcurrency: "",
        disabled: false,
      },
    ]);
    setFormError(null);
    setSaved(false);
  }

  function removeProfile(draftId: string) {
    const profile = profileRows.find((draft) => draft.draftId === draftId);
    setProfileDrafts((drafts) => drafts.filter((draft) => draft.draftId !== draftId));
    if (profile) {
      setAliasDrafts((drafts) => drafts.filter((draft) => draft.providerProfileId !== profile.id));
    }
    setSaved(false);
  }

  function updateProfile(draftId: string, patch: Partial<ProjectAiProviderProfileDraft>) {
    setProfileDrafts((drafts) =>
      drafts.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
    setSaved(false);
  }

  function addAlias() {
    const providerProfileId = profileRows[0]?.id ?? "";
    setAliasDrafts((drafts) => [
      ...drafts,
      {
        draftId: `new-alias-${Date.now()}`,
        id: `alias-${drafts.length + 1}`,
        name: "default",
        providerProfileId,
        model: "gpt-5-mini",
        purpose: "default",
        temperature: "",
        maxOutputTokens: "",
      },
    ]);
    setFormError(null);
    setSaved(false);
  }

  function removeAlias(draftId: string) {
    setAliasDrafts((drafts) => drafts.filter((draft) => draft.draftId !== draftId));
    setSaved(false);
  }

  function updateAlias(draftId: string, patch: Partial<ProjectAiModelAliasDraft>) {
    setAliasDrafts((drafts) =>
      drafts.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
    setSaved(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }
    const input = toProjectAiProviderSettingsInput(settings, profileRows, aliasRows);
    if (!input) {
      setFormError(
        t("projects.aiProviders.validation"),
      );
      return;
    }
    setFormError(null);
    setSaved(false);
    updateMutation.mutate(input);
  }

  return (
    <SettingsFormSurface>
      {settingsQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{t("projects.aiProviders.loadError")}</p>
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
      <form className="grid max-w-5xl gap-6" onSubmit={submit}>
        <section className="grid gap-3 border-y py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{t("projects.aiProviders.profiles")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("projects.aiProviders.profilesDescription")}
              </p>
            </div>
            <Button
              disabled={!settingsQuery.data || updateMutation.isPending}
              onClick={addProfile}
              type="button"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              {t("projects.aiProviders.addProvider")}
            </Button>
          </div>
          {profileRows.length > 0 ? (
            <div className="grid gap-3">
              {profileRows.map((profile) => (
                <div className="grid gap-3 border p-3" key={profile.draftId}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{profile.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {profile.id} · {aiProviderKindLabel(profile.providerKind)}
                      </p>
                    </div>
                    <Button
                      aria-label={t("projects.aiProviders.removeProvider", {
                        providerLabel: profile.label,
                      })}
                      disabled={updateMutation.isPending}
                      onClick={() => removeProfile(profile.draftId)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field>
                      <FieldLabel htmlFor={`project-ai-provider-label-${profile.draftId}`}>
                        {t("projects.aiProviders.label")}
                      </FieldLabel>
                      <Input
                        id={`project-ai-provider-label-${profile.draftId}`}
                        onChange={(event) =>
                          updateProfile(profile.draftId, { label: event.target.value })
                        }
                        value={profile.label}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`project-ai-provider-kind-${profile.draftId}`}>
                        {t("projects.aiProviders.providerKind")}
                      </FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          updateProfile(profile.draftId, {
                            providerKind: value as AiProviderKind,
                          })
                        }
                        value={profile.providerKind}
                      >
                        <SelectTrigger id={`project-ai-provider-kind-${profile.draftId}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {aiProviderKinds.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {aiProviderKindLabel(kind)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`project-ai-provider-credential-${profile.draftId}`}>
                        {t("projects.aiProviders.credentialValue")}
                      </FieldLabel>
                      <Input
                        autoComplete="off"
                        id={`project-ai-provider-credential-${profile.draftId}`}
                        onChange={(event) =>
                          updateProfile(profile.draftId, { credentialValue: event.target.value })
                        }
                        placeholder={
                          profile.credentialRef
                            ? t("companies.aiProvider.credentialValuePlaceholderExisting")
                            : "sk-..."
                        }
                        type="password"
                        value={profile.credentialValue}
                      />
                      <input name="credentialRef" type="hidden" value={profile.credentialRef} />
                      <FieldDescription>
                        {profile.credentialRef
                          ? t("projects.aiProviders.existingReference", {
                              credentialRef: profile.credentialRef,
                            })
                          : t("companies.aiProvider.credentialRefDescription")}
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`project-ai-provider-timeout-${profile.draftId}`}>
                        {t("companies.aiProvider.timeoutMs")}
                      </FieldLabel>
                      <Input
                        id={`project-ai-provider-timeout-${profile.draftId}`}
                        min="1000"
                        onChange={(event) =>
                          updateProfile(profile.draftId, { timeoutMs: event.target.value })
                        }
                        step="1000"
                        type="number"
                        value={profile.timeoutMs}
                      />
                    </Field>
                    {profile.providerKind === "azure_foundry" ||
                    profile.providerKind === "openai_compatible" ? (
                      <Field>
                        <FieldLabel htmlFor={`project-ai-provider-base-url-${profile.draftId}`}>
                          {t("companies.aiProvider.baseUrl")}
                        </FieldLabel>
                        <Input
                          id={`project-ai-provider-base-url-${profile.draftId}`}
                          onChange={(event) =>
                            updateProfile(profile.draftId, { baseUrl: event.target.value })
                          }
                          placeholder="https://example.openai.azure.com"
                          type="url"
                          value={profile.baseUrl}
                        />
                      </Field>
                    ) : null}
                    {profile.providerKind === "azure_foundry" ? (
                      <Field>
                        <FieldLabel htmlFor={`project-ai-provider-deployment-${profile.draftId}`}>
                          {t("companies.aiProvider.deployment")}
                        </FieldLabel>
                        <Input
                          id={`project-ai-provider-deployment-${profile.draftId}`}
                          onChange={(event) =>
                            updateProfile(profile.draftId, { deployment: event.target.value })
                          }
                          value={profile.deployment}
                        />
                      </Field>
                    ) : null}
                    {profile.providerKind === "aws_bedrock" ? (
                      <Field>
                        <FieldLabel htmlFor={`project-ai-provider-region-${profile.draftId}`}>
                          {t("companies.aiProvider.region")}
                        </FieldLabel>
                        <Input
                          id={`project-ai-provider-region-${profile.draftId}`}
                          onChange={(event) =>
                            updateProfile(profile.draftId, { region: event.target.value })
                          }
                          placeholder="us-east-1"
                          value={profile.region}
                        />
                      </Field>
                    ) : null}
                    <Field>
                      <FieldLabel htmlFor={`project-ai-provider-concurrency-${profile.draftId}`}>
                        {t("projects.aiProviders.maxParallel")}
                      </FieldLabel>
                      <Input
                        id={`project-ai-provider-concurrency-${profile.draftId}`}
                        min="1"
                        onChange={(event) =>
                          updateProfile(profile.draftId, { maxConcurrency: event.target.value })
                        }
                        step="1"
                        type="number"
                        value={profile.maxConcurrency}
                      />
                    </Field>
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={profile.disabled}
                        onCheckedChange={(checked) =>
                          updateProfile(profile.draftId, { disabled: checked === true })
                        }
                      />
                      {t("alerts.disabled")}
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {t("projects.aiProviders.noProfiles")}
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{t("projects.aiProviders.modelAliases")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("projects.aiProviders.modelAliasesDescription")}
              </p>
            </div>
            <Button
              disabled={!settingsQuery.data || updateMutation.isPending || profileRows.length === 0}
              onClick={addAlias}
              type="button"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              {t("projects.aiProviders.addAlias")}
            </Button>
          </div>
          {aliasRows.length > 0 ? (
            <div className="grid gap-3">
              {aliasRows.map((alias) => (
                <div
                  className="grid gap-3 border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_2.5rem]"
                  key={alias.draftId}
                >
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-name-${alias.draftId}`}>
                      {t("projects.aiProviders.aliasName")}
                    </FieldLabel>
                    <Input
                      id={`project-ai-alias-name-${alias.draftId}`}
                      onChange={(event) => updateAlias(alias.draftId, { name: event.target.value })}
                      value={alias.name}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-model-${alias.draftId}`}>
                      {t("projects.aiProviders.model")}
                    </FieldLabel>
                    <Input
                      id={`project-ai-alias-model-${alias.draftId}`}
                      onChange={(event) =>
                        updateAlias(alias.draftId, { model: event.target.value })
                      }
                      placeholder="gpt-5-mini"
                      value={alias.model}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-purpose-${alias.draftId}`}>
                      {t("projects.aiProviders.purpose")}
                    </FieldLabel>
                    <Select
                      onValueChange={(value) =>
                        updateAlias(alias.draftId, { purpose: value as AiModelPurpose })
                      }
                      value={alias.purpose}
                    >
                      <SelectTrigger id={`project-ai-alias-purpose-${alias.draftId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {aiModelPurposes.map((purpose) => (
                            <SelectItem key={purpose} value={purpose}>
                              {purpose}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    aria-label={t("projects.aiProviders.removeAlias", { aliasName: alias.name })}
                    className="self-end"
                    disabled={updateMutation.isPending}
                    onClick={() => removeAlias(alias.draftId)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-provider-${alias.draftId}`}>
                      {t("projects.aiProviders.providerProfile")}
                    </FieldLabel>
                    <Select
                      onValueChange={(value) =>
                        updateAlias(alias.draftId, { providerProfileId: value })
                      }
                      value={alias.providerProfileId}
                    >
                      <SelectTrigger id={`project-ai-alias-provider-${alias.draftId}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {profileRows.map((profile) => (
                            <SelectItem key={profile.draftId} value={profile.id}>
                              {profile.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-temperature-${alias.draftId}`}>
                      {t("projects.aiProviders.temperature")}
                    </FieldLabel>
                    <Input
                      id={`project-ai-alias-temperature-${alias.draftId}`}
                      max="2"
                      min="0"
                      onChange={(event) =>
                        updateAlias(alias.draftId, { temperature: event.target.value })
                      }
                      step="0.1"
                      type="number"
                      value={alias.temperature}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`project-ai-alias-output-${alias.draftId}`}>
                      {t("projects.aiProviders.maxOutputTokens")}
                    </FieldLabel>
                    <Input
                      id={`project-ai-alias-output-${alias.draftId}`}
                      min="1"
                      onChange={(event) =>
                        updateAlias(alias.draftId, { maxOutputTokens: event.target.value })
                      }
                      step="1"
                      type="number"
                      value={alias.maxOutputTokens}
                    />
                  </Field>
                </div>
              ))}
            </div>
          ) : (
            <p className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {t("projects.aiProviders.noAliases")}
            </p>
          )}
        </section>

        {settingsQuery.data?.effective.warnings.length ? (
          <Alert>
            <AlertTitle>{t("projects.settings.aiEvalWarnings")}</AlertTitle>
            <AlertDescription>{settingsQuery.data.effective.warnings.join(", ")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!settingsQuery.data || updateMutation.isPending} type="submit">
            <Save data-icon="inline-start" />
            {t("projects.aiProviders.save")}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to={`/projects/${encodeURIComponent(project.id)}/settings/ai-eval`}>
              <SlidersHorizontal data-icon="inline-start" />
              {t("projects.aiProviders.openAiEvalPolicy")}
            </Link>
          </Button>
          {saved ? (
            <span className="text-sm text-muted-foreground">
              {t("projects.aiProviders.saved")}
            </span>
          ) : null}
          {formError ? <span className="text-sm text-destructive">{formError}</span> : null}
          {updateMutation.isError ? (
            <span className="text-sm text-destructive">
              {t("projects.aiProviders.saveError")}
            </span>
          ) : null}
        </div>
      </form>
    </SettingsFormSurface>
  );
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
    updateMutation.mutate(toProjectAiSettingsInput(settings, form.get("enabled") === "on", form));
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
              <Checkbox
                defaultChecked={settingsQuery.data?.enabled ?? false}
                disabled={!settingsQuery.data || updateMutation.isPending}
                name="enabled"
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

        {settingsQuery.data ? (
          <div className="grid gap-5 border-y py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ai-eval-default-provider">
                  {t("projects.settings.aiEvalDefaultProvider")}
                </FieldLabel>
                <Input
                  defaultValue={settingsQuery.data.defaultProviderProfileId ?? ""}
                  id="ai-eval-default-provider"
                  name="defaultProviderProfileId"
                  placeholder="provider profile id"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-eval-default-judge">
                  {t("projects.settings.aiEvalDefaultJudge")}
                </FieldLabel>
                <Input
                  defaultValue={settingsQuery.data.defaultJudgeProfileId ?? ""}
                  id="ai-eval-default-judge"
                  name="defaultJudgeProfileId"
                  placeholder="judge provider profile id"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="ai-eval-daily-budget">
                  {t("projects.settings.aiEvalDailyBudgetUsd")}
                </FieldLabel>
                <Input
                  defaultValue={settingsQuery.data.budget.dailyUsd}
                  id="ai-eval-daily-budget"
                  min="0"
                  name="budgetDailyUsd"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-eval-per-run-budget">
                  {t("projects.settings.aiEvalPerRunBudgetUsd")}
                </FieldLabel>
                <Input
                  defaultValue={settingsQuery.data.budget.perRunUsd ?? ""}
                  id="ai-eval-per-run-budget"
                  min="0"
                  name="budgetPerRunUsd"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-eval-max-items">
                  {t("projects.settings.aiEvalMaxParallelItems")}
                </FieldLabel>
                <Input
                  defaultValue={settingsQuery.data.sampling.maxConcurrentEvaluationItems}
                  id="ai-eval-max-items"
                  min="1"
                  name="maxConcurrentEvaluationItems"
                  step="1"
                  type="number"
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">{t("projects.aiProviders.profiles")}</h3>
              {settingsQuery.data.providerProfiles.length > 0 ? (
                <div className="grid gap-2">
                  {settingsQuery.data.providerProfiles.map((profile) => (
                    <div
                      className="grid gap-2 border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]"
                      key={profile.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{profile.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.providerKind} · {profile.id}
                        </p>
                      </div>
                      <Field>
                        <FieldLabel htmlFor={`provider-timeout-${profile.id}`}>
                          {t("companies.aiProvider.timeoutMs")}
                        </FieldLabel>
                        <Input
                          defaultValue={profile.timeoutMs}
                          id={`provider-timeout-${profile.id}`}
                          min="1000"
                          name={`provider.${profile.id}.timeoutMs`}
                          step="1000"
                          type="number"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`provider-concurrency-${profile.id}`}>
                          {t("projects.aiProviders.maxParallel")}
                        </FieldLabel>
                        <Input
                          defaultValue={profile.maxConcurrency ?? ""}
                          id={`provider-concurrency-${profile.id}`}
                          min="1"
                          name={`provider.${profile.id}.maxConcurrency`}
                          step="1"
                          type="number"
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {t("projects.settings.aiEvalNoProviderProfiles")}
                </p>
              )}
            </div>
          </div>
        ) : null}

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
  const [email, setEmail] = useState("");
  const [inviteOutcome, setInviteOutcome] = useState<string | null>(null);
  const [role, setRole] = useState<ProjectRole>("viewer");
  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(project.id),
    queryFn: () => client.getProjectMembers(project.id),
  });
  const inviteMutation = useMutation({
    mutationFn: client.inviteProjectMember,
    async onSuccess(result) {
      setEmail("");
      setInviteOutcome(
        result.outcome === "membership_created"
          ? t("projects.settings.memberAdded")
          : t("projects.settings.memberInvited"),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(project.id) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.organizationInvitations(project.organizationId),
        }),
      ]);
    },
  });
  const updateMutation = useMutation({
    mutationFn: client.updateProjectMember,
    async onSuccess() {
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
    const trimmedEmail = email.trim().toLowerCase();
    if (!isLikelyEmail(trimmedEmail)) {
      return;
    }
    setInviteOutcome(null);
    inviteMutation.mutate({ projectId: project.id, email: trimmedEmail, role });
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
            <Label htmlFor="project-member-email">{t("projects.settings.memberEmail")}</Label>
            <Input
              id="project-member-email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder={t("projects.settings.memberEmailPlaceholder")}
              type="email"
              value={email}
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
            disabled={!isLikelyEmail(email.trim()) || inviteMutation.isPending}
            type="submit"
          >
            <Plus data-icon="inline-start" />
            {t("projects.settings.inviteMember")}
          </Button>
        </form>
      ) : null}
      {inviteOutcome ? <p className="text-sm text-muted-foreground">{inviteOutcome}</p> : null}
      {membersQuery.isError ? (
        <p className="text-sm text-destructive">{t("projects.settings.membersLoadError")}</p>
      ) : null}
      {inviteMutation.isError || updateMutation.isError || removeMutation.isError ? (
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
  activeItem: "organization" | "projects" | "members" | "ai-provider";
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

const aiProviderKinds: AiProviderKind[] = [
  "openai",
  "anthropic",
  "azure_foundry",
  "aws_bedrock",
  "openai_compatible",
];

const aiModelPurposes: AiModelPurpose[] = [
  "default",
  "chat",
  "judge",
  "optimizer",
  "embedding",
  "replay",
];

function projectAiProviderSettingsQueryKey(projectId: string) {
  return ["ProjectAiProviderSettings", projectId] as const;
}

function aiProviderKindLabel(kind: AiProviderKind) {
  switch (kind) {
    case "anthropic":
      return t("projects.aiProviders.kind.anthropic");
    case "azure_foundry":
      return t("projects.aiProviders.kind.azureFoundry");
    case "aws_bedrock":
      return t("projects.aiProviders.kind.awsBedrock");
    case "openai_compatible":
      return t("projects.aiProviders.kind.openAiCompatible");
    case "openai":
      return t("projects.aiProviders.kind.openAi");
  }
}

function toCompanyAiProviderSettingsInput(
  settings: CompanyAiProviderSettings,
  form: FormData,
  providerKind: AiProviderKind,
): UpdateCompanyAiProviderSettingsInput | null {
  const label = stringField(form.get("label")) ?? t("companies.aiProvider.defaultLabel");
  const rawCredentialRef = stringField(form.get("credentialRef"));
  const credentialRef =
    rawCredentialRef && isAllowedAiCredentialRef(rawCredentialRef) ? rawCredentialRef : null;
  const credentialValue = stringField(form.get("credentialValue"));
  const model = stringField(form.get("model"));
  const baseUrl = stringField(form.get("baseUrl"));
  const region = stringField(form.get("region"));
  const deployment = stringField(form.get("deployment"));
  const timeoutMs = numberField(form.get("timeoutMs")) ?? 30000;
  if ((!credentialRef && !credentialValue) || !model) {
    return null;
  }
  const providerProfileId = settings.providerProfile?.id ?? "company-chat-provider";
  const aliasId = settings.chatModelAlias?.id ?? "company-chat";
  const profileParameters = providerParametersForKind(providerKind, { deployment, region });
  return {
    companyId: settings.companyId,
    expectedVersion: settings.version,
    providerProfile: {
      id: providerProfileId,
      label,
      providerKind,
      baseUrl:
        providerKind === "azure_foundry" || providerKind === "openai_compatible" ? baseUrl : null,
      credentialRef,
      credentialValue,
      models: { chat: [model] },
      parameters: profileParameters,
      timeoutMs,
      maxConcurrency: settings.providerProfile?.maxConcurrency ?? null,
      disabled: false,
    },
    chatModelAlias: {
      id: aliasId,
      name: "chat",
      providerProfileId,
      model,
      purpose: "chat",
      parameters: { extras: {} },
    },
  };
}

function providerParametersForKind(
  providerKind: AiProviderKind,
  values: { deployment: string | null; region: string | null },
) {
  const extras: Record<string, string> = {};
  if (providerKind === "azure_foundry" && values.deployment) {
    extras.deployment = values.deployment;
  }
  if (providerKind === "aws_bedrock" && values.region) {
    extras.region = values.region;
  }
  return extras;
}

function toProjectProviderProfileDraft(profile: AiProviderProfile): ProjectAiProviderProfileDraft {
  const parameters = readJsonObject(profile.parameters);
  return {
    draftId: profile.id,
    id: profile.id,
    label: profile.label,
    providerKind: profile.providerKind,
    baseUrl: profile.baseUrl ?? "",
    credentialRef: isAllowedAiCredentialRef(profile.credentialRef) ? profile.credentialRef : "",
    credentialValue: "",
    deployment: readString(parameters.deployment),
    region: readString(parameters.region),
    timeoutMs: String(profile.timeoutMs),
    maxConcurrency: profile.maxConcurrency ? String(profile.maxConcurrency) : "",
    disabled: !!profile.disabledAt,
  };
}

function toProjectModelAliasDraft(alias: AiModelAlias): ProjectAiModelAliasDraft {
  return {
    draftId: alias.id,
    id: alias.id,
    name: alias.name,
    providerProfileId: alias.providerProfileId,
    model: alias.model,
    purpose: alias.purpose,
    temperature: alias.parameters.temperature == null ? "" : String(alias.parameters.temperature),
    maxOutputTokens:
      alias.parameters.maxOutputTokens == null ? "" : String(alias.parameters.maxOutputTokens),
  };
}

function toProjectAiProviderSettingsInput(
  settings: ProjectAiProviderSettings,
  profileDrafts: ProjectAiProviderProfileDraft[],
  aliasDrafts: ProjectAiModelAliasDraft[],
): UpdateProjectAiProviderSettingsInput | null {
  const providerProfiles = profileDrafts.map((profile) => {
    const label = profile.label.trim();
    const credentialRef =
      profile.credentialRef && isAllowedAiCredentialRef(profile.credentialRef)
        ? profile.credentialRef
        : null;
    const credentialValue = profile.credentialValue.trim() || null;
    const timeoutMs = numberField(profile.timeoutMs) ?? 30000;
    if (!label || (!credentialRef && !credentialValue)) {
      return null;
    }
    return {
      id: profile.id,
      label,
      providerKind: profile.providerKind,
      baseUrl:
        profile.providerKind === "azure_foundry" || profile.providerKind === "openai_compatible"
          ? profile.baseUrl.trim() || null
          : null,
      credentialRef,
      credentialValue,
      models: modelsForProfile(profile.id, aliasDrafts),
      parameters: providerParametersForKind(profile.providerKind, {
        deployment: profile.deployment.trim() || null,
        region: profile.region.trim() || null,
      }),
      timeoutMs,
      maxConcurrency: numberField(profile.maxConcurrency),
      disabled: profile.disabled,
    };
  });
  if (providerProfiles.some((profile) => !profile)) {
    return null;
  }
  const modelAliases = aliasDrafts.map((alias) => {
    const name = alias.name.trim();
    const providerProfileId = alias.providerProfileId.trim();
    const model = alias.model.trim();
    if (!name || !providerProfileId || !model) {
      return null;
    }
    return {
      id: alias.id,
      name,
      providerProfileId,
      model,
      purpose: alias.purpose,
      parameters: {
        temperature: numberField(alias.temperature),
        topP: null,
        maxOutputTokens: numberField(alias.maxOutputTokens),
        reasoningEffort: null,
        extras: {},
      },
    };
  });
  if (modelAliases.some((alias) => !alias)) {
    return null;
  }
  return {
    projectId: settings.projectId,
    providerProfiles: providerProfiles as UpdateProjectAiProviderSettingsInput["providerProfiles"],
    modelAliases: modelAliases as UpdateProjectAiProviderSettingsInput["modelAliases"],
    expectedVersion: settings.version,
  };
}

function modelsForProfile(
  profileId: string,
  aliasDrafts: ProjectAiModelAliasDraft[],
): Record<string, string[]> {
  return aliasDrafts.reduce<Record<string, string[]>>((models, alias) => {
    if (alias.providerProfileId !== profileId || !alias.model.trim()) {
      return models;
    }
    const purposeModels = models[alias.purpose] ?? [];
    if (!purposeModels.includes(alias.model.trim())) {
      purposeModels.push(alias.model.trim());
    }
    models[alias.purpose] = purposeModels;
    return models;
  }, {});
}

function isAllowedAiCredentialRef(value: string) {
  return value.startsWith("managed:") || value.startsWith("env:") || value.startsWith("external:");
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstChatModel(settings: CompanyAiProviderSettings["providerProfile"]): string | null {
  const models = settings?.models;
  if (models && typeof models === "object" && !Array.isArray(models)) {
    const chatModels = (models as Record<string, unknown>).chat;
    if (Array.isArray(chatModels) && typeof chatModels[0] === "string") {
      return chatModels[0];
    }
  }
  return null;
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
  const parentHref =
    activeSection === "identity" ? "/projects" : `/projects/${project.id}/settings`;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Button aria-label={t("actions.back")} asChild size="icon-sm" variant="ghost">
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
const projectCreateTabs = [
  { id: "identity", labelKey: "projects.settings.identity" },
  { id: "access", labelKey: "projects.settings.access" },
] as const;

type ProjectCreateTab = (typeof projectCreateTabs)[number]["id"];
type ProjectCreateFieldErrors = {
  name?: string;
  organizationId?: string;
  slug?: string;
};
type ProjectCreateValidation = {
  fields: ProjectCreateFieldErrors;
  tabs: Record<ProjectCreateTab, boolean>;
  valid: boolean;
};

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

function validateProjectCreateDraft({
  name,
  organizationId,
  slug,
}: {
  name: string;
  organizationId: string;
  slug: string;
}): ProjectCreateValidation {
  const normalizedSlug = normalizeProjectSlug(slug);
  const fields: ProjectCreateFieldErrors = {};

  if (!name.trim()) {
    fields.name = t("projects.create.validation");
  }
  if (!normalizedSlug) {
    fields.slug = t("projects.create.validation");
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    fields.slug = t("projects.create.validation");
  }
  if (!organizationId) {
    fields.organizationId = t("projects.create.validation");
  }

  return {
    fields,
    tabs: {
      identity: Boolean(fields.name || fields.slug),
      access: Boolean(fields.organizationId),
    },
    valid: Object.keys(fields).length === 0,
  };
}

function projectCreateTabIndex(tab: ProjectCreateTab) {
  return projectCreateTabs.findIndex((candidate) => candidate.id === tab);
}

function projectCreateNextTab(tab: ProjectCreateTab) {
  const nextIndex = Math.min(projectCreateTabIndex(tab) + 1, projectCreateTabs.length - 1);
  return projectCreateTabs[nextIndex]?.id ?? tab;
}

function projectCreatePreviousTab(tab: ProjectCreateTab) {
  const previousIndex = Math.max(projectCreateTabIndex(tab) - 1, 0);
  return projectCreateTabs[previousIndex]?.id ?? tab;
}

function projectCreateFirstInvalidTab(validation: ProjectCreateValidation) {
  return projectCreateTabs.find((tab) => validation.tabs[tab.id])?.id ?? "identity";
}

function ProjectCreateBreadcrumb({ organizationId }: { organizationId: string | null }) {
  const parentHref = organizationId
    ? `/organizations/${encodeURIComponent(organizationId)}/projects`
    : "/projects";

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Button aria-label={t("actions.back")} asChild size="icon-sm" variant="ghost">
        <Link to={parentHref}>
          <ArrowLeft aria-hidden />
        </Link>
      </Button>
      <nav aria-label={t("nav.breadcrumb")} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1">
          <li>
            <Link className="hover:text-foreground" to="/projects">
              {t("nav.projects")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="truncate text-foreground">{t("projects.create.submit")}</li>
        </ol>
      </nav>
    </div>
  );
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

function numberField(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toProjectAiSettingsInput(
  settings: ProjectAiSettings,
  enabled: boolean,
  form: FormData,
): UpdateProjectAiSettingsInput {
  return {
    projectId: settings.projectId,
    enabled,
    defaultProviderProfileId:
      stringField(form.get("defaultProviderProfileId")) ??
      settings.defaultProviderProfileId ??
      null,
    defaultJudgeProfileId:
      stringField(form.get("defaultJudgeProfileId")) ?? settings.defaultJudgeProfileId ?? null,
    defaultOptimizerProfileId: settings.defaultOptimizerProfileId ?? null,
    defaultEmbeddingProfileId: settings.defaultEmbeddingProfileId ?? null,
    providerProfiles: settings.providerProfiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      providerKind: profile.providerKind,
      baseUrl: profile.baseUrl ?? null,
      credentialRef: profile.credentialRef ?? null,
      models: profile.models,
      timeoutMs: numberField(form.get(`provider.${profile.id}.timeoutMs`)) ?? profile.timeoutMs,
      maxConcurrency:
        numberField(form.get(`provider.${profile.id}.maxConcurrency`)) ??
        profile.maxConcurrency ??
        null,
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
      metricIds: policy.metricIds,
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
      dailyUsd: numberField(form.get("budgetDailyUsd")) ?? settings.budget.dailyUsd,
      perRunUsd: numberField(form.get("budgetPerRunUsd")) ?? settings.budget.perRunUsd ?? null,
      deterministicOnly: settings.budget.deterministicOnly,
    },
    sampling: {
      ...settings.sampling,
      maxConcurrentEvaluationItems:
        numberField(form.get("maxConcurrentEvaluationItems")) ??
        settings.sampling.maxConcurrentEvaluationItems,
    },
    datasetDefaults: settings.datasetDefaults,
    expectedVersion: settings.version,
  };
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function retentionDataClassLabel(dataClass: RetentionDataClass) {
  const labels: Record<RetentionDataClass, string> = {
    TRACES: t("nav.traces"),
    LOGS: t("nav.logs"),
    METRICS: t("nav.metrics"),
    AI_EVALS: t("nav.aiEval"),
    DATASETS: t("nav.aiEvalDatasets"),
    SCORERS: t("aiEval.scorers"),
    DASHBOARD_HISTORY: t("projects.retention.dashboardHistory"),
    INGEST_CREDENTIAL_AUDIT: t("projects.retention.ingestCredentialAudit"),
  };
  return labels[dataClass];
}

function retentionModeLabel(mode: RetentionMode) {
  const labels: Record<RetentionMode, string> = {
    retain: t("projects.retention.mode.retain"),
    delete: t("projects.retention.mode.delete"),
    soft_delete_then_delete: t("projects.retention.mode.softDeleteThenDelete"),
  };
  return labels[mode];
}

function adminNavLabel(id: "organization" | "projects" | "members" | "ai-provider") {
  if (id === "projects") {
    return t("nav.projects");
  }
  if (id === "members") {
    return t("companies.members.title");
  }
  if (id === "ai-provider") {
    return t("nav.aiProvider");
  }
  return t("companies.title");
}

type ProjectSettingsSectionId =
  | "identity"
  | "access"
  | "setup"
  | "ingest"
  | "retention"
  | "ai-providers"
  | "ai-eval";

function projectSettingsNavLabel(id: ProjectSettingsSectionId) {
  if (id === "identity") {
    return t("projects.settings.identity");
  }
  if (id === "access") {
    return t("projects.settings.access");
  }
  if (id === "setup") {
    return t("projects.settings.setup");
  }
  if (id === "ingest") {
    return t("projects.settings.apiKeys");
  }
  if (id === "retention") {
    return t("projects.settings.retention");
  }
  if (id === "ai-providers") {
    return t("projects.settings.aiProviders");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEval");
  }
  return t("projects.settings.identity");
}

function projectSettingsTitle(id: ProjectSettingsSectionId) {
  if (id === "identity") {
    return t("projects.settings.identity");
  }
  if (id === "access") {
    return t("projects.settings.access");
  }
  if (id === "setup") {
    return t("projects.settings.setup");
  }
  if (id === "ingest") {
    return t("projects.settings.apiKeys");
  }
  if (id === "retention") {
    return t("projects.settings.retention");
  }
  if (id === "ai-providers") {
    return t("projects.settings.aiProviders");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEval");
  }
  return t("projects.settings.identity");
}

function projectSettingsDescription(id: ProjectSettingsSectionId) {
  if (id === "identity") {
    return t("projects.settings.identityDescription");
  }
  if (id === "access") {
    return t("projects.settings.projectMembersDescription");
  }
  if (id === "setup") {
    return t("projects.settings.setupRouteDescription");
  }
  if (id === "ingest") {
    return t("projects.settings.setupDescription");
  }
  if (id === "retention") {
    return t("projects.settings.retentionDescription");
  }
  if (id === "ai-providers") {
    return t("projects.settings.aiProvidersDescription");
  }
  if (id === "ai-eval") {
    return t("projects.settings.aiEvalDescription");
  }
  return t("projects.settingsDescription");
}

function projectSettingsSectionFromPath(pathname: string) {
  if (pathname.endsWith("/general")) {
    return "identity" as const;
  }
  if (pathname.endsWith("/access") || pathname.endsWith("/members")) {
    return "access" as const;
  }
  if (pathname.endsWith("/setup")) {
    return "setup" as const;
  }
  if (pathname.endsWith("/ingest")) {
    return "ingest" as const;
  }
  if (pathname.endsWith("/retention")) {
    return "retention" as const;
  }
  if (pathname.endsWith("/ai-providers")) {
    return "ai-providers" as const;
  }
  if (pathname.endsWith("/ai-eval")) {
    return "ai-eval" as const;
  }
  return "identity" as const;
}
