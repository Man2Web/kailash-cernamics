"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  Calendar,
  Clock,
  Download,
  QrCode,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  Filter,
  Edit2,
  Printer,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  UserX,
  Plus,
} from "lucide-react";
import {
  fetchTodayAttendanceAction,
  fetchMonthlyAttendanceAction,
  saveAttendanceCorrectionAction,
  exportAttendanceExcelAction,
} from "@/app/(dashboard)/office/attendance/actions";
import { AttendanceRecord, MonthlyEmployeeSummary } from "@/lib/attendance/attendance";
import QRCode from "qrcode";

interface AttendanceAdminClientProps {
  initialTodaySummary: {
    totalEmployees: number;
    presentCount: number;
    checkedInCount: number;
    checkedOutCount: number;
    lateCount: number;
    absentCount: number;
    records: AttendanceRecord[];
  };
  initialMonthData: {
    dailyRecords: AttendanceRecord[];
    employeeSummaries: MonthlyEmployeeSummary[];
  };
  employees: Array<{ id: string; employeeNo: string; name: string; role: string }>;
  appUrl: string;
}

export default function AttendanceAdminClient({
  initialTodaySummary,
  initialMonthData,
  employees,
  appUrl,
}: AttendanceAdminClientProps) {
  const [activeTab, setActiveTab] = useState<"today" | "monthly" | "qr">("today");
  const [todaySummary, setTodaySummary] = useState(initialTodaySummary);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [monthData, setMonthData] = useState(initialMonthData);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isPending, startTransition] = useTransition();

  // QR Code Data URL
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const attendanceUrl = `${appUrl}/attendance`;

  // Correction Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [correctionForm, setCorrectionForm] = useState({
    recordId: "",
    employeeId: employees[0]?.id || "",
    attendanceDate: new Date().toISOString().split("T")[0],
    checkInTime: "09:00 AM",
    checkOutTime: "06:00 PM",
    status: "PRESENT" as "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "LEAVE",
    reason: "",
  });

  useEffect(() => {
    QRCode.toDataURL(attendanceUrl, { width: 280, margin: 2 }, (err, url) => {
      if (!err && url) {
        setQrCodeDataUrl(url);
      }
    });
  }, [attendanceUrl]);

  // Handle Month Change
  const handleLoadMonth = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    startTransition(async () => {
      const data = await fetchMonthlyAttendanceAction(year, month);
      setMonthData(data);
    });
  };

  // Handle Excel Export
  const handleExportExcel = () => {
    startTransition(async () => {
      const res = await exportAttendanceExcelAction(selectedYear, selectedMonth);
      if (res.success && res.base64 && res.filename) {
        const byteCharacters = atob(res.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert(res.error || "Failed to export Excel.");
      }
    });
  };

  // Handle Correction Submit
  const handleSaveCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionForm.employeeId || !correctionForm.reason.trim()) {
      alert("Please specify the employee and a reason for correction.");
      return;
    }

    startTransition(async () => {
      const res = await saveAttendanceCorrectionAction(correctionForm);
      if (res.success) {
        setIsCorrectionModalOpen(false);
        // Refresh today's and monthly data
        const updatedToday = await fetchTodayAttendanceAction();
        setTodaySummary(updatedToday);
        const updatedMonth = await fetchMonthlyAttendanceAction(selectedYear, selectedMonth);
        setMonthData(updatedMonth);
        alert(res.message);
      } else {
        alert(res.message || "Failed to save correction.");
      }
    });
  };

  const openCorrectionModal = (record?: AttendanceRecord) => {
    if (record) {
      setEditingRecord(record);
      setCorrectionForm({
        recordId: record.id,
        employeeId: record.employeeId,
        attendanceDate: record.attendanceDate,
        checkInTime: record.checkInTime || "09:00 AM",
        checkOutTime: record.checkOutTime || "",
        status: record.status,
        reason: record.correctionReason || "Admin manual adjustment",
      });
    } else {
      setEditingRecord(null);
      setCorrectionForm({
        recordId: "",
        employeeId: employees[0]?.id || "",
        attendanceDate: new Date().toISOString().split("T")[0],
        checkInTime: "09:00 AM",
        checkOutTime: "06:00 PM",
        status: "PRESENT",
        reason: "",
      });
    }
    setIsCorrectionModalOpen(true);
  };

  // Filter Today Records
  const filteredTodayRecords = todaySummary.records.filter((r) => {
    const matchesSearch =
      r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PRESENT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">PRESENT</span>;
      case "LATE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">LATE CHECK-IN</span>;
      case "HALF_DAY":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">HALF DAY</span>;
      case "LEAVE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">ON LEAVE</span>;
      case "ABSENT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">ABSENT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-white p-3.5 sm:p-5 border border-slate-200 rounded-lg shadow-xs">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
              Employee Attendance Management
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded border border-blue-200 shrink-0">
              Super Admin Control
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
            Track daily QR check-ins, monitor working hours, generate monthly summaries, and export Excel reports
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("qr")}
            className={`px-3 py-2 text-xs font-semibold rounded flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === "qr"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <QrCode className="h-4 w-4" />
            Attendance QR Code
          </button>
          <button
            onClick={() => openCorrectionModal()}
            className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Manual Attendance Entry
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 sm:px-4 pt-2 rounded-t-lg overflow-x-auto no-scrollbar whitespace-nowrap">
        <button
          onClick={() => setActiveTab("today")}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold flex items-center gap-1.5 sm:gap-2 border-b-2 transition cursor-pointer shrink-0 ${
            activeTab === "today"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Today's Live Attendance</span>
          <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full text-[10px]">
            {todaySummary.records.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("monthly")}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold flex items-center gap-1.5 sm:gap-2 border-b-2 transition cursor-pointer shrink-0 ${
            activeTab === "monthly"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Monthly Summary & Excel Export</span>
        </button>

        <button
          onClick={() => setActiveTab("qr")}
          className={`pb-3 px-3 sm:px-4 text-xs font-semibold flex items-center gap-1.5 sm:gap-2 border-b-2 transition cursor-pointer shrink-0 ${
            activeTab === "qr"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>Attendance QR Poster</span>
        </button>
      </div>

      {/* TAB 1: TODAY'S LIVE ATTENDANCE */}
      {activeTab === "today" && (
        <div className="space-y-6">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
            <div className="bg-white p-3.5 sm:p-4 border border-slate-200 rounded-lg shadow-xs">
              <p className="text-[10px] font-bold uppercase text-slate-500">Total Staff</p>
              <p className="text-xl font-bold text-slate-900 mt-1">{todaySummary.totalEmployees}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Active profiles</p>
            </div>
            <div className="bg-white p-3.5 sm:p-4 border border-emerald-200 rounded-lg shadow-xs bg-emerald-50/20">
              <p className="text-[10px] font-bold uppercase text-emerald-700">Present Today</p>
              <p className="text-xl font-bold text-emerald-800 mt-1">{todaySummary.presentCount}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">Attended work</p>
            </div>
            <div className="bg-white p-3.5 sm:p-4 border border-blue-200 rounded-lg shadow-xs bg-blue-50/20">
              <p className="text-[10px] font-bold uppercase text-blue-700">Checked In</p>
              <p className="text-xl font-bold text-blue-800 mt-1">{todaySummary.checkedInCount}</p>
              <p className="text-[10px] text-blue-600 mt-0.5">Currently on shift</p>
            </div>
            <div className="bg-white p-3.5 sm:p-4 border border-indigo-200 rounded-lg shadow-xs bg-indigo-50/20">
              <p className="text-[10px] font-bold uppercase text-indigo-700">Checked Out</p>
              <p className="text-xl font-bold text-indigo-800 mt-1">{todaySummary.checkedOutCount}</p>
              <p className="text-[10px] text-indigo-600 mt-0.5">Shift completed</p>
            </div>
            <div className="bg-white p-3.5 sm:p-4 border border-amber-200 rounded-lg shadow-xs bg-amber-50/20">
              <p className="text-[10px] font-bold uppercase text-amber-700">Late Arrivals</p>
              <p className="text-xl font-bold text-amber-800 mt-1">{todaySummary.lateCount}</p>
              <p className="text-[10px] text-amber-600 mt-0.5">After 09:15 AM</p>
            </div>
            <div className="bg-white p-3.5 sm:p-4 border border-rose-200 rounded-lg shadow-xs bg-rose-50/20">
              <p className="text-[10px] font-bold uppercase text-rose-700">Absent</p>
              <p className="text-xl font-bold text-rose-800 mt-1">{todaySummary.absentCount}</p>
              <p className="text-[10px] text-rose-600 mt-0.5">Unrecorded</p>
            </div>
          </div>

          {/* Table Controls */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative w-full sm:max-w-sm">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by employee name or ID..."
                  className="w-full pl-9 pr-3 py-2 sm:py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full sm:w-auto px-2.5 py-2 sm:py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late Check-in</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LEAVE">Leave</option>
                </select>
              </div>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden p-3 space-y-3">
              {filteredTodayRecords.length > 0 ? (
                filteredTodayRecords.map((rec) => (
                  <div key={rec.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{rec.employeeName}</div>
                        <div className="text-[11px] font-mono text-slate-500 font-bold">
                          {rec.employeeNo || rec.employeeId.slice(0, 8)} • <span className="text-slate-600 font-sans font-normal">{rec.role}</span>
                        </div>
                      </div>
                      <div>{getStatusBadge(rec.status)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded border border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Check In</div>
                        <div className="font-mono font-semibold text-emerald-600">{rec.checkInTime}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Check Out</div>
                        <div className="font-mono font-semibold text-blue-600">{rec.checkOutTime || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Working Hours</div>
                        <div className="font-semibold text-slate-700">{rec.workingHoursFormatted || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium">Method</div>
                        <div className="font-mono text-slate-600 text-[11px]">{rec.method}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-400 text-[11px]">{rec.attendanceDate}</span>
                      <button
                        onClick={() => openCorrectionModal(rec)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Edit / Correct</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400">
                  <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-semibold text-xs">No attendance records logged for today yet.</p>
                </div>
              )}
            </div>

            {/* Desktop Today's Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4">Role / Designation</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Check In</th>
                    <th className="py-3 px-4">Check Out</th>
                    <th className="py-3 px-4">Working Hours</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTodayRecords.length > 0 ? (
                    filteredTodayRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {rec.employeeNo || rec.employeeId.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {rec.employeeName}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{rec.role}</td>
                        <td className="py-3 px-4 text-slate-600">{rec.attendanceDate}</td>
                        <td className="py-3 px-4 font-mono text-emerald-600 font-semibold">
                          {rec.checkInTime}
                        </td>
                        <td className="py-3 px-4 font-mono text-blue-600 font-semibold">
                          {rec.checkOutTime || "-"}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {rec.workingHoursFormatted || "-"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                            {rec.method}
                          </span>
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(rec.status)}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => openCorrectionModal(rec)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="Edit / Manual Correction"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        <Users className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold">No attendance records logged for today yet.</p>
                        <p className="text-[11px] mt-1 text-slate-400">
                          Employees can scan the QR code to mark check-in or you can record entries manually.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MONTHLY SUMMARY & EXCEL EXPORT */}
      {activeTab === "monthly" && (
        <div className="space-y-6">
          {/* Month Selector & Export Controls */}
          <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => handleLoadMonth(selectedYear, Number(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
                >
                  {monthNames.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => handleLoadMonth(Number(e.target.value), selectedMonth)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 focus:ring-1 focus:ring-blue-500"
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportExcel}
              disabled={isPending}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Download className="h-4 w-4" />
              {isPending
                ? "Generating Excel..."
                : `Export Excel (${monthNames[selectedMonth - 1]} ${selectedYear})`}
            </button>
          </div>

          {/* Monthly Employee Roll-Up Summary Table */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Employee Monthly Attendance Roll-Up ({monthNames[selectedMonth - 1]} {selectedYear})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Calculated summary of working days, presents, absents, late days, and total working hours
                </p>
              </div>
            </div>

            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Employee ID</th>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4">Role / Department</th>
                    <th className="py-3 px-4 text-center">Working Days</th>
                    <th className="py-3 px-4 text-center">Present Days</th>
                    <th className="py-3 px-4 text-center">Absent Days</th>
                    <th className="py-3 px-4 text-center">Late Days</th>
                    <th className="py-3 px-4 text-center">Leave Days</th>
                    <th className="py-3 px-4 text-right">Total Working Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthData.employeeSummaries.length > 0 ? (
                    monthData.employeeSummaries.map((emp) => (
                      <tr key={emp.employeeId} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {emp.employeeNo || emp.employeeId.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {emp.employeeName}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{emp.role}</td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-800">
                          {emp.workingDays}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-600">
                          {emp.presentDays}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-rose-600">
                          {emp.absentDays}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-amber-600">
                          {emp.lateDays}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-purple-600">
                          {emp.leaveDays}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {emp.totalWorkingHours}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No employees registered in the system.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="md:hidden p-3 space-y-3">
              {monthData.employeeSummaries.length > 0 ? (
                monthData.employeeSummaries.map((emp) => (
                  <div key={emp.employeeId} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2.5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{emp.employeeName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{emp.employeeNo} • {emp.role}</div>
                      </div>
                      <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                        {emp.totalWorkingHours}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                      <div className="bg-emerald-50 border border-emerald-100 p-1.5 rounded">
                        <div className="text-[9px] uppercase font-bold text-emerald-700">Present</div>
                        <div className="font-bold text-emerald-800 text-sm">{emp.presentDays}</div>
                      </div>
                      <div className="bg-rose-50 border border-rose-100 p-1.5 rounded">
                        <div className="text-[9px] uppercase font-bold text-rose-700">Absent</div>
                        <div className="font-bold text-rose-800 text-sm">{emp.absentDays}</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 p-1.5 rounded">
                        <div className="text-[9px] uppercase font-bold text-amber-700">Late</div>
                        <div className="font-bold text-amber-800 text-sm">{emp.lateDays}</div>
                      </div>
                      <div className="bg-purple-50 border border-purple-100 p-1.5 rounded">
                        <div className="text-[9px] uppercase font-bold text-purple-700">Leave</div>
                        <div className="font-bold text-purple-800 text-sm">{emp.leaveDays}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No employees registered in the system.
                </div>
              )}
            </div>
          </div>

          {/* Detailed Monthly Log Table */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Detailed Daily Attendance Logs ({monthData.dailyRecords.length} records)
                </h3>
              </div>
            </div>

            {/* Mobile Daily Logs Card View */}
            <div className="md:hidden p-3 space-y-3">
              {monthData.dailyRecords.length > 0 ? (
                monthData.dailyRecords.map((r) => (
                  <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{r.employeeName}</div>
                        <div className="text-[11px] font-mono text-slate-500 font-bold">{r.employeeNo} • {r.attendanceDate}</div>
                      </div>
                      <div>{getStatusBadge(r.status)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-100 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400">Check In</div>
                        <div className="font-mono font-semibold text-emerald-600">{r.checkInTime}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Check Out</div>
                        <div className="font-mono font-semibold text-blue-600">{r.checkOutTime || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Hours</div>
                        <div className="font-semibold text-slate-700">{r.workingHoursFormatted || "—"}</div>
                      </div>
                    </div>
                    {r.correctionReason && (
                      <div className="text-[11px] text-slate-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                        Note: {r.correctionReason}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No attendance activity logged in {monthNames[selectedMonth - 1]} {selectedYear}.
                </div>
              )}
            </div>

            {/* Desktop Daily Logs Table */}
            <div className="hidden md:block overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs text-slate-600 border-collapse">
                <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase font-bold tracking-wider border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Employee ID</th>
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Check In</th>
                    <th className="py-2.5 px-4">Check Out</th>
                    <th className="py-2.5 px-4">Working Hours</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthData.dailyRecords.length > 0 ? (
                    monthData.dailyRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 text-slate-700 font-medium">{r.attendanceDate}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-900">{r.employeeNo}</td>
                        <td className="py-2.5 px-4 text-slate-900 font-medium">{r.employeeName}</td>
                        <td className="py-2.5 px-4 font-mono text-emerald-600">{r.checkInTime}</td>
                        <td className="py-2.5 px-4 font-mono text-blue-600">{r.checkOutTime || "-"}</td>
                        <td className="py-2.5 px-4 font-semibold text-slate-700">
                          {r.workingHoursFormatted || "-"}
                        </td>
                        <td className="py-2.5 px-4">{getStatusBadge(r.status)}</td>
                        <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                          {r.correctionReason || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No attendance activity logged in {monthNames[selectedMonth - 1]} {selectedYear}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: QR CODE DISPLAY & PRINT CHECKPOINT */}
      {activeTab === "qr" && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs p-4 sm:p-6 max-w-xl mx-auto text-center space-y-6">
          <div>
            <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl inline-block mb-3">
              <QrCode className="h-8 w-8" />
            </span>
            <h2 className="text-xl font-bold text-slate-900">Attendance QR Code</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Place this QR code at office or warehouse entrances. Employees scan it to record their daily check-in and check-out.
            </p>
          </div>

          {/* Scannable QR Code Image */}
          <div className="p-4 sm:p-6 bg-slate-50 border border-slate-200 rounded-xl inline-block shadow-inner max-w-full overflow-hidden">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Attendance QR Code"
                className="w-56 h-56 sm:w-64 sm:h-64 mx-auto rounded-lg shadow-sm"
              />
            ) : (
              <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center text-slate-400">
                Generating QR Code...
              </div>
            )}
            <p className="font-mono text-[11px] sm:text-xs text-slate-500 mt-3 break-all">{attendanceUrl}</p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-2.5 sm:gap-3">
            <button
              onClick={() => window.print()}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Print QR Poster</span>
            </button>
            <a
              href={qrCodeDataUrl}
              download="attendance-qr-code.png"
              className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded flex items-center justify-center gap-2 transition"
            >
              <Download className="h-4 w-4" />
              <span>Download PNG</span>
            </a>
          </div>
        </div>
      )}

      {/* Manual Correction / Entry Modal */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-900">
                {editingRecord ? "Edit Attendance Record" : "Manual Attendance Entry"}
              </h3>
              <button
                onClick={() => setIsCorrectionModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 text-sm font-bold rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee *</label>
                <select
                  value={correctionForm.employeeId}
                  onChange={(e) =>
                    setCorrectionForm({ ...correctionForm, employeeId: e.target.value })
                  }
                  required
                  disabled={Boolean(editingRecord)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeNo}) - {emp.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={correctionForm.attendanceDate}
                  onChange={(e) =>
                    setCorrectionForm({ ...correctionForm, attendanceDate: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check In Time</label>
                  <input
                    type="text"
                    value={correctionForm.checkInTime}
                    onChange={(e) =>
                      setCorrectionForm({ ...correctionForm, checkInTime: e.target.value })
                    }
                    placeholder="09:00 AM"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Check Out Time</label>
                  <input
                    type="text"
                    value={correctionForm.checkOutTime}
                    onChange={(e) =>
                      setCorrectionForm({ ...correctionForm, checkOutTime: e.target.value })
                    }
                    placeholder="06:00 PM"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status *</label>
                <select
                  value={correctionForm.status}
                  onChange={(e) =>
                    setCorrectionForm({
                      ...correctionForm,
                      status: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                >
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late Check-in</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LEAVE">Leave</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Adjustment / Note *
                </label>
                <textarea
                  value={correctionForm.reason}
                  onChange={(e) =>
                    setCorrectionForm({ ...correctionForm, reason: e.target.value })
                  }
                  required
                  rows={2}
                  placeholder="e.g. On-site client meeting / Scanner glitch / Authorized approval"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded transition shadow-xs disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
