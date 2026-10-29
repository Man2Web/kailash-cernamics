"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  ShoppingCart,
  Warehouse,
  CheckCircle,
  AlertCircle,
  Trash2,
  Lock,
  Eye,
} from "lucide-react";
import {
  createVendor,
  createPurchaseOrder,
  receivePurchaseOrderStock,
  updatePurchaseOrderStatus,
} from "@/app/(dashboard)/purchase/actions";
import ProductCombobox from "@/components/erp/ProductCombobox";
import type { ProductSearchOption } from "@/app/(dashboard)/products/search-actions";
import { useFullPageForm } from "@/lib/ui/use-full-page-form";
import SearchSelect from "@/components/erp/SearchSelect";

interface VendorRow {
  id: string;
  code: string;
  name: string;
  gstin: string;
  email: string;
  phone: string;
  outstandingAmt: number;
  billingAddress: string;
}

export interface PoItemRow {
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
  rate: number;
}

export interface PoRow {
  id: string;
  poNo: string;
  vendor: string;
  vendorPhone: string;
  branch: string;
  warehouseId: string;
  warehouseName: string;
  status: string;
  expectedDeliveryDate: string;
  actualDeliveryDate: string;
  driverName: string;
  driverPhone: string;
  vehicleNo: string;
  transporter: string;
  deliveryNotes: string;
  isLocked: boolean;
  date: string;
  items: PoItemRow[];
  createdByName?: string;
  createdAtFormatted?: string;
  receivedByName?: string;
  receivedAtFormatted?: string;
  completedByName?: string;
  completedAtFormatted?: string;
  statusHistory?: any[];
}

interface PurchaseClientProps {
  vendors: VendorRow[];
  purchaseOrders: PoRow[];
  branches: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  products: {
    id: string;
    name: string;
    sku: string;
    purchasePrice?: any;
    sellingPrice?: any;
    variants?: { id: string; name?: string; sku?: string }[];
  }[];
  isWarehouseManager?: boolean;
  canCreatePo?: boolean;
  canReceive?: boolean;
  assignedWarehouseId?: string;
  assignedWarehouseName?: string;
}

const PO_STATUS_STEPS = [
  "DRAFT",
  "APPROVED",
  "ORDERED",
  "IN_TRANSIT",
  "ARRIVED",
  "RECEIVING",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "COMPLETED",
];

export default function PurchaseClient({
  vendors,
  purchaseOrders,
  branches,
  warehouses,
  products,
  isWarehouseManager = false,
  canCreatePo = true,
  canReceive = true,
  assignedWarehouseId,
  assignedWarehouseName,
}: PurchaseClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pos" | "vendors">("pos");
  const [showPoForm, setShowPoForm] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [selectedPoForDetail, setSelectedPoForDetail] = useState<PoRow | null>(null);
  const [receivingPo, setReceivingPo] = useState<PoRow | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState("ALL");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Vendor Form States
  const [vName, setVName] = useState("");
  const [vCode, setVCode] = useState("");
  const [vGstin, setVGstin] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vAddr, setVAddr] = useState("");
  const [vCity, setVCity] = useState("");
  const [vState, setVState] = useState("");
  const [vPincode, setVPincode] = useState("");

  // PO Form States
  const [poVendorId, setPoVendorId] = useState(vendors[0]?.id || "");
  const [poWarehouseId, setPoWarehouseId] = useState(warehouses[0]?.id || "");
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poDriverName, setPoDriverName] = useState("");
  const [poDriverPhone, setPoDriverPhone] = useState("");
  const [poVehicleNo, setPoVehicleNo] = useState("");
  const [poTransporter, setPoTransporter] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poItems, setPoItems] = useState<{ variantId: string; quantity: number; rate: number }[]>([
    { variantId: "", quantity: 1, rate: 0 },
  ]);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName || !vCode) return;

    const address = vAddr
      ? { address: vAddr, city: vCity, state: vState, pincode: vPincode }
      : undefined;

    const res = await createVendor(vName, vCode, vGstin, vEmail, vPhone, address);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Supplier profile created successfully!");
      setVName("");
      setVCode("");
      setVGstin("");
      setVEmail("");
      setVPhone("");
      setVAddr("");
      setShowVendorForm(false);
      router.refresh();
    }
  };

  const handleAddItemRow = () => {
    setPoItems([...poItems, { variantId: "", quantity: 1, rate: 0 }]);
  };

  const handleRemoveItemRow = (idx: number) => {
    if (poItems.length === 1) return;
    setPoItems(poItems.filter((_, i) => i !== idx));
  };

  const [pickedLabels, setPickedLabels] = useState<Record<string, string>>({});
  const poVariantLabel = (variantId: string) => {
    if (!variantId) return "";
    for (const p of products) {
      const v = p.variants?.find((x) => x.id === variantId);
      if (v) return `${p.name} - ${v.name || v.sku || "Standard"}`;
    }
    return pickedLabels[variantId] || "";
  };

  const handleItemChange = (idx: number, field: string, val: any, picked?: ProductSearchOption) => {
    const updated = [...poItems];
    if (field === "variantId") {
      updated[idx].variantId = val;
      if (picked) setPickedLabels((m) => ({ ...m, [picked.variantId]: picked.label }));
      const prod = products.find((p) => p.variants?.some((v) => v.id === val) || p.id === val);
      if (prod) {
        updated[idx].rate = Number(prod.purchasePrice || 0);
      } else if (picked) {
        updated[idx].rate = Number(picked.purchasePrice || 0);
      }
    } else if (field === "quantity") {
      updated[idx].quantity = Math.max(1, Number(val));
    } else if (field === "rate") {
      updated[idx].rate = Math.max(0, Number(val));
    }
    setPoItems(updated);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poVendorId || !poWarehouseId) {
      showMsg("Please select both Supplier and Warehouse.", "error");
      return;
    }

    const validItems = poItems.filter((i) => i.variantId && i.quantity > 0);
    if (validItems.length === 0) {
      showMsg("Please add at least one product with quantity > 0.", "error");
      return;
    }

    startTransition(async () => {
      const res = await createPurchaseOrder({
        vendorId: poVendorId,
        warehouseId: poWarehouseId,
        items: validItems,
        expectedDeliveryDate: poExpectedDate,
        driverName: poDriverName,
        driverPhone: poDriverPhone,
        vehicleNo: poVehicleNo,
        transporter: poTransporter,
        notes: poNotes,
      });

      if (res.error) showMsg(res.error, "error");
      else {
        showMsg("Purchase Order created and delivery tracking initialized!");
        setShowPoForm(false);
        setPoItems([{ variantId: "", quantity: 1, rate: 0 }]);
        setPoExpectedDate("");
        setPoDriverName("");
        setPoDriverPhone("");
        setPoVehicleNo("");
        setPoTransporter("");
        setPoNotes("");
        router.refresh();
      }
    });
  };

  const handleOpenReceiveModal = (po: PoRow) => {
    if (po.isLocked || po.status === "COMPLETED") {
      alert("This Purchase Order is COMPLETED and locked.");
      return;
    }

    const initialRec: Record<string, number> = {};
    po.items.forEach((item) => {
      initialRec[item.variantId] = item.pendingQty > 0 ? item.pendingQty : 0;
    });

    setReceivingPo(po);
    setReceiveQuantities(initialRec);
    setReceiveNotes("");
  };

  const handleSubmitReceiving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;

    startTransition(async () => {
      const res = await receivePurchaseOrderStock({
        poId: receivingPo.id,
        warehouseId: receivingPo.warehouseId || assignedWarehouseId || warehouses[0]?.id,
        receivedQuantities: receiveQuantities,
        notes: receiveNotes,
      });

      if (res.error) {
        showMsg(res.error, "error");
      } else {
        showMsg(
          res.newStatus === "COMPLETED"
            ? "All goods received! Purchase Order marked COMPLETED and locked. Warehouse stock increased."
            : "Goods receipt confirmed. Status updated to PARTIALLY_RECEIVED. Warehouse stock increased."
        );
        setReceivingPo(null);
        router.refresh();
      }
    });
  };

  const handleStatusTransition = (po: PoRow, newStatus: string) => {
    if (po.isLocked || po.status === "COMPLETED") {
      alert("This Purchase Order is COMPLETED and permanently locked.");
      return;
    }

    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, newStatus);
      if (res.error) showMsg(res.error, "error");
      else {
        showMsg(`Purchase Order status updated to ${newStatus}.`);
        router.refresh();
      }
    });
  };

  const filteredPos = purchaseOrders.filter((po) => {
    const matchesSearch =
      po.poNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.warehouseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || po.status === statusFilter;
    const matchesWarehouse = warehouseFilter === "ALL" || po.warehouseName === warehouseFilter;

    return matchesSearch && matchesStatus && matchesWarehouse;
  });

  const formOpen = !!selectedPoForDetail || !!receivingPo || showPoForm || showVendorForm;
  const closeAllForms = () => {
    setSelectedPoForDetail(null);
    setReceivingPo(null);
    setShowPoForm(false);
    setShowVendorForm(false);
  };
  useFullPageForm(formOpen, closeAllForms, "purchase");

  return (
    <div className="space-y-4">
      <div className={formOpen ? "hidden" : "space-y-4"}>
      {message && (
        <div
          className={`p-3 rounded text-xs flex items-center space-x-2 animate-in fade-in duration-200 ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
          )}
          <span className="font-semibold">{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => setActiveTab("pos")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "pos"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Purchase Orders & Delivery Status ({purchaseOrders.length})</span>
        </button>

        {!isWarehouseManager && (
          <button
            onClick={() => setActiveTab("vendors")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
              activeTab === "vendors"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Suppliers / Vendors ({vendors.length})</span>
          </button>
        )}
      </div>

      {activeTab === "pos" ? (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2.5 bg-white p-3 border border-slate-200 rounded shadow-xs">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO #, supplier, warehouse..."
                className="pl-3 pr-4 py-2 sm:py-1.5 border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white w-full sm:w-64 min-h-[36px] sm:min-h-0"
              />

              <div className="flex gap-2">
                <SearchSelect
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v)}
                  placeholder="Type to search"
                  options={[{ value: "ALL", label: "All Statuses" }, ...PO_STATUS_STEPS.map((s) => ({ value: s, label: `${s}` })), { value: "CANCELLED", label: "CANCELLED" }]}
                  className="flex-1 sm:flex-none px-2.5 py-2 sm:py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none min-h-[36px] sm:min-h-0"
                />

                {!isWarehouseManager && (
                  <SearchSelect
                    value={warehouseFilter}
                    onChange={(v) => setWarehouseFilter(v)}
                    placeholder="Type to search"
                    options={[{ value: "ALL", label: "All Warehouses" }, ...warehouses.map((w) => ({ value: w.name, label: `${w.name}` }))]}
                    className="flex-1 sm:flex-none px-2.5 py-2 sm:py-1.5 border border-slate-200 rounded-sm text-xs text-slate-700 bg-slate-50 focus:outline-none min-h-[36px] sm:min-h-0"
                  />
                )}
              </div>
            </div>

            {!isWarehouseManager && canCreatePo && (
              <button
                onClick={() => setShowPoForm(true)}
                className="flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition flex-shrink-0 cursor-pointer min-h-[36px] sm:min-h-0"
              >
                <Plus className="h-4 w-4" />
                <span>Create Purchase Order</span>
              </button>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3.5 py-3">PO Number</th>
                  <th className="px-3.5 py-3">Supplier</th>
                  <th className="px-3.5 py-3">Created By</th>
                  <th className="px-3.5 py-3">Receiving Warehouse</th>
                  <th className="px-3.5 py-3">Driver / Vehicle</th>
                  <th className="px-3.5 py-3">Expected Date</th>
                  <th className="px-3.5 py-3">Delivery Status</th>
                  <th className="px-3.5 py-3">Receiving Progress</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400">
                      No Purchase Orders found.
                    </td>
                  </tr>
                ) : (
                  filteredPos.map((po) => {
                    const totalOrdered = po.items.reduce((acc, i) => acc + i.orderedQty, 0);
                    const totalReceived = po.items.reduce((acc, i) => acc + i.receivedQty, 0);
                    const totalPending = po.items.reduce((acc, i) => acc + i.pendingQty, 0);
                    const isCompleted = po.status === "COMPLETED" || po.isLocked;

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/50">
                        <td className="px-3.5 py-3 font-mono font-bold text-slate-900">
                          <button
                            onClick={() => setSelectedPoForDetail(po)}
                            className="text-blue-600 hover:underline font-mono font-bold text-left cursor-pointer"
                            title="View PO Details & Audit Log"
                          >
                            {po.poNo}
                          </button>
                        </td>
                        <td className="px-3.5 py-3 font-medium text-slate-900">
                          <div>{po.vendor}</div>
                          {po.vendorPhone && <div className="text-[11px] text-slate-400">{po.vendorPhone}</div>}
                        </td>
                        <td className="px-3.5 py-3 text-slate-700">
                          <div className="flex items-center space-x-1.5">
                            <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                              {(po.createdByName || "U").charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800">{po.createdByName || "Not recorded"}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-slate-700 font-medium">
                          {po.warehouseName}
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="font-semibold text-slate-800">{po.driverName}</div>
                          <div className="text-[11px] font-mono text-slate-500">{po.vehicleNo}</div>
                        </td>
                        <td className="px-3.5 py-3 text-slate-600">
                          {po.expectedDeliveryDate}
                        </td>
                        <td className="px-3.5 py-3">
                          {isCompleted ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 space-x-1">
                              <Lock className="h-3 w-3" />
                              <span>COMPLETED (LOCKED)</span>
                            </span>
                          ) : (
                            <SearchSelect
                              value={po.status}
                              onChange={(v) => handleStatusTransition(po, v)}
                              disabled={isPending}
                              placeholder="Type to search"
                              options={[{ value: "DRAFT", label: "DRAFT" }, { value: "APPROVED", label: "APPROVED" }, { value: "ORDERED", label: "ORDERED" }, { value: "IN_TRANSIT", label: "IN_TRANSIT" }, { value: "ARRIVED", label: "ARRIVED" }, { value: "RECEIVING", label: "RECEIVING" }, { value: "PARTIALLY_RECEIVED", label: "PARTIALLY_RECEIVED" }, { value: "RECEIVED", label: "RECEIVED" }, { value: "COMPLETED", label: "COMPLETED" }, { value: "CANCELLED", label: "CANCELLED" }]}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border outline-none ${
                                po.status === "PARTIALLY_RECEIVED"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : po.status === "IN_TRANSIT" || po.status === "ARRIVED"
                                  ? "bg-blue-50 text-blue-800 border-blue-200"
                                  : "bg-slate-50 text-slate-700 border-slate-200"
                              }`}
                            />
                          )}
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-900">
                              {totalReceived} / {totalOrdered}
                            </span>
                            {totalPending > 0 ? (
                              <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold border border-amber-200">
                                {totalPending} pending
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                                Full
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 text-right space-x-2">
                          <button
                            onClick={() => setSelectedPoForDetail(po)}
                            title="View PO Details & Timeline"
                            className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {!isCompleted && canReceive && (
                            <button
                              onClick={() => handleOpenReceiveModal(po)}
                              title="Receive Goods into Warehouse Stock"
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition cursor-pointer"
                            >
                              Receive Stock
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

          {/* Mobile Cards View */}
          <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredPos.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No Purchase Orders found.
              </div>
            ) : (
              filteredPos.map((po) => {
                const totalOrdered = po.items.reduce((acc, i) => acc + i.orderedQty, 0);
                const totalReceived = po.items.reduce((acc, i) => acc + i.receivedQty, 0);
                const totalPending = po.items.reduce((acc, i) => acc + i.pendingQty, 0);
                const isCompleted = po.status === "COMPLETED" || po.isLocked;

                return (
                  <div key={po.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                    <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                      <div className="min-w-0">
                        <button
                          onClick={() => setSelectedPoForDetail(po)}
                          className="text-blue-600 hover:underline font-mono font-bold text-sm text-left block py-1.5 -my-1.5 pr-3"
                        >
                          {po.poNo}
                        </button>
                        <div className="text-[11px] text-slate-400 mt-0.5">{po.date}</div>
                      </div>
                      {isCompleted ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 space-x-1 shrink-0">
                          <Lock className="h-3 w-3" />
                          <span>COMPLETED</span>
                        </span>
                      ) : (
                        <SearchSelect
                          value={po.status}
                          onChange={(v) => handleStatusTransition(po, v)}
                          disabled={isPending}
                          placeholder="Type to search"
                          options={[{ value: "DRAFT", label: "DRAFT" }, { value: "APPROVED", label: "APPROVED" }, { value: "ORDERED", label: "ORDERED" }, { value: "IN_TRANSIT", label: "IN_TRANSIT" }, { value: "ARRIVED", label: "ARRIVED" }, { value: "RECEIVING", label: "RECEIVING" }, { value: "PARTIALLY_RECEIVED", label: "PARTIALLY_RECEIVED" }, { value: "RECEIVED", label: "RECEIVED" }, { value: "COMPLETED", label: "COMPLETED" }, { value: "CANCELLED", label: "CANCELLED" }]}
                          className={`px-2 py-1 rounded text-xs font-bold border outline-none min-h-[36px] ${
                            po.status === "PARTIALLY_RECEIVED"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : po.status === "IN_TRANSIT" || po.status === "ARRIVED"
                              ? "bg-blue-50 text-blue-800 border-blue-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[11px] uppercase font-bold text-slate-400 block">Supplier</span>
                        <span className="font-semibold text-slate-900 block truncate">{po.vendor}</span>
                        {po.vendorPhone && <span className="text-[11px] text-slate-500 block">{po.vendorPhone}</span>}
                      </div>
                      <div>
                        <span className="text-[11px] uppercase font-bold text-slate-400 block">Warehouse</span>
                        <span className="text-slate-700 block truncate">{po.warehouseName}</span>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase font-bold text-slate-400 block">Driver & Truck</span>
                        <span className="font-medium text-slate-800 block truncate">{po.driverName}</span>
                        <span className="font-mono text-[11px] text-slate-500 block">{po.vehicleNo}</span>
                      </div>
                      <div>
                        <span className="text-[11px] uppercase font-bold text-slate-400 block">Receiving Progress</span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="font-bold text-slate-900">{totalReceived}/{totalOrdered}</span>
                          {totalPending > 0 ? (
                            <span className="text-[11px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded font-bold border border-amber-200">
                              {totalPending} left
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-bold border border-emerald-200">
                              Full
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] uppercase font-bold text-slate-400">Created:</span>
                        <span className="font-medium text-slate-800">{po.createdByName || "Not recorded"}</span>
                      </div>
                      {po.expectedDeliveryDate && (
                        <div className="text-[11px] text-slate-500">
                          Due: {po.expectedDeliveryDate}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => setSelectedPoForDetail(po)}
                        className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition min-h-[36px]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Audit Details</span>
                      </button>
                      {!isCompleted && canReceive && (
                        <button
                          onClick={() => handleOpenReceiveModal(po)}
                          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition min-h-[36px]"
                        >
                          <Warehouse className="h-3.5 w-3.5" />
                          <span>Receive Stock</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 bg-white p-3 border border-slate-200 rounded shadow-xs">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Supplier Directory
            </h3>
            <button
              onClick={() => setShowVendorForm(true)}
              className="flex items-center justify-center space-x-1 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold cursor-pointer min-h-[36px] sm:min-h-0"
            >
              <Plus className="h-4 w-4" />
              <span>Register Supplier</span>
            </button>
          </div>

          {/* Desktop Table */}
          <div className="hidden sm:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3.5 py-3">Code</th>
                  <th className="px-3.5 py-3">Supplier Name</th>
                  <th className="px-3.5 py-3">GSTIN</th>
                  <th className="px-3.5 py-3">Email / Phone</th>
                  <th className="px-3.5 py-3">Billing Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {vendors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400">
                      No suppliers registered.
                    </td>
                  </tr>
                ) : (
                  vendors.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/50">
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900">{v.code}</td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900">{v.name}</td>
                      <td className="px-3.5 py-3 font-mono text-slate-600">{v.gstin}</td>
                      <td className="px-3.5 py-3">
                        <div>{v.email}</div>
                        <div className="text-[11px] text-slate-400">{v.phone}</div>
                      </td>
                      <td className="px-3.5 py-3 text-slate-600">{v.billingAddress}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {vendors.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No suppliers registered.
              </div>
            ) : (
              vendors.map((v) => (
                <div key={v.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-2 text-xs">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{v.name}</h4>
                      <span className="font-mono text-slate-500 text-[11px]">{v.code}</span>
                    </div>
                    {v.gstin && (
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {v.gstin}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Contact</span>
                    <span className="text-slate-800 block">{v.email || "—"}</span>
                    {v.phone && <span className="text-slate-600 block">{v.phone}</span>}
                  </div>
                  {v.billingAddress && (
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Address</span>
                      <span className="text-slate-600 block text-[11px]">{v.billingAddress}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      </div>

      {/* PO DETAIL & DELIVERY STATUS DRAWER */}
      {selectedPoForDetail && (
        <div className="w-full max-w-4xl space-y-3">
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
                  Purchase Order: {selectedPoForDetail.poNo}
                </h3>
                <p className="text-xs text-slate-500">Supplier: {selectedPoForDetail.vendor}</p>
              </div>
              <button
                onClick={() => setSelectedPoForDetail(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Employee Action & Audit Card */}
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg space-y-3 mb-6">
              <div className="flex items-center space-x-2 text-blue-900 font-bold border-b border-blue-100 pb-2 text-xs">
                <Users className="h-4 w-4 text-blue-600" />
                <span>Employee Action Audit</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-500">Created By</span>
                  <div className="font-semibold text-slate-900 mt-1">
                    {selectedPoForDetail.createdByName || "Not recorded"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {selectedPoForDetail.createdAtFormatted || selectedPoForDetail.date}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-500">Received By</span>
                  <div className="font-semibold text-slate-900 mt-1">
                    {selectedPoForDetail.receivedByName || "Not recorded"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {selectedPoForDetail.receivedAtFormatted || "—"}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-500">Completed By</span>
                  <div className="font-semibold text-emerald-800 mt-1">
                    {(selectedPoForDetail.isLocked || selectedPoForDetail.status === "COMPLETED")
                      ? (selectedPoForDetail.completedByName || "Not recorded")
                      : "—"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {(selectedPoForDetail.isLocked || selectedPoForDetail.status === "COMPLETED")
                      ? (selectedPoForDetail.completedAtFormatted || selectedPoForDetail.actualDeliveryDate)
                      : "In progress"}
                  </div>
                </div>
              </div>
            </div>

            {/* Inbound Delivery & Status History */}
            <div className="space-y-2 mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Inbound Delivery & Receiving Status History
              </h4>

              {(!selectedPoForDetail.statusHistory || selectedPoForDetail.statusHistory.length === 0) ? (
                <div className="bg-slate-50 p-4 rounded border text-xs text-slate-500 text-center">
                  PO created on {selectedPoForDetail.date} by {selectedPoForDetail.createdByName || "Not recorded"}.
                </div>
              ) : (
                <div className="border rounded divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                  {selectedPoForDetail.statusHistory.map((h: any, idx: number) => (
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
                            h.newStatus === "COMPLETED" || h.status === "COMPLETED"
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
                          {h.changedAt || h.timestamp ? new Date(h.changedAt || h.timestamp).toLocaleString("en-IN") : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-50 p-3 rounded border">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Receiving Warehouse</p>
                <p className="text-xs font-bold text-slate-900 mt-1">{selectedPoForDetail.warehouseName}</p>
                <p className="text-[11px] text-slate-500">Expected: {selectedPoForDetail.expectedDeliveryDate}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded border">
                <p className="text-[11px] font-bold text-slate-400 uppercase">Logistics & Driver</p>
                <p className="text-xs font-bold text-slate-900 mt-1">{selectedPoForDetail.driverName}</p>
                <p className="text-[11px] font-mono text-slate-600">{selectedPoForDetail.vehicleNo}</p>
                {selectedPoForDetail.driverPhone && (
                  <p className="text-[11px] text-slate-500">{selectedPoForDetail.driverPhone}</p>
                )}
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Products & Receiving Breakdown (Pending = Ordered - Received)
              </h4>
              {/* Desktop Breakdown Table */}
              <div className="hidden sm:block bg-white border border-slate-200 rounded overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {selectedPoForDetail.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">{item.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{item.orderedQty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600">{item.receivedQty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-600">{item.pendingQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Breakdown Cards */}
              <div className="sm:hidden space-y-2">
                {selectedPoForDetail.items.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 p-2.5 border border-slate-200 rounded-md space-y-1.5 text-xs">
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <div className="text-[11px] font-mono text-slate-400">{item.sku}</div>
                    <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200/60 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Ordered</span>
                        <span className="font-semibold text-slate-800">{item.orderedQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-600 uppercase font-bold block">Received</span>
                        <span className="font-semibold text-emerald-700">{item.receivedQty}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-amber-600 uppercase font-bold block">Pending</span>
                        <span className="font-semibold text-amber-700">{item.pendingQty}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedPoForDetail.isLocked || selectedPoForDetail.status === "COMPLETED" ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center space-x-2">
                <Lock className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>
                  <strong>Record Locked:</strong> This Purchase Order is COMPLETED and locked against normal status modifications.
                </span>
              </div>
            ) : (
              <div className="pt-4 border-t flex justify-end">
                <button
                  onClick={() => {
                    const po = selectedPoForDetail;
                    setSelectedPoForDetail(null);
                    handleOpenReceiveModal(po);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  Receive Stock for This PO
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECEIVE GOODS MODAL */}
      {receivingPo && (
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
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Warehouse className="h-4 w-4 text-emerald-600" />
                  <span>Receive Purchase Goods: {receivingPo.poNo}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Target Warehouse: {receivingPo.warehouseName}
                </p>
              </div>
            
            </div>

            <form onSubmit={handleSubmitReceiving} className="pt-3 space-y-4 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-blue-900">
                <p className="font-semibold text-xs mb-1">Inbound Stock Confirmation</p>
                <p className="text-[11px] text-blue-700">
                  Specify the quantity received in this shipment. Physical warehouse stock will increase and a <strong>PURCHASE_RECEIPT</strong> stock movement will be logged.
                </p>
              </div>

              <div className="space-y-3 max-h-64 pr-1">
                {receivingPo.items.map((item) => (
                  <div key={item.variantId} className="p-3 border rounded bg-slate-50 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-[11px] font-mono text-slate-400">{item.sku}</p>
                      </div>
                      <div className="text-right text-[11px]">
                        <span className="text-slate-500">Ordered: {item.orderedQty} | </span>
                        <span className="text-emerald-600 font-semibold">Prev Rec: {item.receivedQty}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                      <label className="font-semibold text-slate-700">
                        Qty Receiving Now (Pending: {item.pendingQty}):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={item.pendingQty}
                        value={receiveQuantities[item.variantId] || 0}
                        onChange={(e) =>
                          setReceiveQuantities({
                            ...receiveQuantities,
                            [item.variantId]: Math.min(item.pendingQty, Math.max(0, Number(e.target.value))),
                          })
                        }
                        className="w-24 p-1.5 border rounded text-right font-bold text-xs focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Receiving Remarks / Notes</label>
                <textarea
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="e.g. Verified 100 boxes in good condition, unloaded at Bay 2"
                  rows={2}
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setReceivingPo(null)}
                  className="px-4 py-2 border rounded text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Updating Stock..." : "Confirm & Increase Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PO MODAL */}
      {showPoForm && (
        <div className="w-full max-w-4xl space-y-3">
          <button
            type="button"
            onClick={closeAllForms}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 min-h-[32px]"
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <div className="w-full flex flex-col">
            <div className="pb-3 mb-1 border-b border-slate-200 flex items-center">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <span>Create Purchase Order</span>
              </h3>
            
            </div>

            <form onSubmit={handleCreatePo} className="pt-3 space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Supplier / Vendor *</label>
                  <SearchSelect
                    value={poVendorId}
                    onChange={(v) => setPoVendorId(v)}
                    required
                    placeholder="Type to search supplier"
                    options={vendors.map((v) => ({ value: v.id, label: `${v.name} (${v.code})` }))}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Receiving Warehouse *</label>
                  <SearchSelect
                    value={poWarehouseId}
                    onChange={(v) => setPoWarehouseId(v)}
                    required
                    placeholder="Type to search warehouse"
                    options={warehouses.map((w) => ({ value: w.id, label: `${w.name}` }))}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPoExpectedDate(e.target.value)}
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Driver Name</label>
                  <input
                    type="text"
                    value={poDriverName}
                    onChange={(e) => setPoDriverName(e.target.value)}
                    placeholder="e.g. Inbound Driver"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Vehicle / Truck No</label>
                  <input
                    type="text"
                    value={poVehicleNo}
                    onChange={(e) => setPoVehicleNo(e.target.value)}
                    placeholder="e.g. TN-23-BX-9988"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-800">Order Line Items *</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded border">
                      <ProductCombobox
                        className="w-full sm:flex-1 sm:min-w-[200px]"
                        required
                        value={item.variantId}
                        valueLabel={poVariantLabel(item.variantId)}
                        onChange={(o) => handleItemChange(idx, "variantId", o?.variantId || "", o || undefined)}
                      />

                      <div className="flex-1 sm:flex-none sm:w-24">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                          placeholder="Qty"
                          className="w-full p-1.5 border rounded text-right text-xs bg-white"
                        />
                      </div>

                      <div className="flex-1 sm:flex-none sm:w-28">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={item.rate}
                          onChange={(e) => handleItemChange(idx, "rate", e.target.value)}
                          placeholder="Rate ₹"
                          className="w-full p-1.5 border rounded text-right text-xs bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        disabled={poItems.length === 1}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Delivery Notes</label>
                <textarea
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  placeholder="Inbound shipment notes and instructions..."
                  rows={2}
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPoForm(false)}
                  className="px-4 py-2 border rounded text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Creating PO..." : "Create Purchase Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGISTER VENDOR MODAL */}
      {showVendorForm && (
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
                <Users className="h-4 w-4 text-blue-600" />
                <span>Register Supplier / Vendor</span>
              </h3>
            
            </div>

            <form onSubmit={handleCreateVendor} className="pt-3 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="e.g. ABC Timber Suppliers"
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Supplier Code *</label>
                  <input
                    type="text"
                    required
                    value={vCode}
                    onChange={(e) => setVCode(e.target.value)}
                    placeholder="SUP-001"
                    className="w-full p-2 border rounded text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">GSTIN</label>
                  <input
                    type="text"
                    value={vGstin}
                    onChange={(e) => setVGstin(e.target.value)}
                    placeholder="33AAAAA0000A1Z5"
                    className="w-full p-2 border rounded text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    placeholder="supplier@example.com"
                    className="w-full p-2 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={vPhone}
                    onChange={(e) => setVPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full p-2 border rounded text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Address</label>
                <input
                  type="text"
                  value={vAddr}
                  onChange={(e) => setVAddr(e.target.value)}
                  placeholder="Plot 10, Industrial Estate"
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowVendorForm(false)}
                  className="px-4 py-2 border rounded text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold cursor-pointer"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
