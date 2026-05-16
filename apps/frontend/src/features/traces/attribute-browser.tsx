import type { JSONValue } from "@cloudgrid/ui-contracts";
import { Copy, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "../../components/code-block";
import { SearchInput } from "../../components/search-input";
import { Button } from "../../components/ui/button";
import { jsonPreview } from "../../lib/format";
import { t } from "../../lib/i18n";
import { copyText } from "./trace-detail-types";

const attributeGroups = [
  { label: "HTTP", prefixes: ["http.", "url.", "server.", "client."] },
  { label: "RPC", prefixes: ["rpc."] },
  { label: "Database", prefixes: ["db."] },
  { label: "Messaging", prefixes: ["messaging."] },
  { label: "AI", prefixes: ["gen_ai."] },
  {
    label: "Service/resource",
    prefixes: ["service.", "deployment.", "telemetry.sdk.", "host.", "process."],
  },
  { label: "Security/user", prefixes: ["user.", "enduser.", "auth.", "security."] },
] as const;

export function jsonValueEntries(value: JSONValue): [string, JSONValue][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value) as [string, JSONValue][];
}

export function jsonValueToCopyText(value: JSONValue) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function groupedAttributes(attributes: JSONValue, search: string) {
  const query = search.trim().toLowerCase();
  const entries = jsonValueEntries(attributes).filter(([key, value]) => {
    if (!query) {
      return true;
    }

    return `${key} ${jsonPreview(value)}`.toLowerCase().includes(query);
  });
  const used = new Set<string>();
  const groups = attributeGroups
    .map((group) => {
      const rows = entries.filter(([key]) =>
        group.prefixes.some((prefix) => key.startsWith(prefix)),
      );
      for (const [key] of rows) {
        used.add(key);
      }
      return { label: group.label, rows };
    })
    .filter((group) => group.rows.length > 0);
  const rawRows = entries.filter(([key]) => !used.has(key));

  return rawRows.length > 0 ? [...groups, { label: "Raw attributes", rows: rawRows }] : groups;
}

export function AttributeEvidenceBrowser({
  attributes,
  search,
  setSearch,
}: {
  attributes: JSONValue;
  search: string;
  setSearch: (value: string) => void;
}) {
  const groups = groupedAttributes(attributes, search);

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        aria-label={t("traceDetail.searchAttributes")}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("traceDetail.searchAttributes")}
        value={search}
      />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("traceDetail.noItems")}</p>
      ) : (
        groups.map((group) => (
          <section className="overflow-hidden rounded-md border" key={group.label}>
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <h3 className="text-xs font-medium">{group.label}</h3>
              <span className="text-xs text-muted-foreground">{group.rows.length}</span>
            </div>
            <div className="divide-y">
              {group.rows.map(([key, value]) => (
                <AttributeRow key={key} name={key} value={value} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function AttributeRow({ name, value }: { name: string; value: JSONValue }) {
  const expandable = value !== null && typeof value === "object";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-3 py-2">
      <div className="grid grid-cols-[minmax(160px,0.7fr)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
        <span className="truncate font-mono text-muted-foreground" title={name}>
          {name}
        </span>
        <span className="truncate font-mono" title={jsonPreview(value)}>
          {jsonPreview(value)}
        </span>
        <span className="flex items-center gap-1">
          {expandable ? (
            <Button
              aria-label={expanded ? t("actions.collapse") : t("actions.expand")}
              onClick={() => setExpanded((current) => !current)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              {expanded ? <Minus /> : <Plus />}
            </Button>
          ) : null}
          <Button
            aria-label={t("traceDetail.copyAttribute")}
            onClick={() => copyText(`${name}=${jsonValueToCopyText(value)}`)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Copy />
          </Button>
        </span>
      </div>
      {expanded ? (
        <div className="mt-2">
          <CodeBlock
            code={jsonValueToCopyText(value)}
            language={typeof value === "string" ? "log" : "json"}
            maxHeightClassName="max-h-48"
          />
        </div>
      ) : null}
    </div>
  );
}
