"use client";
import { useCallback, useEffect, useRef } from "react";
const MAIN_SCROLL_THUMB_IDLE_MS = 200;

export function useFeedScroll(isSourcesListCollapsed: boolean, analysisSlidesOpen: boolean) {
  const mainScrollThumbIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const sourcesSidebarPanelRef = useRef<HTMLDivElement | null>(null);
  const analysisSidebarPanelRef = useRef<HTMLDivElement | null>(null);
  const handleMainContentScroll = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    el.classList.add("is-scrolling-thumb");
    if (mainScrollThumbIdleRef.current) {
      clearTimeout(mainScrollThumbIdleRef.current);
    }
    mainScrollThumbIdleRef.current = setTimeout(() => {
      mainScrollThumbIdleRef.current = null;
      el.classList.remove("is-scrolling-thumb");
    }, MAIN_SCROLL_THUMB_IDLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (mainScrollThumbIdleRef.current) {
        clearTimeout(mainScrollThumbIdleRef.current);
        mainScrollThumbIdleRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    const main = mainScrollRef.current;
    if (!main) return;

    const wheelDeltaPixels = (e: WheelEvent): number => {
      let dy = e.deltaY;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
      else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= main.clientHeight || 0;
      return dy;
    };

    const onWheelCapture = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const rawTarget = e.target;
      if (!(rawTarget instanceof Node)) return;

      if (main.contains(rawTarget)) return;

      if (!isSourcesListCollapsed && sourcesSidebarPanelRef.current?.contains(rawTarget)) return;

      if (analysisSlidesOpen && analysisSidebarPanelRef.current?.contains(rawTarget)) return;

      const el = rawTarget instanceof Element ? rawTarget : rawTarget.parentElement;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [aria-modal='true']")) return;

      e.preventDefault();
      const dy = wheelDeltaPixels(e);
      if (dy === 0) return;
      main.scrollTop += dy;
    };

    window.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheelCapture, true);
  }, [isSourcesListCollapsed, analysisSlidesOpen]);

  return { mainScrollRef, sourcesSidebarPanelRef, analysisSidebarPanelRef, handleMainContentScroll };
}
