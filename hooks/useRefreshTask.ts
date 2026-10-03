"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/task-manager";
import { OPTIMISTIC_REFRESH_TASK_ID } from "@/lib/fetch-refresh-ui";

type Options = {
  authenticated: boolean;
  onNeedAuth: () => void;
  onStart: () => void;
  onCancel: () => void;
  onComplete: () => void;
};

export function useRefreshTask({ authenticated, onNeedAuth, onStart, onCancel, onComplete }: Options) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const activeId = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const isFetchBusy = taskId === OPTIMISTIC_REFRESH_TASK_ID || task?.status === "pending" || task?.status === "running";
  useEffect(() => () => request.current?.abort(), []);
  const clear = useCallback(() => { activeId.current = null; setTaskId(null); setTask(null); }, []);

  const handleRefresh = useCallback(async () => {
    if (!authenticated) { onNeedAuth(); return; }
    if (request.current || isFetchBusy) {
      onCancel();
      request.current?.abort();
      request.current = null;
      if (activeId.current && activeId.current !== OPTIMISTIC_REFRESH_TASK_ID) {
        void fetch("/api/refresh/cancel", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: activeId.current }),
        }).catch(() => {});
      }
      clear();
      return;
    }
    if (taskId) clear();
    const controller = new AbortController();
    request.current = controller;
    activeId.current = OPTIMISTIC_REFRESH_TASK_ID;
    onStart();
    const now = Date.now();
    setTaskId(OPTIMISTIC_REFRESH_TASK_ID);
    setTask({ id: OPTIMISTIC_REFRESH_TASK_ID, status: "running", progress: 0,
      message: "正在启动抓取…", createdAt: now, updatedAt: now, startTime: now,
      estimatedDuration: 120, remainingTime: 120 });
    try {
      const response = await fetch("/api/refresh", { method: "POST", cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !data.success || !data.taskId) throw new Error(data.error || "启动抓取任务失败");
      activeId.current = data.taskId;
      setTaskId(data.taskId);
      if (data.task) setTask(data.task);
    } catch (error) {
      if (!controller.signal.aborted) {
        onCancel();
        clear();
        alert(error instanceof Error ? error.message : "网络请求失败，请检查网络连接后重试");
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [authenticated, onNeedAuth, onStart, onCancel, isFetchBusy, taskId, clear]);
  const handleTaskUpdate = useCallback((next: Task | null) => {
    if (next && next.id !== activeId.current) return;
    setTask(next);
  }, []);
  const handleTaskComplete = useCallback(() => { clear(); onComplete(); }, [clear, onComplete]);
  return { taskId, task, isFetchBusy, handleRefresh, handleTaskUpdate, handleTaskComplete };
}
