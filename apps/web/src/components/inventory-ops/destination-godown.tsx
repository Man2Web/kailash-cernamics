"use client";

import { NativeSelect } from "@/components/common/form-fields";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface G {
  id: string;
  name: string;
  isDisplay: boolean;
  branchId: string;
  branch: { id: string; code: string; name: string };
}

/** Godowns of this branch first, then other branches' godowns (inter-branch transfer). */
export function DestinationGodownSelect({ value, onChange }: { value: string | null | undefined; onChange: (id: string, g: G | null) => void }) {
  const { branchId } = useSession();
  const q = useApi<{ items: G[] }>("/godowns", { pageSize: 500, isActive: "true" });
  const items = q.data?.items ?? [];
  const own = items.filter((g) => g.branchId === branchId);
  const other = items.filter((g) => g.branchId !== branchId);
  return (
    <NativeSelect value={value ?? ""} onChange={(e) => onChange(e.target.value, items.find((g) => g.id === e.target.value) ?? null)}>
      <option value="">{q.isLoading ? "Loading…" : "Select godown"}</option>
      <optgroup label="This branch">
        {own.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.isDisplay ? " (showroom)" : ""}
          </option>
        ))}
      </optgroup>
      {other.length > 0 && (
        <optgroup label="Other branches (in transit)">
          {other.map((g) => (
            <option key={g.id} value={g.id}>
              {g.branch.code} · {g.name}
            </option>
          ))}
        </optgroup>
      )}
    </NativeSelect>
  );
}
