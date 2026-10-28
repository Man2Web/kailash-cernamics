import React from "react";
import db from "@/lib/db/db";
import WorkflowClient from "@/components/erp/WorkflowClient";
import { getSession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function WorkflowPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.roles.includes("SUPER_ADMIN") && !session.user.roles.includes("ADMIN")) {
    redirect("/unauthorized");
  }

  // 1. Fetch Workflow details
  const workflows = await db.approvalWorkflow.findMany({
    include: {
      steps: {
        orderBy: {
          stepNumber: "asc",
        },
      },
    },
    orderBy: {
      docType: "asc",
    },
  });

  const requests = await db.approvalRequest.findMany({
    include: {
      workflow: true,
      histories: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const users = await db.user.findMany({
    orderBy: {
      name: "asc",
    },
  });

  const invoices = await db.invoice.findMany({
    include: {
      customer: true,
    },
  });

function formatDate(value: unknown): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
}

  // Map details
  const invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));

  const formattedRequests = requests.map((req: any) => {
    const inv: any = invoiceMap.get(req.docId);
    let docDetails = "N/A";
    if (inv) {
      docDetails = `Invoice ${inv.invoiceNo || "-"} (₹${Number(inv.totalPayable || 0).toFixed(2)}) - ${inv.customer?.name || "Customer"}`;
    }

    return {
      id: req.id,
      docType: req.workflow?.docType || "INVOICE",
      docDetails,
      currentStep: req.currentStep || 1,
      status: req.status || "PENDING",
      date: formatDate(req.createdAt),
      histories: (req.histories || []).map((h: any) => ({
        step: h.stepNumber || 1,
        user: h.user?.name || "User",
        action: h.action || "REVIEW",
        comments: h.comments || "",
        date: formatDate(h.createdAt),
      })),
    };
  });

  // Format users for selection
  const formattedUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">Approvals & Workflow Engine</h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          Configure sequential approval paths for invoices, and approve or reject pending items
        </p>
      </div>

      <WorkflowClient
        workflows={workflows}
        requests={formattedRequests}
        users={formattedUsers}
      />
    </div>
  );
}
