"use client";

import React, { useState, useTransition } from "react";
import {
  Users,
  Plus,
  Search,
  CheckCircle,
  FileText,
  BadgeAlert,
  Trash2,
  CalendarCheck,
  DollarSign,
} from "lucide-react";
import { createEmployee, toggleEmployeeStatus, deleteEmployee } from "@/app/(dashboard)/hr/actions";

interface EmployeeRow {
  id: string;
  employeeNo: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  jobTitle: string;
  status: string;
  salary: number;
  joiningDate: string;
}

interface HrClientProps {
  employees: EmployeeRow[];
}

export default function HrClient({ employees }: HrClientProps) {
  const [activeTab, setActiveTab] = useState("directory");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("SALES");
  const [jobTitle, setJobTitle] = useState("");
  const [salaryStr, setSalaryStr] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Stats
  const total = employees.length;
  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;
  const payrollCost = employees
    .filter((e) => e.status === "ACTIVE")
    .reduce((sum, e) => sum + e.salary, 0);

  const handleRegisterEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const salary = parseFloat(salaryStr);

    if (!name || !email || !jobTitle || isNaN(salary)) {
      setErrorMsg("Please fill out all required fields with a valid salary.");
      return;
    }

    startTransition(async () => {
      const res = await createEmployee({
        name,
        email,
        phone,
        department,
        jobTitle,
        salary,
      });

      if (res.success) {
        setSuccessMsg("Employee record registered successfully.");
        setName("");
        setEmail("");
        setPhone("");
        setDepartment("SALES");
        setJobTitle("");
        setSalaryStr("");
        setTimeout(() => {
          setShowForm(false);
          setSuccessMsg("");
        }, 1500);
      } else {
        setErrorMsg(res.error || "Failed to create employee.");
      }
    });
  };

  const handleStatusChange = (id: string, status: string) => {
    startTransition(async () => {
      const res = await toggleEmployeeStatus(id, status);
      if (!res.success) {
        alert(res.error || "Failed to update employee status.");
      }
    });
  };

  const handleDeleteEmployee = (id: string) => {
    if (!confirm("Are you sure you want to delete this employee profile?")) return;
    startTransition(async () => {
      const res = await deleteEmployee(id);
      if (!res.success) {
        alert(res.error || "Failed to delete employee profile.");
      }
    });
  };

  const filteredEmployees = employees.filter((e) => {
    return (
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "SUSPENDED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-500 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Total Personnel
            </p>
            <p className="text-xl font-extrabold text-slate-800">{total}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-500 rounded-sm">
            <Users className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Active Staff
            </p>
            <p className="text-xl font-extrabold text-blue-600">{activeCount}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-sm">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Monthly Payroll
            </p>
            <p className="text-xl font-extrabold text-emerald-600">
              ₹{payrollCost.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-sm">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Attendance Today
            </p>
            <p className="text-xl font-extrabold text-slate-800">100%</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-500 rounded-sm">
            <CalendarCheck className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => {
            setActiveTab("directory");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "directory"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Staff Directory</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("timesheet");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "timesheet"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CalendarCheck className="h-3.5 w-3.5" />
          <span>Attendance Timesheet</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("payroll");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "payroll"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Salary Ledger & Payslips</span>
        </button>
      </div>

      {/* Directory Tab View */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3.5 bg-white p-3 border border-slate-200 rounded shadow-xs">
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff directory..."
                className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
              />
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition duration-150"
            >
              <Plus className="h-4 w-4" />
              <span>Register Employee</span>
            </button>
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">EMP ID</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Joining Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      No employees found matching directory parameters.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {e.employeeNo}
                      </td>
                      <td className="px-4 py-3 font-medium">{e.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-500">{e.email}</td>
                      <td className="px-4 py-3 font-semibold text-slate-600">
                        {e.department}
                      </td>
                      <td className="px-4 py-3">{e.jobTitle}</td>
                      <td className="px-4 py-3">
                        <select
                          value={e.status}
                          disabled={isPending}
                          onChange={(evt) => handleStatusChange(e.id, evt.target.value)}
                          className={`px-1.5 py-0.5 border text-[10px] font-semibold rounded-sm outline-none ${getStatusColor(
                            e.status
                          )}`}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                          <option value="SUSPENDED">Suspended</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{e.joiningDate}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteEmployee(e.id)}
                          disabled={isPending}
                          className="text-slate-400 hover:text-red-600 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredEmployees.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No employees found matching directory parameters.
              </div>
            ) : (
              filteredEmployees.map((e) => (
                <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{e.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{e.employeeNo} • {e.department}</div>
                    </div>
                    <select
                      value={e.status}
                      disabled={isPending}
                      onChange={(evt) => handleStatusChange(e.id, evt.target.value)}
                      className={`px-2 py-0.5 border text-[10px] font-semibold rounded outline-none ${getStatusColor(
                        e.status
                      )}`}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Job Title</span>
                      <span className="text-slate-700 font-medium">{e.jobTitle}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Joined</span>
                      <span className="text-slate-600">{e.joiningDate}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Email</span>
                      <span className="text-slate-600 font-mono text-[11px]">{e.email}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => handleDeleteEmployee(e.id)}
                      disabled={isPending}
                      className="px-2.5 py-1 text-red-600 bg-red-50 hover:bg-red-100 rounded text-xs font-semibold flex items-center space-x-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Timesheet View */}
      {activeTab === "timesheet" && (
        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-3 border-b">
            <h3 className="text-xs font-bold text-slate-800">
              Daily Attendance Check: {new Date().toLocaleDateString("en-IN")}
            </h3>
            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold uppercase">
              Present: {activeCount}/{activeCount}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {employees.filter(e => e.status === "ACTIVE").map((emp) => (
              <div
                key={emp.id}
                className="p-3 border border-slate-200 rounded bg-slate-50 flex justify-between items-center"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800">{emp.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                    {emp.department} • {emp.employeeNo}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/50 border border-emerald-200 px-2 py-1 rounded uppercase">
                  Present
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salary & Payslip View */}
      {activeTab === "payroll" && (
        <div className="space-y-3">
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">EMP ID</th>
                  <th className="px-4 py-3">Staff Name</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right font-bold">Base Salary</th>
                  <th className="px-4 py-3 text-right">HRA Allowance</th>
                  <th className="px-4 py-3 text-right">PF Deduction</th>
                  <th className="px-4 py-3 text-right font-extrabold text-slate-900">Net Pay</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {employees.map((e) => {
                  const hra = e.salary * 0.2; // 20%
                  const pf = e.salary * 0.12; // 12%
                  const netPay = e.salary + hra - pf;

                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {e.employeeNo}
                      </td>
                      <td className="px-4 py-3 font-semibold">{e.name}</td>
                      <td className="px-4 py-3 text-slate-500 uppercase">{e.department}</td>
                      <td className="px-4 py-3 text-right">₹{e.salary.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        +₹{hra.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-500">-₹{pf.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">
                        ₹{netPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => alert(`Payslip generated for ${e.name} for current salary month.`)}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          Print Payslip
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {employees.map((e) => {
              const hra = e.salary * 0.2;
              const pf = e.salary * 0.12;
              const netPay = e.salary + hra - pf;

              return (
                <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{e.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{e.employeeNo} • {e.department}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Net Pay</div>
                      <div className="font-extrabold text-blue-600 text-sm">
                        ₹{netPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded border border-slate-100 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400">Base</div>
                      <div className="font-semibold text-slate-700">₹{e.salary.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-emerald-600">+HRA</div>
                      <div className="font-semibold text-emerald-700">₹{hra.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-red-500">-PF</div>
                      <div className="font-semibold text-red-600">₹{pf.toFixed(0)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => alert(`Payslip generated for ${e.name} for current salary month.`)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-xs transition"
                  >
                    Print Payslip
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slide-over Registration Panel */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-50">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 animate-slide-in">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <h2 className="text-sm font-bold text-slate-800">Register Staff Employee</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 bg-red-50 border border-red-200 text-red-600 rounded text-xs">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 mb-3 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded text-xs">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleRegisterEmployee} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Employee Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dinesh Murugan"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. dinesh.m@geetha.com"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 99887 76655"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500"
                >
                  <option value="HR">Human Resources</option>
                  <option value="SALES">Sales & Marketing</option>
                  <option value="FINANCE">Finance & General Ledger</option>
                  <option value="WAREHOUSE">Warehouse Logistics</option>
                  <option value="SUPPORT">Support & Help Desk</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Job Designation *
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Accounts Executive or Logistics Supervisor"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Base Salary (INR/Month) *
                </label>
                <input
                  type="number"
                  value={salaryStr}
                  onChange={(e) => setSalaryStr(e.target.value)}
                  placeholder="e.g. 35000"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="pt-4 border-t flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-sm shadow-xs disabled:opacity-50"
                >
                  {isPending ? "Registering..." : "Add Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
