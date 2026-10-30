"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCode2, ReceiptText, Truck } from "lucide-react";
import { formatDateTime } from "@gc/shared";
import { Section, InfoGrid } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldShell } from "@/components/common/form-fields";
import { api, apiGet } from "@/lib/api";
import { useSession } from "@/lib/session";

interface InvoiceGst {
  id: string;
  status: string;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  ewayBillNo: string | null;
  party?: { gstin?: string | null } | null;
}

/** Phase 7: e-invoice (IRN + QR) and e-way bill for a posted invoice, through the configured GSP. */
export function EInvoicePanel({ inv }: { inv: InvoiceGst }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [payload, setPayload] = useState<string | null>(null);
  const [ewbOpen, setEwbOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ewb, setEwb] = useState({ vehicleNo: "", distanceKm: "", transporterId: "", transporterName: "" });

  if (inv.status !== "POSTED") return null;

  const preview = async () => {
    try {
      const r = await apiGet<{ applicable: boolean; configured: boolean; payload: unknown }>(`/gst/einvoice/${inv.id}/payload`);
      setPayload(
        `${r.applicable ? "" : "// Buyer has no GSTIN: e-invoice does not apply (B2C)\n"}${r.configured ? "" : "// GSP not configured: set GSP_* in the environment (GSP_PROVIDER=mock to test)\n"}${JSON.stringify(r.payload, null, 2)}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build payload");
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      await api(`/gst/einvoice/${inv.id}/generate`, { method: "POST", body: {} });
      toast.success("IRN generated");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "IRN generation failed");
    } finally {
      setBusy(false);
    }
  };

  const createEwb = async () => {
    setBusy(true);
    try {
      const r = await api<{ ewayBillNo: string }>(`/gst/ewaybill/${inv.id}`, {
        method: "POST",
        body: {
          vehicleNo: ewb.vehicleNo.trim().toUpperCase(),
          distanceKm: Number(ewb.distanceKm),
          transporterId: ewb.transporterId.trim() || undefined,
          transporterName: ewb.transporterName.trim() || undefined,
        },
      });
      toast.success(`E-way bill ${r.ewayBillNo} generated`);
      setEwbOpen(false);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "E-way bill failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="E-invoice & e-way bill"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={preview}>
            <FileCode2 className="size-4" /> Preview IRN payload
          </Button>
          {!inv.irn && can("invoice.write") && (
            <Button size="sm" onClick={generate} disabled={busy}>
              <ReceiptText className="size-4" /> Generate IRN
            </Button>
          )}
          {!inv.ewayBillNo && can("dispatch.write") && (
            <Button size="sm" variant="secondary" onClick={() => setEwbOpen(true)}>
              <Truck className="size-4" /> E-way bill
            </Button>
          )}
        </div>
      }
    >
      <InfoGrid
        items={[
          { label: "IRN", value: inv.irn ? <span className="font-mono text-[11px] break-all whitespace-normal">{inv.irn}</span> : "Not generated" },
          { label: "Ack no", value: inv.ackNo ?? "—" },
          { label: "Ack date", value: inv.ackDate ? formatDateTime(inv.ackDate) : "—" },
          { label: "E-way bill", value: inv.ewayBillNo ?? "—" },
        ]}
      />
      {!inv.party?.gstin && <p className="mt-2 text-[12px] text-muted-foreground">Buyer has no GSTIN, so e-invoice does not apply (B2C).</p>}

      <Dialog open={payload !== null} onOpenChange={(o) => !o && setPayload(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>IRN payload (NIC schema 1.1)</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[65dvh] overflow-auto rounded-md bg-fill p-3 text-[11px] leading-snug">{payload}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={ewbOpen} onOpenChange={setEwbOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate e-way bill</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createEwb();
            }}
          >
            <FieldShell label="Vehicle no" required htmlFor="ewb-veh">
              <Input id="ewb-veh" value={ewb.vehicleNo} onChange={(e) => setEwb({ ...ewb, vehicleNo: e.target.value })} placeholder="TN37AB1234" required minLength={4} />
            </FieldShell>
            <FieldShell label="Distance (km)" required htmlFor="ewb-km">
              <Input id="ewb-km" type="number" inputMode="numeric" min={1} max={4000} value={ewb.distanceKm} onChange={(e) => setEwb({ ...ewb, distanceKm: e.target.value })} required />
            </FieldShell>
            <FieldShell label="Transporter GSTIN / ID" htmlFor="ewb-tid">
              <Input id="ewb-tid" value={ewb.transporterId} onChange={(e) => setEwb({ ...ewb, transporterId: e.target.value })} />
            </FieldShell>
            <FieldShell label="Transporter name" htmlFor="ewb-tn">
              <Input id="ewb-tn" value={ewb.transporterName} onChange={(e) => setEwb({ ...ewb, transporterName: e.target.value })} />
            </FieldShell>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setEwbOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Generating…" : "Generate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
