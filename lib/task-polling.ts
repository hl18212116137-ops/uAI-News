import { readTaskStatusResponse } from "@/lib/task-status-client";
import type { Task } from "@/lib/task-manager";

type Options = {
  intervalMs?: number;
  maxDurationMs?: number;
  onError?: (message: string) => void;
};

/** One request at a time; stopping cancels both timers and in-flight work. */
export function watchTask(taskId: string, onTask: (task: Task) => void, options: Options = {}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const interval = options.intervalMs ?? 1000;
  const stop = () => {
    controller.abort();
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  const fail = (message: string) => { stop(); options.onError?.(message); };
  const deadline = setTimeout(() => fail("任务状态等待超时，请稍后重试"), options.maxDurationMs ?? 20 * 60_000);
  const poll = async () => {
    try {
      const response = await fetch(`/api/task-status?taskId=${encodeURIComponent(taskId)}`, {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      const result = await readTaskStatusResponse(response);
      if (controller.signal.aborted) return;
      if (result.kind === "missing") { fail("任务已过期，请重新抓取"); return; }
      if (response.status === 401 || response.status === 403) { fail("登录已失效，请重新登录"); return; }
      if (result.kind !== "task") throw new Error(result.message);
      const task = result.task;
      if (task.id !== taskId || !task.status) throw new Error("无法读取任务状态");
      failures = 0;
      if (["completed", "failed", "cancelled"].includes(task.status)) stop();
      onTask(task);
    } catch (error) {
      if (controller.signal.aborted) return;
      failures += 1;
      if (failures >= 5) { fail(error instanceof Error ? error.message : "任务状态请求失败"); return; }
    }
    if (!controller.signal.aborted) timer = setTimeout(poll, interval * Math.min(8, 2 ** failures));
  };
  void poll();
  return stop;
}
