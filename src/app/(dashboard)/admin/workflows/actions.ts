"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";

// ==========================================
// 1. WORKFLOW CONFIGURATION
// ==========================================

export async function createApprovalWorkflow(docType: string, name: string, steps: string[]) {
  const session = await authorize({ adminOnly: true });
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const result = await db.$transaction(async (tx) => {
      // Deactivate old workflow for same docType
      await tx.approvalWorkflow.updateMany({
        where: { docType },
        data: { isActive: false },
      });

      const workflow = await tx.approvalWorkflow.create({
        data: {
          docType,
          name,
          isActive: true,
        },
      });

      for (let i = 0; i < steps.length; i++) {
        await tx.approvalWorkflowStep.create({
          data: {
            workflowId: workflow.id,
            stepNumber: i + 1,
            roleName: steps[i],
          },
        });
      }

      return workflow;
    });

    revalidatePath("/admin/workflows");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating workflow:", error);
    return { error: error.message || "Failed to create workflow" };
  }
}

// ==========================================
// 2. APPROVAL EXECUTION ENGINE
// ==========================================

export async function submitDocForApproval(docType: string, docId: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const result = await db.$transaction(async (tx) => {
      // Find active workflow
      const workflow = await tx.approvalWorkflow.findFirst({
        where: { docType, isActive: true },
        include: { steps: true },
      });

      if (!workflow || workflow.steps.length === 0) {
        // Auto-approve the document if no workflow exists
        await tx.invoice.updateMany({
          where: { id: docId },
          data: { status: "APPROVED" },
        });
        return { approved: true };
      }

      // Create approval request
      const request = await tx.approvalRequest.create({
        data: {
          workflowId: workflow.id,
          docId,
          currentStep: 1,
          status: "PENDING",
        },
      });

      return { approved: false, request };
    });

    revalidatePath("/admin/workflows");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error submitting for approval:", error);
    return { error: error.message || "Failed to submit for approval" };
  }
}

export async function approveStep(requestId: string, _clientUserId: string, comments?: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  const userId = session.user.id; // never trust a client-supplied approver id
  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Fetch request and workflow steps
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: {
          workflow: {
            include: {
              steps: true,
            },
          },
        },
      });

      if (!request) throw new Error("Approval Request not found");
      if (request.status !== "PENDING") throw new Error("Request already resolved");

      // 2. Add history entry
      await tx.approvalHistory.create({
        data: {
          requestId,
          stepNumber: request.currentStep,
          userId,
          action: "APPROVED",
          comments: comments || null,
        },
      });

      // 3. Check if there are further steps
      const totalSteps = request.workflow.steps.length;
      if (request.currentStep < totalSteps) {
        // Increment step
        const updated = await tx.approvalRequest.update({
          where: { id: requestId },
          data: {
            currentStep: request.currentStep + 1,
          },
        });
        return { status: "STEP_APPROVED", request: updated };
      } else {
        // Fully approved
        const updated = await tx.approvalRequest.update({
          where: { id: requestId },
          data: {
            status: "APPROVED",
          },
        });

        // Update target document
        if (request.workflow.docType === "INVOICE") {
          await tx.invoice.update({
            where: { id: request.docId },
            data: { status: "APPROVED" },
          });
        }

        return { status: "FULLY_APPROVED", request: updated };
      }
    });

    revalidatePath("/admin/workflows");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error approving step:", error);
    return { error: error.message || "Failed to approve step" };
  }
}

export async function rejectStep(requestId: string, _clientUserId: string, comments?: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  const userId = session.user.id; // never trust a client-supplied approver id
  try {
    const result = await db.$transaction(async (tx) => {
      // Fetch request
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { workflow: true },
      });

      if (!request) throw new Error("Approval Request not found");
      if (request.status !== "PENDING") throw new Error("Request already resolved");

      // Log history
      await tx.approvalHistory.create({
        data: {
          requestId,
          stepNumber: request.currentStep,
          userId,
          action: "REJECTED",
          comments: comments || null,
        },
      });

      // Update request to rejected
      const updated = await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED" },
      });

      // Update target document
      if (request.workflow.docType === "INVOICE") {
        await tx.invoice.update({
          where: { id: request.docId },
          data: { status: "REJECTED" },
        });
      }

      return updated;
    });

    revalidatePath("/admin/workflows");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error rejecting step:", error);
    return { error: error.message || "Failed to reject step" };
  }
}
