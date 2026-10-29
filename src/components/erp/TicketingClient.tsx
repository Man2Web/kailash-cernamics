"use client";

import React, { useState, useTransition } from "react";
import {
  Ticket,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  Filter,
} from "lucide-react";
import { createTicket, updateTicketStatus, deleteTicket } from "@/app/(dashboard)/ticketing/actions";
import SearchSelect from "@/components/erp/SearchSelect";

interface TicketRow {
  id: string;
  ticketNo: string;
  customerName: string;
  customerId: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedToName: string;
  date: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface TicketingClientProps {
  tickets: TicketRow[];
  customers: CustomerOption[];
}

export default function TicketingClient({ tickets, customers }: TicketingClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [customerId, setCustomerId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Statistics calculation
  const total = tickets.length;
  const open = tickets.filter((t) => t.status === "OPEN").length;
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED").length;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!customerId || !subject) {
      setErrorMsg("Please select a customer and enter a subject.");
      return;
    }

    startTransition(async () => {
      const res = await createTicket({
        customerId,
        subject,
        description,
        priority,
      });

      if (res.success) {
        setSuccessMsg("Support ticket created successfully.");
        setCustomerId("");
        setSubject("");
        setDescription("");
        setPriority("MEDIUM");
        setTimeout(() => {
          setShowForm(false);
          setSuccessMsg("");
        }, 1500);
      } else {
        setErrorMsg(res.error || "Failed to create support ticket.");
      }
    });
  };

  const handleStatusChange = (id: string, status: string) => {
    startTransition(async () => {
      const res = await updateTicketStatus(id, status);
      if (!res.success) {
        alert(res.error || "Failed to update ticket status.");
      }
    });
  };

  const handleDeleteTicket = (id: string) => {
    if (!confirm("Are you sure you want to delete this ticket?")) return;
    startTransition(async () => {
      const res = await deleteTicket(id);
      if (!res.success) {
        alert(res.error || "Failed to delete ticket.");
      }
    });
  };

  // Filters application
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.ticketNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getPriorityColor = (prio: string) => {
    switch (prio) {
      case "URGENT":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "HIGH":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "MEDIUM":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "text-red-600 bg-red-50 border-red-200";
      case "IN_PROGRESS":
        return "text-amber-600 bg-amber-50 border-amber-200";
      case "RESOLVED":
        return "text-emerald-600 bg-emerald-50 border-emerald-200";
      default:
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Issues
            </p>
            <p className="text-xl font-extrabold text-slate-800">{total}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-500 rounded-sm">
            <Ticket className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Open Tickets
            </p>
            <p className="text-xl font-extrabold text-red-600">{open}</p>
          </div>
          <div className="p-2 bg-red-50 text-red-600 rounded-sm">
            <AlertCircle className="h-4 w-4 animate-pulse" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              In Progress
            </p>
            <p className="text-xl font-extrabold text-amber-600">{inProgress}</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-sm">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Resolved Cases
            </p>
            <p className="text-xl font-extrabold text-emerald-600">{resolved}</p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-sm">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Toolbar / Search Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3.5 bg-white p-3.5 border border-slate-200 rounded shadow-xs">
        {/* Search & Filter Inputs */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto flex-1">
          <div className="relative max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket no, customer..."
              className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
            />
          </div>

          <SearchSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            placeholder="Type to search"
            options={[{ value: "ALL", label: "All Statuses" }, { value: "OPEN", label: "Open" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "RESOLVED", label: "Resolved" }]}
            className="px-2.5 py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none"
          />

          <SearchSelect
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v)}
            placeholder="Type to search"
            options={[{ value: "ALL", label: "All Priorities" }, { value: "URGENT", label: "Urgent" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]}
            className="px-2.5 py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none"
          />
        </div>

        {/* Action Buttons */}
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition duration-150 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Support Ticket</span>
        </button>
      </div>

      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
            <tr>
              <th className="px-4 py-3">Ticket No</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Subject / Issue</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  No support tickets found matching the filter options.
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    {t.ticketNo}
                  </td>
                  <td className="px-4 py-3 font-medium">{t.customerName}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{t.subject}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {t.description}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 border text-[11px] font-semibold rounded-sm uppercase ${getPriorityColor(
                        t.priority
                      )}`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <SearchSelect
                      value={t.status}
                      onChange={(v) => handleStatusChange(t.id, v)}
                      disabled={isPending}
                      placeholder="Type to search"
                      options={[{ value: "OPEN", label: "Open" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "RESOLVED", label: "Resolved" }]}
                      className={`px-1.5 py-0.5 border text-[11px] font-semibold rounded-sm outline-none ${getStatusColor(
                        t.status
                      )}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.assignedToName}</td>
                  <td className="px-4 py-3 text-slate-400">{t.date}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteTicket(t.id)}
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
        {filteredTickets.length === 0 ? (
          <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
            No support tickets found matching the filter options.
          </div>
        ) : (
          filteredTickets.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <span className="font-mono font-bold text-slate-900 text-xs block">{t.ticketNo}</span>
                  <div className="font-semibold text-slate-800 text-sm mt-0.5">{t.customerName}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 border text-[11px] font-semibold rounded uppercase ${getPriorityColor(
                      t.priority
                    )}`}
                  >
                    {t.priority}
                  </span>
                  <SearchSelect
                    value={t.status}
                    onChange={(v) => handleStatusChange(t.id, v)}
                    disabled={isPending}
                    placeholder="Type to search"
                    options={[{ value: "OPEN", label: "Open" }, { value: "IN_PROGRESS", label: "In Progress" }, { value: "RESOLVED", label: "Resolved" }]}
                    className={`px-1.5 py-0.5 border text-[11px] font-semibold rounded outline-none ${getStatusColor(
                      t.status
                    )}`}
                  />
                </div>
              </div>

              <div>
                <p className="font-semibold text-slate-900">{t.subject}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-400 block">Assigned To</span>
                  <span className="text-slate-700">{t.assignedToName || "Unassigned"}</span>
                </div>
                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-400 block">Date</span>
                  <span className="text-slate-600">{t.date}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => handleDeleteTicket(t.id)}
                  disabled={isPending}
                  className="px-2.5 py-1 text-red-600 bg-red-50 hover:bg-red-100 rounded text-xs font-semibold flex items-center space-x-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Slide-over Form Overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-50">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 animate-slide-in">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <h2 className="text-sm font-bold text-slate-800">Log New Support Ticket</h2>
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

            <form onSubmit={handleCreateTicket} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Select Customer *
                </label>
                <SearchSelect
                  value={customerId}
                  onChange={(v) => setCustomerId(v)}
                  required
                  placeholder="Type to search customer"
                  options={[...customers.map((c) => ({ value: c.id, label: `${c.name}` }))]}
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Subject / Issue Title *
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Shipment Delay or Cracks in Tile box"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Detailed Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Provide details about the issue and logs..."
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Priority
                </label>
                <SearchSelect
                  value={priority}
                  onChange={(v) => setPriority(v)}
                  placeholder="Type to search"
                  options={[{ value: "URGENT", label: "Urgent" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]}
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500"
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
                  {isPending ? "Logging..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
