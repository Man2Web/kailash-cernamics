"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { Paged } from "@gc/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { path: string; message: string }[],
    public code?: string,
    /** full error body (e.g. 409 shortage responses carry available batches) */
    public body?: unknown,
  ) {
    super(message);
  }
}

const BRANCH_KEY = "gc.branch";

export function getBranchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

export function setBranchId(id: string) {
  try {
    localStorage.setItem(BRANCH_KEY, id);
  } catch {
    /* private mode */
  }
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

let refreshing: Promise<boolean> | null = null;
async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Reuse the same key when retrying the same user action. */
  idempotencyKey?: string;
  formData?: FormData;
}

/** Fetch wrapper: JSON, branch header, Idempotency-Key on writes, silent token refresh on 401. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? (opts.body || opts.formData ? "POST" : "GET");
  const headers: Record<string, string> = {};
  const branch = getBranchId();
  if (branch) headers["X-Branch-Id"] = branch;
  if (method !== "GET") headers["Idempotency-Key"] = opts.idempotencyKey ?? newIdempotencyKey();
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}${qs(opts.query)}`, {
    method,
    headers,
    credentials: "include",
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && !retried && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    if (await refreshSession()) return api<T>(path, { ...opts, idempotencyKey: headers["Idempotency-Key"] }, true);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  // A remembered branch the user can no longer use (removed from it, or a different database) must not lock them out:
  // forget it and let the server fall back to their default branch.
  if (res.status === 403 && !retried && branch && typeof data?.message === "string" && data.message.includes("No access to this branch")) {
    try {
      localStorage.removeItem(BRANCH_KEY);
    } catch {
      /* private mode */
    }
    return api<T>(path, { ...opts, idempotencyKey: headers["Idempotency-Key"] }, true);
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message || res.statusText;
    throw new ApiError(msg, res.status, data?.issues, data?.code, data);
  }
  return data as T;
}

export const apiGet = <T>(path: string, query?: Query) => api<T>(path, { query });
export const apiPost = <T>(path: string, body?: unknown, key?: string) => api<T>(path, { method: "POST", body: body ?? {}, idempotencyKey: key });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: body ?? {} });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

export async function uploadFile(file: File, folder = "misc"): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return api(`/files`, { method: "POST", formData: fd, query: { folder } });
}

/** GET with React Query. Key = [path, query]. */
export function useApi<T>(path: string | null, query?: Query, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [path, query ?? {}],
    queryFn: () => apiGet<T>(path!, query),
    enabled: !!path,
    ...options,
  });
}

export function useList<T>(path: string, query?: Query) {
  return useApi<Paged<T>>(path, query, { placeholderData: (prev) => prev });
}

/** Mutation that invalidates the given query path prefixes on success. */
export function useApiMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      for (const p of invalidate) qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(p) });
    },
  });
}
