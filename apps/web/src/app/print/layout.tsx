import type { Metadata } from "next";

export const metadata: Metadata = { title: "Print" };

/** Print views live outside the app shell: plain A4 pages with print CSS. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root min-h-dvh bg-neutral-200 py-6 text-[12px] text-black print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print { .no-print { display: none !important; } .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: auto !important; padding: 0 !important; } html, body { background: #fff !important; } }
        .sheet { color-scheme: light; }
        .sheet table { border-collapse: collapse; width: 100%; }
        .sheet th, .sheet td { border: 1px solid #c8c8c8; padding: 4px 6px; vertical-align: top; }
        .sheet th { background: #f1f4f6; font-weight: 600; text-align: left; }
        .sheet .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      `}</style>
      {children}
    </div>
  );
}
