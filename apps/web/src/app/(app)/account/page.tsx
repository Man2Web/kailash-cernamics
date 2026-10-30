"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changePasswordSchema } from "@gc/shared";
import type { z } from "zod";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { FormGrid, TextField } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useQueryClient } from "@tanstack/react-query";

type Pw = z.infer<typeof changePasswordSchema>;

export default function AccountPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const form = useForm<Pw>({ resolver: zodResolver(changePasswordSchema) as Resolver<Pw>, defaultValues: { currentPassword: "", newPassword: "" } });
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");

  const changePw = form.handleSubmit(async (v) => {
    try {
      await api("/auth/change-password", { method: "POST", body: v });
      toast.success("Password changed. Other devices are signed out.");
      form.reset();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not change password");
    }
  });

  return (
    <>
      <PageHeader title="My account" />
      <div className="space-y-4">
        <Section title="Profile">
          <InfoGrid
            items={[
              { label: "Name", value: user.name },
              { label: "Email", value: user.email },
              { label: "Role", value: user.role.name },
              { label: "Branches", value: user.branches.map((b) => b.code).join(", ") },
            ]}
          />
        </Section>
        <Section title="Change password">
          <form id="security" onSubmit={changePw} className="space-y-4">
            <FormGrid>
              <TextField control={form.control} name="currentPassword" label="Current password" type="password" />
              <TextField control={form.control} name="newPassword" label="New password" type="password" hint="At least 8 characters" />
            </FormGrid>
            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Change password
              </Button>
            </div>
          </form>
        </Section>
        <Section title="Two-factor authentication (TOTP)">
          {user.totpEnabled ? (
            <p className="text-[13.5px]">2FA is <b className="text-ios-green">on</b>. You'll be asked for a 6-digit code from your authenticator app when you sign in.</p>
          ) : setup ? (
            <div className="space-y-3 text-[13.5px]">
              <p>Add this account in Google Authenticator / Authy by entering the key below (or open the link on your phone), then type the 6-digit code to turn on 2FA.</p>
              <div className="rounded-md bg-fill p-3 font-mono text-[13px] break-all">{setup.secret}</div>
              <a href={setup.otpauthUrl} className="text-tint text-[12.5px] break-all hover:underline">
                {setup.otpauthUrl}
              </a>
              <div className="flex max-w-xs gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} />
                <Button
                  disabled={code.length !== 6}
                  onClick={async () => {
                    try {
                      await api("/auth/totp/enable", { method: "POST", body: { code } });
                      toast.success("2FA is on");
                      qc.invalidateQueries({ queryKey: ["/auth/me"] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Code did not match");
                    }
                  }}
                >
                  Turn on
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-[13.5px]">
              <p>Protect your account with a code from an authenticator app. Recommended for owners and admins.</p>
              <Button variant="secondary" onClick={async () => setSetup(await api("/auth/totp/setup", { method: "POST", body: {} }))}>
                Set up 2FA
              </Button>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
