"use client";

import React from "react";
import { ArrowLeft, Save } from "lucide-react";

interface FormPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onBack: () => void;
  /** Label of an optional Save button on the right; it submits the form with id `formId`. Leave out when the page uses FormActions. */
  submitLabel?: string;
  formId?: string;
  pending?: boolean;
}

/** Top of a create/add page: back arrow and title with subtitle (plus an optional Save button on the right). */
export function FormPageHeader({ title, subtitle, icon, onBack, submitLabel, formId, pending }: FormPageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="mt-0.5 h-10 w-10 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {icon}
            <span>{title}</span>
          </h2>
          {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {submitLabel && formId && (
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs disabled:opacity-60 transition"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving..." : submitLabel}
        </button>
      )}
    </div>
  );
}

// Every text box, picker, date and text area inside a section gets the same look, whatever classes it was written with.
// Class names are written out in full so Tailwind can find them.
const FIELD_STYLES = [
  "[&_input:not([type=checkbox]):not([type=radio])]:h-10 [&_input:not([type=checkbox]):not([type=radio])]:px-3",
  "[&_input:not([type=checkbox]):not([type=radio])]:rounded-lg [&_input:not([type=checkbox]):not([type=radio])]:text-sm",
  "[&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:rounded-lg [&_textarea]:text-sm",
  "[&_input]:border [&_input]:border-slate-300 [&_input]:bg-white [&_input]:text-slate-900",
  "[&_textarea]:border [&_textarea]:border-slate-300 [&_textarea]:bg-white [&_textarea]:text-slate-900",
  "[&_input::placeholder]:text-slate-400 [&_textarea::placeholder]:text-slate-400",
  "[&_input:focus]:outline-none [&_input:focus]:border-blue-500 [&_input:focus]:ring-2 [&_input:focus]:ring-blue-500/20",
  "[&_textarea:focus]:outline-none [&_textarea:focus]:border-blue-500 [&_textarea:focus]:ring-2 [&_textarea:focus]:ring-blue-500/20",
  "[&_input:disabled]:bg-slate-100 [&_input:disabled]:text-slate-500 [&_input:disabled]:cursor-not-allowed",
  "[&_label]:text-[13px] [&_label]:font-medium [&_label]:text-slate-700",
].join(" ");

interface FormSectionProps {
  number: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Buttons shown on the right of the section heading (e.g. Scan QR, Add Item). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** A numbered card with an uppercase heading. Inputs inside get the shared page-form styling. */
export function FormSection({ number, title, description, icon, actions, children }: FormSectionProps) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-xs text-xs ${FIELD_STYLES}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
            {number}
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              {icon}
              <span>{title}</span>
            </h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{actions}</div>}
      </div>
      <div className="p-4 sm:p-6 space-y-4">{children}</div>
    </section>
  );
}

interface FormActionsProps {
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  onCancel: () => void;
}

/**
 * Cancel and Save bar pinned to the bottom of the screen while the form scrolls. Place it last, inside the <form>.
 * The negative offsets and margins match the dashboard <main> padding so the bar sits flush with the screen edges.
 */
export function FormActions({ submitLabel, pendingLabel = "Saving...", pending, onCancel }: FormActionsProps) {
  return (
    <div className="sticky -bottom-3 sm:-bottom-4 md:-bottom-6 z-20 -mx-3 sm:-mx-4 md:-mx-6 -mb-3 sm:-mb-4 md:-mb-6 px-3 sm:px-4 md:px-6 py-3 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.12)] flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending}
        className="flex-[2] sm:flex-none h-10 px-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs disabled:opacity-60 transition"
      >
        <Save className="h-4 w-4" />
        {pending ? pendingLabel : submitLabel}
      </button>
    </div>
  );
}

interface LineItemsTotalProps {
  label?: string;
  amount: number;
}

/** Subtotal row under a line-items table. */
export function LineItemsTotal({ label = "Subtotal", amount }: LineItemsTotalProps) {
  return (
    <div className="flex items-center justify-end gap-6 px-3 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg text-sm">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-900 tabular-nums">₹{amount.toLocaleString("en-IN")}</span>
    </div>
  );
}
