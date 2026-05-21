import type {
  AiChatActionProposal,
  AiChatArtifact,
  AiChatConversation,
  AiChatHistory,
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
  Clipboard,
  Clock3,
  FileJson,
  History,
  MessageCircle,
  MessageSquarePlus,
  PanelLeft,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../components/ai-elements/conversation";
import {
  MarkdownResponse,
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
} from "../components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "../components/ai-elements/prompt-input";
import { Shimmer } from "../components/ai-elements/shimmer";
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
import { createAiChatGraphQLClient } from "../features/ai-chat/api";
import {
  applyAiChatStreamEvent,
  aiChatActionById,
  aiChatApprovalInput,
  aiChatArtifactById,
  aiChatConversationQueryKey,
  aiChatHistoryQueryKey,
  aiChatProviderQueryKey,
  createAiChatStreamViewState,
  findAiChatConversation,
  isCompanyAiChatProviderConfigured,
  orderedAiChatProjectGroups,
  safeAiChatArtifactView,
  type AiChatStreamViewState,
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

export function AiChatRoute() {
  const { selectProject, viewer } = useAppSession();
  const selectedProject = viewer?.selectedProject ?? null;
  const organization = selectedProject
    ? viewer?.organizations.find((item) => item.id === selectedProject.organizationId)
    : null;
  const companyId = organization?.id ?? selectedProject?.organizationId ?? "";
  const projectId = selectedProject?.id ?? "";
  const userId = viewer?.user.id ?? "";
  const isCompanyAdmin = organization?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("conversation");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localConversation, setLocalConversation] = useState<AiChatConversation | null>(null);
  const [streamState, setStreamState] = useState<AiChatStreamViewState | null>(null);
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptAutoFocused = useRef(false);
  const focusPromptInput = useCallback(() => {
    requestAnimationFrame(() => promptRef.current?.focus());
  }, []);

  const providerQuery = useQuery({
    enabled: aiChatEnabled && Boolean(companyId),
    queryKey: aiChatProviderQueryKey(companyId),
    queryFn: () => aiChatClient.getCompanyAiProviderSettings(companyId),
  });
  const historyQuery = useQuery({
    enabled: aiChatEnabled && Boolean(companyId && projectId),
    queryKey: aiChatHistoryQueryKey({ companyId, projectId, userId }),
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
    userId,
  );
  const localConversationForRoute =
    localConversation &&
    conversationId === localConversation.id &&
    localConversation.projectId === projectId &&
    localConversation.userId === userId
      ? localConversation
      : null;
  const hydratedLocalConversation = isHydratedAiChatConversation(localConversationForRoute)
    ? localConversationForRoute
    : null;
  const hydratedHistoryConversation = isHydratedAiChatConversation(conversationFromHistory)
    ? conversationFromHistory
    : null;
  const shouldFetchConversation = Boolean(
    conversationId && !hydratedHistoryConversation && !hydratedLocalConversation,
  );
  const conversationQuery = useQuery({
    enabled: aiChatEnabled && Boolean(projectId) && shouldFetchConversation,
    queryKey: aiChatConversationQueryKey({ conversationId, projectId, userId }),
    queryFn: () => aiChatClient.getAiChatConversation(conversationId ?? ""),
  });
  const fetchedConversation = conversationInSelectedProject(
    conversationQuery.data,
    projectId,
    userId,
  );
  const activeConversation =
    conversationId === null
      ? null
      : (hydratedLocalConversation ??
        fetchedConversation ??
        hydratedHistoryConversation ??
        conversationFromHistory ??
        null);
  const displayedConversation = useMemo(
    () =>
      activeConversation
        ? conversationWithLocalStream(activeConversation, streamState, providerQuery.data)
        : null,
    [activeConversation, providerQuery.data, streamState],
  );
  const groups = useMemo(
    () => orderedAiChatProjectGroups(historyQuery.data, projectId, userId),
    [historyQuery.data, projectId, userId],
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
      setLocalConversation(conversation);
      queryClient.setQueryData(
        aiChatConversationQueryKey({ conversationId: conversation.id, projectId, userId }),
        conversation,
      );
      queryClient.setQueryData<AiChatHistory>(
        aiChatHistoryQueryKey({ companyId, projectId, userId }),
        (current) => upsertConversationInHistory(current, conversation),
      );
      setSearchParams({ conversation: conversation.id });
      await queryClient.invalidateQueries({
        queryKey: aiChatHistoryQueryKey({ companyId, projectId, userId }),
      });
    },
  });
  const approveAiChatAction = useMutation({
    mutationFn: ({ approved, proposal }: { approved: boolean; proposal: AiChatActionProposal }) =>
      aiChatClient.approveAiChatAction(aiChatApprovalInput(proposal, approved)),
    onSuccess: async (proposal) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiChatHistoryQueryKey({ companyId, projectId, userId }),
        }),
        queryClient.invalidateQueries({
          queryKey: aiChatConversationQueryKey({
            conversationId: proposal.conversationId,
            projectId,
            userId,
          }),
        }),
      ]);
    },
  });
  const deleteConversation = useMutation({
    mutationFn: (id: string) => aiChatClient.deleteAiChatConversation(id),
    onSuccess: async (_deleted, id) => {
      queryClient.removeQueries({
        queryKey: aiChatConversationQueryKey({ conversationId: id, projectId, userId }),
      });
      queryClient.setQueryData<AiChatHistory>(
        aiChatHistoryQueryKey({ companyId, projectId, userId }),
        (current) => removeConversationFromHistory(current, id),
      );
      if (activeConversation?.id === id) {
        setLocalConversation(null);
        setStreamState(null);
        setSearchParams({});
      }
      await queryClient.invalidateQueries({
        queryKey: aiChatHistoryQueryKey({ companyId, projectId, userId }),
      });
    },
  });

  const providerConfigured = isCompanyAiChatProviderConfigured(providerQuery.data);
  const missingProvider =
    !providerQuery.isLoading && (!providerQuery.data || providerConfigured === false);
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

  useEffect(() => {
    focusPromptInput();
  }, [focusPromptInput]);

  useEffect(() => {
    if (
      !promptAutoFocused.current &&
      providerConfigured &&
      !historyQuery.isLoading &&
      !conversationQuery.isLoading
    ) {
      promptAutoFocused.current = true;
      focusPromptInput();
    }
  }, [conversationQuery.isLoading, focusPromptInput, historyQuery.isLoading, providerConfigured]);

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

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPrompt) {
      return;
    }
    const text = prompt.trim();
    try {
      let conversation = activeConversation;
      let skipUserMessageAppend = false;
      if (!conversation) {
        conversation = await createConversation.mutateAsync({
          firstUserMessage: text,
        });
        skipUserMessageAppend = true;
      }
      await streamPrompt(conversation, text, { skipUserMessageAppend });
    } catch {
      // React Query owns the mutation error; streamPrompt owns stream failures.
    }
  }

  async function streamPrompt(
    conversation: AiChatConversation,
    text: string,
    options: { skipUserMessageAppend?: boolean } = {},
  ) {
    if (conversation.projectId !== projectId) {
      setStreamState({
        ...createAiChatStreamViewState({ conversationId: conversation.id, userText: text }),
        error: t("aiChat.runError"),
        status: "failed",
      });
      return;
    }
    const abort = new AbortController();
    let completed = false;
    setStreamAbort(abort);
    setPrompt("");
    setSearchParams({ conversation: conversation.id });
    setLocalConversation(conversation);
    queryClient.setQueryData(
      aiChatConversationQueryKey({ conversationId: conversation.id, projectId, userId }),
      conversation,
    );
    setStreamState(
      createAiChatStreamViewState({ conversationId: conversation.id, userText: text }),
    );
    try {
      const streamInput = {
        conversationId: conversation.id,
        projectId,
        userMessageClientId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        parts: [{ type: "text" as const, text }],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (options.skipUserMessageAppend === true) {
        Object.assign(streamInput, { skipUserMessageAppend: true });
      }
      for await (const event of aiChatClient.streamAiChatRun(streamInput, {
        signal: abort.signal,
      })) {
        setStreamState((state) => (state ? applyAiChatStreamEvent(state, event) : state));
        if (event.type === "run.completed") {
          completed = true;
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
      let refreshedConversation: AiChatConversation | null = null;
      if (completed) {
        try {
          const refreshed = await aiChatClient.getAiChatConversation(conversation.id);
          const selectedRefreshed = conversationInSelectedProject(refreshed, projectId, userId);
          if (selectedRefreshed) {
            refreshedConversation = selectedRefreshed;
            setLocalConversation(selectedRefreshed);
            queryClient.setQueryData(
              aiChatConversationQueryKey({ conversationId: conversation.id, projectId, userId }),
              selectedRefreshed,
            );
            queryClient.setQueryData<AiChatHistory>(
              aiChatHistoryQueryKey({ companyId, projectId, userId }),
              (current) => upsertConversationInHistory(current, selectedRefreshed),
            );
          }
        } catch {
          refreshedConversation = null;
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: aiChatHistoryQueryKey({ companyId, projectId, userId }),
        }),
        queryClient.invalidateQueries({
          queryKey: aiChatConversationQueryKey({
            conversationId: conversation.id,
            projectId,
            userId,
          }),
        }),
      ]);
      if (completed && refreshedConversation) {
        setStreamState(null);
      }
      focusPromptInput();
    }
  }

  function startNewConversation() {
    streamAbort?.abort();
    setPrompt("");
    setStreamState(null);
    setLocalConversation(null);
    setSearchParams({});
    setHistoryOpen(false);
  }

  function openConversation(conversation: AiChatConversation) {
    if (conversation.projectId !== projectId) {
      void selectProject(conversation.projectId).then(() => {
        navigate(`/ai-chat?conversation=${encodeURIComponent(conversation.id)}`);
      });
      return;
    }
    setSearchParams({ conversation: conversation.id });
    setLocalConversation(conversation);
    setHistoryOpen(false);
  }

  const historyRail = (
    <ConversationHistoryRail
      activeConversationId={activeConversation?.id ?? null}
      groups={groups}
      onNewConversation={startNewConversation}
      onDeleteConversation={(conversation) => deleteConversation.mutate(conversation.id)}
      onOpenConversation={openConversation}
      selectedProjectId={projectId}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3 lg:hidden">
        <Sheet onOpenChange={setHistoryOpen} open={historyOpen}>
          <SheetTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
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
        <Button onClick={startNewConversation} size="icon" type="button" variant="ghost">
          <MessageSquarePlus data-icon="inline-start" />
          <span className="sr-only">{t("aiChat.newConversation")}</span>
        </Button>
      </div>
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
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r bg-muted/15 lg:flex">{historyRail}</aside>
          <div className="relative flex min-h-0 flex-col overflow-hidden bg-background">
            {historyQuery.isLoading || providerQuery.isLoading ? (
              <AiChatLoadingState />
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
                streaming={streaming}
                onApprove={(proposal, approved) =>
                  approveAiChatAction.mutate({ proposal, approved })
                }
              />
            ) : (
              <ConversationEmptyState
                className="min-h-0 flex-1"
                description={t("aiChat.empty.description")}
                icon={<MessageCircle aria-hidden className="size-6" />}
                title={t("aiChat.empty.title")}
              >
                <div className="grid w-full max-w-lg grid-cols-1 gap-2 text-left sm:grid-cols-3">
                  {[
                    t("aiChat.suggestion.latency"),
                    t("aiChat.suggestion.logs"),
                    t("aiChat.suggestion.dashboard"),
                  ].map((suggestion) => (
                    <Button
                      className="h-auto min-h-12 justify-start whitespace-normal rounded-md border bg-background px-3 py-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      key={suggestion}
                      onClick={() => {
                        setPrompt(suggestion);
                        focusPromptInput();
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <MessageCircle aria-hidden className="size-3 shrink-0" />
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </ConversationEmptyState>
            )}
            <PromptInput className="shrink-0 border-t px-3 py-2" onSubmit={submitPrompt}>
              <PromptInputBody className="mx-auto w-full max-w-6xl rounded-md border bg-background px-3 py-1 shadow-sm">
                <PromptInputTextarea
                  aria-label={t("aiChat.prompt")}
                  disabled={!providerConfigured || createConversation.isPending}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t("aiChat.promptPlaceholder")}
                  ref={promptRef}
                  value={prompt}
                />
                <PromptInputFooter className="px-0 pb-1">
                  <PromptInputTools>
                    <p className="text-xs text-muted-foreground">
                      {streaming ? (
                        <Shimmer>{t("aiChat.streaming")}</Shimmer>
                      ) : (
                        t("aiChat.prompt.textOnly")
                      )}
                    </p>
                  </PromptInputTools>
                  {streaming ? (
                    <Button onClick={() => streamAbort?.abort()} type="button" variant="outline">
                      <X data-icon="inline-start" />
                      {t("actions.cancel")}
                    </Button>
                  ) : (
                    <PromptInputSubmit
                      disabled={!canSubmitPrompt}
                      status={createConversation.isPending ? "submitted" : "ready"}
                    >
                      {t("aiChat.prompt.send")}
                    </PromptInputSubmit>
                  )}
                </PromptInputFooter>
                {createConversation.error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden />
                    <AlertTitle>{t("aiChat.createError")}</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                      <span>{errorMessage(createConversation.error)}</span>
                      <Button
                        className="w-fit"
                        disabled={!canSubmitPrompt}
                        type="submit"
                        variant="outline"
                      >
                        <Send data-icon="inline-start" />
                        {t("actions.retry")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                {streamState?.status === "failed" && streamState.error ? (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden />
                    <AlertTitle>{t("aiChat.runError")}</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                      <span>{streamState.error}</span>
                      {activeConversation ? (
                        <Button
                          className="w-fit"
                          onClick={() =>
                            void streamPrompt(activeConversation, streamState.userText)
                          }
                          type="button"
                          variant="outline"
                        >
                          <Send data-icon="inline-start" />
                          {t("actions.retry")}
                        </Button>
                      ) : null}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </PromptInputBody>
            </PromptInput>
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

function AiChatLoadingState() {
  return (
    <Conversation className="bg-background">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
        <Sparkles aria-hidden className="size-4 text-muted-foreground" />
        <Shimmer className="text-sm font-medium">{t("aiChat.streaming")}</Shimmer>
      </div>
      <ConversationContent className="bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <LoadingRows />
        </div>
      </ConversationContent>
    </Conversation>
  );
}

function ConversationHistoryRail({
  activeConversationId,
  groups,
  onDeleteConversation,
  onNewConversation,
  onOpenConversation,
  selectedProjectId,
}: {
  activeConversationId: string | null;
  groups: AiChatProjectGroup[];
  onDeleteConversation: (conversation: AiChatConversation) => void;
  onNewConversation: () => void;
  onOpenConversation: (conversation: AiChatConversation) => void;
  selectedProjectId: string;
}) {
  if (!groups.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <HistoryRailHeader count={0} onNewConversation={onNewConversation} />
        <div className="flex min-h-48 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
          {t("aiChat.history.empty")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HistoryRailHeader
        count={groups.reduce((count, group) => count + group.conversations.length, 0)}
        onNewConversation={onNewConversation}
      />
      <nav aria-label={t("aiChat.history")} className="min-h-0 flex-1 overflow-auto p-2">
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section className="flex flex-col gap-1" key={group.projectId}>
              <div className="flex items-center justify-between px-2">
                <h2 className="text-xs font-medium text-muted-foreground">{group.projectName}</h2>
                <span className="text-xs text-muted-foreground">{group.conversations.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {group.conversations.map((conversation) => (
                  <div
                    className={cn(
                      "group/history-item flex items-stretch gap-1 rounded-md border border-transparent",
                      conversation.id === activeConversationId
                        ? "border-border bg-background text-foreground"
                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                    key={conversation.id}
                  >
                    <Button
                      className="h-auto min-h-16 min-w-0 flex-1 flex-col items-start justify-start gap-1 rounded-md px-2 py-2 text-left text-inherit hover:bg-transparent hover:text-inherit"
                      onClick={() => onOpenConversation(conversation)}
                      type="button"
                      variant="ghost"
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <History aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span className="line-clamp-2 text-sm font-medium">
                          {conversation.title}
                        </span>
                      </span>
                      <span className="flex max-w-full items-center gap-2 text-xs text-muted-foreground">
                        {conversation.projectId !== selectedProjectId ? (
                          <Badge variant="outline">{t("aiChat.history.otherProject")}</Badge>
                        ) : null}
                        <Clock3 aria-hidden className="size-3" />
                        <span className="truncate">
                          {formatDateTime(conversation.lastMessageAt)}
                        </span>
                      </span>
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          aria-label={t("aiChat.history.delete")}
                          className="my-2 mr-1 size-8 shrink-0 opacity-70 hover:opacity-100"
                          size="icon"
                          title={t("aiChat.history.delete")}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("aiChat.history.deleteTitle")}</DialogTitle>
                          <DialogDescription>
                            {t("aiChat.history.deleteDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button type="button" variant="outline">
                              <X aria-hidden className="size-4" />
                              {t("actions.cancel")}
                            </Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button
                              onClick={() => onDeleteConversation(conversation)}
                              type="button"
                              variant="destructive"
                            >
                              <Trash2 data-icon="inline-start" />
                              {t("aiChat.history.delete")}
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HistoryRailHeader({
  count,
  onNewConversation,
}: {
  count: number;
  onNewConversation: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
      <div className="flex min-w-0 items-center gap-2">
        <PanelLeft aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="truncate text-sm font-semibold">{t("aiChat.history")}</h2>
      </div>
      <div className="flex items-center gap-1.5">
        <Badge variant="outline">{count}</Badge>
        <Button
          aria-label={t("aiChat.newConversation")}
          onClick={onNewConversation}
          size="icon"
          title={t("aiChat.newConversation")}
          type="button"
          variant="ghost"
        >
          <MessageSquarePlus aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ConversationTranscript({
  approvalPending,
  conversation,
  onApprove,
  streaming,
}: {
  approvalPending: boolean;
  conversation: AiChatConversation;
  onApprove: (proposal: AiChatActionProposal, approved: boolean) => void;
  streaming: boolean;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const messageGrowthKey = useMemo(
    () =>
      conversation.messages
        .map((message) => {
          const partGrowth = message.parts
            .map((part) => (part.type === "text" ? (part.text ?? "").length : part.type))
            .join(",");
          return `${message.id}:${partGrowth}`;
        })
        .join("|"),
    [conversation.messages],
  );
  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = contentRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ behavior, top: node.scrollHeight });
  }, []);
  const scrollTrigger = `${conversation.id}:${messageGrowthKey}`;

  useEffect(() => {
    void scrollTrigger;
    if (!streaming && !stickToBottom.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollToLatest(streaming ? "auto" : "smooth");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollToLatest, scrollTrigger, streaming]);

  return (
    <Conversation className="bg-background">
      <ConversationContent
        className="bg-background"
        onScroll={(event) => {
          const node = event.currentTarget;
          stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
        }}
        ref={contentRef}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pt-4 pb-6">
          <div className="flex justify-end">
            <ConversationStatusBadges conversation={conversation} streaming={streaming} />
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
              <Message from={message.role} key={message.id}>
                {message.role !== "user" ? (
                  <MessageAvatar>
                    <Bot className="size-4" aria-hidden />
                  </MessageAvatar>
                ) : null}
                <div
                  className={cn(
                    "flex max-w-[min(1040px,100%)] flex-col gap-1",
                    message.role === "user" && "items-end",
                  )}
                >
                  <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <span>
                      {message.role === "user"
                        ? t("aiChat.message.user")
                        : t("aiChat.message.assistant")}
                    </span>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <MessageContent className="max-w-full" from={message.role}>
                    {message.parts.map((part, index) => {
                      const key = `${message.id}-${index}`;
                      if (part.type === "text") {
                        return (
                          <AssistantText
                            key={key}
                            pending={streaming && message.id.startsWith("local-assistant-")}
                            text={part.text ?? ""}
                          />
                        );
                      }
                      if (part.type === "artifact") {
                        return (
                          <ArtifactPanel
                            artifact={aiChatArtifactById(conversation, part.artifactId ?? null)}
                            key={key}
                          />
                        );
                      }
                      if (part.type === "action_proposal") {
                        return (
                          <ActionProposalPanel
                            disabled={approvalPending}
                            key={key}
                            onApprove={onApprove}
                            proposal={aiChatActionById(conversation, part.actionProposalId ?? null)}
                            streamPart={part}
                          />
                        );
                      }
                      if (part.type === "tool_status") {
                        return <ToolStatusPart key={key} part={part} />;
                      }
                      if (part.type === "approval_result") {
                        return <ApprovalResultPart key={key} part={part} />;
                      }
                      if (part.type === "error") {
                        return <ErrorPart key={key} part={part} />;
                      }
                      if (part.type === "compaction_summary") {
                        return <CompactionSummaryPart key={key} part={part} />;
                      }
                      return <UnknownMessagePart key={key} type={part.type} />;
                    })}
                  </MessageContent>
                  {message.role === "assistant" ? (
                    <MessageActions className="px-1">
                      <MessageAction
                        label={t("aiChat.message.copy")}
                        onClick={() => copyMessageText(message)}
                      >
                        <Clipboard aria-hidden className="size-3" />
                      </MessageAction>
                    </MessageActions>
                  ) : null}
                </div>
                {message.role === "user" ? (
                  <MessageAvatar className="bg-primary text-primary-foreground">
                    <span className="text-xs font-semibold">{t("aiChat.message.user")}</span>
                  </MessageAvatar>
                ) : null}
              </Message>
            ))}
          </div>
        </div>
      </ConversationContent>
      <ConversationScrollButton onClick={() => scrollToLatest()} />
    </Conversation>
  );
}

function AssistantText({ pending, text }: { pending: boolean; text: string }) {
  if (pending && !text.trim()) {
    return (
      <div
        aria-label={t("aiChat.pending")}
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderInline />
        <Shimmer>{t("aiChat.pending")}</Shimmer>
      </div>
    );
  }

  return <MarkdownResponse className={pending ? "text-muted-foreground" : undefined} text={text} />;
}

function LoaderInline() {
  return (
    <span
      aria-hidden
      className="size-3 rounded-full border border-muted-foreground/40 border-t-foreground motion-safe:animate-spin"
    />
  );
}

function ConversationStatusBadges({
  conversation,
  streaming,
}: {
  conversation: AiChatConversation;
  streaming: boolean;
}) {
  const run = conversation.latestRun;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {conversation.status === "archived" ? (
        <Badge variant="outline">{t("aiChat.archived")}</Badge>
      ) : null}
      {streaming ? <Badge variant="secondary">{t("aiChat.streaming")}</Badge> : null}
      {run ? <Badge variant="secondary">{run.status}</Badge> : null}
      {run?.problem ? <Badge variant="destructive">{t("aiChat.runError")}</Badge> : null}
    </div>
  );
}

function ToolStatusPart({ part }: { part: AiChatMessage["parts"][number] }) {
  const durationMs = jsonRecord(part.json)?.durationMs;
  const errorCode = jsonRecord(part.json)?.errorCode;
  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
      <Clock3 aria-hidden className="size-3 text-muted-foreground" />
      <span className="font-medium">{part.label ?? part.toolName ?? t("aiChat.tool.label")}</span>
      {part.toolName ? (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{part.toolName}</code>
      ) : null}
      {part.status ? <Badge variant="outline">{part.status}</Badge> : null}
      {typeof durationMs === "number" ? (
        <span className="text-muted-foreground">{durationMs}ms</span>
      ) : null}
      {typeof errorCode === "string" ? <Badge variant="destructive">{errorCode}</Badge> : null}
    </div>
  );
}

function ApprovalResultPart({ part }: { part: AiChatMessage["parts"][number] }) {
  return (
    <Alert className="bg-background">
      <Check aria-hidden />
      <AlertTitle>{t("aiChat.approval.result")}</AlertTitle>
      <AlertDescription>{part.text ?? stringifyJsonValue(part.json)}</AlertDescription>
    </Alert>
  );
}

function ErrorPart({ part }: { part: AiChatMessage["parts"][number] }) {
  const problem = jsonRecord(part.problem);
  const code = typeof problem?.code === "string" ? problem.code : null;
  const detail = typeof problem?.detail === "string" ? problem.detail : part.text;
  return (
    <Alert className="bg-background" variant="destructive">
      <AlertCircle aria-hidden />
      <AlertTitle>{code ?? t("aiChat.runError")}</AlertTitle>
      {detail ? <AlertDescription>{detail}</AlertDescription> : null}
    </Alert>
  );
}

function CompactionSummaryPart({ part }: { part: AiChatMessage["parts"][number] }) {
  return (
    <Alert className="bg-background">
      <Archive aria-hidden />
      <AlertTitle>{t("aiChat.compaction.title")}</AlertTitle>
      <AlertDescription>{part.text ?? stringifyJsonValue(part.json)}</AlertDescription>
    </Alert>
  );
}

function UnknownMessagePart({ type }: { type: string }) {
  return (
    <Badge className="w-fit" variant="outline">
      {type}
    </Badge>
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
  streamPart,
}: {
  disabled: boolean;
  onApprove: (proposal: AiChatActionProposal, approved: boolean) => void;
  proposal: AiChatActionProposal | null;
  streamPart?: AiChatMessage["parts"][number];
}) {
  if (!proposal) {
    const preview = jsonRecord(streamPart?.json);
    return (
      <Alert className="bg-background">
        <ShieldAlert aria-hidden />
        <AlertTitle>{t("aiChat.approval.missing")}</AlertTitle>
        <AlertDescription className="flex flex-wrap gap-2">
          {typeof preview?.actionKind === "string" ? (
            <Badge variant="outline">{preview.actionKind}</Badge>
          ) : null}
          {typeof preview?.risk === "string" ? (
            <Badge variant="outline">{preview.risk}</Badge>
          ) : null}
        </AlertDescription>
      </Alert>
    );
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
        code={JSON.stringify(proposal.inputPreview, null, 2)}
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
                code={JSON.stringify(proposal.inputPreview, null, 2)}
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
  streamState: AiChatStreamViewState | null,
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
  const shouldRenderLocalAssistant =
    streamState.assistantParts.length > 0 ||
    streamState.error ||
    streamState.status === "streaming";
  const assistantText = messageTextFromParts(streamState.assistantParts);
  const localAssistantAlreadyPersisted =
    streamState.status === "completed" &&
    !streamState.error &&
    messages.some((message) => assistantMessageMatches(message, assistantText));
  if (shouldRenderLocalAssistant && !localAssistantAlreadyPersisted) {
    const parts =
      streamState.assistantParts.length > 0
        ? streamState.assistantParts
        : [
            {
              type: "text" as const,
              text: streamState.error ?? t("aiChat.streaming"),
            },
          ];
    messages.push({
      id: `local-assistant-${streamState.conversationId}`,
      conversationId: conversation.id,
      role: "assistant",
      parts,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ...conversation,
    latestRun: {
      id: streamState.runId ?? conversation.latestRun?.id ?? "local-streaming-run",
      conversationId: conversation.id,
      projectId: conversation.projectId,
      userId: conversation.userId,
      status: streamState.status === "completed" ? "completed" : streamState.status,
      providerKind:
        conversation.latestRun?.providerKind ??
        providerSettings?.providerProfile?.providerKind ??
        "configured",
      providerProfileId:
        conversation.latestRun?.providerProfileId ??
        providerSettings?.providerProfile?.id ??
        "provider",
      model:
        conversation.latestRun?.model ?? providerSettings?.chatModelAlias?.model ?? "configured",
      traceId: conversation.latestRun?.traceId ?? null,
      toolCallCount: conversation.latestRun?.toolCallCount ?? 0,
      sandboxScriptCount: conversation.latestRun?.sandboxScriptCount ?? 0,
      artifactCount: conversation.latestRun?.artifactCount ?? 0,
      inputTokenCount: conversation.latestRun?.inputTokenCount ?? null,
      outputTokenCount: conversation.latestRun?.outputTokenCount ?? null,
      estimatedCostUsd: conversation.latestRun?.estimatedCostUsd ?? null,
      artifacts: mergeById(conversation.latestRun?.artifacts ?? [], streamState.artifacts),
      actionProposals: mergeById(
        conversation.latestRun?.actionProposals ?? [],
        streamState.actionProposals,
      ),
      startedAt: conversation.latestRun?.startedAt ?? new Date().toISOString(),
      completedAt:
        streamState.status === "completed" || streamState.status === "failed"
          ? new Date().toISOString()
          : null,
      problem: streamState.error ? { detail: streamState.error } : null,
    },
    messages,
  };
}

function assistantMessageMatches(message: AiChatMessage, text: string): boolean {
  return (
    message.role === "assistant" &&
    normalizeMessageText(messageText(message)) === normalizeMessageText(text)
  );
}

function upsertConversationInHistory(
  history: AiChatHistory | undefined,
  conversation: AiChatConversation,
): AiChatHistory | undefined {
  if (!history) {
    return history;
  }
  let foundGroup = false;
  const projectGroups = history.projectGroups.map((group) => {
    const conversations = group.conversations.filter((item) => item.id !== conversation.id);
    if (group.projectId !== conversation.projectId) {
      return { ...group, conversations };
    }
    foundGroup = true;
    return { ...group, conversations: [conversation, ...conversations] };
  });
  if (!foundGroup) {
    projectGroups.unshift({
      projectId: conversation.projectId,
      projectName: conversation.projectId,
      conversations: [conversation],
    });
  }
  return { ...history, projectGroups };
}

function removeConversationFromHistory(
  history: AiChatHistory | undefined,
  conversationId: string,
): AiChatHistory | undefined {
  if (!history) {
    return history;
  }
  return {
    ...history,
    projectGroups: history.projectGroups
      .map((group) => ({
        ...group,
        conversations: group.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        ),
      }))
      .filter((group) => group.conversations.length > 0),
  };
}

function isHydratedAiChatConversation(
  conversation: AiChatConversation | null | undefined,
): conversation is AiChatConversation {
  return Boolean(conversation && conversation.messages.length > 0);
}

function conversationInSelectedProject(
  conversation: AiChatConversation | null | undefined,
  projectId: string,
  userId?: string | null,
): AiChatConversation | null {
  return conversation?.projectId === projectId && (!userId || conversation.userId === userId)
    ? conversation
    : null;
}

function userMessageMatches(message: AiChatMessage, text: string) {
  return (
    message.role === "user" &&
    message.parts.some((part) => part.type === "text" && part.text === text)
  );
}

function messageText(message: AiChatMessage): string {
  return message.parts
    .filter((part): part is { text: string; type: "text" } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function messageTextFromParts(parts: AiChatMessage["parts"]): string {
  return parts
    .filter((part): part is { text: string; type: "text" } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, JSONValue> | null {
  return isRecord(value) ? value : null;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = [...current];
  for (const item of incoming) {
    const index = merged.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) {
      merged.push(item);
    } else {
      merged[index] = item;
    }
  }
  return merged;
}

function stringifyJsonValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : t("errors.generic");
}

function copyMessageText(message: AiChatMessage) {
  const text = message.parts
    .filter((part): part is { text: string; type: "text" } => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");

  if (text && typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}
