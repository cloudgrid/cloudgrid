import {
  Activity,
  Bot,
  Braces,
  Clipboard,
  FilterX,
  FolderOpen,
  LayoutDashboard,
  LineChart,
  TerminalSquare,
} from "lucide-react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../../components/ui/command";
import { copyToClipboard } from "../../lib/feedback";
import { t } from "../../lib/i18n";
import { useAppSession } from "../../providers/app-session-provider";
import { aiEvalEnabled } from "../../routes/ai-eval-route";

const traceListFilterKeys = [
  "service",
  "query",
  "operationName",
  "spanName",
  "from",
  "to",
  "status",
  "minDurationMs",
  "maxDurationMs",
  "attributes",
  "sort",
  "cursor",
];

const logFilterKeys = [
  "service",
  "traceId",
  "spanId",
  "severity",
  "from",
  "to",
  "search",
  "attributes",
  "sort",
  "cursor",
];

const traceDetailFilterKeys = [
  "spanQuery",
  "spanService",
  "spanName",
  "spanStatus",
  "minSpanDurationMs",
  "maxSpanDurationMs",
  "attributes",
  "showMatchesOnly",
  "criticalPathOnly",
  "errorsOnly",
  "logSearch",
];

function currentTraceId(pathname: string) {
  return matchPath("/traces/:traceId", pathname)?.params.traceId ?? null;
}

function clearFilterSearch(pathname: string, search: string) {
  const params = new URLSearchParams(search);

  if (currentTraceId(pathname)) {
    for (const key of traceDetailFilterKeys) {
      params.delete(key);
    }
    return params.toString();
  }

  if (pathname.startsWith("/logs")) {
    for (const key of logFilterKeys) {
      params.delete(key);
    }
    return params.toString();
  }

  for (const key of traceListFilterKeys) {
    params.delete(key);
  }
  return params.toString();
}

export function CommandPalette({
  open,
  onOpenChange,
  showGraphQLUiLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showGraphQLUiLink: boolean;
}) {
  const { viewer } = useAppSession();
  const location = useLocation();
  const navigate = useNavigate();
  const traceId = currentTraceId(location.pathname);
  const selectedProject = viewer?.selectedProject ?? null;

  const runAction = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  const clearFilters = () => {
    const nextSearch = clearFilterSearch(location.pathname, location.search);
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`);
  };

  return (
    <CommandDialog
      description={t("command.placeholder")}
      onOpenChange={onOpenChange}
      open={open}
      title={t("nav.command")}
    >
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.noResults")}</CommandEmpty>
        <CommandGroup heading={t("command.routes")}>
          <CommandItem onSelect={() => runAction(() => navigate("/projects"))}>
            <FolderOpen />
            <span>{t("nav.projects")}</span>
            <CommandShortcut>/projects</CommandShortcut>
          </CommandItem>
          {selectedProject ? (
            <>
              <CommandItem onSelect={() => runAction(() => navigate("/traces"))}>
                <Activity />
                <span>{t("nav.traces")}</span>
                <CommandShortcut>/traces</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => navigate("/traces?mode=live"))}>
                <Activity />
                <span>{t("live.title")}</span>
                <CommandShortcut>/traces?mode=live</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => navigate("/logs"))}>
                <TerminalSquare />
                <span>{t("nav.logs")}</span>
                <CommandShortcut>/logs</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => navigate("/metrics"))}>
                <LineChart />
                <span>{t("nav.metrics")}</span>
                <CommandShortcut>/metrics</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => navigate("/dashboards"))}>
                <LayoutDashboard />
                <span>{t("nav.dashboards")}</span>
                <CommandShortcut>/dashboards</CommandShortcut>
              </CommandItem>
              {aiEvalEnabled ? (
                <CommandItem onSelect={() => runAction(() => navigate("/ai-eval"))}>
                  <Bot />
                  <span>{t("nav.aiEval")}</span>
                  <CommandShortcut>/ai-eval</CommandShortcut>
                </CommandItem>
              ) : null}
            </>
          ) : null}
          {traceId ? (
            <CommandItem
              onSelect={() => runAction(() => navigate(`/traces/${traceId}${location.search}`))}
            >
              <Activity />
              <span>{t("traceDetail.title")}</span>
              <CommandShortcut>{traceId.slice(0, 8)}</CommandShortcut>
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("command.actions")}>
          <CommandItem onSelect={() => runAction(clearFilters)}>
            <FilterX />
            <span>{t("filters.clear")}</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => void copyToClipboard(window.location.href))}>
            <Clipboard />
            <span>{t("actions.copyUrl")}</span>
          </CommandItem>
          {showGraphQLUiLink ? (
            <CommandItem onSelect={() => runAction(() => window.location.assign("/graphql"))}>
              <Braces />
              <span>{t("actions.openGraphql")}</span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
