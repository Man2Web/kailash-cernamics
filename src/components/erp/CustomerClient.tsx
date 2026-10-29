"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Search,
  UserPlus,
  UsersRound,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { createCustomer, createCustomerGroup } from "@/app/(dashboard)/sales/customers/actions";
import SearchSelect from "@/components/erp/SearchSelect";

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  group: string;
  gstin: string;
  email: string;
  phone: string;
  creditLimit: number;
  outstandingAmt: number;
  billingAddress: string;
  shippingAddress: string;
}

interface GroupRow {
  id: string;
  name: string;
  discountPercent: any;
}

interface PriceListRow {
  id: string;
  name: string;
}

interface CustomerClientProps {
  customers: CustomerRow[];
  customerGroups: GroupRow[];
  priceLists: PriceListRow[];
}

export default function CustomerClient({
  customers,
  customerGroups,
  priceLists,
}: CustomerClientProps) {
  const [activeTab, setActiveTab] = useState("customers");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Group Form States
  const [groupName, setGroupName] = useState("");
  const [groupDiscount, setGroupDiscount] = useState("0");

  // Customer Form States
  const [cName, setCName] = useState("");
  const [cCode, setCCode] = useState("");
  const [cGroupId, setCGroupId] = useState("");
  const [cPriceListId, setCPriceListId] = useState("");
  const [cGstin, setCGstin] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cLimit, setCLimit] = useState("0");

  // Primary Address States
  const [bAddr, setBAddr] = useState("");
  const [bCity, setBCity] = useState("");
  const [bState, setBState] = useState("");
  const [bPincode, setBPincode] = useState("");

  const [dAddr, setDAddr] = useState("");
  const [dCity, setDCity] = useState("");
  const [dState, setDState] = useState("");
  const [dPincode, setDPincode] = useState("");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName) return;
    const res = await createCustomerGroup(groupName, parseFloat(groupDiscount) || 0);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Customer Group created successfully!");
      setGroupName("");
      setGroupDiscount("0");
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName || !cCode || !cGroupId) {
      showMsg("Please fill in all required fields.", "error");
      return;
    }

    const billingAddress = bAddr
      ? { address: bAddr, city: bCity, state: bState, pincode: bPincode }
      : undefined;

    const deliveryAddress = dAddr
      ? { address: dAddr, city: dCity, state: dState, pincode: dPincode }
      : undefined;

    const res = await createCustomer({
      name: cName,
      code: cCode,
      groupId: cGroupId,
      priceListId: cPriceListId || undefined,
      gstin: cGstin || undefined,
      email: cEmail || undefined,
      phone: cPhone || undefined,
      creditLimit: parseFloat(cLimit) || 0,
      billingAddress,
      deliveryAddress,
    });

    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Customer profile created successfully!");
      setShowForm(false);
      // Reset form states
      setCName("");
      setCCode("");
      setCGroupId("");
      setCPriceListId("");
      setCGstin("");
      setCEmail("");
      setCPhone("");
      setCLimit("0");
      setBAddr("");
      setBCity("");
      setBState("");
      setBPincode("");
      setDAddr("");
      setDCity("");
      setDState("");
      setDPincode("");
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.gstin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Message alerts */}
      {message && (
        <div
          className={`p-3 rounded border text-xs flex items-center space-x-2 ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => setActiveTab("customers")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "customers"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Customers</span>
        </button>
        <button
          onClick={() => setActiveTab("groups")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "groups"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UsersRound className="h-3.5 w-3.5" />
          <span>Customer Groups</span>
        </button>
      </div>

      {/* 1. Customers List View */}
      {activeTab === "customers" && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 bg-white p-3 border border-slate-200 rounded-sm shadow-xs">
            <div className="relative w-full lg:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers name, code, GSTIN..."
                className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900 min-h-[36px] sm:min-h-0"
              />
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold transition min-h-[36px] sm:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{showForm ? "Cancel" : "Add Customer"}</span>
            </button>
          </div>

          {/* Customer Creation Form */}
          {showForm && (
            <form
              onSubmit={handleCreateCustomer}
              className="bg-white p-4 sm:p-6 border border-slate-200 rounded-sm shadow-sm space-y-5 text-xs text-slate-700 animate-in fade-in duration-200"
            >
              <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center space-x-2">
                <UserPlus className="h-4 w-4 text-blue-600" />
                <span>Create New Customer Profile</span>
              </h3>

              {/* Core Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="e.g. Kailash Ceramic House"
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Customer Code *</label>
                  <input
                    type="text"
                    required
                    value={cCode}
                    onChange={(e) => setCCode(e.target.value)}
                    placeholder="e.g. CUST0001"
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Customer Group *</label>
                  <SearchSelect
                    value={cGroupId}
                    onChange={(v) => setCGroupId(v)}
                    required
                    placeholder="Type to search group"
                    options={[...customerGroups.map((g) => ({ value: g.id, label: `${g.name}` }))]}
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Price List</label>
                  <SearchSelect
                    value={cPriceListId}
                    onChange={(v) => setCPriceListId(v)}
                    placeholder="Type to search default price list"
                    options={[...priceLists.map((p) => ({ value: p.id, label: `${p.name}` }))]}
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    value={cGstin}
                    onChange={(e) => setCGstin(e.target.value)}
                    placeholder="33AAAAA0000A1Z"
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Email Address</label>
                  <input
                    type="email"
                    value={cEmail}
                    onChange={(e) => setCEmail(e.target.value)}
                    placeholder="e.g. contact@kailashceramics.com"
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Mobile Number</label>
                  <input
                    type="text"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={cLimit}
                    onChange={(e) => setCLimit(e.target.value)}
                    className="w-full px-2.5 py-2 sm:py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 min-h-[36px] sm:min-h-0"
                  />
                </div>
              </div>

              {/* Primary Address Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-4">
                {/* Billing Address */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 uppercase text-[11px]">
                    Primary Billing Address
                  </h4>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-500">Street Address</label>
                    <input
                      type="text"
                      value={bAddr}
                      onChange={(e) => setBAddr(e.target.value)}
                      placeholder="12, Main Bazaar Road"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">City</label>
                      <input
                        type="text"
                        value={bCity}
                        onChange={(e) => setBCity(e.target.value)}
                        placeholder="Vellore"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">State</label>
                      <input
                        type="text"
                        value={bState}
                        onChange={(e) => setBState(e.target.value)}
                        placeholder="Tamil Nadu"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">Pincode</label>
                      <input
                        type="text"
                        value={bPincode}
                        onChange={(e) => setBPincode(e.target.value)}
                        placeholder="632001"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 uppercase text-[11px]">
                      Primary Delivery Address
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setDAddr(bAddr);
                        setDCity(bCity);
                        setDState(bState);
                        setDPincode(bPincode);
                      }}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      Copy Billing Address
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-500">Street Address</label>
                    <input
                      type="text"
                      value={dAddr}
                      onChange={(e) => setDAddr(e.target.value)}
                      placeholder="12, Main Bazaar Road"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">City</label>
                      <input
                        type="text"
                        value={dCity}
                        onChange={(e) => setDCity(e.target.value)}
                        placeholder="Vellore"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">State</label>
                      <input
                        type="text"
                        value={dState}
                        onChange={(e) => setDState(e.target.value)}
                        placeholder="Tamil Nadu"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-500">Pincode</label>
                      <input
                        type="text"
                        value={dPincode}
                        onChange={(e) => setDPincode(e.target.value)}
                        placeholder="632001"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end pt-2 border-t border-slate-100 gap-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition min-h-[42px] sm:min-h-0"
                >
                  Create Customer Profile
                </button>
              </div>
            </form>
          )}

          {/* Customers Dense Table (Desktop >= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-2 border-b">Code</th>
                  <th className="px-4 py-2 border-b">Name</th>
                  <th className="px-4 py-2 border-b">Group</th>
                  <th className="px-4 py-2 border-b">GSTIN</th>
                  <th className="px-4 py-2 border-b">Phone</th>
                  <th className="px-4 py-2 border-b text-right">Outstanding</th>
                  <th className="px-4 py-2 border-b text-right">Credit Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No customers found. Add a customer to get started.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                        {c.code}
                      </td>
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2">{c.group}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{c.gstin}</td>
                      <td className="px-4 py-2">{c.phone}</td>
                      <td className="px-4 py-2 text-right font-bold text-rose-600">
                        ₹{c.outstandingAmt.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        ₹{c.creditLimit.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Customers Cards View (Mobile < 768px) */}
          <div className="md:hidden space-y-3">
            {filteredCustomers.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No customers found. Add a customer to get started.
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <div key={c.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-2.5 text-xs">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-snug">{c.name}</h4>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">{c.code}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {c.group}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Phone</span>
                      <span className="text-slate-800 font-medium block">{c.phone || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">GSTIN</span>
                      <span className="font-mono text-slate-600 text-[11px] block">{c.gstin || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Outstanding</span>
                      <span className="font-bold text-rose-600 block">₹{c.outstandingAmt.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Credit Limit</span>
                      <span className="text-slate-600 block">₹{c.creditLimit.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Customer Groups View */}
      {activeTab === "groups" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-4 border border-slate-200 rounded-sm shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <UsersRound className="h-4 w-4 text-blue-600" />
              <span>Add Customer Group</span>
            </h3>
            <form onSubmit={handleCreateGroup} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Group Name *</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Wholesale, Retail, Distributor"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Default Discount (%)</label>
                <input
                  type="number"
                  value={groupDiscount}
                  onChange={(e) => setGroupDiscount(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
              >
                Create Group
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-3">
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2 border-b">Group Name</th>
                    <th className="px-4 py-2 border-b">Default Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {customerGroups.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                        No customer groups found
                      </td>
                    </tr>
                  ) : (
                    customerGroups.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium">{g.name}</td>
                        <td className="px-4 py-2">{g.discountPercent.toString()}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-2">
              {customerGroups.length === 0 ? (
                <div className="bg-white p-4 text-center text-slate-400 border border-slate-200 rounded-sm text-xs">
                  No customer groups found
                </div>
              ) : (
                customerGroups.map((g) => (
                  <div key={g.id} className="bg-white p-3 border border-slate-200 rounded-lg shadow-xs flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-900">{g.name}</span>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200">
                      {g.discountPercent.toString()}% discount
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
