import { AlertTriangle, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({ title = "Nothing here yet", description, action, className }: { title?: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      <Inbox className="size-8 text-muted-foreground/60" />
      <div className="text-[15px] font-medium">{title}</div>
      {description && <p className="max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry, className }: { error: unknown; retry?: () => void; className?: string }) {
  const message = error && typeof error === "object" && "message" in error ? String((error as Error).message) : "Could not load data";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      <AlertTriangle className="size-8 text-ios-orange" />
      <div className="text-[15px] font-medium">Something went wrong</div>
      <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>
      {retry && (
        <Button variant="secondary" size="sm" onClick={retry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 py-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-60" />
      <Skeleton className="h-28 w-full" />
      <LoadingRows rows={8} />
    </div>
  );
}
