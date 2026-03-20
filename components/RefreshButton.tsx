"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

interface Task {
  id: string;
  status: TaskStatus;
  progress: number;
  message: string;
  error?: string;
  remainingTime?: number;
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '0 秒';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${minutes} 分`;
  return `${minutes} 分 ${secs} 秒`;
}

type RefreshProgressProps = {
  taskId: string | null;
  task: Task | null;
  onTaskUpdate: (task: Task | null) => void;
  onTaskComplete: () => void;
};

export default function RefreshProgress({ taskId, task, onTaskUpdate, onTaskComplete }: RefreshProgressProps) {
  const router = useRouter();

  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/task-status?taskId=${taskId}`);
        const data = await response.json();

        if (response.ok) {
          onTaskUpdate(data);

          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(interval);
            if (data.status === 'completed') {
              setTimeout(() => {
                router.refresh();
                onTaskComplete();
              }, 1000);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch task status:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [taskId, router, onTaskUpdate, onTaskComplete]);

  const isRunning = task && (task.status === 'pending' || task.status === 'running');

  if (!task) return null;

  return (
    <div className="mb-8">
      {isRunning && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[#6a7282]">{task.message}</span>
            <div className="flex items-center gap-3">
              {task.remainingTime !== undefined && (
                <span className="text-sm text-[#99a1af]">
                  剩余 {formatTime(task.remainingTime)}
                </span>
              )}
              <span className="text-sm text-[#6a7282]">{task.progress}%</span>
            </div>
          </div>
          <div className="w-full bg-[#f3f4f6] rounded-full h-1.5">
            <div
              className="bg-[#101828] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}
      {task.status === 'failed' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          抓取失败：{task.error || '未知错误'}
        </div>
      )}
    </div>
  );
}
