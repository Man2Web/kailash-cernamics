"use server";

import { db } from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

export async function createTicket(formData: {
  customerId: string;
  subject: string;
  description?: string;
  priority: string;
}) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const ticketNo = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;

    await db.supportTicket.create({
      data: {
        ticketNo,
        customerId: formData.customerId,
        subject: formData.subject,
        description: formData.description,
        priority: formData.priority,
        status: "OPEN",
      },
    });

    revalidatePath("/ticketing");
    return { success: true };
  } catch (error: any) {
    console.error("Error creating ticket:", error);
    return { success: false, error: error.message || "Failed to create support ticket." };
  }
}

export async function updateTicketStatus(id: string, status: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.supportTicket.update({
      where: { id },
      data: { status },
    });

    revalidatePath("/ticketing");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating ticket status:", error);
    return { success: false, error: error.message || "Failed to update ticket status." };
  }
}

export async function deleteTicket(id: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.supportTicket.delete({
      where: { id },
    });

    revalidatePath("/ticketing");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting ticket:", error);
    return { success: false, error: error.message || "Failed to delete ticket." };
  }
}
