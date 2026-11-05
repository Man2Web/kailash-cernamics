"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, FileText, MapPin, MessageCircle, Phone, Pencil } from "lucide-react";
import { formatDateTime, formatINR, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeadForm, type Lead } from "@/components/crm/lead-form";
import { FollowupDoneDialog } from "@/components/crm/followup-done";
import { VisitCheckInDialog } from "@/components/crm/visit-checkin";
import { api, newIdempotencyKey, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface LeadDetail extends Lead {
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  party: { id: string; name: string; phone: string | null } | null;
  quotation: { id: string; number: string; status: string; totalPaise: number } | null;
  followups: { id: string; dueAt: string; doneAt: string | null; notes: string | null; outcome: string | null }[];
  visits: { id: string; checkInAt: string; lat: number | null; lng: number | null; notes: string | null; photos: string[] }[];
}

export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, on } = useSession();
  const q = useApi<LeadDetail>(`/leads/${id}`);
  const [editing, setEditing] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [visit, setVisit] = useState(false);
  const [nextAt, setNextAt] = useState("");
  const [converting, setConverting] = useState(false);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const l = q.data;
  const canWrite = can("crm.write");
  const wa = l.phone ? `https://wa.me/${l.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}` : null;

  const convert = async () => {
    setConverting(true);
    try {
      const r = await api<{ quotationId: string; number: string }>(`/leads/${l.id}/convert`, { method: "POST", body: {} });
      toast.success(`Quotation ${r.number} created`);
      router.push(`/sales/quotations/${r.quotationId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not convert");
      setConverting(false);
    }
  };
  const schedule = async () => {
    if (!nextAt) return;
    try {
      await api("/followups", { method: "POST", idempotencyKey: newIdempotencyKey(), body: { leadId: l.id, dueAt: new Date(`${nextAt}:00+05:30`).toISOString() } });
      setNextAt("");
      toast.success("Follow-up scheduled");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule");
    }
  };

  return (
    <>
      <PageHeader
        title={l.name}
        back={{ href: "/crm/leads", label: "Leads" }}
        description={<span className="flex items-center gap-2"><StatusBadge status={l.status} /> {labelOf(l.source)} · created {formatDateTime(l.createdAt)}</span>}
        actions={
          <>
            {l.phone && <Button asChild size="sm" variant="secondary"><a href={`tel:${l.phone}`}><Phone className="size-4" /> Call</a></Button>}
            {wa && <Button asChild size="sm" variant="secondary"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>}
            {canWrite && <Button size="sm" variant="secondary" onClick={() => setVisit(true)}><MapPin className="size-4" /> Check in</Button>}
            {canWrite && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>}
            {canWrite && on("sales.quotations") && can("quotation.write") && (
              l.quotation ? (
                <Button asChild size="sm"><Link href={`/sales/quotations/${l.quotation.id}`}><FileText className="size-4" /> Open {l.quotation.number}</Link></Button>
              ) : (
                <Button size="sm" onClick={convert} disabled={converting}><FileText className="size-4" /> {converting ? "Creating…" : "Convert to quotation"}</Button>
              )
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section>
            <InfoGrid items={[
              { label: "Phone", value: l.phone },
              { label: "Assigned to", value: l.assignedTo?.name },
              { label: "Next follow-up", value: formatDateTime(l.nextFollowupAt) || "—" },
              { label: "Customer", value: l.party ? <Link className="text-tint hover:underline" href={`/parties/${l.party.id}`}>{l.party.name}</Link> : "New" },
              { label: "Quotation", value: l.quotation ? `${l.quotation.number} · ${formatINR(l.quotation.totalPaise)}` : "—" },
              { label: "Email", value: l.email },
            ]} />
            {l.requirement && <p className="mt-4 text-[14px] whitespace-pre-line"><span className="text-[12px] text-muted-foreground">Requirement</span><br />{l.requirement}</p>}
            {l.siteAddress && <p className="mt-2 text-[13px] text-muted-foreground">Site: {l.siteAddress}</p>}
            {l.lostReason && <p className="mt-2 text-[13px] text-ios-red">Lost: {l.lostReason}</p>}
          </Section>
          <Section title="Follow-ups">
            {canWrite && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="h-8 w-56" aria-label="Next follow-up" />
                <Button size="sm" variant="secondary" onClick={schedule} disabled={!nextAt}><CalendarPlus className="size-4" /> Schedule</Button>
              </div>
            )}
            {l.followups.length ? (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {l.followups.map((f) => (
                  <li key={f.id} className="relative">
                    <span className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full ${f.doneAt ? "bg-ios-green" : new Date(f.dueAt) < new Date() ? "bg-ios-red" : "bg-ios-orange"}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[13px] font-medium">{formatDateTime(f.dueAt)}{f.doneAt ? " · done" : ""}</div>
                      {!f.doneAt && canWrite && <Button size="sm" variant="ghost" className="h-7" onClick={() => setDoneId(f.id)}>Mark done</Button>}
                    </div>
                    {f.notes && <div className="text-[13px] text-muted-foreground">{f.notes}</div>}
                    {f.outcome && <div className="text-[13px]">→ {f.outcome}</div>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-muted-foreground">No follow-ups yet.</p>
            )}
          </Section>
        </div>
        <Section title="Site visits">
          {l.visits.length ? (
            <ul className="space-y-3">
              {l.visits.map((v) => (
                <li key={v.id} className="text-[13px]">
                  <div className="font-medium">{formatDateTime(v.checkInAt)}</div>
                  {v.lat !== null && v.lng !== null && <a className="text-[12px] text-tint hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${v.lat},${v.lng}`}>Open in Maps</a>}
                  {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
                  {!!v.photos.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {v.photos.map((p) => <img key={p} src={p} alt="" className="size-14 rounded object-cover" />)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No visits yet.</p>
          )}
        </Section>
      </div>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(false)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader><DialogTitle>Edit lead</DialogTitle></DialogHeader>
            <LeadForm lead={l} onSaved={() => { setEditing(false); q.refetch(); }} onCancel={() => setEditing(false)} />
          </DialogContent>
        </Dialog>
      )}
      {doneId && <FollowupDoneDialog followupId={doneId} leadName={l.name} onClose={() => setDoneId(null)} onDone={() => { setDoneId(null); q.refetch(); }} />}
      {visit && <VisitCheckInDialog leadId={l.id} onClose={() => setVisit(false)} onDone={() => { setVisit(false); q.refetch(); }} />}
    </>
  );
}
