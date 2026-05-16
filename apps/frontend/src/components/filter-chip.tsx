import { X } from "lucide-react";
import { Button } from "./ui/button";

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button
      className="h-7 max-w-64 justify-start rounded-full px-2.5 text-xs"
      onClick={onRemove}
      type="button"
      variant="outline"
    >
      <span className="truncate">{label}</span>
      <X data-icon="inline-end" />
    </Button>
  );
}
