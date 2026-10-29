import React from "react";
import { notFound, redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import db from "@/lib/db/db";
import { ResetPasswordForm } from "@/components/erp/OfficeForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset Password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.user.roles)) redirect("/unauthorized");

  const user = await db.user.findUnique({ where: { id } }).catch(() => null);
  if (!user) notFound();
  return <ResetPasswordForm user={{ id: user.id, name: user.name }} />;
}
