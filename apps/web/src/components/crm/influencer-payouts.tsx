"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { formatDateTime, formatINR, labelOf } from "@gc/shared";
import { DataTable } from "@/components/common/data-table";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell, MoneyInput } from "@/components/common/form-fields";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface LedgerRow {
  id: string;
  kind: string;
  points: number;
  amountPaise: number;
  note: string | null;
  invoiceId: string | null;
  createdAt: string;
  influencer: { id: string; name: string; type: string; pointsBalance: number };
}

interface InfluencerPick {
  id: string;
  name: string;
  type: string;
  pointsBalance: number;
}

/** Commission/points accrued on fully paid invoices, and payouts made to influencers. */
export function InfluencerPayouts() {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <DataTable<LedgerRow>
        endpoint="/influencer-payouts"
        exportName="influencer-commission"
        searchPlaceholder="Search influencer or note…"
        filters={[{ key: "kind", label: "Entry", options: ["ACCRUAL", "PAYOUT", "REVERSAL"].map((k) => ({ value: k, label: labelOf(k) })) }]}
        toolbar={
          can("payment.write") && (
            <Button size="sm" className="h-9" onClick={() => setOpen(true)}>
              <HandCoins className="size-4" /> Record payout
            </Button>
          )
        }
        emptyTitle="No commission entries yet"
        columns={[
          { accessorKey: "createdAt", header: "Date", cell: ({ row }) => formatDateTime(row.original.createdAt), meta: { exportValue: (r) => formatDateTime(r.createdAt) } },
          { id: "influencer", header: "Influencer", cell: ({ row }) => <span className="font-medium">{row.original.influencer?.name}</span>, meta: { exportValue: (r) => r.influencer?.name } },
          {
            accessorKey: "kind",
            header: "Entry",
            cell: ({ row }) => <StatusBadge status={row.original.kind === "PAYOUT" ? "POSTED" : row.original.kind === "ACCRUAL" ? "APPROVED" : "CANCELLED"} label={labelOf(row.original.kind)} />,
          },
          { accessorKey: "points", header: "Points", meta: { align: "right" } },
          { accessorKey: "amountPaise", header: "Amount", cell: ({ row }) => formatINR(row.original.amountPaise), meta: { align: "right", exportValue: (r) => Number(r.amountPaise) / 100 } },
          { accessorKey: "note", header: "Note", cell: ({ row }) => row.original.note ?? "" },
          { id: "balance", header: "Points balance", cell: ({ row }) => row.original.influencer?.pointsBalance ?? 0, meta: { align: "right", exportValue: (r) => r.influencer?.pointsBalance } },
        ]}
      />
      {open && <PayoutDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PayoutDialog({ onClose }: { onClose: () => void }) {
  const [influencer, setInfluencer] = useState<InfluencerPick | null>(null);
  const [points, setPoints] = useState("");
  const [amountPaise, setAmountPaise] = useState(0);
  const [note, setNote] = useState("");
  const save = useApiMutation(
    (body: { influencerId: string; points: number; amountPaise: number; note?: string }) => api("/influencer-payouts", { method: "POST", body }),
    ["/influencer-payouts", "/influencers"],
  );
  const submit = () => {
    if (!influencer) return toast.error("Choose an influencer");
    const pts = Number(points || 0);
    if (pts > influencer.pointsBalance) return toast.error(`Only ${influencer.pointsBalance} points available`);
    if (!pts && !amountPaise) return toast.error("Enter points or an amount");
    save.mutate(
      { influencerId: influencer.id, points: pts, amountPaise, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Payout recorded");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payout</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldShell label="Influencer" required hint={influencer ? `${influencer.pointsBalance} points available` : undefined}>
            <EntitySelect<InfluencerPick>
              endpoint="/influencers"
              value={influencer?.id}
              onChange={(_, item) => setInfluencer(item)}
              getLabel={(i) => i.name}
              getDescription={(i) => `${labelOf(i.type)} · ${i.pointsBalance} pts`}
            />
          </FieldShell>
          <FieldShell label="Points redeemed" htmlFor="po-points">
            <Input id="po-points" type="number" inputMode="numeric" min={0} value={points} onChange={(e) => setPoints(e.target.value)} />
          </FieldShell>
          <FieldShell label="Amount paid">
            <MoneyInput value={amountPaise} onChange={setAmountPaise} />
          </FieldShell>
          <FieldShell label="Note (mode, reference)" htmlFor="po-note">
            <Input id="po-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI ref / cash" />
          </FieldShell>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
