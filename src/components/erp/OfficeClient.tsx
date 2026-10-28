"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Users,
  Building2,
  ShieldCheck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  KeyRound,
  Edit2,
  Truck,
  Warehouse as WarehouseIcon,
  Phone,
  Mail,
  Lock,
  Calendar,
} from "lucide-react";
import {
  createUserAction,
  updateUserAction,
  toggleUserStatusAction,
  resetUserPasswordAction,
  createCustomerAction,
  createSupplierAction,
} from "@/app/(dashboard)/office/actions";

interface OfficeUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  employeeNo: string;
  role: string;
  warehouseId?: string;
  warehouseName?: string;
  status: string;
  createdAt: string;
}

interface OfficeCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  group: string;
  creditLimit: number;
  outstandingAmt: number;
}

interface OfficeSupplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  gstin: string;
  outstandingAmt: number;
}

interface OfficeWarehouse {
  id: string;
  code: string;
  name: string;
  address: string;
}

interface OfficeClientProps {
  users: OfficeUser[];
  customers: OfficeCustomer[];
  suppliers: OfficeSupplier[];
  warehouses: OfficeWarehouse[];
  isSuperAdminUser: boolean;
}

export default function OfficeClient({
  users,
  customers,
  suppliers,
  warehouses,
  isSuperAdminUser,
}: OfficeClientProps) {
  const [activeTab, setActiveTab] = useState<"users" | "customers" | "suppliers" | "warehouses">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modals
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<OfficeUser | null>(null);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [showCreateSupplierModal, setShowCreateSupplierModal] = useState(false);

  // User form state
  const [userName, setUserName] = useState("");
  const [userEmployeeNo, setUserEmployeeNo] = useState("");
  const [userRole, setUserRole] = useState<"SALES_PERSON" | "WAREHOUSE_MANAGER" | "SUPER_ADMIN">("SALES_PERSON");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [userWarehouseId, setUserWarehouseId] = useState("");
  const [userPassword, setUserPassword] = useState("Inventory@123");
  const [userStatus, setUserStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  // Reset password state
  const [newPassword, setNewPassword] = useState("");

  // Customer form state
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custGstin, setCustGstin] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custCreditLimit, setCustCreditLimit] = useState(0);

  // Supplier form state
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supGstin, setSupGstin] = useState("");
  const [supAddress, setSupAddress] = useState("");

  // Messages
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Handlers
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await createUserAction({
        name: userName,
        employeeNo: userEmployeeNo,
        role: userRole,
        email: userEmail,
        phone: userPhone,
        warehouseId: userWarehouseId,
        password: userPassword,
        status: userStatus,
      });

      if (res.success) {
        setSuccessMsg("User created successfully!");
        setShowCreateUserModal(false);
        setUserName("");
        setUserEmail("");
        setUserPhone("");
        setUserEmployeeNo("");
        setUserWarehouseId("");
      } else {
        setErrorMsg(res.error || "Failed to create user.");
      }
    });
  };

  const handleToggleStatus = (user: OfficeUser) => {
    if (!confirm(`Are you sure you want to ${user.status === "ACTIVE" ? "deactivate" : "activate"} user ${user.name}?`)) {
      return;
    }
    startTransition(async () => {
      const res = await toggleUserStatusAction(user.id, user.status);
      if (!res.success) {
        alert(res.error || "Failed to toggle user status.");
      }
    });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPassword) return;
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await resetUserPasswordAction(selectedUserForPassword.id, newPassword);
      if (res.success) {
        setSuccessMsg(`Password reset successfully for ${selectedUserForPassword.name}.`);
        setShowResetPasswordModal(false);
        setNewPassword("");
        setSelectedUserForPassword(null);
      } else {
        setErrorMsg(res.error || "Failed to reset password.");
      }
    });
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await createCustomerAction({
        name: custName,
        phone: custPhone,
        email: custEmail,
        gstin: custGstin,
        address: custAddress,
        creditLimit: Number(custCreditLimit),
      });

      if (res.success) {
        setSuccessMsg("Customer created successfully!");
        setShowCreateCustomerModal(false);
        setCustName("");
        setCustPhone("");
        setCustEmail("");
        setCustGstin("");
        setCustAddress("");
      } else {
        setErrorMsg(res.error || "Failed to create customer.");
      }
    });
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await createSupplierAction({
        name: supName,
        phone: supPhone,
        email: supEmail,
        gstin: supGstin,
        address: supAddress,
      });

      if (res.success) {
        setSuccessMsg("Supplier created successfully!");
        setShowCreateSupplierModal(false);
        setSupName("");
        setSupPhone("");
        setSupEmail("");
        setSupGstin("");
        setSupAddress("");
      } else {
        setErrorMsg(res.error || "Failed to create supplier.");
      }
    });
  };

  // Filter lists
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.employeeNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery)
  );

  const filteredWarehouses = warehouses.filter(
    (w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 space-x-4 sm:space-x-6 text-xs sm:text-sm overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
        <button
          onClick={() => {
            setActiveTab("users");
            setSearchQuery("");
          }}
          className={`pb-2.5 font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "users"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Employees & Users ({users.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("customers");
            setSearchQuery("");
          }}
          className={`pb-2.5 font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "customers"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Customers ({customers.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("suppliers");
            setSearchQuery("");
          }}
          className={`pb-2.5 font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "suppliers"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Suppliers ({suppliers.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("warehouses");
            setSearchQuery("");
          }}
          className={`pb-2.5 font-semibold transition border-b-2 flex items-center space-x-1.5 shrink-0 ${
            activeTab === "warehouses"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <WarehouseIcon className="h-4 w-4" />
          <span>Warehouses ({warehouses.length})</span>
        </button>

        {isSuperAdminUser && (
          <Link
            href="/office/attendance"
            className="pb-2.5 font-semibold transition border-b-2 border-transparent text-slate-500 hover:text-blue-600 flex items-center space-x-1.5 shrink-0"
          >
            <Calendar className="h-4 w-4 text-blue-500" />
            <span>Employee Attendance</span>
            <span className="px-1.5 py-0.2 text-[11px] bg-blue-100 text-blue-700 font-bold rounded">
              New
            </span>
          </Link>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3 border border-slate-200 rounded shadow-xs">
        <div className="relative w-full sm:max-w-xs md:max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white"
          />
        </div>

        <div className="w-full sm:w-auto">
          {activeTab === "users" && isSuperAdminUser && (
            <button
              onClick={() => {
                setErrorMsg("");
                setSuccessMsg("");
                setShowCreateUserModal(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create User / Employee</span>
            </button>
          )}

          {activeTab === "customers" && (
            <button
              onClick={() => {
                setErrorMsg("");
                setSuccessMsg("");
                setShowCreateCustomerModal(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Customer</span>
            </button>
          )}

          {activeTab === "suppliers" && (
            <button
              onClick={() => {
                setErrorMsg("");
                setSuccessMsg("");
                setShowCreateSupplierModal(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded">
          {successMsg}
        </div>
      )}

      {/* TAB 1: USERS */}
      {activeTab === "users" && (
        <div>
          {/* Mobile Cards View */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredUsers.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No users found matching your search.
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div key={u.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{u.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 font-bold">{u.employeeNo || "No ID"}</div>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          u.role === "SUPER_ADMIN"
                            ? "bg-purple-100 text-purple-700"
                            : u.role.includes("WAREHOUSE")
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {u.role.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {u.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100">
                    <div className="flex items-center space-x-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="flex items-center space-x-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{u.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1.5 pt-0.5 border-t border-slate-200/60">
                      <WarehouseIcon className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="font-medium text-slate-800">
                        {u.warehouseName ? u.warehouseName : "All / Unassigned"}
                      </span>
                    </div>
                  </div>

                  {isSuperAdminUser && (
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setSelectedUserForPassword(u);
                          setShowResetPasswordModal(true);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Reset Password</span>
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        disabled={isPending}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold rounded ${
                          u.status === "ACTIVE"
                            ? "text-rose-700 bg-rose-50 hover:bg-rose-100"
                            : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                      >
                        {u.status === "ACTIVE" ? (
                          <>
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Deactivate</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Activate</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Emp ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Contact Details</th>
                  <th className="px-4 py-3">Assigned Warehouse</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No users found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {u.employeeNo || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>{u.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            u.role === "SUPER_ADMIN"
                              ? "bg-purple-100 text-purple-700"
                              : u.role.includes("WAREHOUSE")
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {u.role.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5 text-slate-600">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span>{u.email}</span>
                          </div>
                          {u.phone && (
                            <div className="flex items-center space-x-1.5 text-slate-500">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{u.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {u.warehouseName ? (
                          <div className="flex items-center space-x-1 text-slate-800 font-semibold">
                            <WarehouseIcon className="h-3.5 w-3.5 text-blue-600" />
                            <span>{u.warehouseName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">All / Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            u.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {isSuperAdminUser && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedUserForPassword(u);
                                setShowResetPasswordModal(true);
                              }}
                              title="Reset Password"
                              className="p-1 text-slate-400 hover:text-slate-800 transition"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(u)}
                              title={u.status === "ACTIVE" ? "Deactivate User" : "Activate User"}
                              disabled={isPending}
                              className={`p-1 transition ${
                                u.status === "ACTIVE"
                                  ? "text-slate-400 hover:text-red-600"
                                  : "text-emerald-600 hover:text-emerald-700"
                              }`}
                            >
                              {u.status === "ACTIVE" ? (
                                <XCircle className="h-4 w-4" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS */}
      {activeTab === "customers" && (
        <div>
          {/* Mobile Card View */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredCustomers.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No customers found matching your search.
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{c.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 font-bold">{c.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-medium">Outstanding</div>
                      <div className="font-bold text-slate-900 text-xs">₹{c.outstandingAmt.toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-100">
                    <div>
                      <div className="text-[11px] text-slate-400">Phone</div>
                      <div className="font-medium text-slate-700">{c.phone || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">GSTIN</div>
                      <div className="font-mono text-slate-700 text-[11px]">{c.gstin || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Group</div>
                      <div className="text-slate-700">{c.group || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Credit Limit</div>
                      <div className="text-slate-700">₹{c.creditLimit.toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email || "—"}</td>
                    <td className="px-4 py-3 font-mono">{c.gstin || "—"}</td>
                    <td className="px-4 py-3">{c.group}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      ₹{c.outstandingAmt.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIERS */}
      {activeTab === "suppliers" && (
        <div>
          {/* Mobile Card View */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSuppliers.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No suppliers found matching your search.
              </div>
            ) : (
              filteredSuppliers.map((s) => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{s.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 font-bold">{s.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-medium">Outstanding</div>
                      <div className="font-bold text-slate-900 text-xs">₹{s.outstandingAmt.toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-100">
                    <div>
                      <div className="text-[11px] text-slate-400">Phone</div>
                      <div className="font-medium text-slate-700">{s.phone || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">GSTIN</div>
                      <div className="font-mono text-slate-700 text-[11px]">{s.gstin || "—"}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-slate-400">Email</div>
                      <div className="text-slate-700 truncate">{s.email || "—"}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Supplier Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3 text-right">Outstanding Payables</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{s.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3">{s.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{s.email || "—"}</td>
                    <td className="px-4 py-3 font-mono">{s.gstin || "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      ₹{s.outstandingAmt.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: WAREHOUSES */}
      {activeTab === "warehouses" && (
        <div>
          {/* Mobile Card View */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredWarehouses.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No warehouses found matching your search.
              </div>
            ) : (
              filteredWarehouses.map((w) => (
                <div key={w.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900 text-sm flex items-center space-x-1.5">
                      <WarehouseIcon className="h-4 w-4 text-blue-600" />
                      <span>{w.name}</span>
                    </div>
                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {w.code}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-semibold mb-0.5">Address</div>
                    <div>{w.address || "—"}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Warehouse Name</th>
                  <th className="px-4 py-3">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredWarehouses.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{w.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{w.name}</td>
                    <td className="px-4 py-3 text-slate-600">{w.address || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span>Create New User / Employee</span>
              </h3>
              <button
                onClick={() => setShowCreateUserModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 text-xs rounded hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Full Name *</label>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Role *</label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as any)}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="SALES_PERSON">Sales Person</option>
                    <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Employee ID</label>
                  <input
                    type="text"
                    value={userEmployeeNo}
                    onChange={(e) => setUserEmployeeNo(e.target.value)}
                    placeholder="e.g. EMP-0001"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    Email Address (Optional if phone provided)
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="e.g. ramesh@inventory.com"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    Phone Number (Optional if email provided)
                  </label>
                  <input
                    type="tel"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {userRole === "WAREHOUSE_MANAGER" && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Assigned Warehouse *</label>
                  <select
                    value={userWarehouseId}
                    onChange={(e) => setUserWarehouseId(e.target.value)}
                    required
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Warehouse --</option>
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Initial Password *</label>
                  <input
                    type="password"
                    required
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Status</label>
                  <select
                    value={userStatus}
                    onChange={(e) => setUserStatus(e.target.value as any)}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUserModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {isPending ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {showResetPasswordModal && selectedUserForPassword && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">
                Reset Password for {selectedUserForPassword.name}
              </h3>
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 text-xs rounded hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">New Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetPasswordModal(false)}
                  className="w-full sm:w-auto px-3 py-2 border rounded text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {isPending ? "Resetting..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE CUSTOMER MODAL */}
      {showCreateCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="font-bold text-slate-900 text-sm">Add New Customer</h3>
              <button
                onClick={() => setShowCreateCustomerModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 text-xs rounded hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="e.g. Aditi Tiles & Interiors"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    placeholder="e.g. aditi@gmail.com"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">GSTIN</label>
                  <input
                    type="text"
                    value={custGstin}
                    onChange={(e) => setCustGstin(e.target.value)}
                    placeholder="e.g. 33AABCU9603R1ZM"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={custCreditLimit}
                    onChange={(e) => setCustCreditLimit(Number(e.target.value))}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Billing Address</label>
                <textarea
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Street, City, State, Pincode"
                  rows={2}
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCustomerModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border rounded text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SUPPLIER MODAL */}
      {showCreateSupplierModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="font-bold text-slate-900 text-sm">Add New Supplier</h3>
              <button
                onClick={() => setShowCreateSupplierModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 text-xs rounded hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="p-4 sm:p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="e.g. Kajaria Ceramics Ltd"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="e.g. 044-24567890"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder="e.g. vendor@kajaria.com"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">GSTIN</label>
                <input
                  type="text"
                  value={supGstin}
                  onChange={(e) => setSupGstin(e.target.value)}
                  placeholder="e.g. 33AAACK1234F1Z8"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Address</label>
                <textarea
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  placeholder="Vendor facility address"
                  rows={2}
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSupplierModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border rounded text-slate-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
