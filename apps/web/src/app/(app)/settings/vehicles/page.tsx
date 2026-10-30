"use client";

import { orgVehicleSchema } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { MasterPage, type MasterConfig } from "@/components/common/master-page";
import { StatusBadge } from "@/components/common/status-badge";

interface Vehicle {
  id: string;
  number: string;
  type: string | null;
  driverName: string | null;
  driverPhone: string | null;
  isActive: boolean;
}

const config: MasterConfig<Vehicle> = {
  title: "Vehicles",
  singular: "Vehicle",
  endpoint: "/vehicles",
  writePerm: "org.write",
  schema: orgVehicleSchema,
  defaults: { number: "", type: "", driverName: "", driverPhone: "", isActive: true },
  columns: [
    { accessorKey: "number", header: "Vehicle no.", meta: { sortKey: "number", className: "font-mono" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    { accessorKey: "type", header: "Type" },
    { accessorKey: "driverName", header: "Driver" },
    { accessorKey: "driverPhone", header: "Driver phone" },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
    },
  ],
  fields: [
    { name: "number", label: "Vehicle number", type: "text", required: true, placeholder: "TN37BX4521" },
    { name: "type", label: "Type", type: "text", placeholder: "Tata 407" },
    { name: "driverName", label: "Driver name", type: "text" },
    { name: "driverPhone", label: "Driver phone", type: "tel" },
    { name: "isActive", label: "Active", type: "switch" },
  ],
};

export default function VehiclesPage() {
  return (
    <>
      <PageHeader title="Vehicles" description="Delivery vehicles and drivers used on dispatches." />
      <MasterPage config={config} />
    </>
  );
}
