"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ZodType } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { newIdempotencyKey } from "@/lib/api";

/** Simple keyed line state for document line grids. */
export function useLines<T extends object>(blank: () => T, initial?: T[]) {
  const [lines, setLines] = useState<(T & { _key: string })[]>(() => (initial?.length ? initial : [blank()]).map((l) => ({ ...l, _key: newIdempotencyKey() })));
  return {
    lines,
    setLines,
    add: () => setLines((ls) => [...ls, { ...blank(), _key: newIdempotencyKey() }]),
    remove: (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l._key !== key) : ls)),
    update: (key: string, patch: Partial<T>) => setLines((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l))),
    plain: () => lines.map(({ _key, ...rest }) => rest as unknown as T),
  };
}

export function AddLineButton({ onClick, label = "Add line" }: { onClick: () => void; label?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <Plus className="size-4" /> {label}
    </Button>
  );
}

export function RemoveLineButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={onClick} aria-label="Remove line">
      <Trash2 className="size-4" />
    </Button>
  );
}

/** Validate with the shared Zod schema before sending; shows the first problem as a toast. */
export function validate<T>(schema: ZodType<T>, value: unknown): T | null {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue.path.length ? ` (${issue.path.map((p) => (typeof p === "number" ? `line ${p + 1}` : String(p))).join(" › ")})` : "";
  toast.error(`${issue.message}${where}`);
  return null;
}
