import React from "react";
import AttendancePublicClient from "@/components/erp/AttendancePublicClient";
import { getSession } from "@/lib/auth/auth";
import { generateDynamicAttendanceToken, validateAttendanceToken } from "@/lib/attendance/token";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Employee Attendance | Daily Check-In & Check-Out",
  description: "Mark daily employee check-in and check-out.",
};

interface PublicAttendancePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function PublicAttendancePage({ searchParams }: PublicAttendancePageProps) {
  const params = await searchParams;
  const token = params?.token || "";

  const session = await getSession();
  const initialIdentifier = session?.user?.employeeNo || session?.user?.phone || session?.user?.email || "";
  const initialName = session?.user?.name || "";

  let isTokenValid = false;
  let tokenValidationMessage = "";

  if (token) {
    const check = await validateAttendanceToken(token);
    isTokenValid = check.valid;
    tokenValidationMessage = check.message || "";
  }

  // Generate initial live token for kiosk display
  const initialLiveToken = await generateDynamicAttendanceToken();

  const configuredAttendanceUrl =
    process.env.NEXT_PUBLIC_ATTENDANCE_URL ||
    (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/attendance` : "http://localhost:3000/attendance");

  return (
    <AttendancePublicClient
      initialToken={token}
      isTokenValid={isTokenValid}
      tokenValidationMessage={tokenValidationMessage}
      initialLiveToken={initialLiveToken.token}
      initialExpiresInSeconds={initialLiveToken.expiresInSeconds}
      initialIdentifier={initialIdentifier}
      initialName={initialName}
      configuredAttendanceUrl={configuredAttendanceUrl}
    />
  );
}
