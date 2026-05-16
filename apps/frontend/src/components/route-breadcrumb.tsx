import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../lib/i18n";
import { Button } from "./ui/button";

export interface RouteBreadcrumbItem {
  label: string;
  to?: string;
}

export function RouteBreadcrumb({
  backLabel,
  backTo,
  items,
}: {
  backLabel: string;
  backTo: string;
  items: RouteBreadcrumbItem[];
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <Button aria-label={backLabel} asChild size="icon-sm" variant="ghost">
        <Link to={backTo}>
          <ArrowLeft />
        </Link>
      </Button>
      <nav aria-label={t("nav.breadcrumb")} className="flex min-w-0 items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span
              className="flex min-w-0 items-center gap-1"
              key={`${item.to ?? "current"}:${index}:${item.label}`}
            >
              {index > 0 ? <ChevronRight className="size-3 shrink-0" aria-hidden /> : null}
              {item.to && !isLast ? (
                <Link
                  className="truncate rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  to={item.to}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-foreground">{item.label}</span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
