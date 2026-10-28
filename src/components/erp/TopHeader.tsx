"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Menu,
  Search,
  Keyboard,
  Settings,
  Bell,
  Grid,
  ChevronDown,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/logout-action";

interface TopHeaderProps {
  user: {
    name: string;
    email: string;
    roles: string[];
  };
  onMenuToggle?: () => void;
}

export default function TopHeader({ user, onMenuToggle }: TopHeaderProps) {
  const [selectedOutlet, setSelectedOutlet] = useState("Vellore Outlet");
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const outlets = ["Vellore Outlet", "Chennai Outlet"];

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-4 md:px-6 flex-shrink-0 select-none z-10 shadow-xs max-w-full">
      {/* 1. Mobile Menu Button & Brand (Visible on < 768px) */}
      <div className="flex items-center space-x-2 md:hidden">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open mobile navigation"
          className="p-2 -ml-1 rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
          Inventory
        </span>
      </div>

      {/* 2. Global Search Box (Desktop / Tablet >= 768px) */}
      <div className="hidden md:block flex-1 max-w-md">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            suppressHydrationWarning
            placeholder="Search..."
            className="block w-full pl-9 pr-3 lg:pr-12 py-1.5 min-w-[120px] border border-slate-200 rounded-sm bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs focus:bg-white transition-all duration-150"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 border border-slate-200 rounded-sm text-[11px] font-sans font-medium text-slate-400 bg-white">
              Ctrl+K
            </kbd>
          </div>
        </div>
      </div>

      {/* 3. Right Actions Control Panel */}
      <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4 ml-auto">
        {/* A. Outlet Selector (Hidden on very small mobile if tight, visible on sm+) */}
        <div className="relative hidden sm:block">
          <select
            value={selectedOutlet}
            suppressHydrationWarning
            onChange={(e) => setSelectedOutlet(e.target.value)}
            className="appearance-none pr-7 pl-2.5 py-1.5 border border-slate-200 rounded-sm bg-slate-50 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-semibold cursor-pointer transition-all max-w-[140px] truncate"
          >
            {outlets.map((outlet) => (
              <option key={outlet} value={outlet}>
                {outlet}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-slate-500">
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>

        {/* B. Icon Actions (Desktop / Tablet only) */}
        <div className="hidden md:flex items-center space-x-2">
          <button
            title="Keyboard Shortcuts"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          <Link
            href="/account"
            title="Account Settings"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <Settings className="h-4 w-4" />
          </Link>

          <button
            title="Notifications"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 relative transition"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 block h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>

          <button
            title="App Launcher"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <Grid className="h-4 w-4" />
          </button>

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 mx-1"></div>
        </div>

        {/* C. User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            aria-label="User profile menu"
            className="flex items-center space-x-1.5 p-1 rounded-md focus:outline-none hover:bg-slate-100 transition min-w-[40px] min-h-[36px] justify-center cursor-pointer"
          >
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs uppercase shadow-xs">
              {user.name.charAt(0)}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-500 hidden sm:block" />
          </button>

          {isProfileOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsProfileOpen(false)}
              ></div>
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded shadow-md z-40 py-1 text-slate-700 animate-in fade-in slide-in-from-top-1 duration-100">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">
                    {user.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {user.email}
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="w-full flex items-center text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-600 transition"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <UserIcon className="mr-2 h-3.5 w-3.5" />
                  My Profile
                </Link>
                <Link
                  href="/account"
                  className="w-full flex items-center text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-600 transition"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Account Settings
                </Link>
                <div className="border-t border-slate-100 my-1"></div>
                <form action={handleLogout} className="w-full">
                  <button
                    type="submit"
                    className="w-full flex items-center text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600 font-semibold transition"
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
