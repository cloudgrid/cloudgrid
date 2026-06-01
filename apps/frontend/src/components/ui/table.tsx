"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string;
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, onClick, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

type TableSortDirection = "asc" | "desc" | null;

function SortableTableHead({
  children,
  className,
  direction,
  onSort,
  ...props
}: React.ComponentProps<"th"> & {
  direction?: TableSortDirection;
  onSort: () => void;
}) {
  const Icon =
    direction === "asc" ? ArrowUpIcon : direction === "desc" ? ArrowDownIcon : ChevronsUpDownIcon;
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";

  return (
    <TableHead className={className} aria-sort={ariaSort} {...props}>
      <button
        className="inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        onClick={onSort}
        type="button"
      >
        <span className="truncate">{children}</span>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export type { TableSortDirection };
export {
  SortableTableHead,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
