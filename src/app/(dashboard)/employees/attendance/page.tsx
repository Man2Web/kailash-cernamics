import { getSession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function EmployeesAttendanceRedirectPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSuperAdmin = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  if (!isSuperAdmin) {
    redirect("/unauthorized");
  }

  redirect("/office/attendance");
}
