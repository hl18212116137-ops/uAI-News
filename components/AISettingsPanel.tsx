"use client";

import { useEffect, useRef, useState } from "react";
import { AI_PROVIDERS, AI_PROVIDER_OPTIONS, type AIProvider, type PublicAISettings } from "@/lib/ai/config";

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<PublicAISettings | null>(null);
  const [provider, setProvider] = useState<AIProvider>("deepseek");
  const [fallback, setFallback] = useState<AIProvider | "">("");
  const [model, setModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function applySettings(next: PublicAISettings) {
    setSettings(next); setProvider(next.provider); setFallback(next.fallbackProvider ?? "");
    setModel(next.connections[next.provider].model); setEndpoint(next.connections[next.provider].endpoint);
    setTimeoutSeconds(next.timeoutSeconds); setApiKey(""); setClearKey(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void fetch("/api/admin/ai-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "AI 配置无法读取");
        if (!controller.signal.aborted) applySettings(data.settings);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "AI 配置无法读取"); });
    return () => controller.abort();
  }, [revision]);

  async function submit(method: "PUT" | "POST" | "DELETE") {
    if (!settings || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method, headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: method === "DELETE" ? undefined : JSON.stringify({ provider, fallbackProvider: fallback || null, model, endpoint,
          timeoutSeconds, clearApiKey: clearKey, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "操作失败");
      if (controller.signal.aborted) return;
      if (data.settings) applySettings(data.settings);
      setMessage(data.message || (method === "DELETE" ? "已恢复部署配置" : "已保存，下次 AI 请求开始使用新配置"));
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "请求失败，请重试"); }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  return <section className="card space-y-4 p-5" aria-busy={busy || !settings}>
    <h2 className="font-semibold text-[#101828]">AI 接口设置</h2>
    {settings ? <>
      <p className="text-xs leading-5 text-[#6a7282]">当前：{AI_PROVIDER_OPTIONS[settings.provider].label} · {settings.connections[settings.provider].model} · {settings.connections[settings.provider].configured ? "Key 已配置" : "Key 未配置"}。设置影响全站资讯处理与解读。</p>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit("PUT"); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-[#101828]">服务商<select value={provider} disabled={busy} className="input-field block w-full" onChange={(event) => {
            const next = event.target.value as AIProvider; setProvider(next); setModel(settings.connections[next].model);
            setEndpoint(settings.connections[next].endpoint); setApiKey(""); setClearKey(false); setMessage("");
            if (fallback === next) setFallback("");
          }}>{AI_PROVIDERS.map((name) => <option key={name} value={name}>{AI_PROVIDER_OPTIONS[name].label}</option>)}</select></label>
          <label className="space-y-2 text-sm text-[#101828]">模型<input value={model} required maxLength={120} disabled={busy} onChange={(event) => setModel(event.target.value)} className="input-field block w-full" />
            <span className="block text-xs text-[#6a7282]">常用模型：{AI_PROVIDER_OPTIONS[provider].model}</span></label>
        </div>
        <label className="block space-y-2 text-sm text-[#101828]">接口地址<select value={endpoint} disabled={busy} onChange={(event) => setEndpoint(event.target.value)} className="input-field block w-full text-xs">
          {AI_PROVIDER_OPTIONS[provider].endpoints.map((url) => <option key={url} value={url}>{url}</option>)}
        </select></label>
        <label className="block space-y-2 text-sm text-[#101828]">API Key<input type="password" value={apiKey} autoComplete="new-password" spellCheck={false} disabled={busy || clearKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.connections[provider].configured ? "已配置，留空保留原 Key" : "输入此服务商的 API Key"} className="input-field block w-full" />
          <span className="block text-xs text-[#6a7282]">Key 加密保存，仅管理员可修改，保存后不回显。</span></label>
        <label className="flex items-center gap-2 text-xs text-[#6a7282]"><input type="checkbox" checked={clearKey} disabled={busy} onChange={(event) => { setClearKey(event.target.checked); setApiKey(""); }} />清除此服务商的 Key</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-[#101828]">备用服务<select value={fallback} disabled={busy} onChange={(event) => setFallback(event.target.value as AIProvider | "")} className="input-field block w-full">
            <option value="">关闭备用服务</option>{AI_PROVIDERS.filter((name) => name !== provider).map((name) => <option key={name} value={name}>{AI_PROVIDER_OPTIONS[name].label}（{settings.connections[name].configured ? "Key 已配置" : "Key 未配置"}）</option>)}
          </select></label>
          <label className="space-y-2 text-sm text-[#101828]">单次请求超时（秒）<input type="number" min={10} max={60} required value={timeoutSeconds} disabled={busy} onChange={(event) => setTimeoutSeconds(Number(event.target.value))} className="input-field block w-full" /></label>
        </div>
        <p className="text-xs leading-5 text-[#6a7282]">切换服务商后可分别保存各自的 Key。测试连接只验证当前选择的接口，不使用备用服务。</p>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy} className="btn-primary btn-press rounded-md px-3 py-2 text-sm">保存 AI 配置</button>
          <button type="button" disabled={busy} onClick={() => void submit("POST")} className="btn-primary btn-press rounded-md px-3 py-2 text-sm">测试连接</button>
          <button type="button" disabled={busy} onClick={() => void submit("DELETE")} className="text-sm text-[#6a7282]">恢复部署配置</button>
        </div>
      </form>
    </> : !error ? <p role="status" className="text-sm text-[#6a7282]">正在读取 AI 配置…</p> : null}
    {message ? <p role="status" className="text-sm text-[#6a7282]">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-primary-600">{error}{!settings ? <button type="button" className="ml-3 underline" onClick={() => setRevision((value) => value + 1)}>重试</button> : null}</p> : null}
  </section>;
}
