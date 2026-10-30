"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDate, formatINR } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

export default function NewChallanPage() {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!invoiceId) return toast.error("Pick a posted invoice");
    setSaving(true);
    try {
      const c = await api<{ id: string; number: string }>("/challans", { method: "POST", body: { invoiceId, notes: notes || null } });
      toast.success(`Challan ${c.number} created`);
      router.push(`/sales/challans/${c.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader title="New delivery challan" back={{ href: "/sales/challans", label: "Challans" }} description="All items still to be delivered on the invoice are added to the challan." />
      <Section className="max-w-xl space-y-4">
        <FieldShell label="Invoice" required>
          <EntitySelect<any>
            endpoint="/invoices"
            params={{ status: "POSTED" }}
            value={invoiceId}
            onChange={(id) => setInvoiceId(id)}
            getLabel={(i) => `${i.number} · ${i.party?.name ?? ""}`}
            getDescription={(i) => `${formatDate(i.date)} · ${formatINR(i.totalPaise)}`}
            placeholder="Search invoice number or customer…"
          />
        </FieldShell>
        <FieldShell label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FieldShell>
        <Button onClick={save} disabled={saving}>
          {saving ? "Creating…" : "Create challan"}
        </Button>
      </Section>
    </>
  );
}
