import { ArrowDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function Conversation({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

export function ConversationContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="conversation-content"
      className={cn("min-h-0 flex-1 overflow-auto scroll-smooth px-4 py-4", className)}
      {...props}
    />
  );
}

export function ConversationEmptyState({
  children,
  className,
  description,
  icon,
  title,
  ...props
}: ComponentProps<"div"> & {
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function ConversationScrollButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      aria-label={t("aiChat.scrollLatest")}
      className={cn("absolute right-4 bottom-4 size-9 rounded-full", className)}
      size="icon"
      type="button"
      variant="secondary"
      {...props}
    >
      <ArrowDown aria-hidden className="size-4" />
    </Button>
  );
}
