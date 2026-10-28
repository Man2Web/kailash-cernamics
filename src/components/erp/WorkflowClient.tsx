"use client";

import React, { useState } from "react";
import {
  GitCommit,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import {
  createApprovalWorkflow,
  approveStep,
  rejectStep,
} from "@/app/(dashboard)/admin/workflows/actions";

interface WorkflowStep {
  id: string;
  stepNumber: number;
  roleName: string;
}

interface WorkflowData {
  id: string;
  docType: string;
  name: string;
  isActive: boolean;
  steps: WorkflowStep[];
}

interface RequestHistory {
  step: number;
  user: string;
  action: string;
  comments: string;
  date: string;
}

interface RequestData {
  id: string;
  docType: string;
  docDetails: string;
  currentStep: number;
  status: string;
  date: string;
  histories: RequestHistory[];
}

interface UserData {
  id: string;
  name: string;
}

interface WorkflowClientProps {
  workflows: WorkflowData[];
  requests: RequestData[];
  users: UserData[];
}

export default function WorkflowClient({
  workflows,
  requests,
  users,
}: WorkflowClientProps) {
  const [activeTab, setActiveTab] = useState("requests");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Workflow Creator Form States
  const [docType, setDocType] = useState("INVOICE");
  const [wfName, setWfName] = useState("");
  const [wfSteps, setWfSteps] = useState<string[]>([]);
  const [newStepRole, setNewStepRole] = useState("Sales Manager");

  // Approval Form Actions Modal
  const [actionReq, setActionReq] = useState<RequestData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [comments, setComments] = useState("");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleAddRoleStep = () => {
    setWfSteps((prev) => [...prev, newStepRole]);
  };

  const handleRemoveRoleStep = (idx: number) => {
    setWfSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfName || wfSteps.length === 0) {
      showMsg("Please provide workflow name and at least one step.", "error");
      return;
    }

    const res = await createApprovalWorkflow(docType, wfName, wfSteps);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Approval Workflow configured and activated successfully!");
      setWfName("");
      setWfSteps([]);
    }
  };

  const handleApprove = async () => {
    if (!actionReq || !selectedUserId) return;

    const res = await approveStep(actionReq.id, selectedUserId, comments);
    setActionReq(null);
    setSelectedUserId("");
    setComments("");

    if (res.error) showMsg(res.error, "error");
    else if (res.data) {
      showMsg(
        res.data.status === "FULLY_APPROVED"
          ? "Document fully approved! Target status updated."
          : "Approval recorded. Passed to next sequential step."
      );
    }
  };

  const handleReject = async () => {
    if (!actionReq || !selectedUserId) return;

    const res = await rejectStep(actionReq.id, selectedUserId, comments);
    setActionReq(null);
    setSelectedUserId("");
    setComments("");

    if (res.error) showMsg(res.error, "error");
    else showMsg("Document rejected. Status updated.");
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const completedRequests = requests.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-4">
      {/* Alert toast */}
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
          onClick={() => setActiveTab("requests")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "requests"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Pending Approvals ({pendingRequests.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("workflows")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "workflows"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <GitCommit className="h-3.5 w-3.5" />
          <span>Workflows Setup</span>
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "history"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>Approval Log</span>
        </button>
      </div>

      {/* 1. Pending Approvals list */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="bg-white p-3 border border-slate-200 rounded-sm shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Pending Document Approvals
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {pendingRequests.length === 0 ? (
              <div className="bg-white border p-8 text-center text-slate-400 text-xs">
                No pending document approvals found.
              </div>
            ) : (
              pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-blue-600 uppercase bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-sm text-[10px]">
                        {req.docType}
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">{req.date}</span>
                    </div>
                    <p className="font-semibold text-slate-800 text-sm">{req.docDetails}</p>
                    <div className="text-slate-500 font-medium">
                      Current Approval Stage:{" "}
                      <span className="font-bold text-slate-700">Step {req.currentStep}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-auto">
                    <button
                      onClick={() => setActionReq(req)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
                    >
                      Process Approval Action
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Workflows configuration */}
      {activeTab === "workflows" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Creator */}
          <div className="bg-white p-4 border border-slate-200 rounded-sm shadow-xs space-y-4 text-xs">
            <h3 className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Setup Custom Workflow
            </h3>
            <form onSubmit={handleCreateWorkflow} className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Document Type *</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm outline-none text-slate-950 font-medium"
                >
                  <option value="INVOICE">INVOICE</option>
                  <option value="TRANSFER">STOCK TRANSFER</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Workflow Name *</label>
                <input
                  type="text"
                  required
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  placeholder="e.g. Sales Invoices Approvals"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm outline-none text-slate-900"
                />
              </div>

              {/* Add Steps */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="font-bold text-slate-800 block text-[10px] uppercase">
                  Sequential Steps Setup
                </label>
                <div className="flex space-x-1.5">
                  <select
                    value={newStepRole}
                    onChange={(e) => setNewStepRole(e.target.value)}
                    className="flex-1 px-2.5 py-1 border border-slate-300 bg-white rounded-sm outline-none text-slate-950"
                  >
                    <option value="Sales Manager">Sales Manager</option>
                    <option value="General Manager">General Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddRoleStep}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-sm text-[10px] uppercase"
                  >
                    + Add
                  </button>
                </div>

                {/* Steps List */}
                <div className="space-y-1 bg-slate-50 p-2 rounded max-h-36 overflow-y-auto">
                  {wfSteps.length === 0 ? (
                    <span className="text-slate-400">No steps defined. Add a role to start.</span>
                  ) : (
                    wfSteps.map((step, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-1.5 border rounded-sm">
                        <span className="font-medium text-slate-700">
                          {idx + 1}. {step}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRoleStep(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={wfSteps.length === 0}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition disabled:opacity-50"
              >
                Activate Workflow Setup
              </button>
            </form>
          </div>

          {/* List existing Workflows */}
          <div className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden md:col-span-2 text-xs text-slate-700 p-4 space-y-4">
            <h3 className="font-bold text-slate-500 uppercase tracking-wider text-[10px] border-b pb-2">
              Active Workflow Pipelines
            </h3>
            <div className="space-y-4">
              {workflows.length === 0 ? (
                <div className="text-slate-400">No workflows configured.</div>
              ) : (
                workflows.map((wf) => (
                  <div key={wf.id} className="border border-slate-100 rounded p-3 bg-slate-50/50 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">{wf.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold ${
                          wf.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-slate-50 text-slate-500 border border-slate-100"
                        }`}
                      >
                        {wf.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Steps:</span>
                      {wf.steps.map((step) => (
                        <div key={step.id} className="flex items-center space-x-1">
                          <span className="bg-white border px-2 py-0.5 rounded font-medium">
                            {step.stepNumber}. {step.roleName}
                          </span>
                          {step.stepNumber < wf.steps.length && <span className="text-slate-400">→</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. History Log */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden text-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-2 border-b">Date</th>
                  <th className="px-4 py-2 border-b">Document Type</th>
                  <th className="px-4 py-2 border-b">Document Details</th>
                  <th className="px-4 py-2 border-b text-center">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {completedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No resolved approval requests logged.
                    </td>
                  </tr>
                ) : (
                  completedRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-500">{req.date}</td>
                      <td className="px-4 py-2 font-mono font-bold">{req.docType}</td>
                      <td className="px-4 py-2">{req.docDetails}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm text-[10px] uppercase font-bold border ${
                            req.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : "bg-red-50 text-red-700 border-red-100"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-2.5 text-xs">
            {completedRequests.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No resolved approval requests logged.
              </div>
            ) : (
              completedRequests.map((req) => (
                <div key={req.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900 text-xs block">{req.docType}</span>
                      <span className="text-[11px] text-slate-400">{req.date}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                        req.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "bg-red-50 text-red-700 border-red-100"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-slate-700">{req.docDetails}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Approval Modal Action Dialog */}
      {actionReq && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-xs text-slate-700">
          <div className="bg-white p-6 border border-slate-200 rounded-sm shadow-xl max-w-md w-full space-y-4 animate-in zoom-in duration-150">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Resolve Stage - Approval Step {actionReq.currentStep}
            </h3>
            <div className="space-y-1">
              <p className="font-semibold text-slate-950 font-mono text-[10px] uppercase bg-blue-50 border px-1.5 py-0.5 inline-block rounded-sm">
                {actionReq.docType}
              </p>
              <p className="font-bold text-slate-800 text-sm mt-1">{actionReq.docDetails}</p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Acting Approver User *</label>
                <select
                  required
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm outline-none text-slate-950"
                >
                  <option value="">Select User Profile</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Review Comments</label>
                <textarea
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Approve or rejection remarks"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm outline-none text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActionReq(null)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!selectedUserId}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold transition flex items-center space-x-1 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject</span>
              </button>
              <button
                onClick={handleApprove}
                disabled={!selectedUserId}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm font-bold transition flex items-center space-x-1 disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
