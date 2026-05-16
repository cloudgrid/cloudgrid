import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";

type SearchInputProps = ComponentProps<typeof Input> & {
  containerClassName?: string;
};

export function SearchInput({ containerClassName, className, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...props} className={cn("pl-8", className)} type="search" />
    </div>
  );
}
