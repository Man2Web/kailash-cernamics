"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, LogOut, Moon, Search, Sun, UserRound, KeyRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api, apiGet } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CommandMenu, useCommandMenu } from "./command-menu";
import { FEATURES } from "@gc/shared";
import { featureOf, isActive, navGroups, navVisible } from "./nav";

export function BrandMark({ size = 28 }: { size?: number }) {
  // Four-tile mark drawn in CSS so it follows the theme colour; swap for the client logo later.
  return (
    <span className="grid shrink-0 grid-cols-2 gap-[2px] rounded-[6px] bg-tint p-[3px]" style={{ height: size, width: size }} aria-hidden>
      <span className="rounded-[2px] bg-white/95" />
      <span className="rounded-[2px] bg-white/55" />
      <span className="rounded-[2px] bg-white/55" />
      <span className="rounded-[2px] bg-white/95" />
    </span>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full text-muted-foreground hover:text-foreground"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  );
}

function BranchSwitcher() {
  const { user, branchId, setBranch } = useSession();
  if (user.branches.length <= 1) {
    return <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">{user.branches[0]?.name}</span>;
  }
  return (
    <select
      aria-label="Branch"
      value={branchId}
      onChange={(e) => setBranch(e.target.value)}
      className="h-8 max-w-48 rounded-md border-0 bg-fill px-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {user.branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.code} · {b.name}
        </option>
      ))}
    </select>
  );
}

function NotificationsButton() {
  const q = useQuery({ queryKey: ["/notifications"], queryFn: () => apiGet<{ unread: number }>("/notifications"), refetchInterval: 60_000 });
  const unread = q.data?.unread ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-foreground" aria-label="Notifications">
      <Link href="/notifications">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-ios-red px-1 text-[10px] font-semibold text-white tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    router.replace("/login");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
          <span className="grid size-8 place-items-center rounded-full bg-fill-strong text-[13px] font-semibold">{user.name.slice(0, 1).toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-medium">{user.name}</div>
          <div className="text-[12px] font-normal text-muted-foreground">
            {user.role.name} · {user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound className="size-4" /> My account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account#security">
            <KeyRound className="size-4" /> Password & 2FA
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SideNav() {
  const pathname = usePathname();
  const { can, on, user: me } = useSession();
  const isOwner = me.role.code === "OWNER";
  const { setOpenMobile } = useSidebar();
  return (
    <>
      {navGroups.map((g) => {
        const items = g.items.filter((i) => navVisible(i, can, on, isOwner));
        if (!items.length) return null;
        return (
          <SidebarGroup key={g.label || "main"} className="py-1">
            {g.label && <SidebarGroupLabel className="text-[12px] font-semibold text-muted-foreground">{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-8 rounded-md px-2 text-[14px] text-foreground/85 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-foreground"
                      >
                        <Link href={item.href} onClick={() => setOpenMobile(false)}>
                          <item.icon className={cn("size-[17px]", active ? "text-tint" : "text-muted-foreground")} />
                          <span className="flex-1 truncate">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function TopBar() {
  const { open } = useCommandMenu();
  return (
    <header className="material-bar sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border px-3 md:px-5 print:hidden">
      <SidebarTrigger className="md:hidden" />
      <button
        type="button"
        onClick={open}
        className="flex h-8 w-full max-w-md items-center gap-2 rounded-md bg-fill px-3 text-[13px] text-muted-foreground hover:bg-fill-strong"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search products, customers, pages…</span>
        <kbd className="hidden rounded border border-border px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <BranchSwitcher />
        <NotificationsButton />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

/** A page of a module the Super Admin has switched off: a plain explanation instead of broken screens. */
function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { on, user } = useSession();
  const feature = featureOf(pathname);
  if (!feature || on(feature)) return <>{children}</>;
  const label = FEATURES.find((f) => f.key === feature)?.label ?? feature;
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-[22px] font-bold">{label} is turned off</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        {user.role.code === "OWNER" ? "You switched this module off. Nothing was deleted, and you can turn it back on at any time." : "The Super Admin has switched this module off for the company."}
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link href="/" className="rounded-lg bg-fill px-4 py-2 text-[14px] font-medium hover:bg-fill-strong">Back to dashboard</Link>
        {user.role.code === "OWNER" && (
          <Link href="/settings/modules" className="rounded-lg bg-tint px-4 py-2 text-[14px] font-medium text-white">Open modules on/off</Link>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <CommandMenu>
        <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border print:hidden">
          <SidebarHeader className="px-4 pt-4 pb-2">
            <Link href="/" className="flex w-fit items-center gap-2.5">
              <BrandMark size={30} />
              <span className="leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight">Kailash Ceramics</span>
                <span className="block text-[11px] text-muted-foreground">Tiles & Sanitaryware ERP</span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="px-1 pb-4">
            <SideNav />
          </SidebarContent>
          <SidebarFooter className="px-4 pb-3 text-[11px] text-muted-foreground">v0.1 · crm.kailashceramics.com</SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0 bg-background">
          <TopBar />
          <main className="mx-auto w-full max-w-[1400px] min-w-0 px-3 py-4 md:px-6 md:py-6">
            <ModuleGate>{children}</ModuleGate>
          </main>
        </SidebarInset>
      </CommandMenu>
    </SidebarProvider>
  );
}
