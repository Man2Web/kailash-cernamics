"use client";

import { EntityInput } from "@/components/common/entity-input";
import type { Query } from "@/lib/api";

export interface EntitySelectProps<T extends { id: string }> {
  /** list endpoint, e.g. "/products" — must support ?q=&pageSize= and GET /:id */
  endpoint: string;
  value: string | null | undefined;
  onChange: (id: string | null, item: T | null) => void;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => React.ReactNode;
  params?: Query;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  /** Typed text that doesn't exist yet is saved as a new record built from this body (masters only). */
  buildNew?: (typed: string) => Record<string, unknown> | null;
  invalidMessage?: string;
}

/** Picker for products, parties, godowns… — a text box with suggestions backed by the list endpoint (server search). */
export function EntitySelect<T extends { id: string }>(p: EntitySelectProps<T>) {
  return <EntityInput<T> {...p} />;
}
