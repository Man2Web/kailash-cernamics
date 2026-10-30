"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import { VisitCheckInDialog } from "@/components/crm/visit-checkin";
import { useSession } from "@/lib/session";

interface Row {
  id: string;
  checkInAt: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  photos: string[];
  lead: { id: string; name: string; phone: string | null } | null;
}

export default function VisitsPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Site visits"
        description="GPS check-ins with photos from customer sites."
        actions={can("crm.write") && <Button size="sm" onClick={() => setOpen(true)}><MapPin className="size-4" /> Check in</Button>}
      />
      <DataTable<Row>
        endpoint="/site-visits"
        exportName="site-visits"
        columns={[
          { accessorKey: "checkInAt", header: "When", meta: { exportValue: (r) => formatDateTime(r.checkInAt) }, cell: ({ row }) => formatDateTime(row.original.checkInAt) },
          { id: "lead", header: "Lead", meta: { exportValue: (r) => r.lead?.name }, cell: ({ row }) => (row.original.lead ? <Link href={`/crm/leads/${row.original.lead.id}`} className="font-medium hover:underline">{row.original.lead.name}</Link> : "—") },
          { id: "loc", header: "Location", meta: { exportValue: (r) => (r.lat !== null ? `${r.lat},${r.lng}` : "") }, cell: ({ row }) => row.original.lat !== null ? <a className="text-tint hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${row.original.lat},${row.original.lng}`}>Map</a> : "—" },
          { id: "photos", header: "Photos", meta: { exportValue: (r) => r.photos.length }, cell: ({ row }) => (
            <div className="flex gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {row.original.photos.slice(0, 4).map((p) => <img key={p} src={p} alt="" className="size-8 rounded object-cover" />)}
            </div>
          ) },
          { accessorKey: "notes", header: "Notes", cell: ({ row }) => <span className="line-clamp-2 max-w-80">{row.original.notes}</span> },
        ]}
      />
      {open && <VisitCheckInDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/site-visits" }); }} />}
    </>
  );
}
