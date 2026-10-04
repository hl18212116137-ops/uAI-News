"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppModalShell from "./AppModalShell";
import SubscriptionSettings from "./SubscriptionSettings";
import type { SourceListItem } from "@/lib/types";
import type { AuthUser } from "@/lib/auth";
import type { ReadingPreference } from "@/lib/reading-preferences";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  canManage: boolean;
  sources: SourceListItem[];
  onLogin: () => void;
  onReviewHidden: () => void;
  onChanged: () => void;
};

export default function ReadingPreferencesPanel({ isOpen, onClose, user, canManage, sources, onLogin, onReviewHidden, onChanged }: Props) {
  const [rules, setRules] = useState<ReadingPreference[]>([]);
  const [maxDays, setMaxDays] = useState(7);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState("");
  const [prefer, setPrefer] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const mutationRef = useRef<AbortController | null>(null);
  const userId = user?.id;
  useEffect(() => () => mutationRef.current?.abort(), []);

  useEffect(() => {
    if (!isOpen || !userId) return;
    const controller = new AbortController();
    setLoading(true); setLoaded(false); setError(""); setMessage("");
    void fetch("/api/me/pipeline-rules?module=recommendation", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error("偏好暂时无法读取，请稍后重试。");
        if (controller.signal.aborted) return;
        const next = data.rules as ReadingPreference[];
        setRules(next); setMaxDays(data.maxVisibleDays);
        const current = next.find((rule) => rule.ruleType === "recommendation_visible_days");
        setDays(current?.ruleType === "recommendation_visible_days" ? Math.min(current.payload.days, data.maxVisibleDays) : data.maxVisibleDays);
        setLoaded(true);
      })
      .catch(() => { if (!controller.signal.aborted) setError("偏好暂时无法读取，请稍后重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOpen, userId, revision]);

  const mutate = useCallback(async (body: unknown, deleteId?: string) => {
    if (mutationRef.current || !loaded) return false;
    const controller = new AbortController();
    mutationRef.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/me/pipeline-rules${deleteId ? `?id=${encodeURIComponent(deleteId)}` : ""}`, {
        method: deleteId ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: deleteId ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error("保存失败，请稍后重试。");
      if (controller.signal.aborted) return false;
      if (deleteId) setRules((current) => current.filter((rule) => rule.id !== deleteId));
      else setRules((current) => [...current.filter((rule) => rule.id !== data.rule.id && !(data.rule.ruleType === "recommendation_visible_days" && rule.ruleType === data.rule.ruleType)), data.rule]);
      setMessage("偏好已保存。");
      onChanged();
      return true;
    } catch {
      if (!controller.signal.aborted) setError("保存失败，请稍后重试。");
      return false;
    } finally {
      if (mutationRef.current === controller) mutationRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [loaded, onChanged]);
  const disabled = busy || loading || !loaded;

  return (
    <AppModalShell isOpen={isOpen} onClose={onClose} disableBackdropClick={busy} panelClassName={`max-w-[520px] max-h-[85dvh] overflow-hidden p-5 ${user ? "flex h-[min(540px,85dvh)] flex-col" : ""}`} ariaLabelledBy="reading-preferences-title">
      <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
        <h2 id="reading-preferences-title" className="text-base font-semibold text-[#101828]">阅读偏好</h2>
        <button type="button" onClick={onClose} disabled={busy} className="btn-primary rounded-md px-3 py-1.5 text-xs">关闭</button>
      </div>
      {!user ? (
        <div className="space-y-4 py-5 text-center">
          <p className="text-sm text-[#6a7282]">登录后可以设置阅读偏好，管理不感兴趣的内容。</p>
          <button type="button" onClick={onLogin} className="btn-primary btn-press rounded-md px-4 py-2 text-sm">登录</button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain scrollbar-gutter-stable" aria-busy={loading}>
          <p role="status" className="min-h-5 text-xs leading-5 text-[#6a7282]">{loading ? "正在读取偏好…" : message || "仅影响你的订阅资讯流，可随时修改。"}</p>
          {error ? <div role="alert" className="text-sm text-primary-600">{error}{!loaded && !loading ? <button type="button" className="ml-3 underline" onClick={() => setRevision((value) => value + 1)}>重试</button> : null}</div> : null}
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void mutate({ module: "recommendation", ruleType: "recommendation_visible_days", payload: { days } }); }}>
            <label htmlFor="reading-days" className="block text-sm font-medium text-[#101828]">阅读时间范围</label>
            <div className="flex items-center gap-3">
              <input id="reading-days" type="number" min={1} max={maxDays} required value={days} onChange={(event) => setDays(Number(event.target.value))} disabled={disabled} className="input-field w-24 text-sm" />
              <span className="text-sm text-[#6a7282]">天（最多 {maxDays} 天）</span>
              <button disabled={disabled} className="btn-primary rounded-md px-3 py-2 text-sm disabled:opacity-50">保存</button>
            </div>
          </form>
          {(["hide_if_contains", "prefer_keyword"] as const).map((type) => {
            const hidden = type === "hide_if_contains";
            const draft = hidden ? hide : prefer;
            const setDraft = hidden ? setHide : setPrefer;
            const label = hidden ? "屏蔽关键词" : "优先关键词";
            return <section key={type} className="space-y-2">
              <form onSubmit={async (event) => {
                event.preventDefault();
                if (await mutate({ module: "recommendation", ruleType: type, payload: hidden ? { substring: draft.trim() } : { keyword: draft.trim() } })) setDraft("");
              }}>
                <label htmlFor={type} className="mb-2 block text-sm font-medium text-[#101828]">{label}</label>
                <div className="flex gap-2">
                  <input id={type} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} required disabled={disabled} className="input-field min-w-0 flex-1 text-sm" placeholder={hidden ? "隐藏标题或摘要中包含该词的内容" : "优先展示包含该词的内容"} />
                  <button disabled={disabled || !draft.trim()} className="btn-primary rounded-md px-3 py-2 text-sm disabled:opacity-50">添加</button>
                </div>
              </form>
              <ul className="flex flex-wrap gap-2">
                {rules.filter((rule) => rule.ruleType === type).map((rule) => <li key={rule.id} className="flex items-center gap-2 rounded-md bg-[#f5f5f5] px-2 py-1 text-xs text-[#101828]">
                  <span>{rule.ruleType === "hide_if_contains" ? rule.payload.substring : rule.ruleType === "prefer_keyword" ? rule.payload.keyword : ""}</span>
                  <button type="button" disabled={disabled} onClick={() => void mutate(null, rule.id)} aria-label={`删除${label}：${"substring" in rule.payload ? rule.payload.substring : "keyword" in rule.payload ? rule.payload.keyword : ""}`} className="px-1 text-[#6a7282] hover:text-primary-600">×</button>
                </li>)}
              </ul>
            </section>;
          })}
          <SubscriptionSettings sources={sources} onChanged={onChanged} />
          <div className="flex flex-wrap gap-4 border-t border-[#f3f4f6] pt-4 text-sm">
            <button type="button" disabled={busy} onClick={onReviewHidden} onPointerEnter={() => { void import("./PassedPostsReviewPanel").catch(() => {}); }} onFocus={() => { void import("./PassedPostsReviewPanel").catch(() => {}); }} className="text-[#101828] hover:text-primary-600">管理不感兴趣的内容</button>
            {canManage ? <Link href="/admin/pipeline" className="text-[#6a7282] hover:text-primary-600">采集管理</Link> : null}
          </div>
        </div>
      )}
    </AppModalShell>
  );
}
