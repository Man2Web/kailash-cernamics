import { labelOf } from "@gc/shared";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  DRAFT: "bg-fill-strong text-foreground/80",
  SENT: "bg-ios-blue/12 text-ios-blue",
  PENDING: "bg-ios-orange/14 text-ios-orange",
  PENDING_APPROVAL: "bg-ios-orange/14 text-ios-orange",
  APPROVED: "bg-ios-teal/14 text-ios-teal",
  ACCEPTED: "bg-ios-teal/14 text-ios-teal",
  CONFIRMED: "bg-ios-teal/14 text-ios-teal",
  POSTED: "bg-ios-green/14 text-ios-green",
  COMPLETED: "bg-ios-green/14 text-ios-green",
  PAID: "bg-ios-green/14 text-ios-green",
  SYNCED: "bg-ios-indigo/14 text-ios-indigo",
  SUCCESS: "bg-ios-indigo/14 text-ios-indigo",
  PARTIAL: "bg-ios-purple/14 text-ios-purple",
  CONVERTED: "bg-ios-purple/14 text-ios-purple",
  FAILED: "bg-ios-red/12 text-ios-red",
  OVERDUE: "bg-ios-red/12 text-ios-red",
  REJECTED: "bg-ios-red/12 text-ios-red",
  CANCELLED: "bg-fill text-muted-foreground line-through",
  EXPIRED: "bg-fill text-muted-foreground",
  NOT_QUEUED: "bg-fill text-muted-foreground",
  BOUNCED: "bg-ios-red/12 text-ios-red",
  CLEARED: "bg-ios-green/14 text-ios-green",
  NEW: "bg-ios-blue/12 text-ios-blue",
  WON: "bg-ios-green/14 text-ios-green",
  LOST: "bg-fill text-muted-foreground",
  SALEABLE: "bg-ios-green/14 text-ios-green",
  DAMAGED: "bg-ios-red/12 text-ios-red",
  DISPLAY: "bg-ios-blue/12 text-ios-blue",
  RESERVED: "bg-ios-orange/14 text-ios-orange",
  // Office: attendance and employees
  PRESENT: "bg-ios-green/14 text-ios-green",
  LATE: "bg-ios-orange/14 text-ios-orange",
  HALF_DAY: "bg-ios-purple/14 text-ios-purple",
  LEAVE: "bg-ios-blue/12 text-ios-blue",
  ABSENT: "bg-ios-red/12 text-ios-red",
  NOT_MARKED: "bg-fill text-muted-foreground",
  ACTIVE: "bg-ios-green/14 text-ios-green",
  INACTIVE: "bg-fill text-muted-foreground",
  SUSPENDED: "bg-ios-orange/14 text-ios-orange",
  TERMINATED: "bg-ios-red/12 text-ios-red",
};

const LABELS: Record<string, string> = {
  SYNCED: "Synced to Tally",
  FAILED: "Sync failed",
  PENDING_APPROVAL: "Pending approval",
  NOT_QUEUED: "Not synced",
};

export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  if (!status) return null;
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", TONES[status] ?? "bg-fill text-foreground/80", className)}>
      {label ?? LABELS[status] ?? labelOf(status)}
    </span>
  );
}
