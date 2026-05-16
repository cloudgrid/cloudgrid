import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { telemetryErrorViewModel } from "../lib/telemetry-error";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

type DataStateProps = {
  children: ReactNode;
  empty?: boolean;
  error?: unknown;
  filtered?: boolean;
  loading?: boolean;
  onRetry: () => void;
  primaryAction: ReactNode;
};

export function LoadingRows() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton className="h-10 w-full" key={index.toString()} />
      ))}
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
  title,
}: {
  error?: unknown;
  onRetry: () => void;
  title?: ReactNode;
}) {
  const view = telemetryErrorViewModel(error);
  return (
    <Alert className="bg-background" variant="destructive">
      <AlertTitle>{title ?? view.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{view.description}</span>
        {view.code || view.status ? (
          <span className="text-xs">
            {view.code ? `${t("state.error.code")}: ${view.code}` : null}
            {view.code && view.status ? " · " : null}
            {view.status ? `${t("state.error.status")}: ${view.status}` : null}
            {view.retryable === false ? ` · ${t("state.error.notRetryable")}` : null}
          </span>
        ) : null}
        <Button onClick={onRetry} variant="outline">
          <RefreshCw data-icon="inline-start" />
          {t("actions.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  description,
  filtered,
  primaryAction,
  title,
}: {
  description?: ReactNode;
  filtered: boolean;
  primaryAction: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background p-6 text-center">
      <div>
        <h2 className="font-semibold">
          {title ?? (filtered ? t("state.empty.filtered.title") : t("state.empty.ingested.title"))}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description ??
            (filtered
              ? t("state.empty.filtered.description")
              : t("state.empty.ingested.description"))}
        </p>
      </div>
      {primaryAction}
    </div>
  );
}

export function DataState({
  children,
  empty = false,
  error,
  filtered = false,
  loading = false,
  onRetry,
  primaryAction,
}: DataStateProps) {
  if (loading) {
    return <LoadingRows />;
  }

  if (error) {
    return <ErrorPanel error={error} onRetry={onRetry} />;
  }

  if (empty) {
    return <EmptyState filtered={filtered} primaryAction={primaryAction} />;
  }

  return children;
}
