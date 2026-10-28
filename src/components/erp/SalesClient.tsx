"use client";

import React, { useState, useTransition } from "react";
import {
  ShoppingCart,
  Receipt,
  FileSpreadsheet,
  BookmarkCheck,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  Truck,
  User,
  MapPin,
  Calendar,
  XCircle,
  FileCheck,
  QrCode,
} from "lucide-react";
import {
  createSalesOrder,
  updateSalesOrderStatus,
  convertQuotationToOrder,
  createSalesDeliveryAction,
  createCustomerAction,
  releaseReservationAction,
} from "@/app/(dashboard)/sales/actions";
import ProductQrScanner from "@/components/erp/ProductQrScanner";

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  customer: string;
  date: string;
  dueDate: string;
  type: string;
  payable: number;
  status: string;
  paymentStatus: string;
  branch: string;
  outlet: string;
}

interface OrderRow {
  id: string;
  orderNo: string;
  customerId: string;
  customer: string;
  phone?: string;
  date: string;
  status: string;
  branch: string;
  outlet: string;
  items?: any[];
  createdBy?: string;
  createdAtFormatted?: string;
  lastUpdatedBy?: string;
  lastUpdatedAtFormatted?: string;
  statusHistory?: any[];
}

interface QuotationRow {
  id: string;
  quotationNo: string;
  customer: string;
  date: string;
  validUntil: string;
  status: string;
}

interface ReservationRow {
  id: string;
  transactionNo: string;
  salesOrderId: string;
  orderNo: string;
  customerName: string;
  productName: string;
  warehouseName: string;
  quantity: number;
  reservedDate: string;
  expectedPickupDate: string;
  expiryDate: string;
  status: "ACTIVE" | "FULFILLED" | "CANCELLED" | "EXPIRED";
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  variants: Array<{ id: string; name: string; sku: string }>;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

interface WarehouseOption {
  id: string;
  name: string;
}

interface SalesClientProps {
  invoices?: InvoiceRow[];
  orders: OrderRow[];
  quotations?: QuotationRow[];
  reservations: ReservationRow[];
  products: ProductOption[];
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  branches: Array<{ id: string; name: string }>;
  outlets: Array<{ id: string; name: string }>;
  canDispatch?: boolean;
  isSalesPerson?: boolean;
  isWarehouseManager?: boolean;
}

export default function SalesClient({
  invoices = [],
  orders = [],
  quotations = [],
  reservations = [],
  products = [],
  customers = [],
  warehouses = [],
  branches = [],
  outlets = [],
  canDispatch = true,
  isSalesPerson = false,
  isWarehouseManager = false,
}: SalesClientProps) {
  const [activeTab, setActiveTab] = useState<"orders" | "reservations">("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modals
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<OrderRow | null>(null);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<OrderRow | null>(null);

  // Customer List State (to support newly added customers dynamically)
  const [customerList, setCustomerList] = useState<CustomerOption[]>(customers);

  // Customer Form State
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAltPhone, setNewCustAltPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustDeliveryAddress, setNewCustDeliveryAddress] = useState("");
  const [newCustNotes, setNewCustNotes] = useState("");

  const handleSelectScannedProduct = (scannedData: any) => {
    const scannedProd = scannedData.product;
    if (!scannedProd) return;

    let matchedVariantId = "";
    for (const p of products) {
      if (p.id === scannedProd.id) {
        matchedVariantId = p.variants[0]?.id || "";
        break;
      }
    }

    if (matchedVariantId) {
      const emptyIdx = orderItems.findIndex((it) => !it.variantId);
      const newItems = [...orderItems];
      const newItem = {
        variantId: matchedVariantId,
        productId: scannedProd.id,
        quantity: 1,
        rate: Number(scannedProd.sellingPrice || 0),
        discount: 0,
      };

      if (emptyIdx >= 0) {
        newItems[emptyIdx] = newItem;
      } else {
        newItems.push(newItem);
      }
      setOrderItems(newItems);

      if (scannedData.inventory?.warehouses) {
        const warehouseWithStock = scannedData.inventory.warehouses.find((w: any) => w.available > 0);
        if (warehouseWithStock && warehouses.some((w) => w.id === warehouseWithStock.warehouseId)) {
          setSelectedWarehouseId(warehouseWithStock.warehouseId);
        }
      }

      setSuccessMsg(`Product "${scannedProd.name}" added to sales order via QR scan!`);
    } else {
      setSuccessMsg(`Scanned: ${scannedProd.name} (Code: ${scannedProd.code})`);
    }

    setShowScannerModal(false);
    setShowCreateOrderModal(true);
  };

  // Form State for Sales Order
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouses[0]?.id || "");
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || "");
  const [selectedOutletId, setSelectedOutletId] = useState(outlets[0]?.id || "");
  const [orderItems, setOrderItems] = useState<Array<{ variantId: string; productId: string; quantity: number; rate: number; discount: number }>>([
    { variantId: "", productId: "", quantity: 1, rate: 0, discount: 0 },
  ]);
  const [isReserved, setIsReserved] = useState(false);
  const [expectedPickupDate, setExpectedPickupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split("T")[0];
  });
  const [reservationExpiryDate, setReservationExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  });
  const [orderNotes, setOrderNotes] = useState("");

  // Dispatch Form State
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryType, setDeliveryType] = useState("Own Vehicle");

  // Notifications
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleAddItem = () => {
    setOrderItems([...orderItems, { variantId: "", productId: "", quantity: 1, rate: 0, discount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, variantId: string) => {
    const newItems = [...orderItems];
    let matchedProduct: ProductOption | undefined;
    for (const p of products) {
      if (p.variants.some((v) => v.id === variantId)) {
        matchedProduct = p;
        break;
      }
    }
    newItems[index] = {
      ...newItems[index],
      variantId,
      productId: matchedProduct?.id || "",
      rate: Number(matchedProduct?.sellingPrice || 0),
    };
    setOrderItems(newItems);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedCustomerId) {
      setErrorMsg("Please select a customer.");
      return;
    }

    const validItems = orderItems.filter((item) => item.variantId && item.quantity > 0);
    if (validItems.length === 0) {
      setErrorMsg("Please add at least one product with quantity > 0.");
      return;
    }

    startTransition(async () => {
      const res = await createSalesOrder({
        customerId: selectedCustomerId,
        branchId: selectedBranchId || branches[0]?.id,
        outletId: selectedOutletId || outlets[0]?.id,
        warehouseId: selectedWarehouseId,
        items: validItems,
        isReserved,
        expectedPickupDate,
        expiryDate: reservationExpiryDate,
        notes: orderNotes,
      });

      if (res.success) {
        setSuccessMsg(
          isReserved
            ? `Sales Order & Stock Reservation created successfully! Order: ${res.data?.orderNo}`
            : `Sales Order created successfully! Order: ${res.data?.orderNo}`
        );
        setShowCreateOrderModal(false);
        setOrderItems([{ variantId: "", productId: "", quantity: 1, rate: 0, discount: 0 }]);
        setIsReserved(false);
        setOrderNotes("");
      } else {
        setErrorMsg(res.error || "Failed to create sales order.");
      }
    });
  };

  const handleUpdateOrderStatus = (orderId: string, status: string) => {
    startTransition(async () => {
      const res = await updateSalesOrderStatus(orderId, status);
      if (!res.success) {
        alert(res.error || "Failed to update order status.");
      }
    });
  };

  const handleConvertQuotation = (qId: string) => {
    if (branches.length === 0 || outlets.length === 0) {
      alert("Cannot convert: No active branches/outlets configured.");
      return;
    }
    startTransition(async () => {
      const res = await convertQuotationToOrder(qId, branches[0].id, outlets[0].id);
      if (res.success) {
        setSuccessMsg("Quotation successfully converted to Sales Order!");
      } else {
        setErrorMsg(res.error || "Failed to convert quotation.");
      }
    });
  };

  const handleCreateDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDispatch) return;
    setErrorMsg("");
    setSuccessMsg("");

    startTransition(async () => {
      const res = await createSalesDeliveryAction({
        salesOrderId: selectedOrderForDispatch.id,
        customerId: selectedOrderForDispatch.customerId,
        customerName: selectedOrderForDispatch.customer,
        customerPhone: selectedOrderForDispatch.phone || "",
        deliveryAddress,
        driverName,
        driverPhone,
        vehicleNo,
        sourceWarehouse: warehouses[0]?.name || "Main Warehouse",
        destOutlet: selectedOrderForDispatch.outlet || "Customer Address",
        deliveryType,
      });

      if (res.success) {
        setSuccessMsg("Sales dispatch scheduled successfully!");
        setShowDispatchModal(false);
        setSelectedOrderForDispatch(null);
      } else {
        setErrorMsg(res.error || "Failed to schedule dispatch.");
      }
    });
  };

  const handleReleaseReservation = (transactionId: string) => {
    if (!confirm("Are you sure you want to release this stock reservation?")) return;
    startTransition(async () => {
      const res = await releaseReservationAction(transactionId, "Released by Sales Person");
      if (res.success) {
        setSuccessMsg("Stock reservation released back to available stock.");
      } else {
        setErrorMsg(res.error || "Failed to release reservation.");
      }
    });
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setErrorMsg("Customer name and phone number are required.");
      return;
    }
    startTransition(async () => {
      const res = await createCustomerAction({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        alternatePhone: newCustAltPhone.trim(),
        email: newCustEmail.trim(),
        address: newCustAddress.trim(),
        deliveryAddress: newCustDeliveryAddress.trim(),
        notes: newCustNotes.trim(),
      });
      if (res.success && res.data) {
        setSuccessMsg(`Customer "${res.data.name}" created successfully!`);
        setCustomerList((prev) => [...prev, { id: res.data.id, name: res.data.name, phone: res.data.phone || "", email: res.data.email || "" }]);
        setSelectedCustomerId(res.data.id);
        setShowCreateCustomerModal(false);
        setNewCustName("");
        setNewCustPhone("");
        setNewCustAltPhone("");
        setNewCustEmail("");
        setNewCustAddress("");
        setNewCustDeliveryAddress("");
        setNewCustNotes("");
      } else {
        setErrorMsg(res.error || "Failed to create customer.");
      }
    });
  };

  // Filtered lists
  const filteredOrders = orders.filter(
    (o) =>
      o.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredReservations = reservations.filter(
    (r) =>
      r.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Alert Banner */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "orders"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Sales Orders ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("reservations")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "reservations"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookmarkCheck className="h-3.5 w-3.5 text-amber-600" />
          <span>Stock Reservations ({reservations.filter((r) => r.status === "ACTIVE").length} active)</span>
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3 border border-slate-200 rounded shadow-xs">
        <div className="relative w-full sm:max-w-xs md:max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white min-h-[40px] sm:min-h-0"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setErrorMsg("");
              setSuccessMsg("");
              setShowScannerModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 sm:py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-sm text-xs font-semibold shadow-xs transition min-h-[40px] sm:min-h-0"
            title="Scan product QR to check live inventory across all warehouses"
          >
            <QrCode className="h-3.5 w-3.5 text-blue-400" />
            <span>Scan QR</span>
          </button>

          <button
            onClick={() => {
              setErrorMsg("");
              setSuccessMsg("");
              setShowCreateCustomerModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-sm text-xs font-semibold border border-slate-300 shadow-xs transition min-h-[40px] sm:min-h-0"
          >
            <User className="h-3.5 w-3.5" />
            <span>Add Customer</span>
          </button>

          {activeTab === "orders" && (
            <button
              onClick={() => {
                setErrorMsg("");
                setSuccessMsg("");
                setShowCreateOrderModal(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition min-h-[40px] sm:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Sales Order</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: SALES ORDERS */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Order No</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Created By</th>
                  <th className="px-4 py-3">Branch / Outlet</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No sales orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setSelectedOrderForDetail(o)}
                          className="text-blue-600 hover:underline font-mono font-bold text-left"
                          title="View order details and audit log"
                        >
                          {o.orderNo}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{o.customer}</td>
                      <td className="px-4 py-3 text-slate-500">{o.date}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center space-x-1.5">
                          <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                            {(o.createdBy || "U").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{o.createdBy || "Not recorded"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {o.branch} - {o.outlet}
                      </td>
                      <td className="px-4 py-3">
                        {isSalesPerson || o.status === "COMPLETED" ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              o.status === "RESERVED"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : o.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : o.status === "EXPIRED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                          >
                            {o.status}
                          </span>
                        ) : (
                          <select
                            value={o.status}
                            onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                            disabled={o.status === "COMPLETED"}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border outline-none ${
                              o.status === "RESERVED"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : o.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : o.status === "EXPIRED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            }`}
                          >
                            <option value="DRAFT">DRAFT</option>
                            <option value="CONFIRMED">CONFIRMED</option>
                            <option value="RESERVED">RESERVED</option>
                            <option value="READY_FOR_DELIVERY">READY FOR DELIVERY</option>
                            <option value="READY_FOR_PICKUP">READY FOR PICKUP</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="CANCELLED">CANCELLED</option>
                            <option value="EXPIRED">EXPIRED</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => setSelectedOrderForDetail(o)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold transition"
                        >
                          Audit Details
                        </button>
                        {canDispatch && o.status !== "COMPLETED" && (
                          <button
                            onClick={() => {
                              setSelectedOrderForDispatch(o);
                              setDeliveryAddress("Default customer address");
                              setShowDispatchModal(true);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-blue-600 rounded text-[10px] font-semibold transition"
                          >
                            Dispatch
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (< 768px) */}
          <div className="md:hidden space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No sales orders found.
              </div>
            ) : (
              filteredOrders.map((o) => (
                <div key={o.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <button
                        onClick={() => setSelectedOrderForDetail(o)}
                        className="text-blue-600 hover:underline font-mono font-bold text-sm text-left block"
                      >
                        {o.orderNo}
                      </button>
                      <div className="text-[11px] text-slate-400 mt-0.5">{o.date}</div>
                    </div>
                    {isSalesPerson || o.status === "COMPLETED" ? (
                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold border ${
                          o.status === "RESERVED"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : o.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : o.status === "EXPIRED"
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}
                      >
                        {o.status}
                      </span>
                    ) : (
                      <select
                        value={o.status}
                        onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                        disabled={o.status === "COMPLETED"}
                        className={`px-2 py-1 rounded text-xs font-bold border outline-none min-h-[36px] ${
                          o.status === "RESERVED"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : o.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : o.status === "EXPIRED"
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="READY_FOR_DELIVERY">READY FOR DELIVERY</option>
                        <option value="READY_FOR_PICKUP">READY FOR PICKUP</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                      <span className="font-semibold text-slate-900 block truncate">{o.customer}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Branch / Outlet</span>
                      <span className="text-slate-600 block truncate">{o.branch} - {o.outlet}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Created By</span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <div className="h-4 w-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[9px] shrink-0">
                          {(o.createdBy || "U").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800 text-xs">{o.createdBy || "Not recorded"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedOrderForDetail(o)}
                      className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition text-center min-h-[40px] flex items-center justify-center"
                    >
                      Audit Details
                    </button>
                    {canDispatch && o.status !== "COMPLETED" && (
                      <button
                        onClick={() => {
                          setSelectedOrderForDispatch(o);
                          setDeliveryAddress("Default customer address");
                          setShowDispatchModal(true);
                        }}
                        className="flex-1 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-xs font-semibold transition text-center min-h-[40px] flex items-center justify-center"
                      >
                        Dispatch
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STOCK RESERVATIONS */}
      {activeTab === "reservations" && (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm text-xs text-amber-900 flex items-start sm:items-center space-x-2">
            <BookmarkCheck className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Stock Reservation Policy:</strong> Reserved stock is held specifically for the customer and is not available to others. Formula: Available = On Hand - Reserved.
            </span>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Res ID</th>
                  <th className="px-4 py-3">Order Ref</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Product / Qty</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Expected Pickup</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No stock reservations recorded.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{r.transactionNo}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{r.orderNo}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.customerName}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{r.quantity} pcs</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.warehouseName || "Main Warehouse"}</td>
                      <td className="px-4 py-3 text-slate-600">{r.expectedPickupDate}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.expiryDate}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.status === "ACTIVE"
                              ? "bg-amber-100 text-amber-800"
                              : r.status === "FULFILLED"
                              ? "bg-emerald-100 text-emerald-800"
                              : r.status === "EXPIRED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === "ACTIVE" && (
                          <button
                            onClick={() => handleReleaseReservation(r.id)}
                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[10px] font-semibold transition"
                          >
                            Release Hold
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredReservations.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No stock reservations recorded.
              </div>
            ) : (
              filteredReservations.map((r) => (
                <div key={r.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <span className="font-mono font-bold text-slate-900 text-sm">{r.transactionNo}</span>
                      <div className="text-[11px] font-mono text-slate-500">Order: {r.orderNo}</div>
                    </div>
                    <span
                      className={`inline-flex px-2.5 py-1 rounded text-xs font-bold ${
                        r.status === "ACTIVE"
                          ? "bg-amber-100 text-amber-800"
                          : r.status === "FULFILLED"
                          ? "bg-emerald-100 text-emerald-800"
                          : r.status === "EXPIRED"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                      <span className="font-semibold text-slate-900 block truncate">{r.customerName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Product / Qty</span>
                      <span className="font-bold text-slate-900 block truncate">{r.quantity} pcs</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Warehouse</span>
                      <span className="text-slate-600 block truncate">{r.warehouseName || "Main Warehouse"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Expiry Date</span>
                      <span className="font-semibold text-slate-800 block">{r.expiryDate}</span>
                    </div>
                  </div>

                  {r.status === "ACTIVE" && (
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleReleaseReservation(r.id)}
                        className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-semibold transition min-h-[40px]"
                      >
                        Release Hold
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STOCK RESERVATIONS END */}

      {/* CREATE CUSTOMER MODAL */}
      {showCreateCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <User className="h-4 w-4 text-blue-600" />
                <span>Add New Customer</span>
              </h3>
              <button
                onClick={() => setShowCreateCustomerModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Acme Enterprises"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Alternate Phone</label>
                  <input
                    type="tel"
                    value={newCustAltPhone}
                    onChange={(e) => setNewCustAltPhone(e.target.value)}
                    placeholder="Optional"
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Email Address</label>
                <input
                  type="email"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  placeholder="contact@customer.com"
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Delivery / Site Address</label>
                <textarea
                  value={newCustDeliveryAddress}
                  onChange={(e) => setNewCustDeliveryAddress(e.target.value)}
                  placeholder="Street, Area, City, Pincode"
                  rows={2}
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Notes</label>
                <input
                  type="text"
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="Special preferences, landmarks, etc."
                  className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCustomerModal(false)}
                  className="px-4 py-2 border rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SALES ORDER MODAL */}
      {showCreateOrderModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <span>Create Sales Order & Customer Requirement</span>
              </h3>
              <button
                onClick={() => setShowCreateOrderModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-4 sm:p-6 space-y-4 text-xs max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="font-semibold text-slate-700">Customer *</label>
                    <button
                      type="button"
                      onClick={() => setShowCreateCustomerModal(true)}
                      className="text-blue-600 text-[10px] hover:underline"
                    >
                      + New Customer
                    </button>
                  </div>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    required
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[40px] sm:min-h-0"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customerList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Warehouse (Stock Source) *</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                    className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 min-h-[40px] sm:min-h-0"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Order Items Section */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <h4 className="font-bold text-slate-800">Order Items</h4>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setShowScannerModal(true)}
                      className="flex-1 sm:flex-none text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-300 px-2.5 py-1.5 rounded text-xs font-semibold flex items-center justify-center space-x-1 transition min-h-[36px] sm:min-h-0"
                    >
                      <QrCode className="h-3.5 w-3.5 text-blue-600" />
                      <span>Scan QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex-1 sm:flex-none text-blue-600 bg-blue-50 sm:bg-transparent hover:bg-blue-100 sm:hover:bg-transparent px-2.5 py-1.5 sm:p-0 rounded text-xs font-semibold flex items-center justify-center space-x-1 min-h-[36px] sm:min-h-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {orderItems.map((item, index) => (
                    <div key={index} className="bg-slate-50 p-3 rounded border border-slate-200/80 space-y-2">
                      {/* Desktop Grid Layout (sm+) */}
                      <div className="hidden sm:grid sm:grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <select
                            value={item.variantId}
                            onChange={(e) => handleProductChange(index, e.target.value)}
                            required
                            className="w-full p-1.5 border rounded text-xs"
                          >
                            <option value="">-- Select Product --</option>
                            {products.map((p) => (
                              <optgroup key={p.id} label={p.name}>
                                {p.variants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} ({v.sku})
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...orderItems];
                              newItems[index].quantity = Number(e.target.value);
                              setOrderItems(newItems);
                            }}
                            placeholder="Qty"
                            className="w-full p-1.5 border rounded text-xs text-center"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            value={item.rate}
                            onChange={(e) => {
                              const newItems = [...orderItems];
                              newItems[index].rate = Number(e.target.value);
                              setOrderItems(newItems);
                            }}
                            placeholder="Rate ₹"
                            className="w-full p-1.5 border rounded text-xs text-right"
                          />
                        </div>
                        <div className="col-span-2 text-right font-bold text-slate-800">
                          ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                        </div>
                        <div className="col-span-1 text-center">
                          {orderItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mobile Stacked Layout (< sm) */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-slate-700 text-xs">Item #{index + 1}</span>
                          {orderItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-red-500 text-xs font-semibold px-2 py-1 bg-red-50 rounded"
                            >
                              Remove Item
                            </button>
                          )}
                        </div>
                        <div>
                          <select
                            value={item.variantId}
                            onChange={(e) => handleProductChange(index, e.target.value)}
                            required
                            className="w-full p-2 border rounded text-xs bg-white min-h-[40px]"
                          >
                            <option value="">-- Select Product --</option>
                            {products.map((p) => (
                              <optgroup key={p.id} label={p.name}>
                                {p.variants.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} ({v.sku})
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2 items-center pt-1">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Qty</label>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const newItems = [...orderItems];
                                newItems[index].quantity = Number(e.target.value);
                                setOrderItems(newItems);
                              }}
                              className="w-full p-2 border rounded text-xs text-center bg-white min-h-[40px]"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Rate (₹)</label>
                            <input
                              type="number"
                              value={item.rate}
                              onChange={(e) => {
                                const newItems = [...orderItems];
                                newItems[index].rate = Number(e.target.value);
                                setOrderItems(newItems);
                              }}
                              className="w-full p-2 border rounded text-xs text-right bg-white min-h-[40px]"
                            />
                          </div>
                          <div className="text-right">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total</label>
                            <div className="font-bold text-slate-900 text-xs py-2">
                              ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stock Reservation Option */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="reserveStockCheck"
                    checked={isReserved}
                    onChange={(e) => setIsReserved(e.target.checked)}
                    className="h-4 w-4 text-blue-600 rounded border-slate-300"
                  />
                  <label htmlFor="reserveStockCheck" className="font-bold text-slate-800 cursor-pointer">
                    Reserve / Block Stock for Customer (Customer will collect later)
                  </label>
                </div>

                {isReserved && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Expected Customer Pickup Date</label>
                      <input
                        type="date"
                        value={expectedPickupDate}
                        onChange={(e) => setExpectedPickupDate(e.target.value)}
                        className="w-full p-2 sm:p-1.5 border rounded text-xs bg-white min-h-[40px] sm:min-h-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Reservation Expiry Date</label>
                      <input
                        type="date"
                        value={reservationExpiryDate}
                        onChange={(e) => setReservationExpiryDate(e.target.value)}
                        className="w-full p-2 sm:p-1.5 border rounded text-xs bg-white min-h-[40px] sm:min-h-0"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Order Notes / Instructions</label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Special handling instructions or customer requests..."
                  rows={2}
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="pt-4 border-t flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrderModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border rounded text-slate-600 font-semibold min-h-[42px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50 min-h-[42px] sm:min-h-0"
                >
                  {isPending ? "Creating Order..." : "Confirm & Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISPATCH DELIVERY MODAL */}
      {showDispatchModal && selectedOrderForDispatch && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Truck className="h-4 w-4 text-blue-600" />
                <span>Dispatch Order {selectedOrderForDispatch.orderNo}</span>
              </h3>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDispatchSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Driver Name *</label>
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Senthil Kumar"
                  className="w-full p-2 border rounded text-xs min-h-[40px] sm:min-h-0"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Driver Phone</label>
                  <input
                    type="tel"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full p-2 border rounded text-xs min-h-[40px] sm:min-h-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Vehicle Number *</label>
                  <input
                    type="text"
                    required
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="TN-23-AX-1234"
                    className="w-full p-2 border rounded text-xs uppercase min-h-[40px] sm:min-h-0"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Delivery Address</label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={2}
                  className="w-full p-2 border rounded text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Delivery Mode</label>
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  className="w-full p-2 border rounded text-xs min-h-[40px] sm:min-h-0"
                >
                  <option value="Own Vehicle">Own Vehicle</option>
                  <option value="Customer Pickup">Customer Pickup</option>
                  <option value="Transporter">Transporter</option>
                  <option value="Third Party Delivery">Third Party Delivery</option>
                </select>
              </div>

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
                  {isPending ? "Dispatching..." : "Schedule Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SALES ORDER DETAIL & AUDIT MODAL */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Sales Order Details — <span className="font-mono text-blue-600">{selectedOrderForDetail.orderNo}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6 text-xs max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer</span>
                  <div className="text-xs font-semibold text-slate-900 mt-1">{selectedOrderForDetail.customer}</div>
                  {selectedOrderForDetail.phone && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{selectedOrderForDetail.phone}</div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Order Status</span>
                  <div className="mt-1">
                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                      {selectedOrderForDetail.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Date: {selectedOrderForDetail.date}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-100">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Branch / Outlet</span>
                  <div className="text-xs font-semibold text-slate-800 mt-1">{selectedOrderForDetail.branch}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{selectedOrderForDetail.outlet}</div>
                </div>
              </div>

              {/* Employee Action & Audit Tracking Section */}
              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg space-y-3">
                <div className="flex items-center space-x-2 text-blue-900 font-bold border-b border-blue-100 pb-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span>Employee Action & Creation Audit</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Created By</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className="h-6 w-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                        {(selectedOrderForDetail.createdBy || "U").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900 text-sm">
                        {selectedOrderForDetail.createdBy || "Not recorded"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Created At</span>
                    <div className="flex items-center space-x-1.5 mt-1 text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">{selectedOrderForDetail.createdAtFormatted || selectedOrderForDetail.date}</span>
                    </div>
                  </div>

                  {selectedOrderForDetail.lastUpdatedBy && selectedOrderForDetail.lastUpdatedBy !== "Not recorded" && (
                    <>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Last Updated By</span>
                        <div className="font-semibold text-slate-800 mt-1">{selectedOrderForDetail.lastUpdatedBy}</div>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Last Updated At</span>
                        <div className="font-medium text-slate-700 mt-1">{selectedOrderForDetail.lastUpdatedAtFormatted || "—"}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Status Progression History Timeline */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-slate-600" />
                  <span>Order Status Progression History</span>
                </h4>

                {(!selectedOrderForDetail.statusHistory || selectedOrderForDetail.statusHistory.length === 0) ? (
                  <div className="p-3 bg-slate-50 border rounded text-slate-500 text-center">
                    Initial order creation recorded by <strong className="text-slate-800">{selectedOrderForDetail.createdBy || "Not recorded"}</strong> on {selectedOrderForDetail.createdAtFormatted || selectedOrderForDetail.date}.
                  </div>
                ) : (
                  <div className="border rounded-md divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                    {selectedOrderForDetail.statusHistory.map((h: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-start justify-between hover:bg-white transition">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            {h.oldStatus && (
                              <>
                                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold">
                                  {h.oldStatus}
                                </span>
                                <span className="text-slate-400">→</span>
                              </>
                            )}
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                              {h.newStatus || h.status}
                            </span>
                          </div>
                          {h.notes && <p className="text-[11px] text-slate-500">{h.notes}</p>}
                        </div>

                        <div className="text-right">
                          <div className="font-semibold text-slate-800">
                            {h.changedByName || h.userName || h.performedBy || "System"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {h.changedAt ? new Date(h.changedAt).toLocaleString("en-IN") : "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDetail(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold min-h-[40px] sm:min-h-0"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* QR SCANNER MODAL */}
      {showScannerModal && (
        <ProductQrScanner
          isModal
          onClose={() => setShowScannerModal(false)}
          onSelectProduct={handleSelectScannedProduct}
        />
      )}
    </div>
  );
}
