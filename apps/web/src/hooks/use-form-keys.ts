"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Keyboard-friendly forms: Enter moves to the next field (Shift+Enter / textarea / buttons excluded)
 * and Ctrl/Cmd+S submits. Attach the returned ref to the <form>.
 */
export function useFormKeys<T extends HTMLFormElement>(onSave: () => void) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const cleanup = useRef<(() => void) | null>(null);

  // Callback ref: forms inside dialogs/portals mount after the first effect, so attach on mount.
  return useCallback((form: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!form) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
        return;
      }
      const t = e.target as HTMLElement;
      if (e.key === "Enter" && !e.shiftKey && (t.tagName === "INPUT" || t.tagName === "SELECT")) {
        const type = (t as HTMLInputElement).type;
        if (type === "submit" || type === "checkbox" || t.getAttribute("role") === "combobox") return;
        e.preventDefault();
        const fields = Array.from(form.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])")).filter(
          (el) => el.offsetParent !== null,
        );
        const i = fields.indexOf(t);
        if (i >= 0 && i < fields.length - 1) fields[i + 1].focus();
        else saveRef.current();
      }
    };
    form.addEventListener("keydown", onKey);
    cleanup.current = () => form.removeEventListener("keydown", onKey);
  }, []);
}

/** Autosave a draft of form values to localStorage; returns helpers to restore and clear it. */
export function useDraft<T>(key: string | null, values: T, enabled = true) {
  useEffect(() => {
    if (!key || !enabled) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`gc.draft.${key}`, JSON.stringify({ at: Date.now(), values }));
      } catch {
        /* ignore */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [key, values, enabled]);

  return {
    load(): T | null {
      if (!key) return null;
      try {
        const raw = localStorage.getItem(`gc.draft.${key}`);
        return raw ? (JSON.parse(raw).values as T) : null;
      } catch {
        return null;
      }
    },
    clear() {
      if (!key) return;
      try {
        localStorage.removeItem(`gc.draft.${key}`);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Warn before leaving the page with unsaved changes. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}
