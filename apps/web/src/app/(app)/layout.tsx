"use client";

import { AppShell } from "@/components/app/app-shell";
import { SessionProvider } from "@/lib/session";
import { BrandMark } from "@/components/app/app-shell";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex animate-pulse flex-col items-center gap-3">
        <BrandMark size={44} />
        <span className="text-[13px] text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider fallback={<Splash />}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
