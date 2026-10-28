"use client";

import React, { useActionState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction, LoginState } from "./actions";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("callbackUrl") || "";
  // Only follow in-app paths after login (never an external address).
  const callbackUrl = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    loginAction,
    {}
  );

  useEffect(() => {
    if (state.success) {
      router.push(callbackUrl);
      router.refresh();
    }
  }, [state.success, router, callbackUrl]);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      {state.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded text-xs">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label
          htmlFor="identifier"
          className="block text-xs font-semibold text-slate-600 uppercase"
        >
          Email or Phone Number
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          required
          className="appearance-none rounded-none relative block w-full px-3 py-1.5 border border-slate-300 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-sm"
          placeholder="e.g. admin@inventory.com or 9876543210"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="password"
          className="block text-xs font-semibold text-slate-600 uppercase"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="appearance-none rounded-none relative block w-full px-3 py-1.5 border border-slate-300 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 text-sm"
          placeholder="••••••••"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isPending ? "Logging in..." : "Log In"}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 border border-slate-200 rounded shadow-sm">
        <div>
          <div className="flex justify-center">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Inventory
            </span>
          </div>
          <h2 className="mt-4 text-center text-xl font-bold text-slate-800">
            Inventory Management System
          </h2>
          <p className="mt-1 text-center text-xs text-slate-500">
            Log in to manage branches, stock, sales, and accounts
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-xs text-slate-400 py-4">Loading login form...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
