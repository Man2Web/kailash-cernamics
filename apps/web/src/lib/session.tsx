"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeatureFlags, FeatureKey, PermissionCode, SessionUser } from "@gc/shared";
import { apiGet, getBranchId, setBranchId } from "./api";

interface SessionCtx {
  user: SessionUser;
  branchId: string;
  branch: SessionUser["branches"][number] | undefined;
  setBranch: (id: string) => void;
  can: (...perms: PermissionCode[]) => boolean;
  /** Is this module switched on for the company? (The Super Admin turns modules on and off.) */
  on: (feature: FeatureKey) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["/auth/me"], queryFn: () => apiGet<SessionUser>("/auth/me"), staleTime: 60_000 });
  const features = useQuery({ queryKey: ["/features"], queryFn: () => apiGet<FeatureFlags>("/features"), staleTime: 30_000 });
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
    if (!me.data || !branchId || !features.data) return null;
    const perms = new Set(me.data.permissions);
    const flags = features.data;
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
      on: (f) => flags[f] !== false,
    };
  }, [me.data, branchId, qc, features.data]);

  // Signed in but with no branch: say so, rather than showing the loading screen forever.
  if (!value && me.data && me.data.role.code !== "ATTENDANCE_DISPLAY" && me.data.branches.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-[20px] font-bold">No branch access yet</h1>
          <p className="text-[14px] text-muted-foreground">Your login is not linked to a branch. Please ask the Super Admin to give you branch access.</p>
        </div>
      </div>
    );
  }
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
