import type { SpanLink } from "@cloudgrid/ui-contracts";
import { Copy, ExternalLink, LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { t } from "../../lib/i18n";
import { AttributeEvidenceBrowser, jsonValueEntries } from "./attribute-browser";
import { copyText } from "./trace-detail-types";

function linkReference(link: SpanLink) {
  return JSON.stringify(
    {
      traceId: link.traceId,
      spanId: link.spanId,
      direction: link.direction,
      traceState: link.traceState ?? null,
      attributes: link.attributes,
    },
    null,
    2,
  );
}

export function SpanLinksTable({
  currentTraceId,
  links,
  onSelectSpanId,
}: {
  currentTraceId: string;
  links: SpanLink[];
  onSelectSpanId: (spanId: string) => void;
}) {
  if (links.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("traceDetail.noItems")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("logs.column.trace")}</TableHead>
          <TableHead>{t("logs.column.span")}</TableHead>
          <TableHead>{t("traceDetail.links")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => (
          <TableRow key={`${link.traceId}-${link.spanId}`}>
            <TableCell className="font-mono text-xs">{link.traceId}</TableCell>
            <TableCell className="font-mono text-xs">{link.spanId}</TableCell>
            <TableCell className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <LinkIcon className="size-3" />
                  {link.direction}
                </span>
                {link.traceId === currentTraceId ? (
                  <Button
                    onClick={() => onSelectSpanId(link.spanId)}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <LinkIcon data-icon="inline-start" />
                    Select span
                  </Button>
                ) : (
                  <Button asChild size="xs" type="button" variant="outline">
                    <Link
                      to={`/traces/${encodeURIComponent(link.traceId)}?spanId=${encodeURIComponent(link.spanId)}`}
                    >
                      <ExternalLink />
                      Open trace
                    </Link>
                  </Button>
                )}
                <Button
                  aria-label={t("traceDetail.copyLinkReference")}
                  onClick={() => copyText(linkReference(link))}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Copy />
                </Button>
              </div>
              {jsonValueEntries(link.attributes).length > 0 ? (
                <AttributeEvidenceBrowser
                  attributes={link.attributes}
                  search=""
                  setSearch={() => {}}
                />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
