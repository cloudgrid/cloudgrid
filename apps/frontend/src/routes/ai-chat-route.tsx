import type {
  AiChatActionProposal,
  AiChatArtifact,
  AiChatConversation,
  AiChatMessage,
  AiChatProjectGroup,
  CompanyAiProviderSettings,
  JSONValue,
} from "@cloudgrid/ui-contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  Bot,
  Check,
  FileJson,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  UserCircle,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CodeBlock } from "../components/code-block";
import { EmptyState, ErrorPanel, LoadingRows } from "../components/query-state";
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
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { createAiChatGraphQLClient } from "../features/ai-chat/api";
import {
  aiChatActionById,
  aiChatApprovalInput,
  aiChatArtifactById,
  aiChatConversationQueryKey,
  aiChatHistoryQueryKey,
  aiChatProviderQueryKey,
  findAiChatConversation,
  firstAiChatConversation,
  isCompanyAiChatProviderConfigured,
  orderedAiChatProjectGroups,
  safeAiChatArtifactView,
} from "../features/ai-chat/view-model";
import { formatDateTime } from "../lib/format";
import { t } from "../lib/i18n";
import { cn } from "../lib/utils";
import { useAppSession } from "../providers/app-session-provider";

export const aiChatEnabled =
  import.meta.env.CLOUDGRID_AI_CHAT_ENABLED !== "false" &&
  import.meta.env.VITE_CLOUDGRID_AI_CHAT_ENABLED !== "false";

const aiChatClient = createAiChatGraphQLClient(
  import.meta.env.VITE_CLOUDGRID_GRAPHQL_URL || "/graphql",
);

interface LocalAiChatStreamState {
  assistantText: string;
  conversationId: string;
  error: string | null;
  runId: string | null;
  status: "streaming" | "completed" | "failed";
  userText: string;
}

export function AiChatRoute() {
  const { selectProject, viewer } = useAppSession();
  const selectedProject = viewer?.selectedProject ?? null;
  const organization = selectedProject
    ? viewer?.organizations.find((item) => item.id === selectedProject.organizationId)
    : null;
  const companyId = organization?.id ?? selectedProject?.organizationId ?? "";
  const projectId = selectedProject?.id ?? "";
  const isCompanyAdmin = organization?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversation");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [streamState, setStreamState] = useState<LocalAiChatStreamState | null>(null);
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);

  const providerQuery = useQuery({
    enabled: aiChatEnabled && Boolean(companyId),
    queryKey: aiChatProviderQueryKey(companyId),
    queryFn: () => aiChatClient.getCompanyAiProviderSettings(companyId),
  });
  const historyQuery = useQuery({
    enabled: aiChatEnabled && Boolean(companyId && projectId),
    queryKey: aiChatHistoryQueryKey({ companyId, projectId }),
    queryFn: () =>
      aiChatClient.getAiChatHistory({
        companyId,
        projectId,
        includeArchived: false,
        first: 50,
        after: null,
      }),
  });

  const conversationFromHistory = findAiChatConversation(
    historyQuery.data,
    conversationId,
    projectId,
  );
  const fallbackConversation = firstAiChatConversation(historyQuery.data, projectId) ?? null;
  const shouldFetchConversation = Boolean(conversationId && !conversationFromHistory);
  const conversationQuery = useQuery({
    enabled: aiChatEnabled && shouldFetchConversation,
    queryKey: aiChatConversationQueryKey(conversationId),
    queryFn: () => aiChatClient.getAiChatConversation(conversationId ?? ""),
  });
  const activeConversation =
    conversationFromHistory ?? conversationQuery.data ?? fallbackConversation ?? null;
  const displayedConversation = useMemo(
    () =>
      activeConversation
        ? conversationWithLocalStream(activeConversation, streamState, providerQuery.data)
        : null,
    [activeConversation, providerQuery.data, streamState],
  );
  const groups = useMemo(
    () => orderedAiChatProjectGroups(historyQuery.data, projectId),
    [historyQuery.data, projectId],
  );

  const createConversation = useMutation({
    mutationFn: ({ firstUserMessage }: { firstUserMessage: string }) =>
      aiChatClient.createAiChatConversation({
        companyId,
        projectId,
        firstUserMessage,
        title: null,
      }),
    onSuccess: async (conversation) => {
      setPrompt("");
      setSearchParams({ conversation: conversation.id });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiChatHistoryQueryKey({ companyId, projectId }),
        }),
        queryClient.invalidateQueries({
          queryKey: aiChatConversationQueryKey(conversation.id),
        }),
      ]);
    },
  });
  const approveAiChatAction = useMutation({
    mutationFn: ({ approved, proposal }: { approved: boolean; proposal: AiChatActionProposal }) =>
      aiChatClient.approveAiChatAction(aiChatApprovalInput(proposal, approved)),
    onSuccess: async (proposal) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiChatHistoryQueryKey({ companyId, projectId }),
        }),
        queryClient.invalidateQueries({
          queryKey: aiChatConversationQueryKey(proposal.conversationId),
        }),
      ]);
    },
  });

  if (!aiChatEnabled) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-4">
        <RouteHeader
          action={null}
          description={t("aiChat.disabled.description")}
          title={t("aiChat.title")}
        />
        <Alert>
          <AlertCircle aria-hidden />
          <AlertTitle>{t("aiChat.disabled.title")}</AlertTitle>
          <AlertDescription>{t("aiChat.disabled.description")}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (!selectedProject || !organization) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-4">
        <RouteHeader
          action={null}
          description={t("aiChat.description")}
          title={t("aiChat.title")}
        />
        <EmptyState
          description={t("project.required.description")}
          filtered={false}
          primaryAction={
            <Button asChild>
              <Link to="/projects">
                <History data-icon="inline-start" />
                {t("project.required.action")}
              </Link>
            </Button>
          }
          title={t("project.required.title")}
        />
      </section>
    );
  }

  const providerConfigured = isCompanyAiChatProviderConfigured(providerQuery.data);
  const missingProvider =
    !providerQuery.isLoading && (!providerQuery.data || providerConfigured === false);
  const providerBadge = providerConfigured
    ? t("aiChat.provider.configured")
    : t("aiChat.provider.missing");
  const streaming = streamState?.status === "streaming";
  const activeRunStatus = displayedConversation?.latestRun?.status ?? null;
  const canSubmitPrompt =
    providerConfigured &&
    prompt.trim().length > 0 &&
    !createConversation.isPending &&
    !streaming &&
    (!displayedConversation ||
      (displayedConversation.status === "active" &&
        activeRunStatus !== "streaming" &&
        activeRunStatus !== "awaiting_approval"));

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPrompt) {
      return;
    }
    const text = prompt.trim();
    const conversation =
      activeConversation ??
      (await createConversation.mutateAsync({
        firstUserMessage: text,
      }));
    await streamPrompt(conversation, text);
  }

  async function streamPrompt(conversation: AiChatConversation, text: string) {
    const abort = new AbortController();
    setStreamAbort(abort);
    setPrompt("");
    setSearchParams({ conversation: conversation.id });
    setStreamState({
      assistantText: "",
      conversationId: conversation.id,
      error: null,
      runId: null,
      status: "streaming",
      userText: text,
    });
    try {
      for await (const event of aiChatClient.streamAiChatRun(
        {
          conversationId: conversation.id,
          projectId: conversation.projectId,
          userMessageClientId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          parts: [{ type: "text", text }],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        { signal: abort.signal },
      )) {
        if (event.type === "run.started") {
          setStreamState((state) =>
            state ? { ...state, runId: event.runId, status: "streaming" } : state,
          );
        }
        if (event.type === "text.delta") {
          const delta = typeof event.payload.text === "string" ? event.payload.text : "";
          setStreamState((state) =>
            state ? { ...state, assistantText: state.assistantText + delta } : state,
          );
        }
        if (event.type === "message.created" && event.payload.role === "assistant") {
          const textPart = Array.isArray(event.payload.parts)
            ? event.payload.parts.find(isStreamTextPart)
            : null;
          if (textPart) {
            setStreamState((state) => (state ? { ...state, assistantText: textPart.text } : state));
          }
        }
        if (event.type === "run.failed") {
          const problem = isRecord(event.payload.problem) ? event.payload.problem : null;
          setStreamState((state) =>
            state
              ? {
                  ...state,
                  error:
                    typeof problem?.detail === "string" ? problem.detail : t("aiChat.runError"),
                  status: "failed",
                }
              : state,
          );
        }
        if (event.type === "run.completed") {
          setStreamState((state) => (state ? { ...state, status: "completed" } : state));
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setStreamState((state) =>
          state
            ? {
                ...state,
                error: error instanceof Error ? error.message : t("aiChat.runError"),
                status: "failed",
              }
            : state,
        );
      }
    } finally {
      setStreamAbort(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiChatHistoryQueryKey({ companyId, projectId }),
        }),
        queryClient.invalidateQueries({
          queryKey: aiChatConversationQueryKey(conversation.id),
        }),
      ]);
    }
  }

  function openConversation(conversation: AiChatConversation) {
    if (conversation.projectId !== projectId) {
      void selectProject(conversation.projectId).then(() => {
        navigate(`/ai-chat?conversation=${encodeURIComponent(conversation.id)}`);
      });
      return;
    }
    setSearchParams({ conversation: conversation.id });
    setHistoryOpen(false);
  }

  const historyRail = (
    <ConversationHistoryRail
      activeConversationId={activeConversation?.id ?? null}
      groups={groups}
      onOpenConversation={openConversation}
      selectedProjectId={projectId}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <RouteHeader
        action={
          <div className="flex items-center gap-2">
            <Sheet onOpenChange={setHistoryOpen} open={historyOpen}>
              <SheetTrigger asChild>
                <Button className="lg:hidden" type="button" variant="outline">
                  <History data-icon="inline-start" />
                  {t("aiChat.history")}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[340px] max-w-[90vw]" side="left">
                <SheetHeader>
                  <SheetTitle>{t("aiChat.history")}</SheetTitle>
                  <SheetDescription>{t("aiChat.history.description")}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 px-4 pb-4">{historyRail}</div>
              </SheetContent>
            </Sheet>
            <Button onClick={() => setSearchParams({})} type="button">
              <MessageSquarePlus data-icon="inline-start" />
              {t("aiChat.newConversation")}
            </Button>
          </div>
        }
        description={t("aiChat.description")}
        status={
          <Badge variant={providerConfigured ? "secondary" : "outline"}>{providerBadge}</Badge>
        }
        title={t("aiChat.title")}
      />

      {providerQuery.error ? (
        <ErrorPanel
          error={providerQuery.error}
          onRetry={() => void providerQuery.refetch()}
          title={t("aiChat.provider.loadError")}
        />
      ) : null}

      {missingProvider ? (
        <MissingProviderState
          companyId={companyId}
          isCompanyAdmin={isCompanyAdmin}
          settings={providerQuery.data}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border bg-background lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r lg:flex">{historyRail}</aside>
          <div className="flex min-h-0 flex-col">
            {historyQuery.isLoading || providerQuery.isLoading ? (
              <LoadingRows />
            ) : historyQuery.error || conversationQuery.error ? (
              <ErrorPanel
                error={historyQuery.error ?? conversationQuery.error}
                onRetry={() => {
                  void historyQuery.refetch();
                  void conversationQuery.refetch();
                }}
              />
            ) : displayedConversation ? (
              <ConversationTranscript
                approvalPending={approveAiChatAction.isPending}
                conversation={displayedConversation}
                onApprove={(proposal, approved) =>
                  approveAiChatAction.mutate({ proposal, approved })
                }
              />
            ) : (
              <EmptyState
                description={t("aiChat.empty.description")}
                filtered={false}
                primaryAction={
                  <Button disabled type="button" variant="outline">
                    <MessageSquarePlus data-icon="inline-start" />
                    {t("aiChat.empty.action")}
                  </Button>
                }
                title={t("aiChat.empty.title")}
              />
            )}
            <form className="border-t bg-background p-3" onSubmit={submitPrompt}>
              <div className="flex flex-col gap-2">
                <Textarea
                  aria-label={t("aiChat.prompt")}
                  disabled={!providerConfigured || createConversation.isPending}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t("aiChat.promptPlaceholder")}
                  value={prompt}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {streaming ? t("aiChat.streaming") : t("aiChat.prompt.textOnly")}
                  </p>
                  {streaming ? (
                    <Button onClick={() => streamAbort?.abort()} type="button" variant="outline">
                      <X data-icon="inline-start" />
                      {t("actions.cancel")}
                    </Button>
                  ) : (
                    <Button disabled={!canSubmitPrompt} type="submit">
                      {createConversation.isPending ? (
                        <Loader2 data-icon="inline-start" />
                      ) : (
                        <Send data-icon="inline-start" />
                      )}
                      {t("aiChat.prompt.send")}
                    </Button>
                  )}
                </div>
                {streamState?.status === "failed" && streamState.error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden />
                    <AlertTitle>{t("aiChat.runError")}</AlertTitle>
                    <AlertDescription>{streamState.error}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function RouteHeader({
  action,
  description,
  status,
  title,
}: {
  action: ReactNode;
  description: string;
  status?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          {status}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function MissingProviderState({
  companyId,
  isCompanyAdmin,
  settings,
}: {
  companyId: string;
  isCompanyAdmin: boolean;
  settings?: CompanyAiProviderSettings | undefined;
}) {
  return (
    <Alert className="bg-background">
      <ShieldAlert aria-hidden />
      <AlertTitle>{t("aiChat.provider.missingTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          {isCompanyAdmin
            ? t("aiChat.provider.adminDescription")
            : t("aiChat.provider.userDescription")}
        </span>
        {settings?.effective.warnings.length ? (
          <ul className="list-disc pl-5">
            {settings.effective.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {isCompanyAdmin ? (
          <Button asChild className="w-fit">
            <Link to={`/organizations/${companyId}/ai-provider`}>
              <ShieldAlert data-icon="inline-start" />
              {t("aiChat.provider.configure")}
            </Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function ConversationHistoryRail({
  activeConversationId,
  groups,
  onOpenConversation,
  selectedProjectId,
}: {
  activeConversationId: string | null;
  groups: AiChatProjectGroup[];
  onOpenConversation: (conversation: AiChatConversation) => void;
  selectedProjectId: string;
}) {
  if (!groups.length) {
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
        {t("aiChat.history.empty")}
      </div>
    );
  }

  return (
    <nav aria-label={t("aiChat.history")} className="min-h-0 flex-1 overflow-auto p-2">
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <section className="flex flex-col gap-1" key={group.projectId}>
            <h2 className="px-2 text-xs font-medium text-muted-foreground">{group.projectName}</h2>
            <div className="flex flex-col gap-1">
              {group.conversations.map((conversation) => (
                <Button
                  className={cn(
                    "h-auto min-h-14 w-full flex-col items-start justify-start gap-1 px-2 py-2 text-left",
                    conversation.id === activeConversationId && "bg-muted",
                  )}
                  key={conversation.id}
                  onClick={() => onOpenConversation(conversation)}
                  type="button"
                  variant="ghost"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <History aria-hidden />
                    <span className="line-clamp-2 text-sm font-medium">{conversation.title}</span>
                  </span>
                  <span className="flex max-w-full items-center gap-2 text-xs text-muted-foreground">
                    {conversation.projectId !== selectedProjectId ? (
                      <Badge variant="outline">{t("aiChat.history.otherProject")}</Badge>
                    ) : null}
                    <span className="truncate">{formatDateTime(conversation.lastMessageAt)}</span>
                  </span>
                </Button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </nav>
  );
}

function ConversationTranscript({
  approvalPending,
  conversation,
  onApprove,
}: {
  approvalPending: boolean;
  conversation: AiChatConversation;
  onApprove: (proposal: AiChatActionProposal, approved: boolean) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{conversation.title}</h2>
          <ConversationStatusBadges conversation={conversation} />
        </div>
        {conversation.compaction ? (
          <Alert className="bg-background">
            <Archive aria-hidden />
            <AlertTitle>{t("aiChat.compaction.title")}</AlertTitle>
            <AlertDescription>{conversation.compaction.summary}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-4">
          {conversation.messages.map((message) => (
            <article
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
              key={message.id}
            >
              {message.role !== "user" ? (
                <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <Bot className="size-4" aria-hidden />
                </span>
              ) : null}
              <div
                className={cn(
                  "flex max-w-[min(760px,100%)] flex-col gap-2 rounded-lg border p-3 text-sm",
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-background",
                )}
              >
                {message.parts.map((part, index) => {
                  const key = `${message.id}-${index}`;
                  if (part.type === "text") {
                    return <p key={key}>{part.text}</p>;
                  }
                  if (part.type === "json_render") {
                    return (
                      <ArtifactPanel
                        artifact={aiChatArtifactById(conversation, part.artifactId ?? null)}
                        key={key}
                      />
                    );
                  }
                  if (part.type === "action_request") {
                    return (
                      <ActionProposalPanel
                        disabled={approvalPending}
                        key={key}
                        onApprove={onApprove}
                        proposal={aiChatActionById(conversation, part.actionId ?? null)}
                      />
                    );
                  }
                  return (
                    <Badge className="w-fit" key={key} variant="outline">
                      {part.type}
                    </Badge>
                  );
                })}
              </div>
              {message.role === "user" ? (
                <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                  <UserCircle className="size-4" aria-hidden />
                </span>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationStatusBadges({ conversation }: { conversation: AiChatConversation }) {
  const run = conversation.latestRun;
  return (
    <>
      {conversation.status === "archived" ? (
        <Badge variant="outline">{t("aiChat.archived")}</Badge>
      ) : null}
      {run ? <Badge variant="secondary">{run.status}</Badge> : null}
      {run?.error ? <Badge variant="destructive">{t("aiChat.runError")}</Badge> : null}
    </>
  );
}

function ArtifactPanel({ artifact }: { artifact: AiChatArtifact | null }) {
  if (!artifact) {
    return <AlertDescription>{t("aiChat.artifact.missing")}</AlertDescription>;
  }

  const view = safeAiChatArtifactView(artifact);
  if (view.kind === "unsupported") {
    return (
      <Alert className="bg-background">
        <FileJson aria-hidden />
        <AlertTitle>{artifact.label}</AlertTitle>
        <AlertDescription>{t("aiChat.artifact.unsupported")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <section
      aria-labelledby={`ai-chat-artifact-${artifact.id}`}
      className="flex flex-col gap-2 rounded-md border bg-background p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FileJson className="size-4" aria-hidden />
        <h3 className="text-sm font-semibold" id={`ai-chat-artifact-${artifact.id}`}>
          {artifact.label}
        </h3>
        <Badge variant="outline">{view.renderer}</Badge>
      </div>
      <ArtifactContent content={view.content} renderer={view.renderer} />
    </section>
  );
}

function ArtifactContent({
  content,
  renderer,
}: {
  content: Record<string, unknown>;
  renderer: string;
}) {
  if (renderer === "table" && Array.isArray(content.rows)) {
    const rows = content.rows.filter(isRecord).slice(0, 10);
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6);
    return (
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex.toString()}>
                {columns.map((column) => (
                  <TableCell key={column}>{stringifyJsonValue(row[column])}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <CodeBlock
      code={JSON.stringify(content, null, 2)}
      language="json"
      maxHeightClassName="max-h-80"
    />
  );
}

function ActionProposalPanel({
  disabled,
  onApprove,
  proposal,
}: {
  disabled: boolean;
  onApprove: (proposal: AiChatActionProposal, approved: boolean) => void;
  proposal: AiChatActionProposal | null;
}) {
  if (!proposal) {
    return <AlertDescription>{t("aiChat.approval.missing")}</AlertDescription>;
  }

  const approvable = proposal.status === "proposed";
  const highRisk = proposal.risk === "high" || proposal.risk === "destructive";
  const approveButton = (
    <Button
      disabled={disabled || !approvable}
      onClick={() => onApprove(proposal, true)}
      type="button"
      variant={proposal.risk === "destructive" ? "destructive" : "default"}
    >
      <Check data-icon="inline-start" />
      {t("aiChat.approval.approve")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{proposal.title}</h3>
          <p className="text-sm text-muted-foreground">{proposal.description}</p>
        </div>
        <Badge variant={proposal.risk === "destructive" ? "destructive" : "outline"}>
          {proposal.risk}
        </Badge>
      </div>
      <CodeBlock
        code={JSON.stringify(proposal.preview, null, 2)}
        language="json"
        maxHeightClassName="max-h-48"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={disabled || !approvable}
          onClick={() => onApprove(proposal, false)}
          type="button"
          variant="outline"
        >
          <X data-icon="inline-start" />
          {t("aiChat.approval.reject")}
        </Button>
        {highRisk ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                disabled={disabled || !approvable}
                type="button"
                variant={proposal.risk === "destructive" ? "destructive" : "default"}
              >
                <Check data-icon="inline-start" />
                {t("aiChat.approval.approve")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("aiChat.approval.confirmTitle")}</DialogTitle>
                <DialogDescription>{proposal.description}</DialogDescription>
              </DialogHeader>
              <CodeBlock
                code={JSON.stringify(proposal.preview, null, 2)}
                language="json"
                maxHeightClassName="max-h-72"
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    <X data-icon="inline-start" />
                    {t("actions.cancel")}
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    disabled={disabled || !approvable}
                    onClick={() => onApprove(proposal, true)}
                    type="button"
                    variant={proposal.risk === "destructive" ? "destructive" : "default"}
                  >
                    <Check data-icon="inline-start" />
                    {t("aiChat.approval.approve")}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          approveButton
        )}
      </div>
    </div>
  );
}

function conversationWithLocalStream(
  conversation: AiChatConversation,
  streamState: LocalAiChatStreamState | null,
  providerSettings: CompanyAiProviderSettings | undefined,
): AiChatConversation {
  if (!streamState || streamState.conversationId !== conversation.id) {
    return conversation;
  }

  const messages = [...conversation.messages];
  if (!messages.some((message) => userMessageMatches(message, streamState.userText))) {
    messages.push({
      id: `local-user-${streamState.conversationId}`,
      conversationId: conversation.id,
      role: "user",
      parts: [{ type: "text", text: streamState.userText }],
      createdAt: new Date().toISOString(),
    });
  }
  if (streamState.assistantText || streamState.error || streamState.status === "streaming") {
    messages.push({
      id: `local-assistant-${streamState.conversationId}`,
      conversationId: conversation.id,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: streamState.error ?? streamState.assistantText ?? t("aiChat.streaming"),
        },
      ],
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ...conversation,
    latestRun: {
      id: streamState.runId ?? conversation.latestRun?.id ?? "local-streaming-run",
      conversationId: conversation.id,
      status: streamState.status === "completed" ? "completed" : streamState.status,
      providerProfileId:
        conversation.latestRun?.providerProfileId ??
        providerSettings?.providerProfile?.id ??
        "provider",
      model:
        conversation.latestRun?.model ?? providerSettings?.chatModelAlias?.model ?? "configured",
      artifacts: conversation.latestRun?.artifacts ?? [],
      actionProposals: conversation.latestRun?.actionProposals ?? [],
      startedAt: conversation.latestRun?.startedAt ?? new Date().toISOString(),
      completedAt:
        streamState.status === "completed" || streamState.status === "failed"
          ? new Date().toISOString()
          : null,
      error: streamState.error,
    },
    messages,
  };
}

function userMessageMatches(message: AiChatMessage, text: string) {
  return (
    message.role === "user" &&
    message.parts.some((part) => part.type === "text" && part.text === text)
  );
}

function isStreamTextPart(value: unknown): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyJsonValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}
