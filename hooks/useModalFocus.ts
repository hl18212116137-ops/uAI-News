"use client";

import { useEffect, useRef } from "react";

const openPanels: HTMLElement[] = [];
let previousOverflow = "";
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** One focus boundary for every modal, including nested dialogs. */
export function useModalFocus(isOpen: boolean, onClose: () => void, disableClose: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(disableClose);
  closeRef.current = onClose;
  disabledRef.current = disableClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (openPanels.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openPanels.push(panel);
    const isTop = () => openPanels[openPanels.length - 1] === panel;
    const targets = () => Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
    const focusFirst = () => (targets()[0] ?? panel).focus({ preventScroll: true });
    focusFirst();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!disabledRef.current) closeRef.current();
      } else if (event.key === "Tab") {
        const items = targets();
        const first = items[0] ?? panel;
        const last = items[items.length - 1] ?? panel;
        const focusOutside = !panel.contains(document.activeElement);
        if (event.shiftKey && (focusOutside || document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault(); last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (focusOutside || document.activeElement === last || document.activeElement === panel)) {
          event.preventDefault(); first.focus({ preventScroll: true });
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !panel.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      const wasTop = isTop();
      openPanels.splice(openPanels.indexOf(panel), 1);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      if (openPanels.length === 0) document.body.style.overflow = previousOverflow;
      if (wasTop) {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        else openPanels[openPanels.length - 1]?.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);
  return panelRef;
}
