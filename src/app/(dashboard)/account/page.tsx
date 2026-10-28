import React from "react";
import db from "@/lib/db/db";
import { redirect } from "next/navigation";
import { getSession, comparePassword } from "@/lib/auth/auth";
import AccountSettingsClient from "@/components/erp/AccountSettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account Settings" };

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  // New members start with a shared default password: remind them to replace it.
  const usingDefaultPassword = user ? await comparePassword("Inventory@123", user.passwordHash) : false;
  const activeSessions = await db.session.count({ where: { userId: session.user.id, expiresAt: { gt: new Date() } } });

  return (
    <AccountSettingsClient
      email={session.user.email}
      usingDefaultPassword={usingDefaultPassword}
      activeSessions={activeSessions}
    />
  );
}
