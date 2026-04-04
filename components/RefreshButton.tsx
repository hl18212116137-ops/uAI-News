"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/task-manager";
import { OPTIMISTIC_REFRESH_TASK_ID } from "@/lib/fetch-refresh-ui";
import { formatTime } from "@/lib/utils";

/** 预计剩余秒数：优先按开始时间推算（每秒递减），否则用服务端 remainingTime 或按进度比例估算 */
function getEstimatedRemainingSeconds(task: Task): number | null {
  const est = task.estimatedDuration ?? (task.remainingTime != null && task.remainingTime > 0 ? task.remainingTime : null);
  if (task.startTime != null && typeof est === "number" && est > 0) {
    const elapsedSec = (Date.now() - task.startTime) / 1000;
    return Math.max(0, Math.floor(est - elapsedSec));
  }
  if (task.remainingTime != null && task.remainingTime > 0) {
    return task.remainingTime;
  }
  if (typeof est === "number" && est > 0) {
    return Math.max(0, Math.round(est * (1 - Math.min(100, Math.max(0, task.progress)) / 100)));
  }
  return null;
}

type RefreshProgressProps = {
  taskId: string | null;
  task: Task | null;
  onTaskUpdate: (task: Task | null) => void;
  onTaskComplete: () => void;
};

export default function RefreshProgress({ taskId, task, onTaskUpdate, onTaskComplete }: RefreshProgressProps) {
  const router = useRouter();
  /** 驱动「预计剩余时间」每秒刷新（与 startTime 推算联动） */
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    if (!taskId || taskId === OPTIMISTIC_REFRESH_TASK_ID) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/task-status?taskId=${taskId}`, { cache: "no-store" });
        const data = await response.json();
        const taskPayload = (data && typeof data === 'object' && 'task' in data ? (data as { task: Task | null }).task : data) as Task | null | undefined;

        if (response.ok && taskPayload) {
          onTaskUpdate(taskPayload);

          if (taskPayload.status === 'cancelled') {
            if (intervalId) clearInterval(intervalId);
            onTaskComplete();
            return;
          }
          if (taskPayload.status === 'completed' || taskPayload.status === 'failed') {
            if (intervalId) clearInterval(intervalId);
            if (taskPayload.status === 'completed') {
              setTimeout(() => {
                router.refresh();
                onTaskComplete();
              }, 1000);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch task status:", error);
      }
    };

    void poll();
    intervalId = setInterval(poll, 1000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [taskId, router, onTaskUpdate, onTaskComplete]);

  const isRunning = !!(task && (task.status === "pending" || task.status === "running"));

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setTimeTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRunning, taskId]);

  const remainingSec = useMemo(() => {
    if (!task || !isRunning) return null;
    void timeTick;
    return getEstimatedRemainingSeconds(task);
  }, [task, isRunning, timeTick]);

  if (!task || !taskId) return null;

  const stepText = task.message?.trim() || "准备中…";

  return (
    <div
      className="w-full min-w-0 shrink-0 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-busy={isRunning ? true : undefined}
    >
      <div className="refresh-progress-strip-enter">
      {isRunning && (
        <div className="flex flex-col bg-[#f9f9fb] p-4">
          {/* 同一行：左为处理提示，右为预计剩余（模块右侧） */}
          <div className="flex min-h-8 items-start justify-between gap-3">
            <p
              className="m-0 min-h-8 min-w-0 flex-1 font-sans text-[11px] font-normal leading-4 tracking-[-0.06px] text-[#101828] line-clamp-2"
              title={stepText}
            >
              {stepText}
            </p>
            <div className="shrink-0 pt-px text-right font-sans text-[10px] font-medium leading-4 tracking-[0.01em] text-[#99a1af]">
              {remainingSec != null ? (
                <span className="whitespace-nowrap">
                  <span className="font-normal">预计剩余时间</span>
                  <span className="mx-1 text-[#e5e7eb]" aria-hidden>
                    ·
                  </span>
                  <span className="tabular-nums text-[#6a7282]">
                    {formatTime(remainingSec)}
                  </span>
                </span>
              ) : (
                <span className="invisible select-none whitespace-nowrap" aria-hidden>
                  预计剩余时间 · 0 秒
                </span>
              )}
            </div>
          </div>
          <div
            className="relative mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[#ebebef]"
            aria-hidden
          >
            <div
              className="motion-layout-ease absolute inset-y-0 left-0 rounded-full bg-[#05f] transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
            />
          </div>
        </div>
      )}
      {task.status === "failed" && (
        <div className="bg-[#fffafa] p-4">
          <p
            className="m-0 truncate font-sans text-[10px] font-normal leading-snug text-[#b42318]"
            title={task.error || "未知错误"}
          >
            {task.error || "未知错误"}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
