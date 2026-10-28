"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { searchProductsAction, type ProductSearchOption } from "@/app/(dashboard)/products/search-actions";

interface ProductComboboxProps {
  /** Selected variant id (the real id is what gets stored/submitted, never the label). */
  value: string;
  /** Text to show for the current value (e.g. from already-loaded products). */
  valueLabel?: string;
  onChange: (option: ProductSearchOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

/** Searchable product picker: server-side search, keyboard navigation, loading / empty / error states. */
export default function ProductCombobox({
  value,
  valueLabel = "",
  onChange,
  disabled,
  placeholder = "Search product by name, code or SKU",
  className = "",
  required,
}: ProductComboboxProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [text, setText] = useState(valueLabel);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<ProductSearchOption[]>([]);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in step with the chosen value (e.g. set by a QR scan or cleared by the form).
  useEffect(() => {
    setText(valueLabel);
  }, [value, valueLabel]);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    const t = setTimeout(async () => {
      const res = await searchProductsAction(text === valueLabel && value ? "" : text);
      if (id !== reqId.current) return; // a newer search superseded this one
      setLoading(false);
      if (res.error) setError(res.error);
      setOptions(res.options);
      setActive(0);
    }, 200);
    return () => clearTimeout(t);
  }, [text, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (o: ProductSearchOption) => {
    setText(o.label);
    setOpen(false);
    onChange(o);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${uid}-opt-${active}` : undefined}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(null); // typing again clears the previous selection
        }}
        onKeyDown={onKeyDown}
        className="w-full p-1.5 border rounded text-xs bg-white"
      />
      {/* Hidden input keeps native form validation tied to a real selection */}
      <input tabIndex={-1} aria-hidden="true" required={required} value={value} onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-300 rounded shadow-lg text-xs"
        >
          {loading && <li className="px-2.5 py-2 text-slate-500">Searching…</li>}
          {!loading && error && <li className="px-2.5 py-2 text-rose-600">{error}</li>}
          {!loading && !error && options.length === 0 && <li className="px-2.5 py-2 text-slate-500">No products found.</li>}
          {!loading &&
            options.map((o, i) => (
              <li
                key={o.variantId}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={o.variantId === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`px-2.5 py-2 cursor-pointer ${i === active ? "bg-blue-50 text-blue-800" : "text-slate-800"}`}
              >
                {o.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
