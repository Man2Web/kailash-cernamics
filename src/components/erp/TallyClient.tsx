"use client";

import React, { useState, useEffect } from "react";
import SearchSelect from "@/components/erp/SearchSelect";
import {
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  ListOrdered,
  History,
  Link2,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  Eye,
  RotateCw,
  Ban,
  ShieldCheck,
} from "lucide-react";

interface TallyClientProps {
  initialData: {
    connection: any;
    settings: any;
    stats: any;
  };
  currentUser: {
    name: string;
    roles: string[];
    permissions: string[];
  };
}

export default function TallyClient({ initialData, currentUser }: TallyClientProps) {
  const [activeTab, setActiveTab] = useState<
    "connection" | "settings" | "queue" | "history" | "mappings" | "errors" | "manual"
  >("connection");

  const [connection, setConnection] = useState(initialData.connection || {});
  const [settings, setSettings] = useState(initialData.settings || {});
  const [stats, setStats] = useState(initialData.stats?.counts || {
    pending: 0,
    processing: 0,
    synced: 0,
    failed: 0,
    retrying: 0,
    cancelled: 0,
    total: 0,
  });
  const [queueItems, setQueueItems] = useState<any[]>(initialData.stats?.queueItems || []);
  const [logs, setLogs] = useState<any[]>(initialData.stats?.recentLogs || []);
  const [mappings, setMappings] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState<any | null>(null);
  const [filterEntityType, setFilterEntityType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [manualSyncMsg, setManualSyncMsg] = useState<{ text: string; success: boolean } | null>(null);

  const canManage =
    currentUser.roles.includes("SUPER_ADMIN") || currentUser.permissions.includes("tally:manage");
  const canSync =
    currentUser.roles.includes("SUPER_ADMIN") || currentUser.permissions.includes("tally:sync");
  const canRetry =
    currentUser.roles.includes("SUPER_ADMIN") || currentUser.permissions.includes("tally:retry");

  // Refresh status & queue periodically
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/tally/status");
      const data = await res.json();
      if (data.counts) setStats(data.counts);
      if (data.queueItems) setQueueItems(data.queueItems);
      if (data.recentLogs) setLogs(data.recentLogs);
      if (data.connection) setConnection(data.connection);
    } catch (err) {
      console.error("Error fetching status:", err);
    }
  };

  const fetchMappings = async () => {
    try {
      const res = await fetch(`/api/tally/mappings?entityType=${filterEntityType}`);
      const data = await res.json();
      if (data.mappings) setMappings(data.mappings);
    } catch (err) {
      console.error("Error fetching mappings:", err);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === "mappings") {
      fetchMappings();
    }
  }, [activeTab, filterEntityType]);

  // Test Connection
  const handleTestConnection = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/tally/connection-test");
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          success: true,
          message: data.message || "Connection details verified. Ready for Bridge synchronization.",
        });
      } else {
        setTestResult({ success: false, message: data.error || "Connection test failed." });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsLoading(false);
      fetchStatus();
    }
  };

  // Copy API Key
  const handleCopyApiKey = () => {
    if (connection.apiKey) {
      navigator.clipboard.writeText(connection.apiKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    }
  };

  // Save Connection & Settings
  const handleSaveConnection = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/tally/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection, settings }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: "Configuration saved successfully!" });
        if (data.connection) setConnection(data.connection);
        if (data.settings) setSettings(data.settings);
      } else {
        setTestResult({ success: false, message: data.error || "Failed to save configuration." });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Retry Single Job
  const handleRetryJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      await fetch("/api/tally/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-one", jobId }),
      });
      await fetchStatus();
    } catch (err) {
      console.error("Failed to retry job:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Retry All Failed
  const handleRetryAll = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/tally/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-all" }),
      });
      await fetchStatus();
    } catch (err) {
      console.error("Failed to retry all:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel Job
  const handleCancelJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      await fetch("/api/tally/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", jobId }),
      });
      await fetchStatus();
    } catch (err) {
      console.error("Failed to cancel job:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Manual Batch Sync
  const handleManualSync = async (entityType: string) => {
    setIsLoading(true);
    setManualSyncMsg(null);
    try {
      const res = await fetch("/api/tally/manual-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType }),
      });
      const data = await res.json();
      if (res.ok) {
        setManualSyncMsg({
          text: `Successfully scheduled ${data.count} ${entityType}(s) for Tally sync.`,
          success: true,
        });
        await fetchStatus();
      } else {
        setManualSyncMsg({ text: data.error || "Failed to trigger sync", success: false });
      }
    } catch (err: any) {
      setManualSyncMsg({ text: err.message, success: false });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered Queue Items
  const filteredQueue = queueItems.filter((item) => {
    const matchesType = filterEntityType === "ALL" || item.entityType === filterEntityType;
    const matchesStatus = filterStatus === "ALL" || item.status === filterStatus;
    const matchesSearch =
      !searchQuery ||
      item.entityCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.entityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.entityType?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SYNCED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Synced
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
            <Clock className="w-3 h-3 mr-1" /> Pending
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-950 text-blue-400 border border-blue-800 animate-pulse">
            <RotateCw className="w-3 h-3 mr-1 animate-spin" /> Processing
          </span>
        );
      case "RETRYING":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-950 text-orange-400 border border-orange-800">
            <RotateCw className="w-3 h-3 mr-1" /> Retrying
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-800">
            <XCircle className="w-3 h-3 mr-1" /> Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Ban className="w-3 h-3 mr-1" /> Cancelled
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Server className="w-48 h-48 text-blue-500" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">TallyPrime Integration</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-900/60 text-blue-300 border border-blue-700">
                ERP → Tally Bridge
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Synchronize Customers, Vendors, Products, Invoices, Purchase Bills, and Vouchers with offline tolerance.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchStatus}
              disabled={isLoading}
              className="flex items-center px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh Status
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Jobs</p>
            <p className="text-xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-slate-950/60 border border-amber-900/40 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Pending</p>
            <p className="text-xl font-bold text-amber-300 mt-1">{stats.pending}</p>
          </div>
          <div className="bg-slate-950/60 border border-blue-900/40 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Processing</p>
            <p className="text-xl font-bold text-blue-300 mt-1">{stats.processing}</p>
          </div>
          <div className="bg-slate-950/60 border border-emerald-900/40 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Synced</p>
            <p className="text-xl font-bold text-emerald-300 mt-1">{stats.synced}</p>
          </div>
          <div className="bg-slate-950/60 border border-rose-900/40 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">Failed</p>
            <p className="text-xl font-bold text-rose-300 mt-1">{stats.failed}</p>
          </div>
          <div className="bg-slate-950/60 border border-orange-900/40 rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">Retrying</p>
            <p className="text-xl font-bold text-orange-300 mt-1">{stats.retrying}</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 space-x-1 overflow-x-auto custom-scrollbar">
        {[
          { id: "connection", label: "Connection", icon: Server },
          { id: "settings", label: "Sync Settings", icon: SettingsIcon },
          { id: "queue", label: "Sync Queue", icon: ListOrdered },
          { id: "history", label: "Sync History & Logs", icon: History },
          { id: "mappings", label: "Entity Mappings", icon: Link2 },
          { id: "errors", label: "Errors & Diagnostics", icon: AlertTriangle },
          { id: "manual", label: "Manual Sync", icon: Play },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                isActive
                  ? "border-blue-500 text-blue-400 bg-slate-900/50"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CONNECTION */}
      {activeTab === "connection" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <h2 className="text-base font-bold text-white flex items-center">
              <Server className="w-4 h-4 mr-2 text-blue-400" />
              Local TallyPrime Bridge Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={connection.name || ""}
                  onChange={(e) => setConnection({ ...connection, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tally Company Name
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={connection.companyName || ""}
                  onChange={(e) => setConnection({ ...connection, companyName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Local Host
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={connection.host || "localhost"}
                  onChange={(e) => setConnection({ ...connection, host: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  disabled={!canManage}
                  value={connection.port || 9000}
                  onChange={(e) => setConnection({ ...connection, port: parseInt(e.target.value, 10) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Tally Bridge API Key (for <code className="text-blue-400">tally-connector/.env</code>)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="password"
                  readOnly
                  value={connection.apiKey || ""}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono"
                />
                <button
                  onClick={handleCopyApiKey}
                  className="flex items-center px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span className="ml-1.5">{copiedKey ? "Copied" : "Copy Key"}</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleTestConnection}
                  disabled={isLoading}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-blue-900/30"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                  Test Connection Endpoint
                </button>

                {canManage && (
                  <button
                    onClick={handleSaveConnection}
                    disabled={isLoading}
                    className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Save Connection
                  </button>
                )}
              </div>

              {testResult && (
                <div
                  className={`text-xs px-3 py-1.5 rounded-lg border flex items-center ${
                    testResult.success
                      ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                      : "bg-rose-950/60 border-rose-800 text-rose-400"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 mr-1.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1.5 flex-shrink-0" />
                  )}
                  {testResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Side Instructions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-emerald-400" />
              How the Bridge Works
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Because TallyPrime runs locally on Windows, the cloud ERP will never try to directly connect to localhost:9000.
            </p>
            <div className="space-y-2 text-xs text-slate-400">
              <p>
                1. Copy the <strong>Tally Bridge API Key</strong> above.
              </p>
              <p>
                2. Put it in <code className="text-blue-400">tally-connector/.env</code> on your local PC.
              </p>
              <p>
                3. Run <code className="text-blue-400">npm start</code> inside <code className="text-blue-400">tally-connector/</code>.
              </p>
              <p>
                4. The bridge will automatically poll and push pending ERP invoices and masters to Tally.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYNC SETTINGS */}
      {activeTab === "settings" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center">
              <SettingsIcon className="w-4 h-4 mr-2 text-blue-400" />
              Synchronization Policies & Tally Ledger Mapping
            </h2>
            {canManage && (
              <button
                onClick={handleSaveConnection}
                disabled={isLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Save Sync Settings
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Entity Sync Toggles</h3>
              {[
                { key: "syncCustomers", label: "Sync Customers" },
                { key: "syncVendors", label: "Sync Vendors" },
                { key: "syncProducts", label: "Sync Products (Stock Items)" },
                { key: "syncSalesInvoices", label: "Sync Sales Invoices" },
                { key: "syncPurchaseBills", label: "Sync Purchase Bills" },
                { key: "syncPayments", label: "Sync Payments" },
                { key: "syncReceipts", label: "Sync Receipts" },
                { key: "syncCreditNotes", label: "Sync Credit Notes" },
                { key: "syncDebitNotes", label: "Sync Debit Notes" },
              ].map((item) => (
                <label key={item.key} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={settings[item.key] !== false}
                    onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Default Tally Groups & Accounts</h3>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Debtor Group</label>
                <input
                  type="text"
                  value={settings.defaultDebtorGroup || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultDebtorGroup: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Creditor Group</label>
                <input
                  type="text"
                  value={settings.defaultCreditorGroup || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultCreditorGroup: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Sales Ledger</label>
                <input
                  type="text"
                  value={settings.defaultSalesLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultSalesLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Purchase Ledger</label>
                <input
                  type="text"
                  value={settings.defaultPurchaseLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultPurchaseLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Tax & Round-Off Ledgers</h3>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">CGST Ledger</label>
                <input
                  type="text"
                  value={settings.defaultCgstLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultCgstLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">SGST Ledger</label>
                <input
                  type="text"
                  value={settings.defaultSgstLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultSgstLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">IGST Ledger</label>
                <input
                  type="text"
                  value={settings.defaultIgstLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultIgstLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Round Off Ledger</label>
                <input
                  type="text"
                  value={settings.defaultRoundoffLedger || ""}
                  disabled={!canManage}
                  onChange={(e) => setSettings({ ...settings, defaultRoundoffLedger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SYNC QUEUE */}
      {activeTab === "queue" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-base font-bold text-white flex items-center">
              <ListOrdered className="w-4 h-4 mr-2 text-blue-400" />
              Synchronization Queue ({filteredQueue.length})
            </h2>

            {canRetry && (
              <button
                onClick={handleRetryAll}
                disabled={isLoading}
                className="flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition"
              >
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                Retry All Failed & Retrying
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Search by code, name, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500"
            />
            <SearchSelect
              value={filterEntityType}
              onChange={(v) => setFilterEntityType(v)}
              placeholder="Type to search"
              options={[{ value: "ALL", label: "All Entity Types" }, { value: "CUSTOMER", label: "Customers" }, { value: "VENDOR", label: "Vendors" }, { value: "PRODUCT", label: "Products" }, { value: "SALES_INVOICE", label: "Sales Invoices" }, { value: "PURCHASE_BILL", label: "Purchase Bills" }, { value: "PAYMENT", label: "Payments" }, { value: "RECEIPT", label: "Receipts" }]}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            />
            <SearchSelect
              value={filterStatus}
              onChange={(v) => setFilterStatus(v)}
              placeholder="Type to search"
              options={[{ value: "ALL", label: "All Statuses" }, { value: "PENDING", label: "Pending" }, { value: "PROCESSING", label: "Processing" }, { value: "SYNCED", label: "Synced" }, { value: "FAILED", label: "Failed" }, { value: "RETRYING", label: "Retrying" }, { value: "CANCELLED", label: "Cancelled" }]}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>

          {/* Table (Desktop >= 768px) */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">Document / Master</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Retries</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No records found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-white">{item.entityType}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{item.entityCode || item.entityId}</div>
                        {item.entityName && <div className="text-[11px] text-slate-400">{item.entityName}</div>}
                        {item.lastError && (
                          <div className="text-[11px] text-rose-400 mt-0.5 truncate max-w-xs">{item.lastError}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px] font-mono">
                          {item.operation}
                        </span>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(item.status)}</td>
                      <td className="py-3 px-4 font-mono">
                        {item.retryCount} / {item.maxRetries}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => setSelectedQueueItem(item)}
                          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
                          title="View Payload / XML"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canRetry && item.status !== "SYNCED" && (
                          <button
                            onClick={() => handleRetryJob(item.id)}
                            className="p-1.5 hover:bg-slate-800 text-amber-400 hover:text-amber-300 rounded transition"
                            title="Retry Sync"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canRetry && item.status !== "SYNCED" && item.status !== "CANCELLED" && (
                          <button
                            onClick={() => handleCancelJob(item.id)}
                            className="p-1.5 hover:bg-slate-800 text-rose-400 hover:text-rose-300 rounded transition"
                            title="Cancel Job"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cards View (Mobile < 768px) */}
          <div className="md:hidden space-y-3">
            {filteredQueue.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-6 text-center text-slate-500 rounded-lg text-xs">
                No records found matching filters.
              </div>
            ) : (
              filteredQueue.map((item) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2.5 text-xs text-slate-300">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <span className="font-bold text-white text-sm block">{item.entityType}</span>
                      <div className="font-mono text-slate-400 text-[11px]">{item.entityCode || item.entityId}</div>
                    </div>
                    <div>{getStatusBadge(item.status)}</div>
                  </div>
                  {item.entityName && <div className="text-slate-300">{item.entityName}</div>}
                  {item.lastError && (
                    <div className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/40">
                      {item.lastError}
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                    <span>Retries: {item.retryCount}/{item.maxRetries}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                    <button
                      onClick={() => setSelectedQueueItem(item)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Payload</span>
                    </button>
                    {canRetry && item.status !== "SYNCED" && (
                      <button
                        onClick={() => handleRetryJob(item.id)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SYNC HISTORY */}
      {activeTab === "history" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center">
            <History className="w-4 h-4 mr-2 text-blue-400" />
            Execution Logs & Audit History
          </h2>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Details / Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {log.entityType} {log.entityCode ? `(${log.entityCode})` : ""}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">{log.operation}</td>
                      <td className="py-3 px-4">{getStatusBadge(log.status)}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{log.durationMs || 0}ms</td>
                      <td className="py-3 px-4 text-slate-300 max-w-sm truncate">
                        {log.errorMessage ? (
                          <span className="text-rose-400">{log.errorMessage}</span>
                        ) : (
                          <span className="text-emerald-400">Successfully synced to Tally</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {logs.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No logs recorded yet.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-800/80 pb-2">
                    <div>
                      <span className="font-semibold text-white block">
                        {log.entityType} {log.entityCode ? `(${log.entityCode})` : ""}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">{new Date(log.createdAt).toLocaleTimeString()} • {log.operation}</span>
                    </div>
                    <div>{getStatusBadge(log.status)}</div>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {log.errorMessage ? (
                      <span className="text-rose-400">{log.errorMessage}</span>
                    ) : (
                      <span className="text-emerald-400">Successfully synced ({log.durationMs || 0}ms)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: ENTITY MAPPINGS */}
      {activeTab === "mappings" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center">
              <Link2 className="w-4 h-4 mr-2 text-blue-400" />
              ERP to Tally Entity Mappings ({mappings.length})
            </h2>
            <button
              onClick={fetchMappings}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs"
            >
              Refresh Mappings
            </button>
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4">ERP Code / Name</th>
                  <th className="py-3 px-4">Tally Name / Voucher #</th>
                  <th className="py-3 px-4">Tally GUID</th>
                  <th className="py-3 px-4">Sync Status</th>
                  <th className="py-3 px-4">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {mappings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No entity mappings created yet.
                    </td>
                  </tr>
                ) : (
                  mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-white">{m.entityType}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-200">{m.entityName || m.entityCode || m.entityId}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-400">{m.tallyName || m.tallyVoucherNo || "-"}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-xs">{m.tallyGuid || "-"}</td>
                      <td className="py-3 px-4">{getStatusBadge(m.syncStatus)}</td>
                      <td className="py-3 px-4 text-slate-400">{new Date(m.lastSyncedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {mappings.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                No entity mappings created yet.
              </div>
            ) : (
              mappings.map((m) => (
                <div key={m.id} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-800/80 pb-2">
                    <div>
                      <span className="font-bold text-white text-sm block">{m.entityType}</span>
                      <div className="text-slate-300 font-medium">{m.entityName || m.entityCode || m.entityId}</div>
                    </div>
                    <div>{getStatusBadge(m.syncStatus)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/60 p-2 rounded">
                    <div>
                      <span className="text-[11px] text-slate-500 uppercase block">Tally Name</span>
                      <span className="font-mono text-emerald-400">{m.tallyName || m.tallyVoucherNo || "-"}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 uppercase block">Last Synced</span>
                      <span className="text-slate-400">{new Date(m.lastSyncedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ERRORS & DIAGNOSTICS */}
      {activeTab === "errors" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 text-rose-400" />
            Diagnostics & Common Solutions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-amber-400">1. "Cannot connect to TallyPrime at localhost:9000"</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ensure TallyPrime is opened on the host Windows machine and ODBC/HTTP Server is enabled in <strong>F1 &gt; Settings &gt; Connectivity &gt; Port 9000</strong>.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-amber-400">2. "Ledger &apos;Sales Account&apos; does not exist"</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Check that default ledgers (Sales Account, CGST, SGST, IGST, Round Off) exist in your Tally Company or update names in the <strong>Sync Settings</strong> tab.
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-amber-400">3. "Date out of financial year"</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ensure the invoice / bill date falls within the currently open Financial Year in TallyPrime (e.g. 1-Apr-2025 to 31-Mar-2026).
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-amber-400">4. "Duplicate Voucher Number"</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                If voucher numbering in Tally is set to Manual/Automatic without duplicates, duplicate invoices will be rejected. Inventory maintains idempotency via document references.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: MANUAL SYNC */}
      {activeTab === "manual" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center">
            <Play className="w-4 h-4 mr-2 text-blue-400" />
            Manual Batch Synchronization
          </h2>

          <p className="text-xs text-slate-400">
            Enqueue all existing records from the primary Supabase database into the Tally Sync Queue.
          </p>

          {manualSyncMsg && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center ${
                manualSyncMsg.success
                  ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                  : "bg-rose-950 border-rose-800 text-rose-300"
              }`}
            >
              {manualSyncMsg.success ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              {manualSyncMsg.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { type: "CUSTOMER", label: "Sync All Customers", desc: "Maps all active customers to Sundry Debtors" },
              { type: "VENDOR", label: "Sync All Vendors", desc: "Maps all vendors to Sundry Creditors" },
              { type: "PRODUCT", label: "Sync All Products", desc: "Maps products to Tally Stock Items" },
              { type: "SALES_INVOICE", label: "Sync All Sales Invoices", desc: "Creates Sales Vouchers in Tally" },
              { type: "PURCHASE_BILL", label: "Sync All Purchase Bills", desc: "Creates Purchase Vouchers in Tally" },
            ].map((btn) => (
              <div key={btn.type} className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-white">{btn.label}</h3>
                <p className="text-[11px] text-slate-400">{btn.desc}</p>
                <button
                  onClick={() => handleManualSync(btn.type)}
                  disabled={isLoading || !canSync}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition disabled:opacity-50"
                >
                  {isLoading ? "Enqueuing..." : "Queue Sync Now"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: View Queue Item Payload / XML */}
      {selectedQueueItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Queue Item Details: {selectedQueueItem.entityType} ({selectedQueueItem.entityCode || selectedQueueItem.entityId})
              </h3>
              <button
                onClick={() => setSelectedQueueItem(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar flex-1">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Generated Tally XML Request</p>
                <pre className="bg-slate-950 p-3 rounded text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap border border-slate-800">
                  {selectedQueueItem.xmlRequest || "No XML generated yet."}
                </pre>
              </div>
              {selectedQueueItem.lastError && (
                <div>
                  <p className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider mb-1">Last Reported Error</p>
                  <pre className="bg-rose-950/40 p-3 rounded text-[11px] font-mono text-rose-300 border border-rose-900">
                    {selectedQueueItem.lastError}
                  </pre>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedQueueItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
