"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Task {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  startTime?: number;
  estimatedDuration?: number;
  remainingTime?: number;
  error?: string;
  result?: {
    totalPosts?: number;
    processedPosts?: number;
  };
}

export default function AddSource() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const router = useRouter();

  const getPollingInterval = (progress: number) => {
    if (progress < 10) return 500;
    if (progress < 50) return 1000;
    if (progress < 90) return 1500;
    return 2000;
  };

  useEffect(() => {
    if (!taskId) return;

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const response = await fetch(`/api/task-status?taskId=${taskId}`);
        const data = await response.json();

        if (data.task) {
          setTask(data.task);

          if (data.task.status === 'completed') {
            setTaskId(null);
            setIsLoading(false);
            setMessage({
              type: "success",
              text: data.task.message || "添加成功！",
            });
            setTimeout(() => {
              router.refresh();
              setUrl('');
              setTask(null);
            }, 1500);
          }
          else if (data.task.status === 'failed') {
            setTaskId(null);
            setIsLoading(false);
            setMessage({
              type: "error",
              text: data.task.error || "处理失败",
            });
          }
          else if (data.task.status === 'running' || data.task.status === 'pending') {
            const interval = getPollingInterval(data.task.progress || 0);
            timeoutId = setTimeout(poll, interval);
          }
        }
      } catch (error) {
        console.error("轮询任务状态失败:", error);
        timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [taskId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage(null);
    setTask(null);

    if (!url.trim()) {
      setMessage({
        type: "error",
        text: "请输入链接",
      });
      return;
    }

    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (result.success) {
        setUrl("");

        if (result.taskId) {
          setTaskId(result.taskId);
          setMessage({
            type: "info",
            text: result.message || "正在处理...",
          });
        } else {
          setMessage({
            type: "success",
            text: result.message || "添加成功！",
          });
          setIsLoading(false);
          setTimeout(() => {
            router.refresh();
          }, 1500);
        }
      } else {
        setMessage({
          type: "error",
          text: result.error || "添加失败",
        });
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error("添加失败:", error);
      if (error.name === 'AbortError') {
        setMessage({
          type: "error",
          text: "请求超时，但博主可能已添加成功，请刷新页面查看",
        });
      } else {
        setMessage({
          type: "error",
          text: "网络错误，请稍后重试",
        });
      }
      setIsLoading(false);
    }
  };

  function formatTime(seconds: number): string {
    if (seconds === 0) return '0秒';
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${minutes}分`;
    return `${minutes}分${secs}秒`;
  }

  return (
    <div className="mb-5">
      <form onSubmit={handleSubmit} className="mb-3">
        <div>
          <label htmlFor="source-url" className="block text-sm font-medium text-[#101828] mb-2">
            添加关注
          </label>
          <div className="flex gap-2">
            <input
              id="source-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴链接（支持 X 博主、媒体网站）"
              disabled={isLoading}
              className="input-field flex-1"
            />
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "添加中..." : "添加"}
            </button>
          </div>
          <p className="text-xs text-[#6a7282] mt-1">
            支持 X 平台博主链接或媒体网站 RSS 链接
          </p>
        </div>
      </form>

      {/* 进度条 - 运行中 */}
      {task && task.status === 'running' && (
        <div className="mt-3 p-3 bg-gray-50 rounded-md border border-[#d1d5dc]">
          <div className="text-sm text-[#101828] mb-2 flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            {task.message}
          </div>

          <div className="w-full h-2 bg-[#d1d5dc] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-primary-600 rounded-full transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>

          <div className="text-xs text-[#6a7282] flex justify-between">
            <span>{task.progress}%</span>
            {task.remainingTime !== undefined && task.remainingTime > 0 && (
              <span>预计剩余: {formatTime(task.remainingTime)}</span>
            )}
          </div>
        </div>
      )}

      {/* 完成状态 */}
      {task && task.status === 'completed' && (
        <div className="mt-3 p-3 bg-green-50 rounded-md border border-green-200 text-green-800 flex items-center gap-2">
          <span className="text-xl">✓</span>
          <div>
            <div className="font-bold">导入成功！</div>
            {task.result?.processedPosts !== undefined && (
              <div className="text-xs mt-1">
                已处理 {task.result.processedPosts} 条推文
              </div>
            )}
          </div>
        </div>
      )}

      {/* 失败状态 */}
      {task && task.status === 'failed' && (
        <div className="mt-3 p-3 bg-red-50 rounded-md border border-red-200 text-red-800">
          <div className="font-bold">导入失败</div>
          <div className="text-xs mt-1">
            {task.error || '未知错误'}
          </div>
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <div className={`
          mt-3 p-3 rounded-md text-sm
          ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : ''}
          ${message.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : ''}
          ${message.type === 'info' ? 'bg-blue-50 border border-blue-200 text-blue-800' : ''}
        `}>
          {message.text}
        </div>
      )}
    </div>
  );
}
