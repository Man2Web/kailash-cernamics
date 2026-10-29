"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Box,
  Warehouse,
  Users,
  Navigation,
  CalendarCheck,
  Contact,
  X,
} from "lucide-react";

interface SidebarProps {
  user: {
    name: string;
    email: string;
    roles: string[];
    permissions?: string[];
    warehouseName?: string;
  };
  isMobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ user, isMobile = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const roles = user.roles || [];

  const isSuperAdmin = roles.includes("SUPER_ADMIN") || roles.includes("ADMIN");
  const isWarehouseManager = roles.includes("WAREHOUSE_MANAGER") || roles.includes("INVENTORY_STAFF");
  const isSalesPerson = roles.includes("SALES_PERSON") || roles.includes("SALES_MANAGER") || roles.includes("SALES_STAFF");
  const permissions = user.permissions || [];
  const can = (code: string) => isSuperAdmin || permissions.includes(code);

  // The menu follows what the Super Admin allowed this member to open.
  const stockLabel = isSuperAdmin ? "Stock" : can("products:create") ? "Stock Management" : "Stock Availability";
  const purchaseLabel = isSuperAdmin || can("purchase:create") ? "Purchase" : "Purchase Deliveries";
  const candidates: Array<{ allowed: boolean; name: string; path: string; icon: React.ComponentType<{ className?: string }> }> = [
    { allowed: can("dashboard:view"), name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { allowed: isSuperAdmin, name: "Office", path: "/office", icon: Building2 },
    { allowed: can("attendance:manage"), name: "Employee Attendance", path: "/office/attendance", icon: CalendarCheck },
    { allowed: can("leads:view"), name: "Leads & Enquiries", path: "/leads", icon: Contact },
    { allowed: can("sales:view"), name: "Sales Orders", path: "/sales", icon: ShoppingCart },
    { allowed: can("purchase:view"), name: purchaseLabel, path: "/purchase", icon: Users },
    { allowed: can("stock:view"), name: stockLabel, path: "/stock", icon: Box },
    { allowed: can("warehouse:view"), name: "My Warehouse", path: "/warehouse", icon: Warehouse },
    { allowed: can("movement:view"), name: "Daily Movement Tracking", path: "/movement", icon: Navigation },
  ];
  const menuItems = candidates.filter((c) => c.allowed);

  return (
    <aside className="w-full md:w-64 bg-slate-900 flex flex-col h-full border-r border-slate-800 text-slate-300 select-none flex-shrink-0 z-20">
      {/* Sidebar Header Brand */}
      <div className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950 flex-shrink-0">
        <Link
          href="/dashboard"
          onClick={() => isMobile && onClose?.()}
          className="flex items-center space-x-2"
        >
          <span className="text-xl font-extrabold text-white tracking-tight">
            Inventory
          </span>
        </Link>

        {isMobile && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation drawer"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation Scroll Area */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 custom-scrollbar">
        {menuItems.map((item) => {
          const isActive =
            item.path === "/office"
              ? pathname === "/office"
              : item.path === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.path || pathname.startsWith(item.path + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.path}
              onClick={() => isMobile && onClose?.()}
              className={`flex items-center px-3 py-2.5 sm:py-2 text-xs font-medium rounded-sm transition-all duration-150 group min-h-[42px] sm:min-h-0 ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon
                className={`mr-2.5 h-4 w-4 flex-shrink-0 ${
                  isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                }`}
              />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 flex-shrink-0 flex items-center space-x-3">
        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm uppercase shrink-0">
          {user.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate">{user.name}</p>
          <p className="text-[11px] text-slate-400 truncate capitalize font-medium">
            {isSuperAdmin
              ? "Super Admin"
              : isWarehouseManager
              ? `Warehouse Manager ${user.warehouseName ? `(${user.warehouseName})` : ""}`
              : isSalesPerson
              ? "Sales Person"
              : user.roles.join(", ")}
          </p>
        </div>
      </div>
    </aside>
  );
}

