"use client";

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const MAX_SHOWN = 50;

/**
 * A text box with suggestions instead of a dropdown: click or type and the matching entries appear; pick one with the mouse,
 * or with the arrow keys and Enter. The real id is stored (never the label). Typing only filters the list: the current choice changes only when you pick another entry.
 */
export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Type to search…",
  required,
  disabled,
  className = "w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500",
}: SearchSelectProps) {
  const uid = useId();
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The list is drawn on top of the page (fixed position) so no card, table or dark header can clip it.
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number; flip: boolean } | null>(null);

  // Follow the chosen value when it changes from outside (a default, a reset, a QR scan).
  useEffect(() => {
    setText(selected?.label ?? "");
  }, [value, selected?.label]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    // Right after choosing, show everything again instead of only the chosen entry.
    const filtering = q && !(selected && selected.label.toLowerCase() === q);
    const words = filtering ? q.split(/\s+/) : [];
    const list = words.length ? options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))) : options;
    return list.slice(0, MAX_SHOWN);
  }, [text, options, selected]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setBox({ left, top: r.bottom, width, height: r.height, flip: below < 200 && r.top > below });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t)) return;
      if (wrapRef.current && !wrapRef.current.contains(t)) {
        setOpen(false);
        setText(selected?.label ?? ""); // left with half-typed text: go back to the real choice
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selected?.label]);

  const choose = (o: SearchSelectOption) => {
    setText(o.label);
    setOpen(false);
    onChange(o.value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setText(selected?.label ?? "");
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${uid}-opt-${active}` : undefined}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {/* Keeps native "required" validation tied to a real choice */}
      <input tabIndex={-1} aria-hidden="true" required={required} value={value} onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />
      {open && box &&
        createPortal(
          <ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            style={{
              position: "fixed",
              left: box.left,
              width: box.width,
              ...(box.flip ? { bottom: window.innerHeight - box.top + box.height + 4 } : { top: box.top + 4 }),
            }}
            className="z-[100] max-h-60 overflow-auto bg-white border border-slate-300 rounded shadow-lg text-xs"
          >
            {matches.length === 0 && <li className="px-2.5 py-2 text-slate-500">No matches.</li>}
            {matches.map((o, i) => (
              <li
                key={o.value}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
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
          </ul>,
          document.body
        )}
    </div>
  );
}
