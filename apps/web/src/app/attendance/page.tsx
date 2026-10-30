"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { CheckCircle2, LogIn, LogOut, QrCode, XCircle } from "lucide-react";
import { api, ApiError, apiGet, useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Me {
  name: string;
  role: { code: string };
}
interface TokenRes {
  token: string;
  expiresInSeconds: number;
}
interface Mine {
  employee: { name: string; employeeNo: string };
}
interface Result {
  ok: boolean;
  message: string;
  name?: string;
}

/** A new code is fetched a little before the previous one's 60 second life ends, so the screen never shows a stale code. */
const REFRESH_SECONDS = 45;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 text-center shadow-card md:p-8">{children}</div>
    </main>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <>
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-tint/10 text-tint">
        <QrCode className="size-6" />
      </div>
      <h1 className="text-[22px] font-bold">Employee Attendance</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
    </>
  );
}

/** The shared office screen. Only the dedicated attendance-screen login ever reaches this view. */
function QrScreen() {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(REFRESH_SECONDS);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    try {
      const t = await apiGet<TokenRes>("/attendance/qr-token");
      // The QR carries a link: scanning it with any phone camera opens the check-in page with this code attached.
      const url = `${window.location.origin}/attendance?token=${encodeURIComponent(t.token)}`;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" }));
      setError(null);
      setLeft(REFRESH_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the QR code");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (left <= 0) void refresh();
  }, [left, refresh]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    window.location.href = "/login";
  };

  return (
    <Card>
      <Header subtitle="Scan this code with your phone to check in or out." />
      <div className="mx-auto mt-5 grid aspect-square w-full max-w-[320px] place-items-center rounded-xl border border-border bg-white p-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Attendance QR code" className="size-full" />
        ) : (
          <span className="text-[13px] text-muted-foreground">{error ?? "Preparing the code…"}</span>
        )}
      </div>
      {error && qr && <p className="mt-2 text-[12px] text-ios-orange">{error} — showing the last code.</p>}
      <p className="mt-3 text-[12px] text-muted-foreground">New code in {Math.max(left, 0)}s</p>
      <div className="mt-4 text-[26px] font-semibold tabular-nums">
        {now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
      </div>
      <div className="text-[13px] text-muted-foreground">
        {now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </div>
      <Button className="mt-6" variant="ghost" size="sm" onClick={logout}>
        <LogOut className="size-4" /> Sign out
      </Button>
    </Card>
  );
}

/** What an employee sees after scanning the QR: confirm who they are, then check in or out. */
function CheckInPage({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [validMsg, setValidMsg] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ valid: boolean; message?: string }>("/attendance/public/verify", { method: "POST", body: { token } })
      .then((r) => {
        setValid(r.valid);
        setValidMsg(r.message ?? "");
      })
      .catch(() => {
        setValid(false);
        setValidMsg("Could not check the QR code. Please scan again.");
      });
  }, [token]);

  // Signed-in employees get their own ID filled in; anyone else types their mobile number.
  // A plain fetch on purpose: the shared client sends signed-out visitors to the login page on a 401, and this
  // page must stay open for them.
  useEffect(() => {
    fetch("/api/attendance/me", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Mine>) : null))
      .then((m) => m && setIdentifier((cur) => cur || m.employee.employeeNo))
      .catch(() => undefined);
  }, []);

  const run = async (kind: "check-in" | "check-out") => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ message: string; employeeName?: string }>(`/attendance/public/${kind}`, { method: "POST", body: { token, identifier } });
      setResult({ ok: true, message: r.message, name: r.employeeName });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setResult({ ok: false, message: msg });
      if (/expired|invalid attendance qr/i.test(msg)) {
        setValid(false);
        setValidMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Header subtitle="Enter your mobile number, then tap check in or check out." />
      {valid === false ? (
        <div className="py-8">
          <XCircle className="mx-auto size-10 text-ios-red" />
          <p className="mt-3 text-[15px] font-medium">{validMsg || "This QR code is no longer valid."}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Scan the code on the office attendance screen again.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3 text-left">
          <label className="block text-[13px] font-medium" htmlFor="identifier">
            Mobile number or employee ID
          </label>
          <input
            id="identifier"
            inputMode="tel"
            autoComplete="tel"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. 9876543210 or +91 9876543210"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-[15px]"
          />
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button size="lg" disabled={busy || valid === null || identifier.trim().length < 3} onClick={() => run("check-in")}>
              <LogIn className="size-5" /> Check in
            </Button>
            <Button size="lg" variant="secondary" disabled={busy || valid === null || identifier.trim().length < 3} onClick={() => run("check-out")}>
              <LogOut className="size-5" /> Check out
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div className={`mt-5 flex items-start gap-3 rounded-xl p-4 text-left ${result.ok ? "bg-ios-green/12" : "bg-ios-red/10"}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ios-green" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-ios-red" />}
          <div>
            {result.name && <div className="text-[15px] font-semibold">{result.name}</div>}
            <div className="text-[13.5px]">{result.message}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Landing() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const me = useApi<Me>(token ? null : "/auth/me", undefined, { retry: false });

  // 1) A scanned link carries a token: show the check-in page. No sign-in needed.
  if (token) return <CheckInPage token={token} />;

  if (me.isLoading) return <Card><p className="py-12 text-[13px] text-muted-foreground">Loading…</p></Card>;

  // 2) The dedicated attendance-screen login: show the live QR.
  if (me.data?.role.code === "ATTENDANCE_DISPLAY") return <QrScreen />;

  // 3) Anyone else opening /attendance directly (including Super Admin) must scan the office QR code.
  return (
    <Card>
      <Header subtitle="Scan the attendance QR code displayed at the office or warehouse entrance with your phone to mark your check-in or check-out." />
      {!me.data && (
        <Link href="/login?next=%2Fattendance" className="mt-5 inline-block text-[14px] font-medium text-tint underline">
          Sign in
        </Link>
      )}
    </Card>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
