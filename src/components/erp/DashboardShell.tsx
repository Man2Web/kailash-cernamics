"use client";

import React, { useState } from "react";
import Sidebar from "@/components/erp/Sidebar";
import TopHeader from "@/components/erp/TopHeader";

interface DashboardShellProps {
  user: {
    name: string;
    email: string;
    roles: string[];
    warehouseId?: string;
    warehouseName?: string;
  };
  children: React.ReactNode;
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans w-full max-w-full">
      {/* 1. Desktop Left Sidebar (Sticky & visible on >= 768px) */}
      <div className="hidden md:flex flex-col h-full shrink-0 z-20">
        <Sidebar user={user} />
      </div>

      {/* 2. Mobile Drawer Sidebar (Sliding drawer on < 768px) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in cursor-pointer"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-300 h-full flex flex-col z-50 shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar
              user={user}
              isMobile
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 3. Right Main Section */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-hidden">
        {/* Top Header */}
        <TopHeader
          user={user}
          onMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Content Main Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 bg-slate-50 min-w-0 max-w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
