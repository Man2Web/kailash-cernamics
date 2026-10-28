"use client";

import React, { useState, useEffect, useTransition } from "react";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Clock,
  User,
  AlertCircle,
  LogIn,
  LogOut,
  Calendar,
  Building,
  ShieldCheck,
  QrCode,
  RotateCw,
  Smartphone,
  ExternalLink,
  Wifi,
  Settings,
} from "lucide-react";
import {
  getLiveAttendanceTokenAction,
  checkInEmployeeAction,
  checkOutEmployeeAction,
} from "@/app/attendance/actions";

interface AttendancePublicClientProps {
  initialToken?: string;
  isTokenValid?: boolean;
  tokenValidationMessage?: string;
  initialLiveToken: string;
  initialExpiresInSeconds: number;
  initialIdentifier?: string;
  initialName?: string;
  configuredAttendanceUrl?: string;
}

export default function AttendancePublicClient({
  initialToken = "",
  isTokenValid = false,
  tokenValidationMessage = "",
  initialLiveToken,
  initialExpiresInSeconds = 60,
  initialIdentifier = "",
  initialName = "",
  configuredAttendanceUrl,
}: AttendancePublicClientProps) {
  // Mode: If initialToken exists in URL, employee scanned the QR code. Otherwise, show the live rotating QR Kiosk.
  const isScanFlow = Boolean(initialToken);

  const [scannedToken, setScannedToken] = useState(initialToken);
  const [tokenValid, setTokenValid] = useState(isTokenValid);
  const [tokenMsg, setTokenMsg] = useState(tokenValidationMessage);

  // Kiosk / Dynamic QR State
  const [liveToken, setLiveToken] = useState(initialLiveToken);
  const [secondsRemaining, setSecondsRemaining] = useState(initialExpiresInSeconds);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isRotating, setIsRotating] = useState(false);

  // Dynamic Base URL Resolution
  const [activeBaseUrl, setActiveBaseUrl] = useState<string>(() => {
    if (configuredAttendanceUrl) {
      return configuredAttendanceUrl.replace(/\/+$/, "").replace(/\/attendance$/, "");
    }
    return "http://localhost:3000";
  });

  const [showNetworkConfig, setShowNetworkConfig] = useState(false);
  const [customHost, setCustomHost] = useState("");

  // Form states
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    alreadyCheckedIn?: boolean;
    record?: any;
  } | null>(null);

  // Auto-detect browser origin if not already pointing to a custom URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      // If configuredAttendanceUrl is provided in env, respect it; otherwise adopt window.location.origin
      if (!configuredAttendanceUrl) {
        setActiveBaseUrl(origin);
      } else if (configuredAttendanceUrl.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        // If env had localhost but user opened the page from a LAN IP e.g. 192.168.1.14, adopt the LAN origin
        setActiveBaseUrl(origin);
      }
    }
  }, [configuredAttendanceUrl]);

  // Construct full target URL for the QR code
  const currentAttendanceBaseUrl = `${activeBaseUrl.replace(/\/+$/, "").replace(/\/attendance$/, "")}/attendance`;
  const currentEncodedQrUrl = `${currentAttendanceBaseUrl}?token=${encodeURIComponent(liveToken)}`;

  // Generate QR image data URL whenever liveToken or base URL changes
  useEffect(() => {
    if (!isScanFlow && liveToken) {
      QRCode.toDataURL(currentEncodedQrUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("Error generating QR data URL:", err));
    }
  }, [liveToken, isScanFlow, currentEncodedQrUrl]);

  // 60-Second Countdown & Auto-Rotation Timer
  useEffect(() => {
    if (isScanFlow) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchNewLiveToken();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isScanFlow]);

  const fetchNewLiveToken = async () => {
    setIsRotating(true);
    try {
      const res = await getLiveAttendanceTokenAction();
      setLiveToken(res.token);
      setSecondsRemaining(res.expiresInSeconds);
    } catch (err) {
      console.error("Failed to rotate attendance QR token:", err);
    } finally {
      setIsRotating(false);
    }
  };

  const inputRef = React.useRef<HTMLInputElement>(null);

  const executeCheckIn = async () => {
    // Read directly from DOM input or state to support mobile autofill
    const domVal = inputRef.current?.value || "";
    const clean = (domVal || identifier || "").trim();
    if (!clean) {
      setResult({
        success: false,
        message: "Please enter your mobile number.",
      });
      inputRef.current?.focus();
      return;
    }

    // Keep state in sync
    setIdentifier(clean);

    startTransition(async () => {
      const tokenToPass = isScanFlow ? scannedToken : liveToken;
      try {
        // 1. Try resilient REST API endpoint
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: clean,
            mobile: clean,
            token: tokenToPass,
            action: "CHECK_IN",
          }),
        });
        const data = await res.json();
        setResult(data);
      } catch (fetchErr) {
        // 2. Fallback to Server Action
        try {
          const fallbackRes = await checkInEmployeeAction(clean, tokenToPass);
          setResult(fallbackRes);
        } catch (serverErr: any) {
          setResult({
            success: false,
            message: serverErr?.message || "Unable to mark attendance. Please try again.",
          });
        }
      }
    });
  };

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    executeCheckIn();
  };

  const handleCheckOut = () => {
    const domVal = inputRef.current?.value || "";
    const clean = (domVal || identifier || "").trim();
    if (!clean) {
      setResult({
        success: false,
        message: "Please enter your mobile number.",
      });
      return;
    }

    startTransition(async () => {
      const tokenToPass = isScanFlow ? scannedToken : liveToken;
      try {
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: clean,
            mobile: clean,
            token: tokenToPass,
            action: "CHECK_OUT",
          }),
        });
        const data = await res.json();
        setResult(data);
      } catch (fetchErr) {
        try {
          const fallbackRes = await checkOutEmployeeAction(clean, tokenToPass);
          setResult(fallbackRes);
        } catch (serverErr: any) {
          setResult({
            success: false,
            message: serverErr?.message || "Unable to check out. Please try again.",
          });
        }
      }
    });
  };

  // Auto-fetch employee status if identifier is populated
  useEffect(() => {
    const clean = (identifier || "").trim();
    if (clean.length >= 4) {
      fetch(`/api/attendance?identifier=${encodeURIComponent(clean)}&token=${encodeURIComponent(isScanFlow ? scannedToken : liveToken)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.record) {
            setResult({
              success: true,
              message: data.state === "COMPLETED" ? "Attendance completed for today." : "Current attendance status",
              alreadyCheckedIn: data.state !== "NOT_CHECKED_IN",
              record: data.record,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const todayDateFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const record = result?.record;
  const isCheckedIn = Boolean(record?.checkInTime);
  const isCheckedOut = Boolean(record?.checkOutTime);
  const isCompleted = isCheckedOut || (result?.message && result.message.includes("Attendance completed"));

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans">
      {/* 1. EMPLOYEE SCAN FLOW (Opened via mobile QR scan with ?token=...) */}
      {isScanFlow ? (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center p-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-400 mb-1">
              <Building className="h-8 w-8" />
            </div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-white">Employee Attendance</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 flex items-center justify-center gap-1.5 mt-0.5">
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
              {todayDateFormatted}
            </p>
          </div>

          {!tokenValid ? (
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
              <p className="font-semibold text-sm text-rose-300">
                {tokenMsg || "QR code expired. Please scan the latest QR code."}
              </p>
              <p className="text-xs text-slate-400">
                Attendance QR codes rotate every 60 seconds. Please scan the live QR code from the attendance display.
              </p>
              <div className="pt-2">
                <a
                  href="/attendance"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Open Live QR Display</span>
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span>QR Verified & Active (IST Timezone)</span>
              </div>

              {/* Input Form */}
              <form onSubmit={handleCheckIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Registered Mobile Number / Employee ID
                  </label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                      }}
                      onBlur={() => {
                        const clean = (identifier || "").trim();
                        if (clean.length >= 4) {
                          fetch(`/api/attendance?identifier=${encodeURIComponent(clean)}&token=${encodeURIComponent(isScanFlow ? scannedToken : liveToken)}`)
                            .then((res) => res.json())
                            .then((data) => {
                              if (data.success && data.record) {
                                setResult({
                                  success: true,
                                  message: data.state === "COMPLETED" ? "Attendance completed for today." : "Today's Attendance",
                                  alreadyCheckedIn: data.state !== "NOT_CHECKED_IN",
                                  record: data.record,
                                });
                              }
                            })
                            .catch(() => {});
                        }
                      }}
                      placeholder="e.g. 9876543210 or +91 9876543210"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3.5 bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition font-medium"
                    />
                    <Smartphone className="h-5 w-5 text-blue-400 absolute left-3.5 top-3.5" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Enter your registered 10-digit mobile number or Employee ID.
                  </p>
                </div>

                {/* State 1: NOT CHECKED IN -> CHECK IN BUTTON */}
                {!isCheckedIn && !isCompleted && (
                  <button
                    type="submit"
                    onClick={executeCheckIn}
                    disabled={isPending}
                    className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/30 transition-all duration-150 cursor-pointer touch-manipulation select-none"
                  >
                    {isPending ? (
                      <>
                        <RotateCw className="h-5 w-5 animate-spin text-white" />
                        <span className="text-white">Recording Check-In...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="h-5 w-5" />
                        <span>MARK CHECK IN</span>
                      </>
                    )}
                  </button>
                )}
              </form>

              {/* Attendance Card Display */}
              {record && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/90 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-sm text-white">Today's Attendance</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      isCompleted
                        ? "bg-purple-950 text-purple-300 border border-purple-800"
                        : isCheckedIn
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-slate-800 text-slate-300"
                    }`}>
                      {isCompleted ? "Attendance Completed" : isCheckedIn ? "Checked In" : "Not Checked In"}
                    </span>
                  </div>

                  <div className="space-y-2 text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Employee:</span>
                      <span className="font-semibold text-white">
                        {record.employeeName} ({record.employeeNo})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Date:</span>
                      <span className="text-white font-mono">{record.attendanceDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Check In:</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {record.checkInTime || "-"}
                      </span>
                    </div>

                    {record.checkOutTime && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Check Out:</span>
                          <span className="font-mono text-blue-400 font-bold">
                            {record.checkOutTime}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Working Hours:</span>
                          <span className="font-semibold text-white font-mono">
                            {record.workingHoursFormatted}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* State 2: CHECKED IN -> CHECK OUT BUTTON */}
                  {isCheckedIn && !isCompleted && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleCheckOut}
                        disabled={isPending}
                        className="w-full py-3.5 px-4 bg-amber-600 hover:bg-amber-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition cursor-pointer touch-manipulation"
                      >
                        {isPending ? (
                          <>
                            <RotateCw className="h-5 w-5 animate-spin text-white" />
                            <span>Recording Check-Out...</span>
                          </>
                        ) : (
                          <>
                            <LogOut className="h-5 w-5" />
                            <span>MARK CHECK OUT</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* State 3: COMPLETED -> Message only */}
                  {isCompleted && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-emerald-300 text-center font-bold text-xs flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <span>Attendance completed for today.</span>
                    </div>
                  )}
                </div>
              )}

              {result && !record && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    result.success
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span>{result.message}</span>
                </div>
              )}
            </>
          )}

          <div className="pt-2 border-t border-slate-800/80 text-center">
            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              Secure 60-Second Rotating QR Code
            </p>
          </div>
        </div>
      ) : (
        /* 2. DYNAMIC QR ROTATION DISPLAY / KIOSK PAGE */
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-10 space-y-6 text-center animate-in fade-in duration-200">
          {/* Header */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center justify-center p-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl text-blue-400 mb-1">
              <QrCode className="h-8 w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white uppercase">
              Employee Attendance
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 flex items-center justify-center gap-1.5 mt-0.5">
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
              {todayDateFormatted}
            </p>
          </div>

          {/* Rotating Dynamic QR Card */}
          <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-4 mx-auto max-w-[320px]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Dynamic Attendance QR Code"
                className="w-64 h-64 rounded-lg object-contain transition-all duration-300"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center bg-slate-100 rounded-lg text-slate-400 text-xs">
                Generating Dynamic QR...
              </div>
            )}

            <div className="w-full flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <RotateCw className={`h-3 w-3 text-blue-600 ${isRotating ? "animate-spin" : ""}`} />
                Auto-Refreshes:
              </span>
              <span className="font-mono font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {secondsRemaining}s
              </span>
            </div>
          </div>

          {/* Target URL Info Banner for Wi-Fi / Phone Scanning */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-left space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Wifi className="h-3 w-3 text-emerald-400" />
                QR Encodes (Wi-Fi Access URL):
              </span>
              <button
                type="button"
                onClick={() => setShowNetworkConfig(!showNetworkConfig)}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <Settings className="h-3 w-3" />
                <span>{showNetworkConfig ? "Hide" : "Change URL"}</span>
              </button>
            </div>
            <p className="font-mono text-[11px] text-emerald-400 break-all bg-slate-900/90 p-2 rounded border border-slate-800 select-all">
              {currentEncodedQrUrl}
            </p>

            {showNetworkConfig && (
              <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                <p className="text-[11px] text-slate-400">
                  Switch the base host if testing across local Wi-Fi or custom domain:
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="e.g. http://192.168.1.14:3000"
                    className="flex-1 p-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customHost.trim()) {
                        setActiveBaseUrl(customHost.trim());
                        setCustomHost("");
                        setShowNetworkConfig(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-xs cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
                <div className="flex gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setActiveBaseUrl("http://192.168.1.14:3000")}
                    className="text-blue-400 hover:underline"
                  >
                    Use Wi-Fi IP (192.168.1.14)
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setActiveBaseUrl("http://localhost:3000")}
                    className="text-slate-400 hover:underline"
                  >
                    Use Localhost (3000)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Smartphone className="h-4 w-4 text-blue-400" />
              <span>How to mark attendance:</span>
            </div>
            <ol className="text-[11px] text-slate-400 list-decimal list-inside space-y-1 pl-1">
              <li>Ensure your phone is connected to the same Wi-Fi network.</li>
              <li>Open camera on your mobile phone and point at this QR code.</li>
              <li>Tap the link to open the attendance verification page.</li>
              <li>Enter your registered Mobile Number or Employee ID to <strong>Check In</strong> or <strong>Check Out</strong>.</li>
            </ol>
          </div>

          {/* Quick manual link for desktop testing */}
          <div className="pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                const targetUrl = `/attendance?token=${encodeURIComponent(liveToken)}`;
                window.location.href = targetUrl;
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-center gap-1 mx-auto transition cursor-pointer"
            >
              <span>Test check-in flow directly on this browser</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
