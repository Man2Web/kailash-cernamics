import React from "react";
import AttendancePublicClient from "@/components/erp/AttendancePublicClient";
import Link from "next/link";
import { getSession, isAttendanceDisplay } from "@/lib/auth/auth";
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

  // The live rotating QR screen is shown ONLY to the dedicated "Attendance QR Screen" login: not to Super Admin or any other
  // account. Everyone else must reach this page by scanning the office QR code, so the link carries a valid token.
  const isDisplay = isAttendanceDisplay(session);
  if (!token && !isDisplay) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
          <h1 className="text-lg font-bold text-white">Employee Attendance</h1>
          <p className="text-sm text-slate-400">
            Scan the attendance QR code displayed at the office or warehouse entrance with your phone to mark your check-in
            or check-out.
          </p>
          {!session && (
            <Link href="/login?callbackUrl=%2Fattendance" className="inline-block text-sm font-semibold text-blue-400 underline">
              Log in
            </Link>
          )}
        </div>
      </div>
    );
  }

  const initialIdentifier = session?.user?.employeeNo || session?.user?.phone || session?.user?.email || "";
  const initialName = session?.user?.name || "";

  let isTokenValid = false;
  let tokenValidationMessage = "";

  if (token) {
    const check = await validateAttendanceToken(token);
    isTokenValid = check.valid;
    tokenValidationMessage = check.message || "";
  }

  // Only the QR-screen login may mint a code; a scanning employee never needs one.
  const initialLiveToken = isDisplay ? await generateDynamicAttendanceToken() : { token: "", expiresInSeconds: 0, expiresAt: 0 };

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
