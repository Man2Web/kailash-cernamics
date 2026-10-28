"use client";

import React, { useState } from "react";
import {
  Warehouse as WarehouseIcon,
  Layers,
  Container,
  CheckCircle,
  AlertCircle,
  Package,
  Search,
  ShoppingCart,
  Truck,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import {
  createWarehouse,
  createLocation,
  createRack,
  createBin,
} from "@/app/(dashboard)/stock/warehouses/actions";

export interface WarehouseStockItem {
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  barcode: string;
  category?: string;
  warehouseId: string;
  warehouseName: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  damaged: number;
  reorderLevel: number;
}

export interface WarehouseSalesOrder {
  id: string;
  orderNo: string;
  customerName: string;
  totalAmount: number;
  status: string;
  date: string;
  destination: string;
}

export interface WarehouseSalesDelivery {
  id: string;
  dispatchNo: string;
  refNo: string;
  destination: string;
  driverName: string;
  vehicleNo: string;
  status: string;
  date: string;
}

interface WarehouseData {
  id: string;
  name: string;
  code: string;
  address: string | null;
  branch: {
    id: string;
    name: string;
  };
}

interface LocationData {
  id: string;
  name: string;
  code: string;
  warehouse: {
    id: string;
    name: string;
  };
}

interface RackData {
  id: string;
  name: string;
  code: string;
  location: {
    id: string;
    name: string;
    warehouse: {
      id: string;
      name: string;
    };
  };
}

interface BinData {
  id: string;
  name: string;
  code: string;
  rack: {
    id: string;
    name: string;
    location: {
      id: string;
      name: string;
    };
  };
}

interface WarehouseClientProps {
  warehouses: WarehouseData[];
  locations: LocationData[];
  racks: RackData[];
  bins: BinData[];
  branches: Array<{ id: string; name: string }>;
  stocks: WarehouseStockItem[];
  salesOrders?: WarehouseSalesOrder[];
  salesDeliveries?: WarehouseSalesDelivery[];
  assignedWarehouseId?: string;
  assignedWarehouseName?: string;
  isManager: boolean;
}

export default function WarehouseClient({
  warehouses,
  locations,
  racks,
  bins,
  branches,
  stocks,
  salesOrders = [],
  salesDeliveries = [],
  assignedWarehouseId,
  assignedWarehouseName,
  isManager,
}: WarehouseClientProps) {
  const [activeTab, setActiveTab] = useState<"stock" | "orders" | "deliveries" | "config">("stock");
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState(
    assignedWarehouseId || warehouses[0]?.id || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Config Form states (Super Admin)
  const [wName, setWName] = useState("");
  const [wCode, setWCode] = useState("");
  const [wBranchId, setWBranchId] = useState(branches[0]?.id || "");
  const [wAddress, setWAddress] = useState("");

  const [lName, setLName] = useState("");
  const [lCode, setLCode] = useState("");
  const [lWarehouseId, setLWarehouseId] = useState(warehouses[0]?.id || "");

  const [rName, setRName] = useState("");
  const [rCode, setRCode] = useState("");
  const [rLocationId, setRLocationId] = useState(locations[0]?.id || "");

  const [bName, setBName] = useState("");
  const [bCode, setBCode] = useState("");
  const [bRackId, setBRackId] = useState(racks[0]?.id || "");

  // Notification messages
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessMsg(text);
      setErrorMsg("");
    } else {
      setErrorMsg(text);
      setSuccessMsg("");
    }
    setTimeout(() => {
      setSuccessMsg("");
      setErrorMsg("");
    }, 5000);
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wName || !wCode || !wBranchId) return;
    const res = await createWarehouse(wName, wCode, wBranchId, wAddress);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Warehouse created successfully!");
      setWName("");
      setWCode("");
      setWAddress("");
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lName || !lCode || !lWarehouseId) return;
    const res = await createLocation(lName, lCode, lWarehouseId);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Storage Location added!");
      setLName("");
      setLCode("");
    }
  };

  const handleCreateRack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName || !rCode || !rLocationId) return;
    const res = await createRack(rName, rCode, rLocationId);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Shelving Rack registered!");
      setRName("");
      setRCode("");
    }
  };

  const handleCreateBin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName || !bCode || !bRackId) return;
    const res = await createBin(bName, bCode, bRackId);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Storage Bin registered!");
      setBName("");
      setBCode("");
    }
  };

  // Filter stocks
  const filteredStocks = stocks.filter((s) => {
    const matchesWarehouse = isManager
      ? true
      : selectedWarehouseFilter === "ALL" || s.warehouseId === selectedWarehouseFilter;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.barcode.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesWarehouse && matchesSearch;
  });

  // Filter orders
  const filteredOrders = salesOrders.filter((o) => {
    return (
      o.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.status.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter deliveries
  const filteredDeliveries = salesDeliveries.filter((d) => {
    return (
      d.dispatchNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.refNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.driverName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Metric summaries
  const totalProducts = filteredStocks.length;
  const totalOnHand = filteredStocks.reduce((sum, s) => sum + s.onHand, 0);
  const totalReserved = filteredStocks.reduce((sum, s) => sum + s.reserved, 0);
  const totalAvailable = filteredStocks.reduce((sum, s) => sum + s.available, 0);
  const totalInTransit = filteredStocks.reduce((sum, s) => sum + s.inTransit, 0);
  const totalLowStock = filteredStocks.filter((s) => s.available <= s.reorderLevel).length;

  const currentWarehouseHeading = isManager
    ? assignedWarehouseName || warehouses[0]?.name || "My Assigned Warehouse"
    : selectedWarehouseFilter === "ALL"
    ? "All Warehouses"
    : warehouses.find((w) => w.id === selectedWarehouseFilter)?.name || "Warehouse Stock";

  return (
    <div className="space-y-4">
      {/* Alert Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center space-x-2">
          <AlertCircle className="h-4 w-4" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded flex items-center space-x-2">
          <CheckCircle className="h-4 w-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Warehouse Active Heading Banner */}
      <div className="bg-slate-900 text-white p-3.5 sm:p-4 rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 w-full max-w-full overflow-hidden box-border">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-blue-400 block">
            {isManager ? "Assigned Facility" : "Warehouse Overview"}
          </span>
          <h2 className="text-base sm:text-lg font-extrabold flex items-center gap-2 mt-0.5">
            <WarehouseIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0" />
            <span className="truncate">{currentWarehouseHeading}</span>
          </h2>
        </div>

        {!isManager && (
          <div className="w-full md:w-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 shrink-0 max-w-full">
            <label className="text-[11px] sm:text-xs text-slate-300 font-medium whitespace-nowrap">
              Select Facility:
            </label>
            <select
              value={selectedWarehouseFilter}
              onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              className="w-full sm:w-auto max-w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="ALL">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* 1. Total Products */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Products</p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900">{totalProducts}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-600 rounded">
            <Package className="h-4 w-4" />
          </div>
        </div>

        {/* 2. Total On Hand */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total On Hand</p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900">{totalOnHand}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded">
            <Layers className="h-4 w-4" />
          </div>
        </div>

        {/* 3. Reserved */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reserved</p>
            <p className="text-base sm:text-lg font-extrabold text-amber-600">{totalReserved}</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded">
            <TrendingDown className="h-4 w-4" />
          </div>
        </div>

        {/* 4. Available */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Available</p>
            <p className="text-base sm:text-lg font-extrabold text-emerald-600">{totalAvailable}</p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded">
            <TrendingUp className="h-4 w-4" />
          </div>
        </div>

        {/* 5. In Transit */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">In Transit</p>
            <p className="text-base sm:text-lg font-extrabold text-indigo-600">{totalInTransit}</p>
          </div>
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
            <Container className="h-4 w-4" />
          </div>
        </div>

        {/* 6. Low Stock */}
        <div className="bg-white p-3 sm:p-3.5 border border-slate-200 rounded shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Low Stock</p>
            <p className="text-base sm:text-lg font-extrabold text-rose-600">{totalLowStock}</p>
          </div>
          <div className="p-2 bg-rose-50 text-rose-600 rounded">
            <ShieldAlert className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm overflow-x-auto overflow-y-hidden no-scrollbar">
        <button
          onClick={() => setActiveTab("stock")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "stock"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          <span>Warehouse Stock</span>
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "orders"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Relevant Sales Orders ({salesOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("deliveries")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === "deliveries"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="h-3.5 w-3.5" />
          <span>Relevant Deliveries ({salesDeliveries.length})</span>
        </button>

        {!isManager && (
          <button
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "config"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Locations & Bins</span>
          </button>
        )}
      </div>

      {/* Tab 1: Warehouse Stock Table */}
      {activeTab === "stock" && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 bg-white p-3 border border-slate-200 rounded shadow-xs">
            <div className="relative w-full sm:max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, SKU, barcode..."
                className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white min-h-[36px] sm:min-h-0"
              />
            </div>

            <div className="text-[11px] text-slate-500 font-semibold">
              Showing {filteredStocks.length} inventory items
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3.5 py-3">Product</th>
                  <th className="px-3.5 py-3">SKU</th>
                  <th className="px-3.5 py-3">Category</th>
                  <th className="px-3.5 py-3">Unit</th>
                  <th className="px-3.5 py-3 text-right">On Hand</th>
                  <th className="px-3.5 py-3 text-right">Reserved</th>
                  <th className="px-3.5 py-3 text-right">Available</th>
                  <th className="px-3.5 py-3 text-right">In Transit</th>
                  <th className="px-3.5 py-3 text-right">Damaged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400">
                      No stock items found in this warehouse.
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((s) => (
                    <tr key={`${s.variantId}_${s.warehouseId}`} className="hover:bg-slate-50/50">
                      <td className="px-3.5 py-3 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-3.5 py-3 font-mono text-slate-600">{s.sku}</td>
                      <td className="px-3.5 py-3 text-slate-600">{s.category || "General"}</td>
                      <td className="px-3.5 py-3 text-slate-500 uppercase">{s.unit}</td>
                      <td className="px-3.5 py-3 text-right font-bold text-slate-900">{s.onHand}</td>
                      <td className="px-3.5 py-3 text-right font-bold text-amber-600">{s.reserved}</td>
                      <td className="px-3.5 py-3 text-right font-bold text-emerald-600">{s.available}</td>
                      <td className="px-3.5 py-3 text-right text-slate-500">{s.inTransit}</td>
                      <td className="px-3.5 py-3 text-right text-slate-500">{s.damaged}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredStocks.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No stock items found in this warehouse.
              </div>
            ) : (
              filteredStocks.map((s) => (
                <div key={`${s.variantId}_${s.warehouseId}`} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-snug">{s.name}</h4>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">SKU: {s.sku}</div>
                    </div>
                    <span className="inline-flex px-2.5 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      Available: {s.available} {s.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">On Hand</span>
                      <span className="font-bold text-slate-900 text-sm">{s.onHand}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Reserved</span>
                      <span className="font-bold text-amber-600 text-sm">{s.reserved}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">In Transit</span>
                      <span className="text-slate-600">{s.inTransit}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Damaged</span>
                      <span className="text-slate-600">{s.damaged}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Relevant Sales Orders */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3.5 py-3">Order #</th>
                  <th className="px-3.5 py-3">Customer</th>
                  <th className="px-3.5 py-3">Destination</th>
                  <th className="px-3.5 py-3 text-right">Amount</th>
                  <th className="px-3.5 py-3">Status</th>
                  <th className="px-3.5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No sales orders found for this warehouse facility.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/50">
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900">{o.orderNo}</td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900">{o.customerName}</td>
                      <td className="px-3.5 py-3 text-slate-600">{o.destination}</td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">₹{o.totalAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3.5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          {o.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-slate-500">{o.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredOrders.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No sales orders found for this warehouse facility.
              </div>
            ) : (
              filteredOrders.map((o) => (
                <div key={o.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-2">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900 text-xs block">{o.orderNo}</span>
                      <span className="font-semibold text-slate-800 text-sm">{o.customerName}</span>
                    </div>
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
                      {o.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{o.destination}</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">₹{o.totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{o.date}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Relevant Sales Deliveries */}
      {activeTab === "deliveries" && (
        <div className="space-y-3">
          <div className="hidden xl:block bg-white border border-slate-200 rounded shadow-xs overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-3.5 py-3">Dispatch #</th>
                  <th className="px-3.5 py-3">Order Ref</th>
                  <th className="px-3.5 py-3">Destination</th>
                  <th className="px-3.5 py-3">Driver</th>
                  <th className="px-3.5 py-3">Vehicle #</th>
                  <th className="px-3.5 py-3">Status</th>
                  <th className="px-3.5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDeliveries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      No sales dispatches found for this warehouse facility.
                    </td>
                  </tr>
                ) : (
                  filteredDeliveries.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50">
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900">{d.dispatchNo}</td>
                      <td className="px-3.5 py-3 font-mono text-slate-600">{d.refNo}</td>
                      <td className="px-3.5 py-3 text-slate-600">{d.destination}</td>
                      <td className="px-3.5 py-3 font-semibold text-slate-900">{d.driverName}</td>
                      <td className="px-3.5 py-3 font-mono text-slate-600">{d.vehicleNo}</td>
                      <td className="px-3.5 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {d.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-slate-500">{d.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredDeliveries.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No sales dispatches found for this warehouse facility.
              </div>
            ) : (
              filteredDeliveries.map((d) => (
                <div key={d.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-2">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-mono font-bold text-slate-900 text-xs block">{d.dispatchNo}</span>
                      <span className="text-slate-600 text-xs">Ref: {d.refNo}</span>
                    </div>
                    <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shrink-0">
                      {d.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Driver</span>
                      <span className="font-semibold text-slate-900">{d.driverName}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Vehicle</span>
                      <span className="font-mono text-slate-700">{d.vehicleNo}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Destination</span>
                      <span className="text-slate-700">{d.destination}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">{d.date}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Storage Locations, Racks & Bins (Super Admin Only) */}
      {activeTab === "config" && !isManager && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Warehouse Form */}
            <div className="bg-white p-4 border border-slate-200 rounded shadow-xs space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase">1. Add Warehouse</h4>
              <form onSubmit={handleCreateWarehouse} className="space-y-2">
                <input
                  type="text"
                  required
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="Warehouse Name"
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  required
                  value={wCode}
                  onChange={(e) => setWCode(e.target.value)}
                  placeholder="Code (e.g. WH-BLR)"
                  className="w-full p-2 border rounded uppercase"
                />
                <select
                  value={wBranchId}
                  onChange={(e) => setWBranchId(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Branch: {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={wAddress}
                  onChange={(e) => setWAddress(e.target.value)}
                  placeholder="Address (Optional)"
                  className="w-full p-2 border rounded"
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition cursor-pointer"
                >
                  Create Warehouse
                </button>
              </form>
            </div>

            {/* Location Form */}
            <div className="bg-white p-4 border border-slate-200 rounded shadow-xs space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase">2. Add Location</h4>
              <form onSubmit={handleCreateLocation} className="space-y-2">
                <input
                  type="text"
                  required
                  value={lName}
                  onChange={(e) => setLName(e.target.value)}
                  placeholder="Location Name"
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  required
                  value={lCode}
                  onChange={(e) => setLCode(e.target.value)}
                  placeholder="Code (e.g. LOC-01)"
                  className="w-full p-2 border rounded uppercase"
                />
                <select
                  value={lWarehouseId}
                  onChange={(e) => setLWarehouseId(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition cursor-pointer"
                >
                  Add Location
                </button>
              </form>
            </div>

            {/* Rack Form */}
            <div className="bg-white p-4 border border-slate-200 rounded shadow-xs space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase">3. Add Rack</h4>
              <form onSubmit={handleCreateRack} className="space-y-2">
                <input
                  type="text"
                  required
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  placeholder="Rack Name"
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  required
                  value={rCode}
                  onChange={(e) => setRCode(e.target.value)}
                  placeholder="Code (e.g. RCK-01)"
                  className="w-full p-2 border rounded uppercase"
                />
                <select
                  value={rLocationId}
                  onChange={(e) => setRLocationId(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.warehouse?.name} - {l.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition cursor-pointer"
                >
                  Add Rack
                </button>
              </form>
            </div>

            {/* Bin Form */}
            <div className="bg-white p-4 border border-slate-200 rounded shadow-xs space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 uppercase">4. Add Bin</h4>
              <form onSubmit={handleCreateBin} className="space-y-2">
                <input
                  type="text"
                  required
                  value={bName}
                  onChange={(e) => setBName(e.target.value)}
                  placeholder="Bin Name"
                  className="w-full p-2 border rounded"
                />
                <input
                  type="text"
                  required
                  value={bCode}
                  onChange={(e) => setBCode(e.target.value)}
                  placeholder="Code (e.g. BIN-01)"
                  className="w-full p-2 border rounded uppercase"
                />
                <select
                  value={bRackId}
                  onChange={(e) => setBRackId(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  {racks.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.location?.warehouse?.name} - {r.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition cursor-pointer"
                >
                  Add Bin
                </button>
              </form>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded border border-slate-200">
            Registered Structure: {warehouses.length} Warehouses, {locations.length} Locations, {racks.length} Shelving Racks, {bins.length} Storage Bins across {branches.length} Operating Branches.
          </div>
        </div>
      )}
    </div>
  );
}
