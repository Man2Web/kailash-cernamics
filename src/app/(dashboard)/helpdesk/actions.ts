"use server";

import { db } from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

export async function createHelpArticle(formData: {
  title: string;
  content: string;
  category: string;
}) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.helpDeskArticle.create({
      data: {
        title: formData.title,
        content: formData.content,
        category: formData.category,
      },
    });

    revalidatePath("/helpdesk");
    return { success: true };
  } catch (error: any) {
    console.error("Error creating article:", error);
    return { success: false, error: error.message || "Failed to publish help desk article." };
  }
}

export async function deleteHelpArticle(id: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.helpDeskArticle.delete({
      where: { id },
    });

    revalidatePath("/helpdesk");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting article:", error);
    return { success: false, error: error.message || "Failed to delete article." };
  }
}
