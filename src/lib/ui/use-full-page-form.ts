"use client";

import { useEffect, useRef } from "react";

/**
 * Shows a form/detail as its own full page (no pop-up): while `open`, the URL gets `?form=<name>` so the browser Back button
 * closes it, and the view scrolls to the top. Closing from the UI removes the extra history entry again.
 */
export function useFullPageForm(open: boolean, close: () => void, name: string) {
  const pushed = useRef(false);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (open && !pushed.current) {
      const url = new URL(window.location.href);
      url.searchParams.set("form", name);
      window.history.pushState({ fullPageForm: true }, "", url.pathname + url.search);
      pushed.current = true;
      window.scrollTo({ top: 0 });
    } else if (!open && pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  }, [open, name]);

  useEffect(() => {
    const onPop = () => {
      if (pushed.current) {
        pushed.current = false;
        closeRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}
