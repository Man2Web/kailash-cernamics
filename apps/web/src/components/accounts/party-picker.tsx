"use client";

import { EntitySelect } from "@/components/common/entity-select";

export interface PartyLite {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  gstin?: string | null;
  type?: string;
}

/** Customer or supplier picker (backed by /parties?type=...). */
export function PartyPicker({ type, value, onChange, autoFocus, id }: { type: "CUSTOMER" | "SUPPLIER"; value: string | null; onChange: (id: string | null, p: PartyLite | null) => void; autoFocus?: boolean; id?: string }) {
  return (
    <EntitySelect<PartyLite>
      id={id}
      endpoint="/parties"
      params={{ type }}
      value={value}
      onChange={onChange}
      autoFocus={autoFocus}
      getLabel={(p) => p.name}
      getDescription={(p) => [p.phone, p.city, p.gstin].filter(Boolean).join(" · ")}
      placeholder={type === "CUSTOMER" ? "Choose customer…" : "Choose supplier…"}
    />
  );
}
