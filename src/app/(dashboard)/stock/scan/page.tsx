import React from "react";
import { getSession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import ProductQrScanner from "@/components/erp/ProductQrScanner";
import Link from "next/link";
import { ArrowLeft, Box } from "lucide-react";

export default async function ScanProductQrPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const roles = session.user.roles || [];
  const isSuperAdminRole = roles.includes("SUPER_ADMIN") || roles.includes("ADMIN");
  const isWarehouseMgrRole = roles.includes("WAREHOUSE_MANAGER") || roles.includes("INVENTORY_STAFF");
  const isSalesPersonRole = roles.includes("SALES_PERSON") || roles.includes("SALES_MANAGER") || roles.includes("SALES_STAFF");

  if (!isSuperAdminRole && !isWarehouseMgrRole && !isSalesPersonRole) {
    redirect("/unauthorized");
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 mb-1">
            <Link href="/stock" className="hover:text-blue-600 flex items-center space-x-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Products</span>
            </Link>
          </div>
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            <span>Scan Product QR Code</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
            Scan any product QR sticker to instantly view live warehouse-wise stock availability, reserved units, and pricing.
          </p>
        </div>
      </div>

      {/* Main Scanner Card */}
      <ProductQrScanner />
    </div>
  );
}
