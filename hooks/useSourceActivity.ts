"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceActivityTone } from "@/components/SourceActivityNotice";

type SourceActivityState = {
  id: number;
  title: string;
  detail: string;
  tone: SourceActivityTone;
  isLeaving: boolean;
};

export function useSourceActivity() {
  const sourceActivityExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceActivityRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceActivityIdRef = useRef(0);
  const [sourceActivity, setSourceActivity] = useState<SourceActivityState | null>(null);
  const clearSourceActivityTimers = useCallback(() => {
    if (sourceActivityExitTimerRef.current) {
      clearTimeout(sourceActivityExitTimerRef.current);
      sourceActivityExitTimerRef.current = null;
    }
    if (sourceActivityRemoveTimerRef.current) {
      clearTimeout(sourceActivityRemoveTimerRef.current);
      sourceActivityRemoveTimerRef.current = null;
    }
  }, []);

  const showSourceActivity = useCallback(
    (
      next: Omit<SourceActivityState, "id" | "isLeaving">,
      visibleForMs = 5200
    ) => {
      clearSourceActivityTimers();
      const id = ++sourceActivityIdRef.current;
      setSourceActivity({ ...next, id, isLeaving: false });

      const exitDelay = Math.max(0, visibleForMs - 180);
      sourceActivityExitTimerRef.current = setTimeout(() => {
        setSourceActivity((current) =>
          current?.id === id ? { ...current, isLeaving: true } : current
        );
      }, exitDelay);
      sourceActivityRemoveTimerRef.current = setTimeout(() => {
        setSourceActivity((current) => (current?.id === id ? null : current));
      }, visibleForMs);
    },
    [clearSourceActivityTimers]
  );

  useEffect(() => clearSourceActivityTimers, [clearSourceActivityTimers]);
  return { sourceActivity, showSourceActivity };
}
