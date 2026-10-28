"use server";

import { db } from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

export async function createAnnouncement(formData: {
  title: string;
  content: string;
  category: string;
}) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.portalAnnouncement.create({
      data: {
        title: formData.title,
        content: formData.content,
        category: formData.category,
        isActive: true,
      },
    });

    revalidatePath("/portal");
    return { success: true };
  } catch (error: any) {
    console.error("Error creating announcement:", error);
    return { success: false, error: error.message || "Failed to create portal announcement." };
  }
}

export async function toggleAnnouncementActive(id: string, isActive: boolean) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.portalAnnouncement.update({
      where: { id },
      data: { isActive },
    });

    revalidatePath("/portal");
    return { success: true };
  } catch (error: any) {
    console.error("Error toggling announcement active state:", error);
    return { success: false, error: error.message || "Failed to update announcement state." };
  }
}

export async function deleteAnnouncement(id: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.portalAnnouncement.delete({
      where: { id },
    });

    revalidatePath("/portal");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting announcement:", error);
    return { success: false, error: error.message || "Failed to delete announcement." };
  }
}
