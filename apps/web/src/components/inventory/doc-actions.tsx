"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, useApiMutation } from "@/lib/api";

/** A button that POSTs to a document action (post, submit, cancel…) with confirmation and toasts. */
export function DocActionButton({
  path,
  label,
  confirmText,
  invalidate,
  variant = "default",
  onDone,
  body,
}: {
  path: string;
  label: string;
  confirmText?: string;
  invalidate: string[];
  variant?: "default" | "secondary" | "destructive" | "outline";
  onDone?: (res: unknown) => void;
  body?: unknown;
}) {
  const m = useApiMutation(() => api(path, { method: "POST", body: body ?? {} }), invalidate);
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={m.isPending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        m.mutate(undefined, {
          onSuccess: (res) => {
            toast.success(`${label} done`);
            onDone?.(res);
          },
          onError: (e) => toast.error(e.message),
        });
      }}
    >
      {m.isPending ? "Working…" : label}
    </Button>
  );
}

export function LinesTable({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto md:mx-0">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="h-8 px-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
