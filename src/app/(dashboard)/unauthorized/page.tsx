import React from "react";
import Link from "next/link";
import { ShieldX } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded p-8 text-center space-y-6 shadow-xs">
        <div className="flex justify-center">
          <div className="p-3 bg-red-50 text-red-600 rounded-full">
            <ShieldX className="h-12 w-12" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900">403 - Access Denied</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You do not have the required permissions or role configurations to view this module. Please contact the administrator to request role adjustments.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded transition shadow-sm"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
