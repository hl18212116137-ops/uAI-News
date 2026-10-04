"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import AppModalShell from "@/components/AppModalShell";

type PassedPostLogRow = {
  id: string;
  url: string | null;
  sourceName: string | null;
  sourceHandle: string | null;
  content: string | null;
  title: string | null;
  summary: string | null;
  category: string | null;
  passType: "low_signal" | "ai_unimportant" | "user_pass" | "duplicate" | "processing_failed";
  passReason: string;
  publishedAt: string | null;
  updatedAt: string;
  promotedAt: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onPromoted?: () => void;
  scope?: "hidden" | "moderation";
};

function passTypeLabel(passType: PassedPostLogRow["passType"]): string {
  if (passType === "user_pass") return "用户 PASS";
  if (passType === "duplicate") return "重复";
  if (passType === "processing_failed") return "处理失败";
  return passType === "low_signal" ? "低信号" : "AI PASS";
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function PassedPostsReviewPanel({
  isOpen,
  onClose,
  user,
  onPromoted,
  scope = "hidden",
}: Props) {
  const router = useRouter();
  const [logs, setLogs] = useState<PassedPostLogRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const userCacheKey = `${user?.id ?? "guest"}:${scope}`;
  const activeUserCacheKeyRef = useRef(userCacheKey);
  const loadLogsRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    activeUserCacheKeyRef.current = userCacheKey;
    loadLogsRequestRef.current = null;
    setLogs([]);
    setSelectedIds(new Set());
    setLoaded(false);
    setLoading(false);
    setError(null);
    setMessage(null);
  }, [userCacheKey]);

  const loadLogs = useCallback(() => {
    if (!user) {
      setLogs([]);
      setLoaded(true);
      setError("登录后可以管理不感兴趣的内容。");
      return;
    }

    if (loadLogsRequestRef.current) return loadLogsRequestRef.current;
    const requestUserCacheKey = userCacheKey;
    const request = (async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch(`/api/me/pass-logs?limit=80&scope=${scope}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          success?: boolean;
          logs?: PassedPostLogRow[];
          error?: string;
        };
        if (!res.ok || !data.success) throw new Error(data.error || "加载 PASS 记录失败");
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setLogs(data.logs ?? []);
        setSelectedIds(new Set());
        setLoaded(true);
      } catch (e) {
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setLogs([]);
        setError("记录暂时无法加载，请稍后重试。");
      } finally {
        if (activeUserCacheKeyRef.current === requestUserCacheKey) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();
    loadLogsRequestRef.current = request;
    void request.finally(() => {
      if (loadLogsRequestRef.current === request) {
        loadLogsRequestRef.current = null;
      }
    });
    return request;
  }, [user, userCacheKey, scope]);

  useEffect(() => {
    if (!isOpen || loaded || loading) return;
    void loadLogs();
  }, [isOpen, loaded, loading, loadLogs]);

  const selectableIds = useMemo(
    () => logs.filter((log) => !log.promotedAt).map((log) => log.id).slice(0, 30),
    [logs]
  );
  const selectedCount = selectedIds.size;
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 30) next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((current) => {
      if (selectableIds.length === 0) return current;
      if (selectableIds.every((id) => current.has(id))) return new Set();
      return new Set(selectableIds);
    });
  }, [selectableIds]);

  const promoteSelected = useCallback(async () => {
    if (selectedIds.size === 0 || promoting) return;

    const requestUserKey = userCacheKey;
    setPromoting(true);
    setError(null);
    setMessage(null);
    try {
      const ids = [...selectedIds];
      const res = await fetch("/api/me/pass-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids, scope }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        promotedIds?: string[];
        promoted?: number;
      };
      if (!res.ok || !data.success) throw new Error(data.error || "推送失败");

      if (activeUserCacheKeyRef.current !== requestUserKey) return;
      const promotedIds = new Set(data.promotedIds ?? []);
      const now = new Date().toISOString();
      setLogs((current) =>
        current.map((log) =>
          promotedIds.has(log.id) ? { ...log, promotedAt: log.promotedAt || now } : log
        )
      );
      setSelectedIds(new Set());
      setMessage(data.message || `已恢复 ${data.promoted ?? promotedIds.size} 条内容`);
      router.refresh();
      onPromoted?.();
    } catch {
      if (activeUserCacheKeyRef.current !== requestUserKey) return;
      setError("恢复失败，请稍后重试。");
    } finally {
      if (activeUserCacheKeyRef.current === requestUserKey) setPromoting(false);
    }
  }, [selectedIds, promoting, router, onPromoted, scope, userCacheKey]);

  return (
    <AppModalShell
      isOpen={isOpen}
      onClose={onClose}
      disableBackdropClick={promoting}
      panelVariant="large"
      panelClassName="h-[min(640px,86dvh)] max-w-[920px] overflow-hidden p-0"
      ariaLabelledBy="pass-review-title"
    >
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="shrink-0 border-b border-[#f3f4f6] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="pass-review-title" className="text-base font-semibold text-[#101828]">
                {scope === "moderation" ? "采集筛选记录" : "不感兴趣的内容"}
              </h2>
              <p className="mt-1 text-sm leading-5 text-[#6a7282]">
                {scope === "moderation" ? "审核你的订阅源被筛掉的内容，必要时重新入库。" : "这里是你隐藏过的内容，恢复后将重新参与正常筛选。"}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium"
              onClick={() => void loadLogs()}
              disabled={loading || promoting}
            >
              刷新列表
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] px-5 py-3">
            <label className="flex items-center gap-2 text-xs font-medium text-[#101828]">
              <input
                type="checkbox"
                className="size-4 rounded border-[#e5e7eb] accent-primary-500"
                checked={allSelectableSelected}
                onChange={toggleAll}
                disabled={selectableIds.length === 0 || loading || promoting}
              />
              全选本批（最多 30 条）
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#6a7282]">
                已选 {selectedCount} 条，可恢复 {selectableIds.length} 条
              </span>
              <button
                type="button"
                className="btn-press rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={selectedCount === 0 || promoting}
                onClick={() => void promoteSelected()}
              >
                {promoting ? "恢复中…" : "恢复所选内容"}
              </button>
            </div>
          </div>

          {error ? <p className="px-5 py-3 text-sm text-primary-600">{error}</p> : null}
          {message ? (
            <p className="px-5 py-3 text-sm text-[#6a7282]" role="status">
              {message}
            </p>
          ) : null}

          {loading ? (
            <div className="grid min-h-0 flex-1 gap-2 overflow-hidden px-5 py-4" role="status" aria-label="正在加载记录">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton h-20 rounded-md" />
              ))}
            </div>
          ) : !error && logs.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 text-center">
              <p className="text-sm font-medium text-[#101828]">暂无记录</p>
              <p className="mt-1 text-sm text-[#6a7282]">{scope === "moderation" ? "后续采集的筛选记录会显示在这里。" : "你尚未将内容标记为不感兴趣。"}</p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-[#f3f4f6] overflow-y-auto overscroll-contain">
              {logs.map((log) => {
                const disabled = Boolean(log.promotedAt) || promoting;
                const checked = selectedIds.has(log.id);
                return (
                  <li key={log.id} className="px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded border-[#e5e7eb] accent-primary-500"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleOne(log.id)}
                        aria-label={`选择 ${log.sourceName || log.sourceHandle || "未知来源"} 的内容`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              log.passType === "low_signal"
                                ? "bg-[#f5f5f5] text-[#6a7282]"
                                : "bg-primary-50 text-primary-700",
                            ].join(" ")}
                          >
                            {scope === "moderation" ? passTypeLabel(log.passType) : "不感兴趣"}
                          </span>
                          {log.promotedAt ? (
                            <span className="rounded bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#0055FF]">
                              已恢复
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate text-xs font-medium text-[#101828]">
                            {log.sourceName || (log.sourceHandle ? `@${log.sourceHandle}` : "未知来源")}
                          </span>
                          <span className="text-[11px] text-[#99a1af]">
                            {formatTime(log.publishedAt || log.updatedAt)}
                          </span>
                          {log.url ? (
                            <a
                              className="ml-auto text-[11px] font-medium text-primary-600 hover:text-primary-700"
                              href={log.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              原推文
                            </a>
                          ) : null}
                        </div>
                        {scope === "moderation" ? <p className="mt-2 text-xs leading-5 text-[#101828]">{log.passReason}</p> : null}
                        {log.content ? (
                          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#6a7282]">
                            {log.content}
                          </p>
                        ) : null}
                        {log.summary ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#99a1af]">
                            {log.title ? `${log.title}：` : ""}
                            {log.summary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-[#e5e7eb] px-5 py-3">
          <button
            type="button"
            className="btn-primary btn-press w-full rounded-md py-2.5 text-sm font-medium"
            onClick={onClose}
            disabled={promoting}
          >
            关闭
          </button>
        </div>
      </div>
    </AppModalShell>
  );
}
