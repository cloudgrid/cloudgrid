import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { copyToClipboard } from "../lib/feedback";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function CopyButton({
  "aria-label": ariaLabel = t("actions.copy"),
  onCopied,
  value,
}: {
  "aria-label"?: string;
  onCopied?: () => void;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      onCopied?.();
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={copied ? t("actions.copied") : ariaLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copy();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("actions.copied") : ariaLabel}</TooltipContent>
    </Tooltip>
  );
}
