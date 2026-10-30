"use client";

import { formatDate, formatINR } from "@gc/shared";
import { MoneyInput } from "@/components/common/form-fields";

export interface OpenDoc {
  id: string;
  label: string;
  date: string;
  totalPaise: number;
  duePaise: number;
}

/** Oldest-first allocation of an amount over open documents. */
export function autoAllocate(docs: OpenDoc[], amountPaise: number): Record<string, number> {
  let left = amountPaise;
  const out: Record<string, number> = {};
  for (const d of docs) {
    if (left <= 0) break;
    const a = Math.min(d.duePaise, left);
    if (a > 0) out[d.id] = a;
    left -= a;
  }
  return out;
}

export function AllocationGrid({ docs, alloc, onChange, amountPaise }: { docs: OpenDoc[]; alloc: Record<string, number>; onChange: (a: Record<string, number>) => void; amountPaise: number }) {
  const allocated = Object.values(alloc).reduce((a, b) => a + (b || 0), 0);
  const left = amountPaise - allocated;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Document</th>
              <th className="py-2 pr-2 font-medium">Date</th>
              <th className="py-2 pr-2 text-right font-medium">Total</th>
              <th className="py-2 pr-2 text-right font-medium">Balance</th>
              <th className="w-40 py-2 text-right font-medium">Allocate</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-border/60">
                <td className="py-1.5 pr-2 font-medium">{d.label}</td>
                <td className="py-1.5 pr-2">{formatDate(d.date)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{formatINR(d.totalPaise)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{formatINR(d.duePaise)}</td>
                <td className="py-1.5">
                  <MoneyInput value={alloc[d.id] ?? null} onChange={(v) => onChange({ ...alloc, [d.id]: Math.min(Math.max(0, v), d.duePaise) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-4 text-[13px]">
        <span>
          Allocated <b className="tabular">{formatINR(allocated)}</b>
        </span>
        <span className={left < 0 ? "text-ios-red" : "text-muted-foreground"}>
          {left < 0 ? "Over by " : "Advance (on account) "}
          <b className="tabular">{formatINR(Math.abs(left))}</b>
        </span>
      </div>
    </div>
  );
}
