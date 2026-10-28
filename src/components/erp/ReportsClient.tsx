"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Printer,
  Package,
  ShoppingCart,
  Receipt,
  BookOpen,
  Search,
} from "lucide-react";

interface StockReportRow {
  code: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  purchasePrice: number;
  stockValue: number;
}

interface SalesReportRow {
  invoiceNo: string;
  customer: string;
  date: string;
  taxable: number;
  tax: number;
  payable: number;
  outlet: string;
}

interface PurchaseReportRow {
  billNo: string;
  vendor: string;
  date: string;
  taxable: number;
  tax: number;
  payable: number;
}

interface FinanceReportRow {
  code: string;
  name: string;
  type: string;
  debits: number;
  credits: number;
  balance: number;
}

interface ReportsClientProps {
  stockReport: StockReportRow[];
  salesReport: SalesReportRow[];
  purchaseReport: PurchaseReportRow[];
  financeReport: FinanceReportRow[];
}

export default function ReportsClient({
  stockReport,
  salesReport,
  purchaseReport,
  financeReport,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState("stock");
  const [searchQuery, setSearchQuery] = useState("");

  const downloadCsv = (data: any[], filename: string, headers: string[]) => {
    let csvContent = headers.join(",") + "\n";
    data.forEach((row) => {
      const line = Object.values(row)
        .map((val) => {
          let str = String(val).replace(/"/g, '""');
          if (str.includes(",") || str.includes("\n")) {
            str = `"${str}"`;
          }
          return str;
        })
        .join(",");
      csvContent += line + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportStockCsv = () => {
    downloadCsv(stockReport, "stock_valuation_report.csv", [
      "Code",
      "Name",
      "SKU",
      "Category",
      "Quantity",
      "Purchase Price",
      "Stock Value",
    ]);
  };

  const handleExportSalesCsv = () => {
    downloadCsv(salesReport, "sales_report.csv", [
      "Invoice No",
      "Customer",
      "Date",
      "Taxable Amt",
      "Tax Amt",
      "Payable",
      "Outlet",
    ]);
  };

  const handleExportPurchaseCsv = () => {
    downloadCsv(purchaseReport, "purchase_bills_report.csv", [
      "Bill No",
      "Vendor",
      "Posting Date",
      "Taxable Amt",
      "Tax Amt",
      "Payable",
    ]);
  };

  const handleExportFinanceCsv = () => {
    downloadCsv(financeReport, "coa_balances_report.csv", [
      "Account Code",
      "Account Name",
      "Type",
      "Debit Sum",
      "Credit Sum",
      "Net Balance",
    ]);
  };

  // Filter lists based on query
  const filteredStock = stockReport.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSales = salesReport.filter(
    (s) =>
      s.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.customer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPurchases = purchaseReport.filter(
    (p) =>
      p.billNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.vendor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFinance = financeReport.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 print:space-y-6">
      {/* Search and Action Toolbar (hidden on print) */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3.5 bg-white p-3 border border-slate-200 rounded-sm shadow-xs print:hidden">
        {/* Search */}
        <div className="relative max-w-xs w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-slate-400" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search report values..."
            className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={
              activeTab === "stock"
                ? handleExportStockCsv
                : activeTab === "sales"
                ? handleExportSalesCsv
                : activeTab === "purchases"
                ? handleExportPurchaseCsv
                : handleExportFinanceCsv
            }
            className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-sm text-xs font-semibold transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold transition shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs list (hidden on print) */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm print:hidden">
        <button
          onClick={() => {
            setActiveTab("stock");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "stock"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          <span>Stock Valuation</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("sales");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "sales"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>Sales Invoices</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("purchases");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "purchases"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          <span>Purchase Bills</span>
        </button>
        <button
          onClick={() => {
            setActiveTab("finance");
            setSearchQuery("");
          }}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "finance"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>COA Balances</span>
        </button>
      </div>

      {/* Printable Report Header Block (Visible ONLY during print layout) */}
      <div className="hidden print:block text-slate-900 border-b-2 border-slate-900 pb-4 text-xs space-y-1">
        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-950">
          Geetha Ceramics & ERP Systems
        </h2>
        <div className="flex justify-between font-medium">
          <span>Module: {activeTab.toUpperCase()} Ledger Report</span>
          <span>Printed on: {new Date().toLocaleDateString("en-IN")}</span>
        </div>
      </div>

      {/* 1. Stock Valuation Report */}
      {activeTab === "stock" && (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden print:block print:border-none print:shadow-none">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold print:bg-slate-100">
                <tr>
                  <th className="px-4 py-2 border-b">Code</th>
                  <th className="px-4 py-2 border-b">Name</th>
                  <th className="px-4 py-2 border-b">SKU</th>
                  <th className="px-4 py-2 border-b">Category</th>
                  <th className="px-4 py-2 border-b text-right">Available Qty</th>
                  <th className="px-4 py-2 border-b text-right">Cost Price</th>
                  <th className="px-4 py-2 border-b text-right font-bold">Valuation Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStock.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-950">{row.code}</td>
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2 font-mono text-slate-500">{row.sku}</td>
                    <td className="px-4 py-2">{row.category}</td>
                    <td className="px-4 py-2 text-right font-semibold">{row.quantity}</td>
                    <td className="px-4 py-2 text-right">₹{row.purchasePrice.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">
                      ₹{row.stockValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 print:hidden">
            {filteredStock.map((row, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{row.name}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{row.code} • SKU: {row.sku}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-xs">
                    Qty: {row.quantity}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded border border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-bold block">Cost Price</span>
                    <span className="text-slate-700 font-medium">₹{row.purchasePrice.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase font-bold block">Valuation</span>
                    <span className="font-bold text-slate-900">₹{row.stockValue.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Sales Report */}
      {activeTab === "sales" && (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden print:block print:border-none print:shadow-none">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold print:bg-slate-100">
                <tr>
                  <th className="px-4 py-2 border-b">Invoice No</th>
                  <th className="px-4 py-2 border-b">Customer</th>
                  <th className="px-4 py-2 border-b">Date</th>
                  <th className="px-4 py-2 border-b">Outlet</th>
                  <th className="px-4 py-2 border-b text-right">Taxable</th>
                  <th className="px-4 py-2 border-b text-right">GST Tax</th>
                  <th className="px-4 py-2 border-b text-right font-bold">Total Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredSales.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-950">
                      {row.invoiceNo}
                    </td>
                    <td className="px-4 py-2 font-medium">{row.customer}</td>
                    <td className="px-4 py-2 text-slate-500">{row.date}</td>
                    <td className="px-4 py-2 text-slate-500">{row.outlet}</td>
                    <td className="px-4 py-2 text-right">₹{row.taxable.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-blue-600">₹{row.tax.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">
                      ₹{row.payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 print:hidden">
            {filteredSales.map((row, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-mono font-bold text-slate-900 text-xs block">{row.invoiceNo}</span>
                    <span className="font-semibold text-slate-800 text-sm mt-0.5">{row.customer}</span>
                  </div>
                  <span className="font-bold text-emerald-700 text-sm">
                    ₹{row.payable.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Date & Outlet</span>
                    <span className="text-slate-600">{row.date} • {row.outlet}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Taxable / GST</span>
                    <span className="text-slate-600">₹{row.taxable.toFixed(0)} + ₹{row.tax.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Purchases Report */}
      {activeTab === "purchases" && (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden print:block print:border-none print:shadow-none">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold print:bg-slate-100">
                <tr>
                  <th className="px-4 py-2 border-b">Bill No</th>
                  <th className="px-4 py-2 border-b">Vendor</th>
                  <th className="px-4 py-2 border-b">Posting Date</th>
                  <th className="px-4 py-2 border-b text-right">Taxable</th>
                  <th className="px-4 py-2 border-b text-right">GST Tax</th>
                  <th className="px-4 py-2 border-b text-right font-bold">Total Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPurchases.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-950">{row.billNo}</td>
                    <td className="px-4 py-2 font-medium">{row.vendor}</td>
                    <td className="px-4 py-2 text-slate-500">{row.date}</td>
                    <td className="px-4 py-2 text-right">₹{row.taxable.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-blue-600">₹{row.tax.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">
                      ₹{row.payable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 print:hidden">
            {filteredPurchases.map((row, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-mono font-bold text-slate-900 text-xs block">{row.billNo}</span>
                    <span className="font-semibold text-slate-800 text-sm mt-0.5">{row.vendor}</span>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">
                    ₹{row.payable.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Posting Date</span>
                    <span className="text-slate-600">{row.date}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Taxable / GST</span>
                    <span className="text-slate-600">₹{row.taxable.toFixed(0)} + ₹{row.tax.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. COA Balances Report */}
      {activeTab === "finance" && (
        <div className="space-y-3">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden print:block print:border-none print:shadow-none">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold print:bg-slate-100">
                <tr>
                  <th className="px-4 py-2 border-b">Account Code</th>
                  <th className="px-4 py-2 border-b">Account Name</th>
                  <th className="px-4 py-2 border-b">Type</th>
                  <th className="px-4 py-2 border-b text-right">Debits Sum</th>
                  <th className="px-4 py-2 border-b text-right">Credits Sum</th>
                  <th className="px-4 py-2 border-b text-right font-bold">Net Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredFinance.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                    <td className="px-4 py-2 font-mono font-bold text-slate-950">{row.code}</td>
                    <td className="px-4 py-2 font-medium">{row.name}</td>
                    <td className="px-4 py-2">{row.type}</td>
                    <td className="px-4 py-2 text-right text-slate-500">₹{row.debits.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">₹{row.credits.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-bold text-blue-600">
                      ₹{row.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3 print:hidden">
            {filteredFinance.map((row, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{row.name}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{row.code} • {row.type}</span>
                  </div>
                  <span className="font-bold text-blue-600 text-sm">
                    ₹{row.balance.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Total Debits</span>
                    <span className="text-slate-700 font-medium">₹{row.debits.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">Total Credits</span>
                    <span className="text-slate-700 font-medium">₹{row.credits.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
