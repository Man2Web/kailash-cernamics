"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Truck,
  MapPin,
  Barcode,
} from "lucide-react";
import { calculateGst } from "@/lib/tax/gst";
import { createInvoice } from "@/app/(dashboard)/sales/actions";

interface Address {
  id: string;
  type: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  area: string | null;
}

interface Customer {
  id: string;
  name: string;
  code: string;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  addresses: Address[];
  group: {
    discountPercent: any;
  };
}

interface Outlet {
  id: string;
  name: string;
  branch: {
    id: string;
    name: string;
    address: string | null;
  };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  code: string;
  hsnCode: string | null;
  variants?: { id: string }[];
  sellingPrice: any;
  gstRate: any;
  unit: {
    id: string;
    code: string;
  };
}

interface Warehouse {
  id: string;
  name: string;
  locations: {
    id: string;
    name: string;
    racks: {
      id: string;
      name: string;
      bins: {
        id: string;
        name: string;
      }[];
    }[];
  }[];
}

interface InvoiceItemRow {
  productId: string;
  variantId: string;
  sku: string;
  description: string;
  warehouseId: string;
  binId: string;
  unitId: string;
  unitCode: string;
  quantity: number;
  rate: number;
  discount: number; // absolute discount
  taxableAmt: number;
  gstRate: number;
  cgstRate: number;
  cgstAmt: number;
  sgstRate: number;
  sgstAmt: number;
  igstRate: number;
  igstAmt: number;
  totalAmt: number;
}

interface InvoiceCreateClientProps {
  customers: Customer[];
  outlets: Outlet[];
  products: Product[];
  warehouses: Warehouse[];
  branches: any[];
  priceLists: any[];
}

export default function InvoiceCreateClient({
  customers,
  outlets,
  products,
  warehouses,
  branches,
  priceLists,
}: InvoiceCreateClientProps) {
  const router = useRouter();

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Header Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [gstin, setGstin] = useState("");
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [docSeries, setDocSeries] = useState("GEN-2026");
  const [salesLedger, setSalesLedger] = useState("Sales Standard");
  
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cMobile, setCMobile] = useState("");
  const [docNo, setDocNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [invoiceType, setInvoiceType] = useState("TAX");
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [natureOfTrans, setNatureOfTrans] = useState("Sales");
  const [poNumber, setPoNumber] = useState("");
  const [poDate, setPoDate] = useState("");

  // 2. Billing & Shipping Address states
  const [bAddr, setBAddr] = useState("");
  const [bState, setBState] = useState("");
  const [bCity, setBCity] = useState("");
  const [bArea, setBArea] = useState("");
  const [bPincode, setBPincode] = useState("");

  const [dAddr, setDAddr] = useState("");
  const [dState, setDState] = useState("");
  const [dCity, setDCity] = useState("");
  const [dArea, setDArea] = useState("");
  const [dPincode, setDPincode] = useState("");

  // 3. Logistics & Transport states
  const [ewayNo, setEwayNo] = useState("");
  const [transDocNo, setTransDocNo] = useState("");
  const [transDate, setTransDate] = useState("");
  const [distance, setDistance] = useState("0");
  const [transMode, setTransMode] = useState("ROAD");
  const [shippingType, setShippingType] = useState("Direct");
  const [transporter, setTransporter] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");

  // 4. Line Items Table state
  const [items, setItems] = useState<InvoiceItemRow[]>([]);

  // Generate Document number automatically
  useEffect(() => {
    setDocNo(`INV/2026/${Math.floor(100000 + Math.random() * 900000)}`);
    if (outlets.length > 0) {
      setSelectedOutletId(outlets[0].id);
    }
  }, [outlets]);

  // Autofill customer parameters upon selection
  useEffect(() => {
    if (!selectedCustomerId) return;
    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (customer) {
      setGstin(customer.gstin || "");
      setCName(customer.name);
      setCEmail(customer.email || "");
      setCMobile(customer.phone || "");

      // Autofill addresses
      const billing = customer.addresses.find((a) => a.type === "BILLING");
      if (billing) {
        setBAddr(billing.address);
        setBState(billing.state);
        setBCity(billing.city);
        setBArea(billing.area || "");
        setBPincode(billing.pincode);
      }

      const delivery = customer.addresses.find((a) => a.type === "SHIPPING");
      if (delivery) {
        setDAddr(delivery.address);
        setDState(delivery.state);
        setDCity(delivery.city);
        setDArea(delivery.area || "");
        setDPincode(delivery.pincode);
      }
    }
  }, [selectedCustomerId, customers]);

  // Tax calculation trigger when addresses, outlets, or item changes
  const sellerState = outlets.find((o) => o.id === selectedOutletId)?.branch.address || "Tamil Nadu"; // Default state fallback

  const recalculateTaxes = (itemRows: InvoiceItemRow[]) => {
    return itemRows.map((item) => {
      const res = calculateGst({
        rate: item.rate,
        quantity: item.quantity,
        discount: item.discount,
        baseGstRate: item.gstRate,
        sellerState,
        buyerState: dState || bState || "Tamil Nadu", // Use delivery state
        isInclusive: false,
      });

      return {
        ...item,
        taxableAmt: res.taxableAmount,
        cgstRate: res.cgstRate,
        cgstAmt: res.cgstAmount,
        sgstRate: res.sgstRate,
        sgstAmt: res.sgstAmount,
        igstRate: res.igstRate,
        igstAmt: res.igstAmount,
        totalAmt: res.totalAmount,
      };
    });
  };

  useEffect(() => {
    if (items.length > 0) {
      setItems((prev) => recalculateTaxes(prev));
    }
  }, [dState, selectedOutletId]);

  const handleAddItem = () => {
    if (products.length === 0 || warehouses.length === 0) return;
    
    // Choose first product and warehouse default
    const prod = products[0];
    const wh = warehouses[0];
    const binId = wh.locations[0]?.racks[0]?.bins[0]?.id || "";

    const newRow: InvoiceItemRow = {
      productId: prod.id,
      variantId: prod.variants?.[0]?.id ?? prod.id, // the product's default variant
      sku: prod.sku,
      description: prod.name,
      warehouseId: wh.id,
      binId,
      unitId: prod.unit.id,
      unitCode: prod.unit.code,
      quantity: 1,
      rate: Number(prod.sellingPrice),
      discount: 0,
      taxableAmt: Number(prod.sellingPrice),
      gstRate: Number(prod.gstRate),
      cgstRate: 0,
      cgstAmt: 0,
      sgstRate: 0,
      sgstAmt: 0,
      igstRate: 0,
      igstAmt: 0,
      totalAmt: Number(prod.sellingPrice),
    };

    setItems((prev) => recalculateTaxes([...prev, newRow]));
  };

  const handleItemProductChange = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        productId: prod.id,
        variantId: prod.variants?.[0]?.id ?? prod.id,
        sku: prod.sku,
        description: prod.name,
        unitId: prod.unit.id,
        unitCode: prod.unit.code,
        rate: Number(prod.sellingPrice),
        gstRate: Number(prod.gstRate),
      };
      return recalculateTaxes(copy);
    });
  };

  const handleItemQtyChange = (index: number, val: string) => {
    const qty = parseFloat(val) || 0;
    setItems((prev) => {
      const copy = [...prev];
      copy[index].quantity = qty;
      return recalculateTaxes(copy);
    });
  };

  const handleItemRateChange = (index: number, val: string) => {
    const rate = parseFloat(val) || 0;
    setItems((prev) => {
      const copy = [...prev];
      copy[index].rate = rate;
      return recalculateTaxes(copy);
    });
  };

  const handleItemDiscountChange = (index: number, val: string) => {
    const discount = parseFloat(val) || 0;
    setItems((prev) => {
      const copy = [...prev];
      copy[index].discount = discount;
      return recalculateTaxes(copy);
    });
  };

  const handleItemWarehouseChange = (index: number, whId: string) => {
    const wh = warehouses.find((w) => w.id === whId);
    const binId = wh?.locations[0]?.racks[0]?.bins[0]?.id || "";
    setItems((prev) => {
      const copy = [...prev];
      copy[index].warehouseId = whId;
      copy[index].binId = binId;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Computations
  const noOfItems = items.length;
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalTaxable = items.reduce((sum, item) => sum + item.taxableAmt, 0);
  const totalDiscount = items.reduce((sum, item) => sum + item.discount, 0);
  
  const totalCGST = items.reduce((sum, item) => sum + item.cgstAmt, 0);
  const totalSGST = items.reduce((sum, item) => sum + item.sgstAmt, 0);
  const totalIGST = items.reduce((sum, item) => sum + item.igstAmt, 0);
  const totalTax = totalCGST + totalSGST + totalIGST;

  const rawPayable = totalTaxable + totalTax;
  const totalPayable = Math.round(rawPayable);
  const roundOff = totalPayable - rawPayable;

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId || !selectedOutletId || items.length === 0) {
      setMessage({ type: "error", text: "Please select customer, outlet, and add at least one item." });
      return;
    }

    setIsSubmitting(true);

    const activeOutlet = outlets.find((o) => o.id === selectedOutletId);
    const branchId = activeOutlet?.branch.id || "";

    const res = await createInvoice({
      customerId: selectedCustomerId,
      branchId,
      outletId: selectedOutletId,
      docSeries,
      salesLedgerId: undefined,
      invoiceNo: docNo,
      invoiceDate: new Date(invoiceDate),
      dueDate: new Date(dueDate),
      invoiceType,
      natureOfTrans,
      poNumber: poNumber || undefined,
      poDate: poDate ? new Date(poDate) : undefined,

      // Logistics
      ewayBillNo: ewayNo || undefined,
      transDocNo: transDocNo || undefined,
      transDate: transDate ? new Date(transDate) : undefined,
      distance: parseFloat(distance) || 0,
      transMode,
      shippingType,
      transporterName: transporter || undefined,
      driverName: driverName || undefined,
      driverPhone: driverPhone || undefined,
      vehicleNo: vehicleNo || undefined,

      // Addresses
      billingAddress: bAddr,
      billingState: bState,
      billingCity: bCity,
      billingArea: bArea || undefined,
      billingPincode: bPincode,

      deliveryAddress: dAddr,
      deliveryState: dState,
      deliveryCity: dCity,
      deliveryArea: dArea || undefined,
      deliveryPincode: dPincode,

      // Totals
      noOfItems,
      totalQty,
      totalTaxable,
      totalDiscount,
      totalTax,
      totalPayable,
      roundOff,

      items: items.map((item) => ({
        variantId: item.variantId,
        warehouseId: item.warehouseId,
        binId: item.binId || undefined,
        unitId: item.unitId,
        quantity: item.quantity,
        rate: item.rate,
        discount: item.discount,
        taxableAmt: item.taxableAmt,
        gstRate: item.gstRate,
        cgstRate: item.cgstRate,
        cgstAmt: item.cgstAmt,
        sgstRate: item.sgstRate,
        sgstAmt: item.sgstAmt,
        igstRate: item.igstRate,
        igstAmt: item.igstAmt,
        totalAmt: String(item.totalAmt),
      })),
    });

    setIsSubmitting(false);

    if (res.error) {
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({ type: "success", text: "Invoice created successfully!" });
      router.push("/sales");
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSaveInvoice} className="space-y-4 text-xs text-slate-700 select-none pb-12">
      {/* Alert message banner */}
      {message && (
        <div
          className={`p-3 rounded border flex items-center space-x-2 ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Header Path Info */}
      <div className="flex justify-between items-center bg-white p-3 border border-slate-200 rounded-sm shadow-xs">
        <div className="flex items-center space-x-1.5 text-slate-500 font-medium">
          <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push("/sales")}>
            Sales Invoice
          </span>
          <span>/</span>
          <span className="text-slate-900 font-bold">Add Invoice</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => router.push("/sales")}
            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-sm font-semibold transition"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSubmitting || items.length === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-bold shadow-xs transition disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Invoice"}
          </button>
        </div>
      </div>

      {/* Panel 1: Invoice Details */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-4">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
          Invoice Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Customer / Company *</label>
            <select
              required
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 font-medium"
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">GSTIN</label>
            <input
              type="text"
              readOnly
              value={gstin}
              placeholder="Auto-filled"
              className="w-full px-2.5 py-1.5 border border-slate-200 bg-slate-100 text-slate-500 rounded-sm outline-none font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Outlet *</label>
            <select
              required
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 font-medium"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Doc Series</label>
            <input
              type="text"
              value={docSeries}
              onChange={(e) => setDocSeries(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Sales Ledger</label>
            <select
              value={salesLedger}
              onChange={(e) => setSalesLedger(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            >
              <option value="Sales Standard">Sales Standard</option>
              <option value="Sales Interstate">Sales Interstate</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Name</label>
            <input
              type="text"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Email</label>
            <input
              type="email"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Mobile</label>
            <input
              type="text"
              value={cMobile}
              onChange={(e) => setCMobile(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Doc No (Invoice #)</label>
            <input
              type="text"
              required
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm font-mono font-bold focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Invoice Type</label>
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            >
              <option value="TAX">TAX Invoice</option>
              <option value="RETAIL">RETAIL Bill</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Nature of Transaction</label>
            <input
              type="text"
              value={natureOfTrans}
              onChange={(e) => setNatureOfTrans(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">PO Number</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-8902"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">PO Date</label>
            <input
              type="date"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Panel 2: Billing & Delivery Addresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Billing Address Card */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              <span>Billing Address</span>
            </h3>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Billing State *</label>
                <input
                  type="text"
                  required
                  value={bState}
                  onChange={(e) => setBState(e.target.value)}
                  placeholder="Tamil Nadu"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">City *</label>
                <input
                  type="text"
                  required
                  value={bCity}
                  onChange={(e) => setBCity(e.target.value)}
                  placeholder="Vellore"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Pincode *</label>
                <input
                  type="text"
                  required
                  value={bPincode}
                  onChange={(e) => setBPincode(e.target.value)}
                  placeholder="632001"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-500">Billing Area / Street Address *</label>
              <textarea
                required
                rows={2}
                value={bAddr}
                onChange={(e) => setBAddr(e.target.value)}
                placeholder="12, Main Street, Katpadi"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Delivery Address Card */}
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1">
              <MapPin className="h-3.5 w-3.5 text-blue-600" />
              <span>Delivery Address</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setDState(bState);
                setDCity(bCity);
                setDPincode(bPincode);
                setDAddr(bAddr);
              }}
              className="text-[10px] text-blue-600 hover:underline font-semibold"
            >
              Copy Billing Address
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Delivery State *</label>
                <input
                  type="text"
                  required
                  value={dState}
                  onChange={(e) => setDState(e.target.value)}
                  placeholder="Tamil Nadu"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">City *</label>
                <input
                  type="text"
                  required
                  value={dCity}
                  onChange={(e) => setDCity(e.target.value)}
                  placeholder="Vellore"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-500">Pincode *</label>
                <input
                  type="text"
                  required
                  value={dPincode}
                  onChange={(e) => setDPincode(e.target.value)}
                  placeholder="632001"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-500">Delivery Area / Street Address *</label>
              <textarea
                required
                rows={2}
                value={dAddr}
                onChange={(e) => setDAddr(e.target.value)}
                placeholder="12, Main Street, Katpadi"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Panel 3: Transportation & Logistics */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-4">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center space-x-1.5">
          <Truck className="h-4 w-4 text-blue-600" />
          <span>Transportation & Logistics Details</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">E-Way Bill No</label>
            <input
              type="text"
              value={ewayNo}
              onChange={(e) => setEwayNo(e.target.value)}
              placeholder="e.g. 121012345678"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Trans Doc No</label>
            <input
              type="text"
              value={transDocNo}
              onChange={(e) => setTransDocNo(e.target.value)}
              placeholder="LR Number / GR No"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Trans Date</label>
            <input
              type="date"
              value={transDate}
              onChange={(e) => setTransDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Distance (Kms)</label>
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Transportation Mode</label>
            <select
              value={transMode}
              onChange={(e) => setTransMode(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            >
              <option value="ROAD">ROAD</option>
              <option value="AIR">AIR</option>
              <option value="RAIL">RAIL</option>
              <option value="SHIP">SHIP</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Shipping Type</label>
            <input
              type="text"
              value={shippingType}
              onChange={(e) => setShippingType(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Transporter Name</label>
            <input
              type="text"
              value={transporter}
              onChange={(e) => setTransporter(e.target.value)}
              placeholder="e.g. Professional Logistics"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Driver Name</label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Driver Number</label>
            <input
              type="text"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              placeholder="Mobile Phone"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-500">Vehicle Number</label>
            <input
              type="text"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              placeholder="e.g. TN-23-AX-1234"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm font-mono focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Panel 4: Invoice Item Table */}
      <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Invoice Items Allocation
          </h3>
          <button
            type="button"
            onClick={handleAddItem}
            disabled={products.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-[10px] font-bold transition disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            <span>Add Item</span>
          </button>
        </div>

        {/* Items Desktop Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
              <tr>
                <th className="px-3 py-2 border-b w-64">Product *</th>
                <th className="px-3 py-2 border-b w-32">SKU</th>
                <th className="px-3 py-2 border-b w-32">Warehouse *</th>
                <th className="px-3 py-2 border-b w-24 text-right">Qty *</th>
                <th className="px-3 py-2 border-b w-20 text-center">Unit</th>
                <th className="px-3 py-2 border-b w-24 text-right">Rate *</th>
                <th className="px-3 py-2 border-b w-24 text-right">Discount (₹)</th>
                <th className="px-3 py-2 border-b w-24 text-right">Taxable Amt</th>
                <th className="px-3 py-2 border-b w-20 text-center">GST %</th>
                <th className="px-3 py-2 border-b w-24 text-right">CGST</th>
                <th className="px-3 py-2 border-b w-24 text-right">SGST</th>
                <th className="px-3 py-2 border-b w-24 text-right">IGST</th>
                <th className="px-3 py-2 border-b w-28 text-right">Total Amount</th>
                <th className="px-2 py-2 border-b text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-slate-400">
                    No items allocated. Click "Add Item" to add product details.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    {/* Product Select */}
                    <td className="px-3 py-1.5">
                      <select
                        value={item.productId}
                        onChange={(e) => handleItemProductChange(idx, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 bg-white rounded-sm outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-1.5 font-mono text-slate-500">{item.sku}</td>

                    {/* Warehouse */}
                    <td className="px-3 py-1.5">
                      <select
                        value={item.warehouseId}
                        onChange={(e) => handleItemWarehouseChange(idx, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 bg-white rounded-sm outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded-sm text-right outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      />
                    </td>

                    {/* Unit */}
                    <td className="px-3 py-1.5 text-center text-slate-500 uppercase">
                      {item.unitCode}
                    </td>

                    {/* Rate */}
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={item.rate}
                        onChange={(e) => handleItemRateChange(idx, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded-sm text-right outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      />
                    </td>

                    {/* Discount */}
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.discount}
                        onChange={(e) => handleItemDiscountChange(idx, e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded-sm text-right outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    {/* Taxable Amount */}
                    <td className="px-3 py-1.5 text-right font-medium">
                      ₹{item.taxableAmt.toFixed(2)}
                    </td>

                    {/* GST Rate */}
                    <td className="px-3 py-1.5 text-center text-slate-500">{item.gstRate}%</td>

                    {/* Tax Splits */}
                    <td className="px-3 py-1.5 text-right text-slate-400">
                      {item.cgstRate > 0 ? `₹${item.cgstAmt.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-400">
                      {item.sgstRate > 0 ? `₹${item.sgstAmt.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-400">
                      {item.igstRate > 0 ? `₹${item.igstAmt.toFixed(2)}` : "-"}
                    </td>

                    {/* Total Row Amount */}
                    <td className="px-3 py-1.5 text-right font-bold text-slate-900">
                      ₹{item.totalAmt.toFixed(2)}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-slate-100 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Items Mobile Cards (< 768px) */}
        <div className="md:hidden space-y-3">
          {items.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs border border-dashed rounded-lg bg-slate-50">
              No items allocated. Click "Add Item" to add product details.
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                <div className="flex justify-between items-center gap-2 border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-700 text-[11px] uppercase">Item #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-red-600 font-semibold text-xs flex items-center space-x-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Product *</label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleItemProductChange(idx, e.target.value)}
                    className="w-full p-2 border border-slate-300 bg-white rounded outline-none text-xs font-semibold"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Warehouse *</label>
                    <select
                      value={item.warehouseId}
                      onChange={(e) => handleItemWarehouseChange(idx, e.target.value)}
                      className="w-full p-1.5 border border-slate-300 bg-white rounded outline-none text-xs"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantity ({item.unitCode}) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item.quantity}
                      onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded text-right font-semibold text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rate (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={item.rate}
                      onChange={(e) => handleItemRateChange(idx, e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded text-right font-semibold text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Discount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) => handleItemDiscountChange(idx, e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded text-right text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="p-2 bg-white rounded border border-slate-200 flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">GST: {item.gstRate}%</span>
                    <span className="text-slate-600 font-medium">Taxable: ₹{item.taxableAmt.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Row Total</span>
                    <span className="font-extrabold text-blue-600 text-sm">₹{item.totalAmt.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary Totals Footer Panel */}
      <div className="bg-slate-900 text-slate-300 p-4 border border-slate-800 rounded-sm shadow-md grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Items / Total Qty
          </span>
          <span className="text-sm font-extrabold text-white">
            {noOfItems} Lines / {totalQty} Unit(s)
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Discount
          </span>
          <span className="text-sm font-bold text-rose-400">
            ₹{totalDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            GST Tax Amount
          </span>
          <span className="text-sm font-bold text-blue-400">
            ₹{totalTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Payable Amount (Round Off {roundOff.toFixed(2)})
          </span>
          <span className="text-lg font-black text-white">
            ₹{totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </form>
  );
}
