"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface N {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useApi<{ items: N[]; unread: number }>("/notifications");
  const readAll = async () => {
    await api("/notifications/read-all", { method: "POST", body: {} });
    qc.invalidateQueries({ queryKey: ["/notifications"] });
  };
  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" size="sm" onClick={readAll}>Mark all read</Button>} />
      <Section>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.items.length ? (
          <EmptyState title="You're all caught up" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 py-3", !n.readAt && "font-medium")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-tint")} />
                <div className="min-w-0 flex-1">
                  {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                  {n.body && <p className="text-[13px] font-normal text-muted-foreground">{n.body}</p>}
                </div>
                <span className="shrink-0 text-[12px] font-normal text-muted-foreground">{formatDateTime(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
