"use client";

import React, { useState, useTransition } from "react";
import {
  Package,
  Plus,
  Search,
  FolderPlus,
  Tag,
  Ruler,
  Warehouse,
  CheckCircle,
  AlertCircle,
  QrCode,
  Printer,
  RefreshCw,
} from "lucide-react";
import {
  createCategory,
  createBrand,
  createUnit,
  createProduct,
  getProductStockDetailsAction,
  backfillProductQrCodesAction,
} from "@/app/(dashboard)/stock/actions";
import ProductQrScanner from "@/components/erp/ProductQrScanner";

interface ProductRow {
  id: string;
  code: string;
  name: string;
  sku: string;
  hsnCode: string;
  category: string;
  brand: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minStock: number;
  reorderLevel: number;
  currentStock: number;
}

interface MasterItem {
  id: string;
  name: string;
  code: string;
}

interface StockClientProps {
  products: ProductRow[];
  categories: MasterItem[];
  brands: MasterItem[];
  units: MasterItem[];
  warehouses: MasterItem[];
  viewOnly?: boolean;
}

export default function StockClient({
  products,
  categories,
  brands,
  units,
  warehouses,
  viewOnly = false,
}: StockClientProps) {
  const [activeTab, setActiveTab] = useState("products");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [selectedProductDetails, setSelectedProductDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [catName, setCatName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandCode, setBrandCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitCode, setUnitCode] = useState("");

  const [pName, setPName] = useState("");
  const [pSku, setPSku] = useState("");
  const [pCode, setPCode] = useState("");
  const [pBarcode, setPBarcode] = useState("");
  const [pCategoryId, setPCategoryId] = useState("");
  const [pBrandId, setPBrandId] = useState("");
  const [pUnitId, setPUnitId] = useState("");
  const [pHsn, setPHsn] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pPurchasePrice, setPPurchasePrice] = useState("0");
  const [pSellingPrice, setPSellingPrice] = useState("0");
  const [pMrp, setPMrp] = useState("0");
  const [pGstRate, setPGstRate] = useState("18");
  const [pMinStock, setPMinStock] = useState("0");
  const [pReorder, setPReorder] = useState("0");
  const [pWarehouseId, setPWarehouseId] = useState("");
  const [pOpeningStock, setPOpeningStock] = useState("0");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleOpenProductDetails = async (productId: string) => {
    setLoadingDetails(true);
    setSelectedProductDetails(null);
    try {
      const res = await getProductStockDetailsAction(productId);
      if (res.success && res.data) {
        setSelectedProductDetails(res.data);
      } else {
        showMsg(res.error || "Failed to load product QR details", "error");
      }
    } catch (err: any) {
      showMsg(err.message || "Failed to load product details", "error");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleBackfillQrCodes = () => {
    startTransition(async () => {
      const res = await backfillProductQrCodesAction();
      if (res.success && res.data) {
        showMsg(
          `QR Sync Completed: ${res.data.generated} new QR codes generated. (Total products: ${res.data.total})`,
          "success"
        );
      } else {
        showMsg(res.error || "Failed to sync QR codes", "error");
      }
    });
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName || !catCode) return;
    const res = await createCategory(catName, catCode);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Category created successfully!");
      setCatName("");
      setCatCode("");
    }
  };

  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName || !brandCode) return;
    const res = await createBrand(brandName, brandCode);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Brand created successfully!");
      setBrandName("");
      setBrandCode("");
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName || !unitCode) return;
    const res = await createUnit(unitName, unitCode);
    if (res.error) showMsg(res.error, "error");
    else {
      showMsg("Unit created successfully!");
      setUnitName("");
      setUnitCode("");
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName || !pSku || !pCode || !pCategoryId || !pUnitId) {
      showMsg("Please fill in all required fields.", "error");
      return;
    }

    const res = await createProduct({
      name: pName,
      sku: pSku,
      code: pCode,
      barcode: pBarcode || undefined,
      categoryId: pCategoryId,
      brandId: pBrandId || undefined,
      unitId: pUnitId,
      hsnCode: pHsn || undefined,
      description: pDesc || undefined,
      purchasePrice: parseFloat(pPurchasePrice) || 0,
      sellingPrice: parseFloat(pSellingPrice) || 0,
      mrp: parseFloat(pMrp) || 0,
      gstRate: parseFloat(pGstRate) || 18,
      minStock: parseFloat(pMinStock) || 0,
      reorderLevel: parseFloat(pReorder) || 0,
      warehouseId: pWarehouseId || undefined,
      openingStock: parseFloat(pOpeningStock) || 0,
    });

    if (res.error) {
      showMsg(res.error, "error");
    } else {
      showMsg("Product created successfully!");
      setShowProductForm(false);
      // Reset product states
      setPName("");
      setPSku("");
      setPCode("");
      setPBarcode("");
      setPCategoryId("");
      setPBrandId("");
      setPUnitId("");
      setPHsn("");
      setPDesc("");
      setPPurchasePrice("0");
      setPSellingPrice("0");
      setPMrp("0");
      setPGstRate("18");
      setPMinStock("0");
      setPReorder("0");
      setPWarehouseId("");
      setPOpeningStock("0");
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 1. Global Message Alerts */}
      {message && (
        <div
          className={`p-3 rounded border text-xs flex items-center space-x-2 ${
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

      {/* 2. Tabs Selector (Hidden in View-Only mode) */}
      {!viewOnly && (
        <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-lg overflow-x-auto overflow-y-hidden no-scrollbar">
          <button
            onClick={() => setActiveTab("products")}
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-1.5 sm:space-x-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "products"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            <span>Products</span>
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-1.5 sm:space-x-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "categories"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>Categories</span>
          </button>
          <button
            onClick={() => setActiveTab("brands")}
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-1.5 sm:space-x-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "brands"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            <span>Brands</span>
          </button>
          <button
            onClick={() => setActiveTab("units")}
            className={`px-3 sm:px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-1.5 sm:space-x-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "units"
                ? "border-blue-600 text-blue-600 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            <span>Units</span>
          </button>
        </div>
      )}

      {/* 3. Products List View */}
      {activeTab === "products" && (
        <div className="space-y-3 sm:space-y-4">
          {/* Action Toolbar */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-2 bg-white p-2.5 sm:p-3 border border-slate-200 rounded-lg shadow-xs">
            <div className="relative w-full lg:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products SKU, Code, or Name..."
                className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowScannerModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <QrCode className="h-3.5 w-3.5 text-blue-400" />
                <span>Scan Product QR</span>
              </button>

              {!viewOnly && (
                <>
                  <button
                    type="button"
                    onClick={handleBackfillQrCodes}
                    disabled={isPending}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 shadow-xs transition disabled:opacity-50 cursor-pointer"
                    title="Generate permanent QR codes for all products missing them"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                    <span>Sync QR Codes</span>
                  </button>

                  <button
                    onClick={() => setShowProductForm(!showProductForm)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition shadow-xs cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{showProductForm ? "Cancel" : "Add Product"}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* New Product Form Panel */}
          {!viewOnly && showProductForm && (
            <form
              onSubmit={handleCreateProduct}
              className="bg-white p-6 border border-slate-200 rounded-sm shadow-sm space-y-4 text-xs text-slate-700 animate-in fade-in duration-200"
            >
              <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
                Create New Product Master
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Inputs */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="e.g. Kajaria White Ceramic Tiles"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Product SKU *</label>
                  <input
                    type="text"
                    required
                    value={pSku}
                    onChange={(e) => setPSku(e.target.value)}
                    placeholder="e.g. KA-WT-12X12"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Product Code *</label>
                  <input
                    type="text"
                    required
                    value={pCode}
                    onChange={(e) => setPCode(e.target.value)}
                    placeholder="e.g. PRD0001"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Barcode</label>
                  <input
                    type="text"
                    value={pBarcode}
                    onChange={(e) => setPBarcode(e.target.value)}
                    placeholder="Barcode string"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Category *</label>
                  <select
                    required
                    value={pCategoryId}
                    onChange={(e) => setPCategoryId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Brand</label>
                  <select
                    value={pBrandId}
                    onChange={(e) => setPBrandId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  >
                    <option value="">Select Brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Unit of Measurement *</label>
                  <select
                    required
                    value={pUnitId}
                    onChange={(e) => setPUnitId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  >
                    <option value="">Select Unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">HSN/SAC Code</label>
                  <input
                    type="text"
                    value={pHsn}
                    onChange={(e) => setPHsn(e.target.value)}
                    placeholder="HSN Number"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Purchase Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pPurchasePrice}
                    onChange={(e) => setPPurchasePrice(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pSellingPrice}
                    onChange={(e) => setPSellingPrice(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">MRP (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={pMrp}
                    onChange={(e) => setPMrp(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">GST Rate (%)</label>
                  <select
                    value={pGstRate}
                    onChange={(e) => setPGstRate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Minimum Stock Threshold</label>
                  <input
                    type="number"
                    value={pMinStock}
                    onChange={(e) => setPMinStock(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Reorder Alert Level</label>
                  <input
                    type="number"
                    value={pReorder}
                    onChange={(e) => setPReorder(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  />
                </div>

                {/* Opening stock */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Opening Warehouse</label>
                  <select
                    value={pWarehouseId}
                    onChange={(e) => setPWarehouseId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600">Opening Stock Qty</label>
                  <input
                    type="number"
                    disabled={!pWarehouseId}
                    value={pOpeningStock}
                    onChange={(e) => setPOpeningStock(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-1 col-span-4">
                <label className="font-semibold text-slate-600">Description</label>
                <textarea
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  placeholder="Details about product..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
                >
                  Create Product & Record Stock
                </button>
              </div>
            </form>
          )}

          {/* Products Dense Data Table (Desktop >= 768px) */}
          <div className="hidden xl:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-2 border-b">Code</th>
                  <th className="px-4 py-2 border-b">Name</th>
                  <th className="px-4 py-2 border-b">SKU</th>
                  <th className="px-4 py-2 border-b">Category</th>
                  <th className="px-4 py-2 border-b">Brand</th>
                  <th className="px-4 py-2 border-b">UoM</th>
                  <th className="px-4 py-2 border-b text-right">Purchase Price</th>
                  <th className="px-4 py-2 border-b text-right">Selling Price</th>
                  <th className="px-4 py-2 border-b text-right">Min Stock</th>
                  <th className="px-4 py-2 border-b text-right">Current Stock</th>
                  <th className="px-4 py-2 border-b text-center">QR & Live Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                      No products found. Add a product to get started.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                        {p.code}
                      </td>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{p.sku}</td>
                      <td className="px-4 py-2">{p.category}</td>
                      <td className="px-4 py-2">{p.brand}</td>
                      <td className="px-4 py-2 text-slate-500 uppercase">{p.unit}</td>
                      <td className="px-4 py-2 text-right">₹{p.purchasePrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-blue-600">
                        ₹{p.sellingPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">{p.minStock}</td>
                      <td className="px-4 py-2 text-right font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm text-[11px] ${
                            p.currentStock <= p.reorderLevel
                              ? "bg-red-50 text-red-600 border border-red-200"
                              : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          }`}
                        >
                          {p.currentStock}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenProductDetails(p.id)}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded text-[11px] font-medium transition"
                          title="View permanent QR code & live warehouse stock"
                        >
                          <QrCode className="h-3 w-3 text-blue-600" />
                          <span>QR / Stock</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Products Card View (Mobile < 768px) */}
          <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredProducts.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm">
                No products found. Add a product to get started.
              </div>
            ) : (
              filteredProducts.map((p) => (
                <div key={p.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm leading-snug">{p.name}</h4>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        SKU: {p.sku} | Code: {p.code}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                        p.currentStock <= p.reorderLevel
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      Stock: {p.currentStock} {p.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Category & Brand</span>
                      <span className="text-slate-800 font-medium block truncate">
                        {p.category} {p.brand ? `• ${p.brand}` : ""}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Selling Price</span>
                      <span className="font-bold text-blue-600 text-sm block">
                        ₹{p.sellingPrice.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Purchase Price</span>
                      <span className="text-slate-600 block">₹{p.purchasePrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase font-bold text-slate-400 block">Min / Reorder</span>
                      <span className="text-slate-600 block">
                        Min: {p.minStock} | Reorder: {p.reorderLevel}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleOpenProductDetails(p.id)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center justify-center space-x-2 transition min-h-[42px]"
                    >
                      <QrCode className="h-4 w-4 text-blue-400" />
                      <span>View QR & Live Warehouse Stock</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. Categories Management */}
      {activeTab === "categories" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Category */}
          <div className="bg-white p-4 border border-slate-200 rounded-sm shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <FolderPlus className="h-4 w-4" />
              <span>Add Category</span>
            </h3>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Category Name</label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Ceramic Tiles"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Category Code</label>
                <input
                  type="text"
                  required
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  placeholder="e.g. CAT-TILES"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
              >
                Create Category
              </button>
            </form>
          </div>

          {/* List Categories */}
          <div className="md:col-span-2 space-y-3">
            {/* Desktop Table View */}
            <div className="hidden xl:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2 border-b">Code</th>
                    <th className="px-4 py-2 border-b">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                        No categories found
                      </td>
                    </tr>
                  ) : (
                    categories.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                          {c.code}
                        </td>
                        <td className="px-4 py-2">{c.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-2">
              {categories.length === 0 ? (
                <div className="bg-white p-4 text-center text-slate-400 border border-slate-200 rounded-sm text-xs">
                  No categories found
                </div>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="bg-white p-3 border border-slate-200 rounded-lg shadow-xs flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{c.name}</span>
                      <span className="font-mono text-slate-400 text-[11px]">{c.code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Brands Management */}
      {activeTab === "brands" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Brand */}
          <div className="bg-white p-4 border border-slate-200 rounded-sm shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Tag className="h-4 w-4" />
              <span>Add Brand</span>
            </h3>
            <form onSubmit={handleCreateBrand} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Brand Name</label>
                <input
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Kajaria"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Brand Code</label>
                <input
                  type="text"
                  required
                  value={brandCode}
                  onChange={(e) => setBrandCode(e.target.value)}
                  placeholder="e.g. BR-KAJ"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
              >
                Create Brand
              </button>
            </form>
          </div>

          {/* List Brands */}
          <div className="md:col-span-2 space-y-3">
            {/* Desktop Table View */}
            <div className="hidden xl:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2 border-b">Code</th>
                    <th className="px-4 py-2 border-b">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {brands.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                        No brands found
                      </td>
                    </tr>
                  ) : (
                    brands.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                          {b.code}
                        </td>
                        <td className="px-4 py-2">{b.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-2">
              {brands.length === 0 ? (
                <div className="bg-white p-4 text-center text-slate-400 border border-slate-200 rounded-sm text-xs">
                  No brands found
                </div>
              ) : (
                brands.map((b) => (
                  <div key={b.id} className="bg-white p-3 border border-slate-200 rounded-lg shadow-xs flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{b.name}</span>
                      <span className="font-mono text-slate-400 text-[11px]">{b.code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Units Management */}
      {activeTab === "units" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Create Unit */}
          <div className="bg-white p-4 border border-slate-200 rounded-sm shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Ruler className="h-4 w-4" />
              <span>Add Measurement Unit</span>
            </h3>
            <form onSubmit={handleCreateUnit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Unit Name</label>
                <input
                  type="text"
                  required
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="e.g. Square Feet"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-600">Unit Code</label>
                <input
                  type="text"
                  required
                  value={unitCode}
                  onChange={(e) => setUnitCode(e.target.value)}
                  placeholder="e.g. SQFT"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-sm font-semibold transition"
              >
                Create Unit
              </button>
            </form>
          </div>

          {/* List Units */}
          <div className="md:col-span-2 space-y-3">
            {/* Desktop Table View */}
            <div className="hidden xl:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2 border-b">Code</th>
                    <th className="px-4 py-2 border-b">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {units.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                        No units found
                      </td>
                    </tr>
                  ) : (
                    units.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-semibold text-slate-900">
                          {u.code}
                        </td>
                        <td className="px-4 py-2">{u.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-2">
              {units.length === 0 ? (
                <div className="bg-white p-4 text-center text-slate-400 border border-slate-200 rounded-sm text-xs">
                  No units found
                </div>
              ) : (
                units.map((u) => (
                  <div key={u.id} className="bg-white p-3 border border-slate-200 rounded-lg shadow-xs flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{u.name}</span>
                      <span className="font-mono text-slate-400 text-[11px]">{u.code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR SCANNER MODAL */}
      {showScannerModal && (
        <ProductQrScanner isModal onClose={() => setShowScannerModal(false)} />
      )}

      {/* PRODUCT QR DETAILS & LIVE STOCK MODAL */}
      {selectedProductDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-md">
                  <QrCode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedProductDetails.product.name}
                  </h3>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2">
                    <span>Code: {selectedProductDetails.product.code}</span>
                    <span>•</span>
                    <span>SKU: {selectedProductDetails.product.sku}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto text-xs">
              {/* Printable QR Card */}
              <div
                id="product-qr-card-print"
                className="bg-white border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col sm:flex-row items-center gap-4 shadow-xs"
              >
                <div className="bg-white p-2 border border-slate-200 rounded-md shadow-xs shrink-0 flex flex-col items-center">
                  {selectedProductDetails.product.qrDataUrl ? (
                    <img
                      src={selectedProductDetails.product.qrDataUrl}
                      alt={selectedProductDetails.product.name}
                      className="w-36 h-36 object-contain"
                    />
                  ) : (
                    <div className="w-36 h-36 bg-slate-100 flex items-center justify-center text-slate-400 font-mono">
                      No QR Generated
                    </div>
                  )}
                  <span className="text-[11px] font-mono text-slate-700 mt-1 font-bold tracking-wider">
                    {selectedProductDetails.product.qrCode}
                  </span>
                </div>

                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-bold uppercase tracking-wider">
                    Permanent Product QR
                  </div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {selectedProductDetails.product.name}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Category</span>
                      <span className="font-semibold text-slate-800">
                        {typeof selectedProductDetails.product.category === "string"
                          ? selectedProductDetails.product.category
                          : selectedProductDetails.product.category?.name || "Standard"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Brand</span>
                      <span className="font-semibold text-slate-800">
                        {typeof selectedProductDetails.product.brand === "string"
                          ? selectedProductDetails.product.brand
                          : selectedProductDetails.product.brand?.name || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Selling Price</span>
                      <span className="font-bold text-blue-600">
                        ₹{Number(selectedProductDetails.product.sellingPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">HSN Code</span>
                      <span className="font-mono text-slate-700">
                        {selectedProductDetails.product.hsnCode || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const printWin = window.open("", "_blank");
                        if (printWin) {
                          printWin.document.write(`
                            <html>
                              <head>
                                <title>Print QR - ${selectedProductDetails.product.name}</title>
                                <style>
                                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                                  .label { border: 2px solid #000; padding: 16px; width: 300px; text-align: center; border-radius: 8px; }
                                  .title { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
                                  .sub { font-size: 11px; color: #555; margin-bottom: 12px; }
                                  .qr { width: 180px; height: 180px; margin: 0 auto; display: block; }
                                  .token { font-family: monospace; font-size: 11px; margin-top: 8px; font-weight: bold; }
                                  .price { font-size: 14px; font-weight: bold; margin-top: 8px; color: #000; }
                                </style>
                              </head>
                              <body>
                                <div class="label">
                                  <div class="title">${selectedProductDetails.product.name}</div>
                                  <div class="sub">SKU: ${selectedProductDetails.product.sku} | Code: ${selectedProductDetails.product.code}</div>
                                  <img class="qr" src="${selectedProductDetails.product.qrDataUrl}" />
                                  <div class="token">${selectedProductDetails.product.qrCode}</div>
                                  <div class="price">Price: ₹${Number(selectedProductDetails.product.sellingPrice || 0).toFixed(2)}</div>
                                </div>
                                <script>
                                  window.onload = function() { window.print(); window.close(); }
                                </script>
                              </body>
                            </html>
                          `);
                          printWin.document.close();
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center space-x-1.5 transition"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Print Label</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Warehouse Live Stock Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h5 className="font-bold text-slate-800 uppercase text-[11px] tracking-wider flex items-center space-x-1.5">
                    <Warehouse className="h-4 w-4 text-slate-500" />
                    <span>Current Stock Across All Warehouses</span>
                  </h5>
                  <span className="text-[11px] text-slate-400">
                    Live Database Calculation (Available = On Hand - Reserved)
                  </span>
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block border border-slate-200 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[11px]">
                      <tr>
                        <th className="px-3 py-2">Warehouse</th>
                        <th className="px-3 py-2 text-right">On Hand</th>
                        <th className="px-3 py-2 text-right">Reserved</th>
                        <th className="px-3 py-2 text-right">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {(!selectedProductDetails.warehouses || selectedProductDetails.warehouses.length === 0) ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                            No warehouses configured.
                          </td>
                        </tr>
                      ) : (
                        selectedProductDetails.warehouses.map((w: any) => (
                          <tr key={w.warehouseId} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {w.warehouseName}
                              {w.warehouseCode ? ` (${w.warehouseCode})` : ""}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{w.onHand}</td>
                            <td className="px-3 py-2 text-right text-amber-600 font-medium">
                              {w.reserved > 0 ? `${w.reserved} reserved` : "0"}
                            </td>
                            <td className="px-3 py-2 text-right font-bold">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  w.available > 0
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {w.available}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <tr>
                        <td className="px-3 py-2.5">Total Available (All Warehouses)</td>
                        <td className="px-3 py-2.5 text-right">
                          {selectedProductDetails.totalOnHand ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-700">
                          {selectedProductDetails.totalReserved ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 text-sm">
                          {selectedProductDetails.totalAvailable ?? 0}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Warehouse Stock Cards (< sm) */}
                <div className="sm:hidden space-y-2">
                  {(!selectedProductDetails.warehouses || selectedProductDetails.warehouses.length === 0) ? (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-400">
                      No warehouses configured.
                    </div>
                  ) : (
                    selectedProductDetails.warehouses.map((w: any) => (
                      <div key={w.warehouseId} className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                        <div className="font-bold text-slate-900 text-xs flex justify-between items-center">
                          <span>{w.warehouseName} {w.warehouseCode ? `(${w.warehouseCode})` : ""}</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            w.available > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                          }`}>
                            Avail: {w.available}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[11px] uppercase font-bold text-slate-400 block">On Hand</span>
                            <span className="text-slate-700 font-semibold">{w.onHand}</span>
                          </div>
                          <div>
                            <span className="text-[11px] uppercase font-bold text-slate-400 block">Reserved</span>
                            <span className="text-amber-700 font-semibold">{w.reserved}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-800 block">Total All Warehouses</span>
                      <span className="text-[11px] text-slate-500">
                        On Hand: {selectedProductDetails.totalOnHand ?? 0} | Res: {selectedProductDetails.totalReserved ?? 0}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] uppercase font-bold text-slate-500 block">Available</span>
                      <span className="text-sm font-bold text-emerald-700">{selectedProductDetails.totalAvailable ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-400 text-[11px]">
                {selectedProductDetails.lastUpdated ? `Retrieved at ${selectedProductDetails.lastUpdated}` : "Live Database Calculation"}
              </span>
              <button
                type="button"
                onClick={() => setSelectedProductDetails(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
