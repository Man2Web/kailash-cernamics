"use client";

import React, { useState, useTransition } from "react";
import {
  Globe,
  Plus,
  Megaphone,
  Users,
  Search,
  CheckCircle,
  Eye,
  Trash2,
  Lock,
} from "lucide-react";
import { createAnnouncement, toggleAnnouncementActive, deleteAnnouncement } from "@/app/(dashboard)/portal/actions";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  date: string;
}

interface PortalUser {
  id: string;
  code: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

interface PortalClientProps {
  announcements: Announcement[];
  users: PortalUser[];
}

export default function PortalClient({ announcements, users }: PortalClientProps) {
  const [activeTab, setActiveTab] = useState("notices");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!title || !content) {
      setErrorMsg("Please fill out all fields.");
      return;
    }

    startTransition(async () => {
      const res = await createAnnouncement({ title, content, category });
      if (res.success) {
        setSuccessMsg("Announcement published successfully.");
        setTitle("");
        setContent("");
        setCategory("GENERAL");
        setTimeout(() => {
          setShowForm(false);
          setSuccessMsg("");
        }, 1500);
      } else {
        setErrorMsg(res.error || "Failed to publish notice.");
      }
    });
  };

  const handleToggleNotice = (id: string, active: boolean) => {
    startTransition(async () => {
      const res = await toggleAnnouncementActive(id, active);
      if (!res.success) {
        alert(res.error || "Failed to update state.");
      }
    });
  };

  const handleDeleteNotice = (id: string) => {
    if (!confirm("Are you sure you want to delete this notice?")) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(id);
      if (!res.success) {
        alert(res.error || "Failed to delete notice.");
      }
    });
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "ANNOUNCEMENT":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "UPDATE":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "MAINTENANCE":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Portal Directory
            </p>
            <p className="text-xl font-extrabold text-slate-800">{users.length}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-500 rounded-sm">
            <Users className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Active Notices
            </p>
            <p className="text-xl font-extrabold text-blue-600">
              {announcements.filter((a) => a.isActive).length}
            </p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-sm">
            <Megaphone className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Authorized Logins
            </p>
            <p className="text-xl font-extrabold text-emerald-600">
              {users.filter((u) => u.status === "ACTIVE").length}
            </p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-sm">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-4 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Portal Status
            </p>
            <p className="text-xl font-extrabold text-slate-800">ONLINE</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-500 rounded-sm">
            <Globe className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => {
            setActiveTab("notices");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "notices"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Megaphone className="h-3.5 w-3.5" />
          <span>Noticeboard Messages</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("users");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "users"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Client Access Directory</span>
        </button>
      </div>

      {/* Notices View */}
      {activeTab === "notices" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-3 border border-slate-200 rounded shadow-xs">
            <span className="text-xs text-slate-400">
              Publish news and schedules visible to customer portals.
            </span>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition duration-150"
            >
              <Plus className="h-4 w-4" />
              <span>Publish Notice</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {announcements.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-slate-400 bg-white border rounded">
                No active announcements found.
              </div>
            ) : (
              announcements.map((a) => (
                <div
                  key={a.id}
                  className="bg-white p-4 border border-slate-200 rounded shadow-xs relative flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className={`px-2 py-0.5 border text-[9px] font-bold rounded-sm uppercase ${getCategoryColor(
                          a.category
                        )}`}
                      >
                        {a.category}
                      </span>
                      <span className="text-[10px] text-slate-400">{a.date}</span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-800 mb-1">{a.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line mb-4">
                      {a.content}
                    </p>
                  </div>
                  <div className="flex justify-between items-center border-t pt-3 mt-auto">
                    <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={a.isActive}
                        disabled={isPending}
                        onChange={(e) => handleToggleNotice(a.id, e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 outline-none h-3.5 w-3.5"
                      />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">
                        Visible
                      </span>
                    </label>
                    <button
                      onClick={() => handleDeleteNotice(a.id)}
                      disabled={isPending}
                      className="text-slate-400 hover:text-red-600 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Access Registry View */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex bg-white p-3 border border-slate-200 rounded shadow-xs">
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by code, email..."
                className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
              />
            </div>
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Portal Username / Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {u.code}
                    </td>
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500 uppercase">{u.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-1.5 py-0.5 border text-[10px] font-bold rounded-sm uppercase ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-slate-50 border-slate-200 text-slate-400"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.lastLogin}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        title="Reset Portal Password"
                        onClick={() => alert("Temporary password generated: GC123!45")}
                        className="text-slate-400 hover:text-slate-700 inline"
                      >
                        <Lock className="h-3.5 w-3.5 inline" />
                      </button>
                      <button
                        title="View Details"
                        className="text-slate-400 hover:text-slate-700 inline"
                      >
                        <Eye className="h-3.5 w-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredUsers.map((u) => (
              <div key={u.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{u.name}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{u.code}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 border text-[10px] font-bold rounded uppercase ${
                      u.status === "ACTIVE"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    {u.status}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-blue-600 font-medium truncate">{u.email}</div>
                  <div className="text-slate-400 text-[11px]">Last Login: {u.lastLogin}</div>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    onClick={() => alert("Temporary password generated: GC123!45")}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-xs transition flex items-center space-x-1"
                  >
                    <Lock className="h-3 w-3" />
                    <span>Reset Password</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Noticeboard Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-50">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 animate-slide-in">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <h2 className="text-sm font-bold text-slate-800">Publish Notice</h2>
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

            <form onSubmit={handlePublishNotice} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Notice Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500"
                >
                  <option value="GENERAL">General Notice</option>
                  <option value="ANNOUNCEMENT">Official Announcement</option>
                  <option value="UPDATE">System Update</option>
                  <option value="MAINTENANCE">Scheduled Maintenance</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Notice Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Server Maintenance or Holiday Schedule"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Notice Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  placeholder="Type notice message details..."
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
                  {isPending ? "Publishing..." : "Publish Announcement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
