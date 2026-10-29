"use client";

import React from "react";
import { ArrowLeft, Save } from "lucide-react";

interface FormPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onBack: () => void;
  /** Label of the primary button; it submits the form with id `formId`. */
  submitLabel: string;
  formId: string;
  pending?: boolean;
}

/** Top of a create/add page: back arrow, title with subtitle, and the primary Save button on the right. */
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
      <button
        type="submit"
        form={formId}
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs disabled:opacity-60 transition"
      >
        <Save className="h-4 w-4" />
        {pending ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

interface FormSectionProps {
  number: number;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/** A numbered card with an uppercase heading. Inputs inside get the roomier page-form sizing. */
export function FormSection({ number, title, icon, children }: FormSectionProps) {
  return (
    <section
      className={[
        "bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 text-xs",
        "[&_input:not([type=checkbox]):not([type=radio])]:py-2.5 [&_input:not([type=checkbox]):not([type=radio])]:px-3",
        "[&_input:not([type=checkbox]):not([type=radio])]:rounded-lg [&_input:not([type=checkbox]):not([type=radio])]:text-sm",
        "[&_textarea]:rounded-lg [&_textarea]:p-3 [&_textarea]:text-sm",
        "[&_label]:text-[13px] [&_label]:font-semibold [&_label]:text-slate-700",
      ].join(" ")}
    >
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        {icon}
        <span>
          {number}. {title}
        </span>
      </h3>
      {children}
    </section>
  );
}
