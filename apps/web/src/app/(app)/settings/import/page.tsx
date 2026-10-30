"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { exportToExcel, readSpreadsheet } from "@/lib/export";
import { cn } from "@/lib/utils";

interface Preview {
  total: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  committed?: boolean;
  results: { row: number; key: string; action: "create" | "update" | "error"; errors: string[]; notes: string[] }[];
}

const TEMPLATES = {
  products: [
    "sku", "name", "brand", "category_type", "series", "size_mm", "finish", "color", "hsn", "gst_rate", "uom_type",
    "pcs_per_box", "sqft_per_box", "weight_per_box_kg", "mrp_per_box", "mrp_per_unit", "allow_loose_sale", "image_file",
  ],
  parties: ["name", "type", "segment", "phone", "email", "gstin", "state_code", "city", "billing_address", "credit_limit", "credit_days", "opening_balance"],
  "opening-stock": ["sku", "godown_code", "rack_code", "batch_no", "shade_code", "caliber", "grade", "boxes", "loose_pcs", "landed_cost_per_box"],
  "opening-outstanding": ["party_name", "party_gstin", "bill_no", "bill_date", "amount", "due_date"],
};

type Kind = keyof typeof TEMPLATES;

const KIND_LABEL: Record<Kind, string> = {
  products: "Products",
  parties: "Parties",
  "opening-stock": "Opening stock",
  "opening-outstanding": "Opening outstanding",
};

const KEY_LABEL: Record<Kind, string> = { products: "SKU", parties: "Name", "opening-stock": "SKU", "opening-outstanding": "Bill no." };

const HELP: Partial<Record<Kind, string>> = {
  "opening-stock":
    "Physical count by shade per godown. Tiles need batch_no, shade_code and caliber; quantity is boxes + loose pcs (sanitary: boxes = units). Each batch can be loaded once per godown.",
  "opening-outstanding":
    "Unpaid bills from Tally's bill-wise outstanding. They post as invoices numbered with the Tally bill no. (not sent back to Tally) so receipts can be allocated to them.",
};
const SAMPLE: Record<keyof typeof TEMPLATES, Record<string, string>[]> = {
  products: [
    { sku: "TL-KJ-6012-CAL", name: "Calacatta Gold Glossy", brand: "Kajaria", category_type: "TILE", series: "Eternity", size_mm: "600x1200", finish: "Glossy", color: "White", hsn: "6907", gst_rate: "18", uom_type: "PIECE_BOX_AREA", pcs_per_box: "2", sqft_per_box: "15.50", weight_per_box_kg: "30", mrp_per_box: "2480", mrp_per_unit: "", allow_loose_sale: "false", image_file: "" },
    { sku: "SN-HW-WC-ONE", name: "One-piece WC Rimless", brand: "Hindware", category_type: "SANITARY", series: "Elite", size_mm: "", finish: "Glossy", color: "White", hsn: "6910", gst_rate: "18", uom_type: "UNIT", pcs_per_box: "", sqft_per_box: "", weight_per_box_kg: "", mrp_per_box: "", mrp_per_unit: "18500", allow_loose_sale: "false", image_file: "" },
  ],
  parties: [
    { name: "Sri Murugan Constructions", type: "CUSTOMER", segment: "BUILDER", phone: "9842012345", email: "", gstin: "", state_code: "33", city: "Coimbatore", billing_address: "Coimbatore", credit_limit: "1500000", credit_days: "30", opening_balance: "0" },
  ],
  "opening-stock": [
    { sku: "TL-KJ-6012-CAL", godown_code: "MAIN", rack_code: "A1", batch_no: "KJ2610A", shade_code: "S1", caliber: "C2", grade: "PREMIUM", boxes: "24", loose_pcs: "1", landed_cost_per_box: "1850" },
    { sku: "SN-HW-WC-ONE", godown_code: "SHOW", rack_code: "", batch_no: "", shade_code: "", caliber: "", grade: "", boxes: "2", loose_pcs: "0", landed_cost_per_box: "" },
  ],
  "opening-outstanding": [
    { party_name: "Sri Murugan Constructions", party_gstin: "", bill_no: "KC/25-26/1184", bill_date: "15/03/2026", amount: "118000", due_date: "" },
  ],
};

function ImportInner() {
  const params = useSearchParams();
  const initial = params.get("kind");
  const [kind, setKind] = useState<Kind>(initial && initial in TEMPLATES ? (initial as Kind) : "products");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setPreview(null);
    try {
      const data = await readSpreadsheet(f);
      setRows(data);
      setFileName(f.name);
      setPreview(await api<Preview>(`/import/${kind}/preview`, { method: "POST", body: { rows: data } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await api<Preview>(`/import/${kind}/commit`, { method: "POST", body: { rows } });
      setPreview(res);
      if (res.committed)
        toast.success(kind.startsWith("opening") ? `Imported ${res.total} rows` : `Imported ${res.createCount} new, updated ${res.updateCount}`);
      else toast.error("Fix the errors and upload again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Import data"
        description="Bulk-load products, customers/suppliers, opening stock and opening outstanding from Excel or CSV. Nothing is saved until you confirm the preview."
      />
      <div className="space-y-4">
        <Section>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex gap-1 rounded-lg bg-fill p-1">
              {(Object.keys(TEMPLATES) as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setKind(k);
                    setRows([]);
                    setPreview(null);
                    setFileName("");
                  }}
                  className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", kind === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => exportToExcel(`${kind}-template`, TEMPLATES[kind].map((h) => ({ header: h, key: h, width: 16 })), SAMPLE[kind])}
            >
              <FileSpreadsheet className="size-4" /> Download template
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-[13.5px] font-medium text-primary-foreground">
              {busy ? "Working…" : "Upload .xlsx / .csv"}
              <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
            </label>
            {fileName && <span className="text-[13px] text-muted-foreground">{fileName} · {rows.length} rows</span>}
          </div>
          {HELP[kind] && <p className="mt-3 text-[13px] text-muted-foreground">{HELP[kind]}</p>}
        </Section>

        {preview && (
          <Section
            title="Preview"
            actions={
              <div className="flex items-center gap-3 text-[13px]">
                <span className="text-ios-green">{preview.createCount} new</span>
                <span className="text-ios-blue">{preview.updateCount} update</span>
                <span className={preview.errorCount ? "font-medium text-ios-red" : "text-muted-foreground"}>{preview.errorCount} errors</span>
                {preview.committed ? (
                  <span className="font-medium text-ios-green">Imported ✓</span>
                ) : (
                  <Button size="sm" disabled={busy || preview.errorCount > 0} onClick={commit}>
                    Import {preview.total} rows
                  </Button>
                )}
              </div>
            }
          >
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card text-left text-[12px] text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="h-8 px-2">Row</th>
                    <th className="px-2">{KEY_LABEL[kind]}</th>
                    <th className="px-2">Action</th>
                    <th className="px-2">Problems / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.results.map((r) => (
                    <tr key={r.row} className={cn("border-b border-border/60", r.action === "error" && "bg-ios-red/5")}>
                      <td className="px-2 py-1.5 tabular">{r.row}</td>
                      <td className="px-2 font-mono text-[12px]">{r.key}</td>
                      <td className={cn("px-2 capitalize", r.action === "error" ? "text-ios-red" : r.action === "create" ? "text-ios-green" : "text-ios-blue")}>{r.action}</td>
                      <td className="px-2">
                        {r.errors.map((e) => (
                          <div key={e} className="text-ios-red">{e}</div>
                        ))}
                        {r.notes.map((n) => (
                          <div key={n} className="text-muted-foreground">{n}</div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

export default function ImportPage() {
  return (
    <Suspense>
      <ImportInner />
    </Suspense>
  );
}
