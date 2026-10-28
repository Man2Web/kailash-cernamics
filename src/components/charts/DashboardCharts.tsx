"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

interface ChartDataPoint {
  name: string;
  value: number;
}

interface DashboardChartsProps {
  salesData: ChartDataPoint[];
  purchaseData: ChartDataPoint[];
  categoryData: ChartDataPoint[];
}

export default function DashboardCharts({
  salesData,
  purchaseData,
  categoryData,
}: DashboardChartsProps) {
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Sales Trend Chart */}
      <div className="bg-white p-4 border border-slate-200 rounded shadow-xs lg:col-span-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Sales Trend (Monthly)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Stock Value by Category Pie Chart */}
      <div className="bg-white p-4 border border-slate-200 rounded shadow-xs">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Stock Value by Category
        </h3>
        <div className="h-64 flex flex-col items-center justify-center">
          {categoryData.length === 0 ? (
            <span className="text-xs text-slate-400">No stock data available</span>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`}
                    contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                {categoryData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center space-x-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full inline-block"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    ></span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {entry.name}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Purchase Trend Chart */}
      <div className="bg-white p-4 border border-slate-200 rounded shadow-xs lg:col-span-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
          Purchase Trend (Monthly)
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={purchaseData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", fontSize: "12px" }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[2, 2, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
