import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";

export function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  label,
  loadingLabel,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  label: string;
  loadingLabel: string;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  if (!hasMore) {
    return null;
  }

  return (
    <div className="flex justify-center p-3" ref={ref}>
      <Button disabled={isLoading} onClick={onLoadMore} type="button" variant="outline">
        {isLoading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
        {isLoading ? loadingLabel : label}
      </Button>
    </div>
  );
}
