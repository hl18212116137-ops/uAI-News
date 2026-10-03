"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import type { FetchPipelinePublicConfig } from "@/lib/fetch-pipeline-public-config.types";
import type { SourceListItem } from "@/lib/types";
import { useRefreshTask } from "@/hooks/useRefreshTask";
import RefreshProgress from "./RefreshButton";

const AddLongformModal = dynamic(() => import("./AddLongformModal"), { ssr: false });
const PassedPostsReviewPanel = dynamic(() => import("./PassedPostsReviewPanel"), { ssr: false });
const noop = () => {};

export default function PipelineAdminPanel({ initialConfig, sources, user }: { initialConfig: FetchPipelinePublicConfig; sources: SourceListItem[]; user: AuthUser }) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [outer, setOuter] = useState(initialConfig.rawMinOuterChars);
  const [nested, setNested] = useState(initialConfig.rawMinNestedCharsRetweet);
  const [rssDedupe, setRssDedupe] = useState(initialConfig.effectiveSettings.ingestDedupeRssBlogMatchNewsUrl.value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = useRefreshTask({ authenticated: true, onNeedAuth: noop, onStart: noop, onCancel: noop, onComplete: noop });
  useEffect(() => () => request.current?.abort(), []);

  async function save(url: string, method: string, body: unknown) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error();
      if (controller.signal.aborted) return;
      if (data.config) {
        setConfig(data.config); setOuter(data.config.rawMinOuterChars); setNested(data.config.rawMinNestedCharsRetweet);
        setRssDedupe(data.config.effectiveSettings.ingestDedupeRssBlogMatchNewsUrl.value);
      }
      setMessage("已保存"); router.refresh();
    } catch { if (!controller.signal.aborted) setError("保存失败，请检查服务状态后重试。"); }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const pipeline = refresh.task?.result?.pipeline;
  return <div className="space-y-5">
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold text-[#101828]">内容管理</h2>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setImportOpen(true)} className="btn-primary rounded-md px-3 py-2 text-sm">导入长文</button>
        <button type="button" onClick={() => setReviewOpen(true)} className="btn-primary rounded-md px-3 py-2 text-sm">订阅源采集审核</button>
        <button type="button" onClick={refresh.handleRefresh} className="btn-primary rounded-md px-3 py-2 text-sm">{refresh.isFetchBusy ? "暂停采集" : "更新订阅源"}</button>
      </div>
      <RefreshProgress taskId={refresh.taskId} task={refresh.task} onTaskUpdate={refresh.handleTaskUpdate} onTaskComplete={refresh.handleTaskComplete} />
      {refresh.task ? <p role="status" className="text-xs text-[#6a7282]">{refresh.task.message}</p> : null}
      {pipeline ? <p className="text-xs text-[#6a7282]">信息源 {pipeline.sourcesProcessed ?? 0}/{pipeline.sourcesTotal ?? 0} · 新内容 {pipeline.rawInserted ?? 0} · 入库 {pipeline.processSuccess ?? 0}</p> : null}
    </section>
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold text-[#101828]">站点采集参数</h2>
      <p className="text-xs text-[#6a7282]">X 接口：{config.xFetchConfigured ? "已配置" : "未配置"} · 处理方式：{config.processingJobsEnabled ? "后台队列" : "直接处理"} · 首页范围：{config.feedVisibleDays} 天</p>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save("/api/admin/pipeline-settings", "PUT", { rawMinOuterChars: outer, rawMinNestedCharsRetweet: nested, ingestDedupeRssBlogMatchNewsUrl: rssDedupe }); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-[#101828]">正文最少字数<input type="number" min={0} max={500} required value={outer} onChange={(event) => setOuter(Number(event.target.value))} className="input-field block w-full" disabled={busy} /></label>
          <label className="space-y-2 text-sm text-[#101828]">引用最少字数<input type="number" min={0} max={500} required value={nested} onChange={(event) => setNested(Number(event.target.value))} className="input-field block w-full" disabled={busy} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#101828]"><input type="checkbox" checked={rssDedupe} onChange={(event) => setRssDedupe(event.target.checked)} disabled={busy} />网页 / RSS 链接去重</label>
        <div className="flex gap-3">
          <button disabled={busy} className="btn-primary rounded-md px-3 py-2 text-sm">保存参数</button>
          <button type="button" disabled={busy} onClick={() => void save("/api/admin/pipeline-settings", "PUT", { rawMinOuterChars: null, rawMinNestedCharsRetweet: null, ingestDedupeRssBlogMatchNewsUrl: null })} className="text-sm text-[#6a7282]">恢复默认</button>
        </div>
      </form>
      {message ? <p role="status" className="text-sm text-[#6a7282]">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-primary-600">{error}</p> : null}
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold text-[#101828]">订阅源采集开关</h2>
      <p className="text-xs text-[#6a7282]">开关影响该信息源的全站采集；个人订阅在阅读偏好中管理。</p>
      <ul className="space-y-2">{sources.map((source) => <li key={source.id} className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-[#101828]">{source.name}</span>
        <button type="button" disabled={busy} onClick={() => void save("/api/sources", "PATCH", { id: source.id, updates: { enabled: source.enabled === false } })} className="btn-primary shrink-0 rounded-md px-3 py-1.5">{source.enabled === false ? "启用采集" : "暂停采集"}</button>
      </li>)}</ul>
    </section>
    <details className="card p-5">
      <summary className="cursor-pointer font-semibold text-[#101828]">筛选流程说明</summary>
      <ol className="mt-4 space-y-4">{config.rulebook.map((stage) => <li key={stage.key}>
        <h3 className="text-sm font-medium text-[#101828]">{stage.title}</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-[#6a7282]">{stage.steps.map((step) => <li key={step.id}>{step.condition}，{step.action}</li>)}</ul>
      </li>)}</ol>
    </details>
    {importOpen ? <AddLongformModal isOpen onClose={() => setImportOpen(false)} onImported={() => { setMessage("长文已导入，可返回资讯查看。"); router.refresh(); }} /> : null}
    {reviewOpen ? <PassedPostsReviewPanel isOpen onClose={() => setReviewOpen(false)} scope="moderation" user={user} /> : null}
  </div>;
}
