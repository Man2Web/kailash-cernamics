"use client";

import React, { useState, useTransition } from "react";
import {
  Truck,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  MapPin,
  Clock,
  Trash2,
  Lock,
  Eye,
  Calendar,
  Phone,
  User,
  Package,
} from "lucide-react";
import { createMovement, updateMovementStatus, deleteMovement } from "@/app/(dashboard)/movement/actions";
import { useFullPageForm } from "@/lib/ui/use-full-page-form";
import SearchSelect from "@/components/erp/SearchSelect";

export interface DeliveryItem {
  id: string;
  type: "SALES_DELIVERY";
  deliveryNo: string;
  refNo: string;
  partyName: string;
  partyPhone: string;
  warehouse: string;
  destination: string;
  driverName: string;
  driverPhone: string;
  vehicleNo: string;
  deliveryType: string;
  status: string;
  expectedDeliveryDate: string;
  actualDeliveryDate: string;
  date: string;
  isLocked: boolean;
  notes?: string;
  createdByName?: string;
  createdAtFormatted?: string;
  completedByName?: string;
  completedAtFormatted?: string;
  statusHistory?: any[];
}

interface MovementClientProps {
  deliveries: DeliveryItem[];
  warehouses: string[];
  outlets: string[];
  canEditStatus?: boolean;
}

export default function MovementClient({
  deliveries,
  warehouses,
  outlets,
  canEditStatus = true,
}: MovementClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState("ALL");
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedDeliveryForDetail, setSelectedDeliveryForDetail] = useState<DeliveryItem | null>(null);
  const [isPending, startTransition] = useTransition();

  // Create form state
  const [invoiceNo, setInvoiceNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [sourceWarehouse, setSourceWarehouse] = useState(warehouses[0] || "");
  const [destOutlet, setDestOutlet] = useState(outlets[0] || "");
  const [deliveryType, setDeliveryType] = useState("Own Vehicle");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Stats
  const total = deliveries.length;
  const ready = deliveries.filter((d) => ["DRAFT", "READY_FOR_DISPATCH"].includes(d.status)).length;
  const inTransit = deliveries.filter((d) => ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(d.status)).length;
  const delivered = deliveries.filter((d) => d.status === "DELIVERED").length;
  const completed = deliveries.filter((d) => d.status === "COMPLETED" || d.isLocked).length;

  const handleCreateDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!invoiceNo || !driverName || !vehicleNo || !sourceWarehouse) {
      setErrorMsg("Please fill out all required fields.");
      return;
    }

    startTransition(async () => {
      const res = await createMovement({
        invoiceNo,
        driverName,
        driverPhone,
        vehicleNo,
        sourceWarehouse,
        destOutlet: customerName ? `${customerName} (${destOutlet})` : destOutlet,
        deliveryType,
        eta: expectedDate,
        notes,
      });

      if (res.success) {
        setSuccessMsg("Sales delivery dispatch created successfully.");
        setInvoiceNo("");
        setCustomerName("");
        setCustomerPhone("");
        setDriverName("");
        setDriverPhone("");
        setVehicleNo("");
        setExpectedDate("");
        setNotes("");
        setShowDispatchModal(false);
      } else {
        setErrorMsg(res.error || "Failed to create sales delivery dispatch.");
      }
    });
  };

  const handleStatusChange = (delivery: DeliveryItem, newStatus: string) => {
    if (delivery.isLocked || delivery.status === "COMPLETED") {
      alert("This sales delivery is COMPLETED and permanently locked.");
      return;
    }

    startTransition(async () => {
      const res = await updateMovementStatus(delivery.id, newStatus, delivery.expectedDeliveryDate);
      if (!res.success) {
        alert(res.error || "Failed to update status.");
      }
    });
  };

  const handleDelete = (delivery: DeliveryItem) => {
    if (delivery.isLocked || delivery.status === "COMPLETED") {
      alert("Cannot delete a completed delivery.");
      return;
    }
    if (!confirm("Are you sure you want to delete this sales delivery record?")) return;

    startTransition(async () => {
      const res = await deleteMovement(delivery.id);
      if (!res.success) {
        alert(res.error || "Failed to delete delivery.");
      }
    });
  };

  // Filtered deliveries
  const filteredDeliveries = deliveries.filter((d) => {
    const matchesSearch =
      d.deliveryNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.refNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
    const matchesWarehouse = warehouseFilter === "ALL" || d.warehouse === warehouseFilter;

    return matchesSearch && matchesStatus && matchesWarehouse;
  });

  const formOpen = !!selectedDeliveryForDetail || showDispatchModal;
  const closeAllForms = () => {
    setSelectedDeliveryForDetail(null);
    setShowDispatchModal(false);
  };
  useFullPageForm(formOpen, closeAllForms, "movement");

  return (
    <div className="space-y-4">
      <div className={formOpen ? "hidden" : "space-y-4"}>
      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Sales Deliveries</p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900">{total}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-600 rounded">
            <Package className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ready / Draft</p>
            <p className="text-base sm:text-lg font-extrabold text-amber-600">{ready}</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Out for Delivery</p>
            <p className="text-base sm:text-lg font-extrabold text-blue-600">{inTransit}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <Truck className="h-4 w-4 animate-pulse" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Delivered</p>
            <p className="text-base sm:text-lg font-extrabold text-teal-600">{delivered}</p>
          </div>
          <div className="p-2 bg-teal-50 text-teal-600 rounded">
            <CheckCircle className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed (Locked)</p>
            <p className="text-base sm:text-lg font-extrabold text-emerald-600">{completed}</p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded">
            <Lock className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2.5 bg-white p-3 border border-slate-200 rounded shadow-xs">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto flex-1">
          <div className="relative w-full lg:max-w-xs">
            <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search delivery ID, order, customer..."
              className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white min-h-[36px] sm:min-h-0"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-2 sm:py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none min-h-[36px] sm:min-h-0"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="READY_FOR_DISPATCH">READY FOR DISPATCH</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="OUT_FOR_DELIVERY">OUT FOR DELIVERY</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="DELIVERY_FAILED">DELIVERY FAILED</option>
              <option value="RESCHEDULED">RESCHEDULED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>

            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="flex-1 sm:flex-none px-2.5 py-2 sm:py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none min-h-[36px] sm:min-h-0"
            >
              <option value="ALL">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canEditStatus && (
          <button
            onClick={() => setShowDispatchModal(true)}
            className="flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition flex-shrink-0 min-h-[36px] sm:min-h-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Sales Dispatch</span>
          </button>
        )}
      </div>

      {/* Deliveries Table (Desktop >= 768px) */}
      <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
            <tr>
              <th className="px-3.5 py-3">Sales Delivery ID</th>
              <th className="px-3.5 py-3">Sales Order</th>
              <th className="px-3.5 py-3">Customer</th>
              <th className="px-3.5 py-3">Created By</th>
              <th className="px-3.5 py-3">Warehouse</th>
              <th className="px-3.5 py-3">Driver / Vehicle</th>
              <th className="px-3.5 py-3">Expected Date</th>
              <th className="px-3.5 py-3">Delivery Status</th>
              <th className="px-3.5 py-3">Completed By</th>
              <th className="px-3.5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredDeliveries.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-slate-400">
                  No active customer sales deliveries found.
                </td>
              </tr>
            ) : (
              filteredDeliveries.map((d) => {
                const isCompleted = d.status === "COMPLETED" || d.isLocked;

                return (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="px-3.5 py-3 font-mono font-bold text-slate-900">
                      <button
                        onClick={() => setSelectedDeliveryForDetail(d)}
                        className="text-blue-600 hover:underline font-mono font-bold text-left"
                        title="View Full Delivery Details & Audit"
                      >
                        {d.deliveryNo}
                      </button>
                    </td>
                    <td className="px-3.5 py-3 font-mono font-semibold text-slate-800">
                      {d.refNo}
                    </td>
                    <td className="px-3.5 py-3 font-medium text-slate-900">
                      <div>{d.partyName}</div>
                      {d.partyPhone && <div className="text-[11px] text-slate-400">{d.partyPhone}</div>}
                    </td>
                    <td className="px-3.5 py-3 text-slate-700">
                      <div className="flex items-center space-x-1.5">
                        <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                          {(d.createdByName || "U").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{d.createdByName || "Not recorded"}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-slate-600">{d.warehouse}</td>
                    <td className="px-3.5 py-3">
                      <div className="font-medium text-slate-800">{d.driverName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{d.vehicleNo}</div>
                    </td>
                    <td className="px-3.5 py-3 text-slate-600">{d.expectedDeliveryDate}</td>
                    <td className="px-3.5 py-3">
                      {isCompleted ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 space-x-1">
                          <Lock className="h-3 w-3" />
                          <span>COMPLETED</span>
                        </span>
                      ) : !canEditStatus ? (
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold border ${
                            d.status === "DELIVERED"
                              ? "bg-teal-50 text-teal-800 border-teal-200"
                              : d.status === "OUT_FOR_DELIVERY" || d.status === "DISPATCHED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          {d.status}
                        </span>
                      ) : (
                        <select
                          value={d.status}
                          disabled={isPending}
                          onChange={(e) => handleStatusChange(d, e.target.value)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border outline-none ${
                            d.status === "DELIVERED"
                              ? "bg-teal-50 text-teal-800 border-teal-200"
                              : d.status === "OUT_FOR_DELIVERY" || d.status === "DISPATCHED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                          <option value="DISPATCHED">DISPATCHED</option>
                          <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="DELIVERY_FAILED">DELIVERY_FAILED</option>
                          <option value="RESCHEDULED">RESCHEDULED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      {isCompleted ? (
                        <div className="space-y-0.5">
                          <div className="font-semibold text-emerald-800 text-xs">
                            {d.completedByName || "Not recorded"}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {d.completedAtFormatted || d.actualDeliveryDate || "—"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedDeliveryForDetail(d)}
                        title="View Full Delivery Details"
                        className="p-1 text-slate-400 hover:text-blue-600 transition"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEditStatus && !isCompleted && (
                        <button
                          onClick={() => handleDelete(d)}
                          title="Delete movement"
                          className="p-1 text-slate-400 hover:text-red-600 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Deliveries Card View (Mobile < 768px) */}
      <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filteredDeliveries.length === 0 ? (
          <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
            No active customer sales deliveries found.
          </div>
        ) : (
          filteredDeliveries.map((d) => {
            const isCompleted = d.status === "COMPLETED" || d.isLocked;

            return (
              <div key={d.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <button
                      onClick={() => setSelectedDeliveryForDetail(d)}
                      className="text-blue-600 hover:underline font-mono font-bold text-sm text-left block py-1.5 -my-1.5 pr-3"
                    >
                      {d.deliveryNo}
                    </button>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">Order: {d.refNo}</div>
                  </div>
                  {isCompleted ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 space-x-1 shrink-0">
                      <Lock className="h-3 w-3" />
                      <span>COMPLETED</span>
                    </span>
                  ) : !canEditStatus ? (
                    <span
                      className={`inline-flex px-2.5 py-1 rounded text-xs font-bold border shrink-0 ${
                        d.status === "DELIVERED"
                          ? "bg-teal-50 text-teal-800 border-teal-200"
                          : d.status === "OUT_FOR_DELIVERY" || d.status === "DISPATCHED"
                          ? "bg-blue-50 text-blue-800 border-blue-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      {d.status}
                    </span>
                  ) : (
                    <select
                      value={d.status}
                      disabled={isPending}
                      onChange={(e) => handleStatusChange(d, e.target.value)}
                      className={`px-2 py-1 rounded text-xs font-bold border outline-none min-h-[36px] ${
                        d.status === "DELIVERED"
                          ? "bg-teal-50 text-teal-800 border-teal-200"
                          : d.status === "OUT_FOR_DELIVERY" || d.status === "DISPATCHED"
                          ? "bg-blue-50 text-blue-800 border-blue-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
                      <option value="DISPATCHED">DISPATCHED</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                      <option value="DELIVERED">DELIVERED</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="DELIVERY_FAILED">DELIVERY_FAILED</option>
                      <option value="RESCHEDULED">RESCHEDULED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Customer</span>
                    <span className="font-semibold text-slate-900 block truncate">{d.partyName}</span>
                    {d.partyPhone && <span className="text-[11px] text-slate-500 block">{d.partyPhone}</span>}
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Warehouse</span>
                    <span className="text-slate-700 block truncate">{d.warehouse}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Driver & Vehicle</span>
                    <span className="font-medium text-slate-800 block truncate">{d.driverName}</span>
                    <span className="font-mono text-[11px] text-slate-500 block">{d.vehicleNo}</span>
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Expected Date</span>
                    <span className="text-slate-700 block">{d.expectedDeliveryDate || "—"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] uppercase font-bold text-slate-400">By:</span>
                    <span className="font-medium text-slate-800">{d.createdByName || "Not recorded"}</span>
                  </div>
                  {isCompleted && d.completedByName && (
                    <div className="text-[11px] text-emerald-800 font-medium">
                      Done by {d.completedByName}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedDeliveryForDetail(d)}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition min-h-[36px]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View Audit Details</span>
                  </button>
                  {canEditStatus && !isCompleted && (
                    <button
                      onClick={() => handleDelete(d)}
                      className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-semibold flex items-center justify-center transition min-h-[36px]"
                      title="Delete delivery"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      </div>

      {/* DETAIL DRAWER / MODAL */}
      {selectedDeliveryForDetail && (
        <div className="w-full max-w-3xl space-y-3">
          <button
            type="button"
            onClick={closeAllForms}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 min-h-[32px]"
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <div className="w-full flex flex-col">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Sales Delivery: {selectedDeliveryForDetail.deliveryNo}
                </h3>
                <p className="text-xs text-slate-500 font-mono">Sales Order: {selectedDeliveryForDetail.refNo}</p>
              </div>
              <button
                onClick={() => setSelectedDeliveryForDetail(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Employee Action & Audit Tracking Card */}
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg space-y-3 mb-6">
              <div className="flex items-center space-x-2 text-blue-900 font-bold border-b border-blue-100 pb-2">
                <User className="h-4 w-4 text-blue-600" />
                <span>Employee Action Audit</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-500">Created By</span>
                  <div className="font-semibold text-slate-900 text-xs mt-1">
                    {selectedDeliveryForDetail.createdByName || "Not recorded"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {selectedDeliveryForDetail.createdAtFormatted || selectedDeliveryForDetail.date}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-500">Completed By</span>
                  <div className="font-semibold text-emerald-800 text-xs mt-1">
                    {(selectedDeliveryForDetail.isLocked || selectedDeliveryForDetail.status === "COMPLETED")
                      ? (selectedDeliveryForDetail.completedByName || "Not recorded")
                      : "—"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {(selectedDeliveryForDetail.isLocked || selectedDeliveryForDetail.status === "COMPLETED")
                      ? (selectedDeliveryForDetail.completedAtFormatted || selectedDeliveryForDetail.actualDeliveryDate)
                      : "In progress"}
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Status Progression Timeline */}
            <div className="space-y-3 mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>Delivery Status Progression History</span>
              </h4>

              {(!selectedDeliveryForDetail.statusHistory || selectedDeliveryForDetail.statusHistory.length === 0) ? (
                <div className="p-3 bg-slate-50 border rounded text-slate-500 text-xs text-center">
                  Dispatch initiated from <strong>{selectedDeliveryForDetail.warehouse}</strong> on {selectedDeliveryForDetail.date}.
                </div>
              ) : (
                <div className="border rounded-md divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                  {selectedDeliveryForDetail.statusHistory.map((h: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-start justify-between hover:bg-white transition text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          {h.oldStatus && (
                            <>
                              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[11px] font-bold">
                                {h.oldStatus}
                              </span>
                              <span className="text-slate-400">→</span>
                            </>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                            h.newStatus === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {h.newStatus || h.status}
                          </span>
                        </div>
                        {h.notes && <p className="text-[11px] text-slate-500">{h.notes}</p>}
                      </div>

                      <div className="text-right">
                        <div className="font-semibold text-slate-800 text-[11px]">
                          {h.changedByName || h.userName || h.performedBy || "System"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {h.changedAt ? new Date(h.changedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Customer & Location */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-3 rounded border">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Customer Information</p>
                <p className="text-xs font-bold text-slate-900 mt-1">{selectedDeliveryForDetail.partyName}</p>
                {selectedDeliveryForDetail.partyPhone && (
                  <p className="text-xs text-slate-500 flex items-center space-x-1 mt-1">
                    <Phone className="h-3 w-3" />
                    <span>{selectedDeliveryForDetail.partyPhone}</span>
                  </p>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded border">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Driver & Vehicle</p>
                <p className="text-xs font-bold text-slate-900 mt-1">{selectedDeliveryForDetail.driverName}</p>
                <p className="text-xs font-mono text-slate-600">{selectedDeliveryForDetail.vehicleNo}</p>
                {selectedDeliveryForDetail.driverPhone && (
                  <p className="text-xs text-slate-500 mt-1">{selectedDeliveryForDetail.driverPhone}</p>
                )}
              </div>
            </div>

            {/* Destination */}
            <div className="bg-slate-50 p-3 rounded border mb-6">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Delivery Destination</p>
              <div className="flex items-start space-x-2 mt-1">
                <MapPin className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-800 font-medium">{selectedDeliveryForDetail.destination}</p>
              </div>
            </div>

            {/* Lock status banner */}
            {selectedDeliveryForDetail.isLocked || selectedDeliveryForDetail.status === "COMPLETED" ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center space-x-2">
                <Lock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <strong>Record Locked:</strong> This customer delivery was marked COMPLETED by{" "}
                  <strong>{selectedDeliveryForDetail.completedByName || "Warehouse Staff"}</strong>. Status editing is locked.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                Active sales delivery in progress.
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW SALES DISPATCH MODAL */}
      {showDispatchModal && (
        <div className="w-full max-w-3xl space-y-3">
          <button
            type="button"
            onClick={closeAllForms}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 min-h-[32px]"
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <div className="w-full">
            <div className="pb-3 mb-1 border-b border-slate-200 flex items-center">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Truck className="h-4 w-4 text-blue-600" />
                <span>Schedule Sales Delivery Dispatch</span>
              </h3>
            
            </div>

            <form onSubmit={handleCreateDispatch} className="pt-3 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Sales Order # *</label>
                  <input
                    type="text"
                    required
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="e.g. SO-000125"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. ABC Customer"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Customer Phone</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Driver Name *</label>
                  <input
                    type="text"
                    required
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Mani K"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Driver Phone</label>
                  <input
                    type="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="TN-23-AX-1234"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 uppercase min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Delivery Type</label>
                  <select
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value)}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  >
                    <option value="Own Vehicle">Own Vehicle</option>
                    <option value="Customer Pickup">Customer Pickup</option>
                    <option value="Transporter">Transporter</option>
                    <option value="Third Party Delivery">Third Party Delivery</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Warehouse *</label>
                  <SearchSelect
                    value={sourceWarehouse}
                    onChange={(v) => setSourceWarehouse(v)}
                    placeholder="Type to search warehouse"
                    options={warehouses.map((w) => ({ value: w, label: `${w}` }))}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Destination / City</label>
                  <input
                    type="text"
                    value={destOutlet}
                    onChange={(e) => setDestOutlet(e.target.value)}
                    placeholder="e.g. Katpadi Customer Site"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[36px] sm:min-h-0"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Notes / Instructions</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery handling instructions..."
                  rows={2}
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center space-x-1">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="pt-4 border-t flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border rounded text-slate-600 font-semibold min-h-[42px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50 min-h-[42px] sm:min-h-0"
                >
                  {isPending ? "Scheduling..." : "Schedule Sales Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
