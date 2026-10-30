"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { labelOf } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { EmptyState } from "@/components/common/states";
import { GodownSelect, ProductPicker } from "@/components/inventory/pickers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

interface BatchLabel {
  batchId: string;
  qr: string;
  sku: string;
  name: string;
  brand: string;
  size: string | null;
  finish: string | null;
  batchNo: string;
  shadeCode: string;
  caliber: string;
  grade: string;
  uomType: string;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
}
interface RackLabel {
  rackId: string;
  qr: string;
  code: string;
  name: string | null;
  godown: string;
}
type Label = ({ type: "batch" } & BatchLabel) | ({ type: "rack" } & RackLabel);

export default function LabelsPage() {
  const [source, setSource] = useState<"grn" | "product" | "racks">("grn");
  const [grnId, setGrnId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [godownId, setGodownId] = useState<string>("");
  const [copies, setCopies] = useState(1);
  const [layout, setLayout] = useState<"a4" | "thermal">("a4");
  const [labels, setLabels] = useState<Label[]>([]);
  const [qr, setQr] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      if (source === "racks") {
        if (!godownId) return toast.error("Choose a godown");
        const rows = await apiGet<RackLabel[]>("/labels/racks", { godownId });
        setLabels(rows.map((r) => ({ type: "rack", ...r })));
      } else {
        const query = source === "grn" ? { grnId: grnId ?? undefined } : { productId: productId ?? undefined };
        if (!query.grnId && !query.productId) return toast.error(source === "grn" ? "Choose a GRN" : "Choose a product");
        const rows = await apiGet<BatchLabel[]>("/labels/batches", query);
        setLabels(rows.map((r) => ({ type: "batch", ...r })));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load labels");
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const l of labels) out[l.qr] = await QRCode.toDataURL(l.qr, { margin: 0, width: 160, errorCorrectionLevel: "M" });
      if (alive) setQr(out);
    })();
    return () => {
      alive = false;
    };
  }, [labels]);

  const printable = labels.flatMap((l) => Array.from({ length: Math.max(1, copies) }, (_, i) => ({ ...l, _k: `${l.qr}-${i}` })));

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Labels" description="Print QR labels for boxes (shade, batch, caliber) and racks. Scan them on the Scan page or while counting." actions={<Button asChild size="sm" variant="secondary"><Link href="/inventory/scan">Open scanner</Link></Button>} />
        <Section className="mb-4">
          <FormGrid cols={4}>
            <FieldShell label="Labels for">
              <NativeSelect value={source} onChange={(e) => { setSource(e.target.value as typeof source); setLabels([]); }}>
                <option value="grn">Boxes of a GRN</option>
                <option value="product">Boxes of a product (all shades)</option>
                <option value="racks">Racks of a godown</option>
              </NativeSelect>
            </FieldShell>
            {source === "grn" && (
              <FieldShell label="GRN">
                <EntitySelect endpoint="/grns" value={grnId} onChange={(id) => setGrnId(id)} getLabel={(g: any) => `${g.number}${g.supplier?.name ? ` · ${g.supplier.name}` : ""}`} placeholder="Choose GRN" />
              </FieldShell>
            )}
            {source === "product" && (
              <FieldShell label="Product">
                <ProductPicker value={productId} onChange={(id) => setProductId(id)} />
              </FieldShell>
            )}
            {source === "racks" && (
              <FieldShell label="Godown">
                <GodownSelect value={godownId} onChange={setGodownId} />
              </FieldShell>
            )}
            <FieldShell label="Copies per label">
              <Input type="number" min={1} max={200} inputMode="numeric" value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} />
            </FieldShell>
            <FieldShell label="Layout">
              <NativeSelect value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)}>
                <option value="a4">A4 sheet (3 × 8)</option>
                <option value="thermal">Thermal roll (100 × 50 mm)</option>
              </NativeSelect>
            </FieldShell>
          </FormGrid>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={load}>Load labels</Button>
            <Button onClick={() => window.print()} disabled={!labels.length}>
              <Printer className="size-4" /> Print {printable.length || ""}
            </Button>
          </div>
        </Section>
        {!labels.length && <Section><EmptyState title="No labels loaded" description="Choose what to label and press Load labels." /></Section>}
      </div>

      {!!labels.length && (
        <div className={cn("label-sheet", layout === "a4" ? "grid grid-cols-3 gap-0" : "flex flex-col")}>
          {printable.map((l) => (
            <div
              key={l._k}
              className={cn(
                "flex items-center gap-2 overflow-hidden border border-dashed border-border bg-white p-2 text-black print:border-0",
                layout === "a4" ? "h-[37mm]" : "h-[50mm] w-[100mm] break-after-page",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr[l.qr] ? <img src={qr[l.qr]} alt="" className={layout === "a4" ? "size-[26mm]" : "size-[40mm]"} /> : <div className="size-[26mm] bg-neutral-100" />}
              {l.type === "batch" ? (
                <div className="min-w-0 text-[9pt] leading-tight">
                  <div className="truncate font-bold">{l.name}</div>
                  <div className="truncate">{l.sku} · {l.brand}</div>
                  <div className="truncate">{[l.size, l.finish].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 text-[11pt] font-bold">Shade {l.shadeCode}</div>
                  <div className="truncate">Batch {l.batchNo} · Cal {l.caliber} · {labelOf(l.grade)}</div>
                  {l.uomType === "PIECE_BOX_AREA" && <div className="truncate">{l.pcsPerBox} pcs · {l.sqftPerBox} sq ft / box</div>}
                </div>
              ) : (
                <div className="min-w-0 leading-tight">
                  <div className="text-[9pt]">{l.godown}</div>
                  <div className="text-[24pt] font-bold">{l.code}</div>
                  {l.name && <div className="truncate text-[9pt]">{l.name}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{`
        @media print {
          @page { size: ${layout === "a4" ? "A4" : "100mm 50mm"}; margin: ${layout === "a4" ? "8mm" : "0"}; }
          body * { visibility: hidden; }
          .label-sheet, .label-sheet * { visibility: visible; }
          .label-sheet { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </>
  );
}
