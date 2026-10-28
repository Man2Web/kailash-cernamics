"use client";

import React, { useEffect } from "react";
import { ShieldAlert } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("ERP Runtime Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full text-center space-y-6 bg-slate-950 p-8 border border-slate-800 rounded shadow-2xl">
        <div className="flex justify-center">
          <div className="p-3 bg-rose-950 text-rose-400 border border-rose-900 rounded-full">
            <ShieldAlert className="h-10 w-10 animate-bounce" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">System Runtime Error</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            An unexpected error occurred during client-side operations. This has been logged for system diagnostics.
          </p>
          <div className="p-3.5 bg-slate-900 border border-slate-800 rounded text-left overflow-x-auto text-[11px] text-rose-300 font-mono max-h-32">
            {error.message || "Unknown error"}
          </div>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="px-5 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded transition"
          >
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition shadow-md"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
