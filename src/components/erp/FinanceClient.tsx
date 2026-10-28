"use client";

import React, { useState } from "react";
import {
  BookOpen,
  ListFilter,
  DollarSign,
  TrendingUp,
  Scale,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { initializeChartOfAccounts } from "@/app/(dashboard)/finance/actions";

interface AccountData {
  id: string;
  code: string;
  name: string;
  type: string;
  debitSum: number;
  creditSum: number;
  balance: number;
}

interface JournalEntryItemData {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface JournalEntryData {
  id: string;
  entryNo: string;
  reference: string;
  description: string;
  date: string;
  items: JournalEntryItemData[];
}

interface FinanceClientProps {
  accounts: AccountData[];
  journalEntries: JournalEntryData[];
}

export default function FinanceClient({
  accounts = [],
  journalEntries = [],
}: FinanceClientProps) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeEntries = Array.isArray(journalEntries) ? journalEntries : [];

  const [activeTab, setActiveTab] = useState("coa");
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleInitializeCOA = async () => {
    setIsInitializing(true);
    const res = await initializeChartOfAccounts();
    setIsInitializing(false);

    if (res.error) showMsg(res.error, "error");
    else showMsg(`Initialized ${res.count} standard financial accounts successfully!`);
  };

  // 1. Calculations for Trial Balance
  const trialBalanceRows = safeAccounts.map((acc) => {
    const isDebit = acc.type === "ASSET" || acc.type === "EXPENSE";
    let debitBal = 0;
    let creditBal = 0;

    if (isDebit) {
      if ((acc.balance || 0) >= 0) debitBal = Number(acc.balance || 0);
      else creditBal = Math.abs(Number(acc.balance || 0));
    } else {
      if ((acc.balance || 0) >= 0) creditBal = Number(acc.balance || 0);
      else debitBal = Math.abs(Number(acc.balance || 0));
    }

    return {
      code: acc.code,
      name: acc.name,
      debit: debitBal,
      credit: creditBal,
    };
  });

  const totalTrialDebit = trialBalanceRows.reduce((sum, r) => sum + Number(r.debit || 0), 0);
  const totalTrialCredit = trialBalanceRows.reduce((sum, r) => sum + Number(r.credit || 0), 0);

  // 2. Profit & Loss Calculations
  const revenueAccounts = safeAccounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = safeAccounts.filter((a) => a.type === "EXPENSE");

  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  // 3. Balance Sheet Calculations
  const assetAccounts = safeAccounts.filter((a) => a.type === "ASSET");
  const liabilityAccounts = safeAccounts.filter((a) => a.type === "LIABILITY");
  const equityAccounts = safeAccounts.filter((a) => a.type === "EQUITY");

  const totalAssets = assetAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const totalEquityBase = equityAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  
  // Retained earnings is net profit from P&L
  const totalEquity = totalEquityBase + netProfit;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return (
    <div className="space-y-4">
      {/* Alert toast */}
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

      {/* Tabs selectors */}
      <div className="flex border-b border-slate-200 bg-white px-2 pt-1 shadow-xs rounded-sm">
        <button
          onClick={() => setActiveTab("coa")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "coa"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Chart of Accounts</span>
        </button>
        <button
          onClick={() => setActiveTab("journal")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "journal"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span>Journal Entries</span>
        </button>
        <button
          onClick={() => setActiveTab("trial")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "trial"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Scale className="h-3.5 w-3.5" />
          <span>Trial Balance</span>
        </button>
        <button
          onClick={() => setActiveTab("pl")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "pl"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Profit & Loss</span>
        </button>
        <button
          onClick={() => setActiveTab("balance")}
          className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px flex items-center space-x-2 transition-all ${
            activeTab === "balance"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <DollarSign className="h-3.5 w-3.5" />
          <span>Balance Sheet</span>
        </button>
      </div>

      {/* 1. Chart of Accounts Tab */}
      {activeTab === "coa" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-3 border border-slate-200 rounded-sm shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Financial Account Ledger Registry
            </h3>
            {accounts.length < 5 && (
              <button
                disabled={isInitializing}
                onClick={handleInitializeCOA}
                className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold transition disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin-slow" />
                <span>Initialize Standard Accounts</span>
              </button>
            )}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-2 border-b">Account Code</th>
                  <th className="px-4 py-2 border-b">Account Name</th>
                  <th className="px-4 py-2 border-b">Type</th>
                  <th className="px-4 py-2 border-b text-right">Debit Postings</th>
                  <th className="px-4 py-2 border-b text-right">Credit Postings</th>
                  <th className="px-4 py-2 border-b text-right font-bold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No accounts seeded. Click "Initialize Standard Accounts" to setup the COA.
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono font-bold text-slate-900">
                        {acc.code}
                      </td>
                      <td className="px-4 py-2 font-medium">{acc.name}</td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded-sm bg-slate-50 text-slate-600 border border-slate-100 text-[11px]">
                          {acc.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        ₹{acc.debitSum.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        ₹{acc.creditSum.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-blue-600">
                        ₹{acc.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {accounts.length === 0 ? (
              <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded text-xs">
                No accounts seeded. Click "Initialize Standard Accounts" to setup the COA.
              </div>
            ) : (
              accounts.map((acc) => (
                <div key={acc.id} className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{acc.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{acc.code}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      {acc.type}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded border border-slate-100 text-center">
                    <div>
                      <div className="text-[11px] text-slate-400">Debit</div>
                      <div className="font-medium text-slate-700">₹{acc.debitSum.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Credit</div>
                      <div className="font-medium text-slate-700">₹{acc.creditSum.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-blue-600 font-bold">Balance</div>
                      <div className="font-bold text-blue-700">₹{acc.balance.toFixed(0)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Journal Entries Tab */}
      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Double-Entry Journal Postings
            </h3>
          </div>

          <div className="space-y-3">
            {safeEntries.length === 0 ? (
              <div className="bg-white border p-6 text-center text-slate-400 text-xs">
                No journal entries logged. Generate an invoice or bill to trigger double-entries.
              </div>
            ) : (
              safeEntries.map((je) => {
                const totalDebit = (je.items || []).reduce((sum, item) => sum + Number(item.debit || 0), 0);
                const totalCredit = (je.items || []).reduce((sum, item) => sum + Number(item.credit || 0), 0);

                return (
                  <div
                    key={je.id}
                    className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden"
                  >
                    {/* Header info */}
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs">
                      <div className="flex space-x-4">
                        <span className="font-bold text-slate-900 font-mono">{je.entryNo}</span>
                        <span className="text-slate-500">{je.date}</span>
                        <span className="text-slate-400">Ref: {je.reference}</span>
                      </div>
                      <span className="font-medium text-slate-600">{je.description}</span>
                    </div>

                    {/* Entry lines (Desktop >= 768px) */}
                    <div className="hidden md:block">
                      <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                        <thead className="text-[11px] text-slate-400 uppercase font-semibold">
                          <tr>
                            <th className="px-4 py-1.5">Account Code / Name</th>
                            <th className="px-4 py-1.5 text-right">Debit (₹)</th>
                            <th className="px-4 py-1.5 text-right">Credit (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {je.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-1.5">
                                <span className="font-mono font-bold text-slate-900 mr-2">
                                  {item.accountCode}
                                </span>
                                <span>{item.accountName}</span>
                              </td>
                              <td className="px-4 py-1.5 text-right font-medium">
                                {item.debit > 0 ? `₹${item.debit.toFixed(2)}` : "-"}
                              </td>
                              <td className="px-4 py-1.5 text-right font-medium">
                                {item.credit > 0 ? `₹${item.credit.toFixed(2)}` : "-"}
                              </td>
                            </tr>
                          ))}
                          {/* Summary match line */}
                          <tr className="bg-slate-50/50 font-bold border-t border-slate-200">
                            <td className="px-4 py-2 text-right text-slate-500 text-[11px] uppercase">
                              Balances Match Verification
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-600 font-mono">
                              ₹{totalDebit.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-600 font-mono">
                              ₹{totalCredit.toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Entry lines (Mobile < 768px) */}
                    <div className="md:hidden p-3 space-y-2 text-xs divide-y divide-slate-100">
                      {je.items.map((item) => (
                        <div key={item.id} className="pt-2 first:pt-0 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-900 block">{item.accountName}</span>
                            <span className="font-mono text-slate-400 text-[11px]">{item.accountCode}</span>
                          </div>
                          <div className="text-right font-mono">
                            {item.debit > 0 ? (
                              <span className="text-emerald-700 font-semibold">Dr: ₹{item.debit.toFixed(2)}</span>
                            ) : (
                              <span className="text-blue-700 font-semibold">Cr: ₹{item.credit.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 flex justify-between items-center text-slate-700 font-bold text-[11px]">
                        <span>Total (Dr / Cr)</span>
                        <span className="font-mono text-emerald-700">₹{totalDebit.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. Trial Balance Tab */}
      {activeTab === "trial" && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-4 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Trial Balance Statement
            </h3>
            <p className="text-[11px] text-slate-500">
              Balances mapped per double-entry checks. Debits must mathematically match Credits.
            </p>
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-2 border-b">Account Code</th>
                  <th className="px-4 py-2 border-b">Account Name</th>
                  <th className="px-4 py-2 border-b text-right">Debit Balance</th>
                  <th className="px-4 py-2 border-b text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {trialBalanceRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold">{r.code}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">
                      {r.debit > 0 ? `₹${r.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">
                      {r.credit > 0 ? `₹${r.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                  </tr>
                ))}
                {/* Grand Trial Total */}
                <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-800">
                  <td colSpan={2} className="px-4 py-2.5 text-right uppercase tracking-wider text-[11px] text-slate-400">
                    Mathematical Equilibrium Verification
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    ₹{totalTrialDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    ₹{totalTrialCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-2.5 text-xs">
            {trialBalanceRows.map((r, idx) => (
              <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-900 block">{r.name}</span>
                  <span className="font-mono text-slate-400 text-[11px]">{r.code}</span>
                </div>
                <div className="text-right font-mono">
                  {r.debit > 0 && <span className="text-emerald-700 font-semibold block">Dr: ₹{r.debit.toLocaleString("en-IN")}</span>}
                  {r.credit > 0 && <span className="text-blue-700 font-semibold block">Cr: ₹{r.credit.toLocaleString("en-IN")}</span>}
                </div>
              </div>
            ))}
            <div className="p-3 bg-slate-900 text-white rounded-lg flex justify-between items-center font-bold">
              <span className="text-xs text-slate-300">Total Debit / Credit</span>
              <span className="font-mono text-sm text-emerald-400">₹{totalTrialDebit.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Profit & Loss Tab */}
      {activeTab === "pl" && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Profit & Loss Statement (Income Statement)
            </h3>
            <p className="text-[11px] text-slate-500">
              Calculates revenue and purchases details for the current financial cycle.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* 1. Revenues */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 uppercase border-b pb-1 text-[11px] tracking-wider text-blue-600">
                1. Operating Revenues
              </h4>
              {revenueAccounts.map((a) => (
                <div key={a.id} className="flex justify-between pl-4 text-slate-700">
                  <span>{a.name} ({a.code})</span>
                  <span className="font-semibold">₹{a.balance.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t font-bold text-slate-900 pt-1">
                <span>Total Revenues</span>
                <span>₹{totalRevenue.toFixed(2)}</span>
              </div>
            </div>

            {/* 2. Expenses */}
            <div className="space-y-2 pt-2">
              <h4 className="font-bold text-slate-900 uppercase border-b pb-1 text-[11px] tracking-wider text-rose-600">
                2. Operating Expenses
              </h4>
              {expenseAccounts.map((a) => (
                <div key={a.id} className="flex justify-between pl-4 text-slate-700">
                  <span>{a.name} ({a.code})</span>
                  <span className="font-semibold">₹{a.balance.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t font-bold text-slate-900 pt-1">
                <span>Total Expenses</span>
                <span>₹{totalExpenses.toFixed(2)}</span>
              </div>
            </div>

            {/* Net Profits card */}
            <div
              className={`p-4 rounded-sm border ${
                netProfit >= 0
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-800"
              } flex justify-between items-center`}
            >
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider block">
                  Net Surplus (Net Profit / Loss)
                </span>
                <span className="text-xs text-slate-500">Revenue minus purchase expenses</span>
              </div>
              <span className="text-lg font-black font-mono">
                ₹{netProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Balance Sheet Tab */}
      {activeTab === "balance" && (
        <div className="bg-white border border-slate-200 rounded-sm shadow-xs p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Balance Sheet Statement
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              Assets = Liabilities + Equity (Equation Balance check)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
            {/* Left side: Assets */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider text-blue-600">
                  ASSETS (Debit Balances)
                </h4>
              </div>
              <div className="space-y-2">
                {assetAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between pl-2">
                    <span>{a.name}</span>
                    <span className="font-semibold">₹{a.balance.toFixed(2)}</span>
                  </div>
                ))}
                {assetAccounts.length === 0 && (
                  <div className="text-slate-400 pl-2">No active Asset accounts</div>
                )}
              </div>
              <div className="flex justify-between font-black text-slate-900 border-t pt-2 mt-4 text-xs">
                <span>TOTAL ASSETS</span>
                <span className="font-mono">₹{totalAssets.toFixed(2)}</span>
              </div>
            </div>

            {/* Right side: Liabilities & Equity */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider text-rose-600">
                  LIABILITIES & EQUITIES
                </h4>
              </div>

              {/* Liabilities */}
              <div className="space-y-2">
                <h5 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">
                  Liabilities (Credit Balances)
                </h5>
                {liabilityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between pl-2">
                    <span>{a.name}</span>
                    <span className="font-semibold">₹{a.balance.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Equities */}
              <div className="space-y-2 pt-2">
                <h5 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">
                  Equities & Reserves
                </h5>
                {equityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between pl-2">
                    <span>{a.name}</span>
                    <span className="font-semibold">₹{a.balance.toFixed(2)}</span>
                  </div>
                ))}
                {/* Net profit entry */}
                <div className="flex justify-between pl-2 text-emerald-600 font-semibold">
                  <span>Retained Earnings (Net Profit)</span>
                  <span>₹{netProfit.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-between font-black text-slate-900 border-t pt-2 mt-4 text-xs">
                <span>TOTAL LIABILITIES & EQUITY</span>
                <span className="font-mono">₹{totalLiabilitiesAndEquity.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Equation checks */}
          <div
            className={`p-4 rounded-sm border ${
              Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            } flex justify-between items-center`}
          >
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider block">
                Accounting Equation Match Verification
              </span>
              <span className="text-xs text-slate-500">Assets balance matches Liabilities + Equity</span>
            </div>
            <span className="text-sm font-black font-mono">
              Difference: ₹{Math.abs(totalAssets - totalLiabilitiesAndEquity).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
