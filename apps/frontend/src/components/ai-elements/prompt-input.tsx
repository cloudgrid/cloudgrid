import { Loader2, Send, Square } from "lucide-react";
import type { ComponentProps, KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export function PromptInput({ className, ...props }: ComponentProps<"form">) {
  return <form className={cn("bg-background", className)} {...props} />;
}

export function PromptInputBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function PromptInputTextarea({
  className,
  onKeyDown,
  ...props
}: ComponentProps<typeof Textarea>) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <Textarea
      className={cn(
        "max-h-48 min-h-20 resize-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export function PromptInputFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3", className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 items-center gap-2", className)} {...props} />;
}

export function PromptInputSubmit({
  children,
  className,
  status = "ready",
  ...props
}: ComponentProps<typeof Button> & {
  status?: "error" | "ready" | "submitted" | "streaming";
}) {
  const icon =
    status === "streaming" || status === "submitted" ? (
      <Loader2 aria-hidden className="size-4 animate-spin" />
    ) : status === "error" ? (
      <Square aria-hidden className="size-4" />
    ) : (
      <Send aria-hidden className="size-4" />
    );

  return (
    <Button className={cn("gap-2", className)} type="submit" {...props}>
      {icon}
      {children}
    </Button>
  );
}
