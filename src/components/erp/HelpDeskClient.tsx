"use client";

import React, { useState, useTransition } from "react";
import {
  HelpCircle,
  Plus,
  Search,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { createHelpArticle, deleteHelpArticle } from "@/app/(dashboard)/helpdesk/actions";
import SearchSelect from "@/components/erp/SearchSelect";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  date: string;
}

interface HelpDeskClientProps {
  articles: Article[];
}

export default function HelpDeskClient({ articles }: HelpDeskClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("SYSTEM");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!title || !content) {
      setErrorMsg("Please fill out all fields.");
      return;
    }

    startTransition(async () => {
      const res = await createHelpArticle({ title, content, category });
      if (res.success) {
        setSuccessMsg("Knowledge base article created successfully.");
        setTitle("");
        setContent("");
        setCategory("SYSTEM");
        setTimeout(() => {
          setShowForm(false);
          setSuccessMsg("");
        }, 1500);
      } else {
        setErrorMsg(res.error || "Failed to create article.");
      }
    });
  };

  const handleDeleteArticle = (id: string) => {
    if (!confirm("Are you sure you want to delete this FAQ article?")) return;
    startTransition(async () => {
      const res = await deleteHelpArticle(id);
      if (!res.success) {
        alert(res.error || "Failed to delete article.");
      }
    });
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
  };

  // Filter application
  const filteredArticles = articles.filter((a) => {
    const matchesSearch =
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = activeCategory === "ALL" || a.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  const categories = ["ALL", "INVENTORY", "SALES", "FINANCE", "SYSTEM"];

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "INVENTORY":
        return "Inventory & Stock";
      case "SALES":
        return "Sales & Billing";
      case "FINANCE":
        return "General Ledger & Taxes";
      default:
        return "System Administration";
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Search & Create Panel */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3.5 bg-white p-3.5 border border-slate-200 rounded shadow-xs">
        {/* Search */}
        <div className="relative max-w-md w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-slate-400" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs, error messages, user guides..."
            className="pl-9 pr-4 py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-900"
          />
        </div>

        {/* Create button */}
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-sm text-xs font-semibold shadow-xs transition duration-150 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add FAQ Article</span>
        </button>
      </div>

      {/* Category Toggles */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 border text-xs font-semibold rounded-sm transition duration-150 ${
              activeCategory === cat
                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
            }`}
          >
            {cat === "ALL" ? "All Articles" : getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Accordion / FAQ List */}
      <div className="space-y-2">
        {filteredArticles.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-white border rounded">
            No knowledge base guides found.
          </div>
        ) : (
          filteredArticles.map((a) => {
            const isExpanded = expandedId === a.id;
            return (
              <div
                key={a.id}
                className="bg-white border border-slate-200 rounded-sm shadow-xs overflow-hidden"
              >
                {/* Header Row */}
                <div
                  onClick={() => toggleExpand(a.id)}
                  className="px-4 py-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-50/50 select-none"
                >
                  <div className="flex items-center space-x-3 pr-4">
                    <BookOpen className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border px-1.5 py-0.5 rounded-xs mr-2 uppercase">
                        {a.category}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{a.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 flex-shrink-0">
                    <span className="text-[11px] text-slate-400 hidden sm:inline">{a.date}</span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {/* Content Panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t bg-slate-50/30">
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line mb-3">
                      {a.content}
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDeleteArticle(a.id)}
                        disabled={isPending}
                        className="text-slate-400 hover:text-red-600 text-xs flex items-center space-x-1.5 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete Article</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Log Article Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-50">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 animate-slide-in">
            <div className="flex justify-between items-center border-b pb-4 mb-4">
              <h2 className="text-sm font-bold text-slate-800">Add FAQ Guide</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 bg-red-50 border border-red-200 text-red-600 rounded text-xs">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 mb-3 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded text-xs">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleCreateArticle} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Article Category
                </label>
                <SearchSelect
                  value={category}
                  onChange={(v) => setCategory(v)}
                  placeholder="Type to search"
                  options={[{ value: "INVENTORY", label: "Inventory & Warehouses" }, { value: "SALES", label: "Sales & Billing Processes" }, { value: "FINANCE", label: "Finance & Accounting ledgers" }, { value: "SYSTEM", label: "System Administration guides" }]}
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  Article Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. How to adjust stock items?"
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase">
                  SOP Instructions / Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder="Step by step guides or explanation..."
                  className="w-full p-2 border rounded-sm text-xs focus:ring-1 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              <div className="pt-4 border-t flex space-x-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-sm shadow-xs disabled:opacity-50"
                >
                  {isPending ? "Adding..." : "Add FAQ Article"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
