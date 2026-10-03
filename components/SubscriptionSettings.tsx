"use client";

import { useEffect, useRef, useState } from "react";
import type { SourceListItem } from "@/lib/types";

export default function SubscriptionSettings({ sources, onChanged }: { sources: SourceListItem[]; onChanged: () => void }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function unsubscribe(id: string) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPendingId(id); setError("");
    try {
      const response = await fetch(`/api/subscriptions?id=${encodeURIComponent(id)}`, { method: "DELETE", signal: controller.signal });
      if (!response.ok) throw new Error();
      if (!controller.signal.aborted) onChanged();
    } catch {
      if (!controller.signal.aborted) setError("取消订阅失败，请稍后重试。");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPendingId(null);
    }
  }
  return <details className="border-t border-[#f3f4f6] pt-4">
    <summary className="cursor-pointer text-sm font-medium text-[#101828]">管理订阅（{sources.length}）</summary>
    {error ? <p role="alert" className="mt-2 text-xs text-primary-600">{error}</p> : null}
    <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
      {sources.map((source) => <li key={source.id} className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-[#101828]">{source.name || source.handle}</span>
        <button type="button" disabled={Boolean(pendingId)} onClick={() => void unsubscribe(source.id)} aria-label={`取消订阅 ${source.name || source.handle}`} className="shrink-0 px-2 py-1 text-xs text-[#6a7282] hover:text-primary-600 disabled:opacity-50">{pendingId === source.id ? "正在取消…" : "取消订阅"}</button>
      </li>)}
    </ul>
  </details>;
}
