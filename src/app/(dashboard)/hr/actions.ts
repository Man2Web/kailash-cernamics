"use server";

import { db } from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";
import { revalidatePath } from "next/cache";

export async function createEmployee(formData: {
  name: string;
  email: string;
  phone?: string;
  department: string;
  jobTitle: string;
  salary: number;
}) {
  const session = await authorize({ adminOnly: true });
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const employeeNo = `GC-EMP-${Math.floor(100 + Math.random() * 900)}`;

    await db.employee.create({
      data: {
        employeeNo,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        department: formData.department,
        jobTitle: formData.jobTitle,
        salary: formData.salary,
        status: "ACTIVE",
      },
    });

    revalidatePath("/hr");
    return { success: true };
  } catch (error: any) {
    console.error("Error creating employee:", error);
    return { success: false, error: error.message || "Failed to create employee profile." };
  }
}

export async function toggleEmployeeStatus(id: string, status: string) {
  const session = await authorize({ adminOnly: true });
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.employee.update({
      where: { id },
      data: { status },
    });

    revalidatePath("/hr");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating employee status:", error);
    return { success: false, error: error.message || "Failed to update employee status." };
  }
}

export async function deleteEmployee(id: string) {
  const session = await authorize({ adminOnly: true });
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    await db.employee.delete({
      where: { id },
    });

    revalidatePath("/hr");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting employee:", error);
    return { success: false, error: error.message || "Failed to delete employee profile." };
  }
}
