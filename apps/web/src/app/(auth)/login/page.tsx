"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@gc/shared";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/common/form-fields";
import { BrandMark, ThemeToggle } from "@/components/app/app-shell";
import { api, ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [needTotp, setNeedTotp] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await api<{ role?: { code: string } }>("/auth/login", { method: "POST", body: values });
      // The shared attendance screen account has no branch or permissions: it only ever shows the QR screen.
      if (me?.role?.code === "ATTENDANCE_DISPLAY") {
        router.replace("/attendance");
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (e) {
      if (e instanceof ApiError && e.code === "TOTP_REQUIRED") {
        setNeedTotp(true);
        setError(e.message);
        return;
      }
      setError(e instanceof Error ? e.message : "Sign in failed");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <TextField control={form.control} name="email" label="Email or mobile number" type="text" autoFocus placeholder="you@kailashceramics.com or 9876543210" />
      <TextField control={form.control} name="password" label="Password" type="password" />
      {needTotp && <TextField control={form.control} name="totp" label="Authenticator code" placeholder="6-digit code" maxLength={6} />}
      {error && <p className="rounded-md bg-ios-red/10 px-3 py-2 text-[13px] text-ios-red">{error}</p>}
      <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative grid min-h-dvh place-items-center px-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark size={52} />
          <div>
            <h1 className="text-[24px] font-bold">KAILAS CERAMIX</h1>
            <p className="text-[13px] text-muted-foreground">Tiles & Sanitaryware ERP</p>
          </div>
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
