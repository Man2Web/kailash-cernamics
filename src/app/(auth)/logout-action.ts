"use server";

import { destroySession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
