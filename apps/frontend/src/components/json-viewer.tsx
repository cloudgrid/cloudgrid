import type { JSONValue } from "@cloudgrid/ui-contracts";
import { Braces } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { CodeBlock } from "./code-block";
import { CopyButton } from "./copy-button";
import { Button } from "./ui/button";

function isLargeObject(value: JSONValue) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 20,
  );
}

export function JsonViewer({ value }: { value: JSONValue }) {
  const [expanded, setExpanded] = useState(!isLargeObject(value));
  const rendered = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const preview = useMemo(() => JSON.stringify(value), [value]);

  if (!expanded) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
        <code className="truncate font-mono text-xs">{preview}</code>
        <div className="flex shrink-0 items-center gap-2">
          <CopyButton aria-label={t("actions.copy")} value={preview} />
          <Button onClick={() => setExpanded(true)} size="sm" type="button" variant="outline">
            <Braces data-icon="inline-start" />
            JSON
          </Button>
        </div>
      </div>
    );
  }

  return <CodeBlock code={rendered} language="json" title="JSON" />;
}
