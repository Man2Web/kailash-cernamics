import React from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full text-center space-y-6 bg-slate-950 p-8 border border-slate-800 rounded shadow-2xl">
        <div className="flex justify-center">
          <div className="p-3 bg-red-950 text-red-400 border border-red-900 rounded-full">
            <AlertCircle className="h-10 w-10 animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">404</h1>
          <h2 className="text-lg font-bold text-slate-200">Page Not Found</h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            The requested module, page, or internal link could not be found. It may have been moved or is currently not active.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition shadow-md"
          >
            Go Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
