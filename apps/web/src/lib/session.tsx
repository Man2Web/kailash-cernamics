"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PermissionCode, SessionUser } from "@gc/shared";
import { apiGet, getBranchId, setBranchId } from "./api";

interface SessionCtx {
  user: SessionUser;
  branchId: string;
  branch: SessionUser["branches"][number] | undefined;
  setBranch: (id: string) => void;
  can: (...perms: PermissionCode[]) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["/auth/me"], queryFn: () => apiGet<SessionUser>("/auth/me"), staleTime: 60_000 });
  const [branchId, setBranchState] = useState<string>("");

  useEffect(() => {
    if (me.data?.role.code === "ATTENDANCE_DISPLAY") window.location.replace("/attendance");
  }, [me.data]);

  useEffect(() => {
    if (!me.data) return;
    const stored = getBranchId();
    const valid = me.data.branches.find((b) => b.id === stored)?.id ?? me.data.defaultBranchId ?? me.data.branches[0]?.id ?? "";
    if (valid && valid !== stored) setBranchId(valid);
    setBranchState(valid);
  }, [me.data]);

  const value = useMemo<SessionCtx | null>(() => {
    if (!me.data || !branchId) return null;
    const perms = new Set(me.data.permissions);
    return {
      user: me.data,
      branchId,
      branch: me.data.branches.find((b) => b.id === branchId),
      setBranch: (id: string) => {
        setBranchId(id);
        setBranchState(id);
        qc.invalidateQueries();
      },
      can: (...p) => p.every((x) => perms.has(x)),
    };
  }, [me.data, branchId, qc]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** Render children only when the user has all the permissions. */
export function Can({ perm, children }: { perm: PermissionCode | PermissionCode[]; children: React.ReactNode }) {
  const { can } = useSession();
  const list = Array.isArray(perm) ? perm : [perm];
  return can(...list) ? <>{children}</> : null;
}
