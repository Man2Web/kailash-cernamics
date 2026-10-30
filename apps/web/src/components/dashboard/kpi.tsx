import Link from "next/link";
import { cn } from "@/lib/utils";

const TONES = {
  blue: "bg-ios-blue/12 text-ios-blue",
  green: "bg-ios-green/14 text-ios-green",
  orange: "bg-ios-orange/14 text-ios-orange",
  red: "bg-ios-red/12 text-ios-red",
  indigo: "bg-ios-indigo/14 text-ios-indigo",
  teal: "bg-ios-teal/14 text-ios-teal",
  gray: "bg-fill-strong text-foreground/70",
} as const;

export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "blue",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col gap-2 rounded-xl bg-card p-4 shadow-card transition-colors hover:bg-card/80">
      <div className="flex items-center gap-2">
        <span className={cn("grid size-7 place-items-center rounded-lg", TONES[tone])}>
          <Icon className="size-4" />
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[22px] leading-tight font-bold tracking-tight tabular">{value}</div>
      {sub && <div className="text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Horizontal bar list (top brands etc.) — plain CSS bars, value labels right-aligned. */
export function BarList({ items, format }: { items: { name: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.name} className="text-[13px]">
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate font-medium">{i.name}</span>
            <span className="shrink-0 text-muted-foreground tabular">{format(i.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-fill">
            <div className="h-1.5 rounded-full bg-tint" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
