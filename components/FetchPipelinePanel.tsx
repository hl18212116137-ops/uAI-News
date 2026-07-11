"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth";
type User = AuthUser;
import AppModalShell from "@/components/AppModalShell";
import type {
  FetchPipelinePublicConfig,
  SettingValueSource,
} from "@/lib/fetch-pipeline-public-config.types";
import { OPTIMISTIC_REFRESH_TASK_ID } from "@/lib/fetch-refresh-ui";
import type { Task } from "@/lib/task-manager";

type UserPipelineRuleRow = {
  id: string;
  module?: string;
  ruleType?: string;
  rule_type?: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  createdAt?: string;
  created_at?: string;
};

type SubscribedSourceRow = {
  id: string;
  handle: string;
  name: string;
  enabled?: boolean;
  postCount?: number;
};

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
};

type FetchPipelinePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  task: Task | null;
  user: User | null;
  /** 打开「添加信息源」侧栏流程 */
  onRequestAddSource?: () => void;
};

const pipelineConfigRequests = new Map<string, Promise<FetchPipelinePublicConfig>>();

function readPipelineConfig(user: User | null, userCacheKey: string) {
  const requestKey = `${user ? "me" : "public"}:${userCacheKey}`;
  const current = pipelineConfigRequests.get(requestKey);
  if (current) return current;

  const request = fetch(user ? "/api/me/fetch-pipeline-config" : "/api/fetch-pipeline-config", {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (res) => {
      const data = (await res.json()) as {
        success?: boolean;
        config?: FetchPipelinePublicConfig;
        error?: string;
      };
      if (!res.ok || !data.success || !data.config) {
        throw new Error(data.error || "加载失败");
      }
      return data.config;
    })
    .finally(() => {
      pipelineConfigRequests.delete(requestKey);
    });

  pipelineConfigRequests.set(requestKey, request);
  return request;
}

type PipelineRuleModuleKey =
  | "sources"
  | "dedupe"
  | "raw"
  | "quality"
  | "ai"
  | "feed"
  | "recommendation";

const PLAIN_RULE_TYPE = "plain_rule";
const DISABLE_BUILTIN_RULE_TYPE = "disable_builtin_rule";

function sourceLabel(s: SettingValueSource): string {
  switch (s) {
    case "db":
      return "数据库";
    case "env":
      return "环境变量";
    default:
      return "默认";
  }
}

function getRuleType(rule: UserPipelineRuleRow): string {
  return rule.ruleType || rule.rule_type || "";
}

function ruleTypeLabel(ruleType: string): string {
  switch (ruleType) {
    case PLAIN_RULE_TYPE:
      return "自定义";
    case DISABLE_BUILTIN_RULE_TYPE:
      return "已删除";
    case "hide_if_contains":
      return "隐藏";
    case "prefer_keyword":
      return "优先";
    case "recommendation_visible_days":
      return "时间窗";
    default:
      return ruleType;
  }
}

function formatRulePayload(ruleType: string, payload: Record<string, unknown>): string {
  if (ruleType === PLAIN_RULE_TYPE && typeof payload.text === "string") return payload.text;
  if (ruleType === "recommendation_visible_days" && typeof payload.days === "number") {
    return `最近 ${payload.days} 天`;
  }
  if (typeof payload.substring === "string") return payload.substring;
  if (typeof payload.keyword === "string") return payload.keyword;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function passTypeLabel(passType: PassedPostLogRow["passType"]): string {
  if (passType === "user_pass") return "用户 PASS";
  if (passType === "duplicate") return "重复";
  if (passType === "processing_failed") return "处理失败";
  return passType === "low_signal" ? "低信号" : "AI PASS";
}

function formatPassLogTime(value: string | null | undefined): string {
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

function SettingSourceTag({ source }: { source: SettingValueSource }) {
  return (
    <span className="rounded bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] font-medium text-[#6a7282]">
      {sourceLabel(source)}
    </span>
  );
}

function MetricTile({
  label,
  value,
  source,
}: {
  label: string;
  value: string;
  source?: SettingValueSource;
}) {
  return (
    <div className="rounded-md border border-[#f3f4f6] bg-white px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[#6a7282]">{label}</span>
        {source ? <SettingSourceTag source={source} /> : null}
      </div>
      <div className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-[#101828]">
        {value}
      </div>
    </div>
  );
}

type RulebookStageItem = FetchPipelinePublicConfig["rulebook"][number];
type RulebookStepItem = RulebookStageItem["steps"][number];

const PERSONAL_RECOMMENDATION_RULE_STAGE: RulebookStageItem = {
  key: "personal-recommendation",
  title: "个人推荐规则",
  steps: [
    {
      id: "rec-days",
      condition: "设置「推荐流最近 N 天」",
      action: "订阅推荐流只保留这个时间窗内的内容；删除后回到全站默认时间窗。",
      platform: "all",
    },
    {
      id: "rec-hide",
      condition: "新增「隐藏关键词」",
      action: "标题或摘要包含该词的内容会从你的推荐流隐藏；删除该规则后不再隐藏。",
      platform: "all",
    },
    {
      id: "rec-prefer",
      condition: "新增「优先关键词」",
      action: "标题或摘要包含该词的内容会在你的推荐流中靠前；删除该规则后取消加权。",
      platform: "all",
    },
  ],
};

function getRuleModule(rule: UserPipelineRuleRow): PipelineRuleModuleKey | "" {
  const value = rule.module || "";
  return (
    value === "sources" ||
    value === "dedupe" ||
    value === "raw" ||
    value === "quality" ||
    value === "ai" ||
    value === "feed" ||
    value === "recommendation"
      ? value
      : ""
  );
}

function getDisabledBuiltinRuleId(rule: UserPipelineRuleRow): string {
  return getRuleType(rule) === DISABLE_BUILTIN_RULE_TYPE && typeof rule.payload.ruleId === "string"
    ? rule.payload.ruleId
    : "";
}

function getPlainRuleText(rule: UserPipelineRuleRow): string {
  return getRuleType(rule) === PLAIN_RULE_TYPE && typeof rule.payload.text === "string"
    ? rule.payload.text
    : "";
}

function formatStepText(step: RulebookStepItem): string {
  const condition = step.condition.trim();
  const action = step.action.trim();
  if (!action) return condition;
  return `${condition}，${action}`;
}

function EditableRuleRow({
  text,
  label,
  disabled,
  canDelete,
  onDelete,
}: {
  text: string;
  label: "默认" | "自定义";
  disabled: boolean;
  canDelete: boolean;
  onDelete?: () => void;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md border border-[#f3f4f6] bg-[#fafafa] px-2.5 py-2">
      <span
        className={[
          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
          label === "默认" ? "bg-white text-[#6a7282]" : "bg-[#eef4ff] text-[#0055FF]",
        ].join(" ")}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-5 text-[#101828]">{text}</span>
      {canDelete ? (
        <button
          type="button"
          disabled={disabled}
          className="btn-press shrink-0 rounded px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
          onClick={onDelete}
        >
          删除
        </button>
      ) : null}
    </li>
  );
}

function RuleList({
  stage,
  moduleKey,
  userRules,
  canEdit,
  disabled,
  onDeleteDefaultRule,
  onDeleteUserRule,
}: {
  stage?: RulebookStageItem;
  moduleKey: PipelineRuleModuleKey;
  userRules: UserPipelineRuleRow[];
  canEdit: boolean;
  disabled: boolean;
  onDeleteDefaultRule: (moduleKey: PipelineRuleModuleKey, ruleId: string) => void;
  onDeleteUserRule: (id: string) => void;
}) {
  const disabledBuiltinIds = new Set(
    userRules.map(getDisabledBuiltinRuleId).filter(Boolean)
  );
  const builtinSteps = (stage?.steps ?? []).filter((step) => !disabledBuiltinIds.has(step.id));
  const plainRules = userRules.filter((rule) => getRuleType(rule) === PLAIN_RULE_TYPE);

  if (builtinSteps.length === 0 && plainRules.length === 0) {
    return <p className="text-xs text-[#99a1af]">暂无规则，右侧可以新增。</p>;
  }

  return (
    <ul className="grid gap-1.5">
      {builtinSteps.map((step) => (
        <EditableRuleRow
          key={step.id}
          text={formatStepText(step)}
          label="默认"
          disabled={disabled}
          canDelete={canEdit}
          onDelete={() => onDeleteDefaultRule(moduleKey, step.id)}
        />
      ))}
      {plainRules.map((rule) => (
        <EditableRuleRow
          key={rule.id}
          text={getPlainRuleText(rule)}
          label="自定义"
          disabled={disabled}
          canDelete={canEdit}
          onDelete={() => onDeleteUserRule(rule.id)}
        />
      ))}
    </ul>
  );
}

function StageRuleCard({
  index,
  title,
  summary,
  stage,
  moduleKey,
  userRules,
  canEditRules,
  rulesBusy,
  onDeleteDefaultRule,
  onDeleteUserRule,
  status,
  children,
}: {
  index: number;
  title: string;
  summary: string;
  stage?: RulebookStageItem;
  moduleKey: PipelineRuleModuleKey;
  userRules: UserPipelineRuleRow[];
  canEditRules: boolean;
  rulesBusy: boolean;
  onDeleteDefaultRule: (moduleKey: PipelineRuleModuleKey, ruleId: string) => void;
  onDeleteUserRule: (id: string) => void;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#f3f4f6] bg-white p-3 shadow-xs">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[#f3f4f6] pb-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#0055FF] font-mono text-[11px] font-semibold text-white">
            {index}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-[#101828]">{title}</h4>
            <p className="mt-1 text-xs leading-5 text-[#6a7282]">{summary}</p>
          </div>
        </div>
        {status ? (
          <span className="rounded bg-[#f5f5f5] px-2 py-1 text-[11px] font-medium text-[#6a7282]">
            {status}
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,minmax(240px,0.8fr)]">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#99a1af]">
            规则列表（可增删）
          </p>
          <RuleList
            stage={stage}
            moduleKey={moduleKey}
            userRules={userRules}
            canEdit={canEditRules}
            disabled={rulesBusy}
            onDeleteDefaultRule={onDeleteDefaultRule}
            onDeleteUserRule={onDeleteUserRule}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#99a1af]">
            调整
          </p>
          {children ?? <p className="text-xs leading-5 text-[#99a1af]">当前步骤为内置规则。</p>}
        </div>
      </div>
    </section>
  );
}

function RuleAddBox({
  moduleKey,
  user,
  draft,
  placeholder,
  hiddenDefaultCount,
  disabled,
  onDraftChange,
  onAdd,
  onRestoreDefaults,
}: {
  moduleKey: PipelineRuleModuleKey;
  user: User | null;
  draft: string;
  placeholder: string;
  hiddenDefaultCount: number;
  disabled: boolean;
  onDraftChange: (moduleKey: PipelineRuleModuleKey, value: string) => void;
  onAdd: (moduleKey: PipelineRuleModuleKey) => void;
  onRestoreDefaults: (moduleKey: PipelineRuleModuleKey) => void;
}) {
  if (!user) {
    return (
      <div className="space-y-1.5">
        <label className="flex flex-col gap-1 text-xs text-[#6a7282]">
          新增规则
          <div className="flex min-w-0 gap-2">
            <input
              className="input-field h-8 min-w-0 flex-1 rounded-md py-1 text-xs disabled:bg-[#f5f5f5] disabled:text-[#99a1af]"
              value=""
              placeholder={placeholder}
              disabled
              readOnly
            />
            <button
              type="button"
              disabled
              className="btn-primary btn-press rounded-md px-3 text-xs font-medium disabled:opacity-50"
            >
              增加
            </button>
          </div>
        </label>
        <p className="text-xs leading-5 text-[#99a1af]">登录后可新增、删除或恢复此步骤规则。</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 text-xs text-[#6a7282]">
        新增规则
        <div className="flex min-w-0 gap-2">
          <input
            className="input-field h-8 min-w-0 flex-1 rounded-md py-1 text-xs"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => onDraftChange(moduleKey, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd(moduleKey);
            }}
          />
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            className="btn-primary btn-press rounded-md px-3 text-xs font-medium disabled:opacity-50"
            onClick={() => onAdd(moduleKey)}
          >
            增加
          </button>
        </div>
      </label>
      {hiddenDefaultCount > 0 ? (
        <button
          type="button"
          disabled={disabled}
          className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          onClick={() => onRestoreDefaults(moduleKey)}
        >
          恢复默认规则（{hiddenDefaultCount}）
        </button>
      ) : null}
    </div>
  );
}

function RuleChip({
  rule,
  disabled,
  onDelete,
}: {
  rule: UserPipelineRuleRow;
  disabled: boolean;
  onDelete: (id: string) => void;
}) {
  const ruleType = getRuleType(rule);
  const isHide = ruleType === "hide_if_contains";
  const isPrefer = ruleType === "prefer_keyword";
  const value = formatRulePayload(ruleType, rule.payload);

  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border border-[#f3f4f6] bg-white px-2.5 py-2">
      <span
        className={[
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
          isHide
            ? "bg-primary-50 text-primary-700"
            : isPrefer
              ? "bg-[#eef4ff] text-[#0055FF]"
              : "bg-[#f5f5f5] text-[#6a7282]",
        ].join(" ")}
      >
        {ruleTypeLabel(ruleType)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[#101828]">{value}</span>
      <button
        type="button"
        disabled={disabled}
        className="btn-press shrink-0 rounded px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
        onClick={() => onDelete(rule.id)}
      >
        删除
      </button>
    </li>
  );
}

export default function FetchPipelinePanel({
  isOpen,
  onClose,
  taskId,
  task,
  user,
  onRequestAddSource,
}: FetchPipelinePanelProps) {
  const [config, setConfig] = useState<FetchPipelinePublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [draftOuter, setDraftOuter] = useState("");
  const [draftNested, setDraftNested] = useState("");
  const [draftRssUrl, setDraftRssUrl] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminOk, setAdminOk] = useState<string | null>(null);

  const [subscribedSources, setSubscribedSources] = useState<SubscribedSourceRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsLoaded, setSubsLoaded] = useState(false);
  const [subsError, setSubsError] = useState<string | null>(null);
  const [sourceBusyId, setSourceBusyId] = useState<string | null>(null);
  const [bulkSourceBusy, setBulkSourceBusy] = useState(false);
  const [unsubId, setUnsubId] = useState<string | null>(null);

  const [rulesAll, setRulesAll] = useState<UserPipelineRuleRow[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesErr, setRulesErr] = useState<string | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleMsg, setRuleMsg] = useState<string | null>(null);
  const [plainRuleDrafts, setPlainRuleDrafts] = useState<Record<string, string>>({});

  const [hideDraft, setHideDraft] = useState("");
  const [preferDraft, setPreferDraft] = useState("");
  const [recDays, setRecDays] = useState("7");
  const [passLogsOpen, setPassLogsOpen] = useState(false);
  const [passLogs, setPassLogs] = useState<PassedPostLogRow[]>([]);
  const [passLogsLoading, setPassLogsLoading] = useState(false);
  const [passLogsLoaded, setPassLogsLoaded] = useState(false);
  const [passLogsError, setPassLogsError] = useState<string | null>(null);
  const userCacheKey = user?.id ?? "guest";
  const activeUserCacheKeyRef = useRef(userCacheKey);
  const configRequestRef = useRef<Promise<void> | null>(null);
  const subsRequestRef = useRef<Promise<void> | null>(null);
  const rulesRequestRef = useRef<Promise<void> | null>(null);
  const passLogsRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    activeUserCacheKeyRef.current = userCacheKey;
    configRequestRef.current = null;
    subsRequestRef.current = null;
    rulesRequestRef.current = null;
    passLogsRequestRef.current = null;
    setConfig(null);
    setConfigError(null);
    setConfigLoaded(false);
    setConfigLoading(false);
    setSubscribedSources([]);
    setSubsError(null);
    setSubsLoaded(false);
    setSubsLoading(false);
    setRulesAll([]);
    setRulesErr(null);
    setRulesLoaded(false);
    setRulesLoading(false);
    setPassLogs([]);
    setPassLogsError(null);
    setPassLogsLoaded(false);
    setPassLogsLoading(false);
  }, [userCacheKey]);

  const loadPipelineSnapshot = useCallback(() => {
    if (configRequestRef.current) return configRequestRef.current;
    const requestUserCacheKey = userCacheKey;
    const request = (async () => {
      setConfigLoading(true);
      setConfigError(null);
      try {
        const nextConfig = await readPipelineConfig(user, requestUserCacheKey);
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setConfig(nextConfig);
        setConfigLoaded(true);
      } catch (e) {
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setConfig(null);
        setConfigError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (activeUserCacheKeyRef.current === requestUserCacheKey) {
          setConfigLoading(false);
        }
      }
    })();
    configRequestRef.current = request;
    void request.finally(() => {
      if (configRequestRef.current === request) {
        configRequestRef.current = null;
      }
    });
    return request;
  }, [user, userCacheKey]);

  const loadSubscriptions = useCallback(() => {
    if (!user) return;
    if (subsRequestRef.current) return subsRequestRef.current;
    const requestUserCacheKey = userCacheKey;
    const request = (async () => {
      setSubsLoading(true);
      setSubsError(null);
      try {
        const res = await fetch("/api/me/subscribed-sources", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          success?: boolean;
          sources?: SubscribedSourceRow[];
          error?: string;
        };
        if (!res.ok || !data.success || !data.sources) throw new Error(data.error || "加载订阅失败");
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setSubscribedSources(data.sources);
        setSubsLoaded(true);
      } catch (e) {
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setSubscribedSources([]);
        setSubsError(e instanceof Error ? e.message : "加载订阅失败");
      } finally {
        if (activeUserCacheKeyRef.current === requestUserCacheKey) {
          setSubsLoading(false);
        }
      }
    })();
    subsRequestRef.current = request;
    void request.finally(() => {
      if (subsRequestRef.current === request) {
        subsRequestRef.current = null;
      }
    });
    return request;
  }, [user, userCacheKey]);

  const loadUserRules = useCallback(() => {
    if (!user) return;
    if (rulesRequestRef.current) return rulesRequestRef.current;
    const requestUserCacheKey = userCacheKey;
    const request = (async () => {
      setRulesLoading(true);
      setRulesErr(null);
      try {
        const res = await fetch("/api/me/pipeline-rules?module=all", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          success?: boolean;
          rules?: UserPipelineRuleRow[];
          error?: string;
        };
        if (!res.ok || !data.success) throw new Error(data.error || "规则加载失败");
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        const list = data.rules || [];
        setRulesAll(list);
        setRulesLoaded(true);
        const visibleDaysRule = list.find(
          (r) => getRuleModule(r) === "recommendation" && getRuleType(r) === "recommendation_visible_days"
        );
        if (visibleDaysRule && typeof visibleDaysRule.payload?.days === "number") {
          setRecDays(String(visibleDaysRule.payload.days));
        }
      } catch (e) {
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setRulesErr(e instanceof Error ? e.message : "规则加载失败");
      } finally {
        if (activeUserCacheKeyRef.current === requestUserCacheKey) {
          setRulesLoading(false);
        }
      }
    })();
    rulesRequestRef.current = request;
    void request.finally(() => {
      if (rulesRequestRef.current === request) {
        rulesRequestRef.current = null;
      }
    });
    return request;
  }, [user, userCacheKey]);

  const loadPassLogs = useCallback(() => {
    if (!user) {
      setPassLogs([]);
      setPassLogsLoaded(true);
      setPassLogsError("登录后可以查看订阅源的 PASS 明细。");
      return;
    }

    if (passLogsRequestRef.current) return passLogsRequestRef.current;
    const requestUserCacheKey = userCacheKey;
    const request = (async () => {
      setPassLogsLoading(true);
      setPassLogsError(null);
      try {
        const res = await fetch("/api/me/pass-logs?limit=60", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          success?: boolean;
          logs?: PassedPostLogRow[];
          error?: string;
        };
        if (!res.ok || !data.success) throw new Error(data.error || "加载 PASS 明细失败");
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setPassLogs(data.logs ?? []);
        setPassLogsLoaded(true);
      } catch (e) {
        if (activeUserCacheKeyRef.current !== requestUserCacheKey) return;
        setPassLogs([]);
        setPassLogsError(e instanceof Error ? e.message : "加载 PASS 明细失败");
      } finally {
        if (activeUserCacheKeyRef.current === requestUserCacheKey) {
          setPassLogsLoading(false);
        }
      }
    })();
    passLogsRequestRef.current = request;
    void request.finally(() => {
      if (passLogsRequestRef.current === request) {
        passLogsRequestRef.current = null;
      }
    });
    return request;
  }, [user, userCacheKey]);

  const togglePassLogs = useCallback(() => {
    if (passLogsOpen) {
      setPassLogsOpen(false);
      return;
    }
    setPassLogsOpen(true);
    if (!passLogsLoaded && !passLogsLoading) {
      void loadPassLogs();
    }
  }, [passLogsOpen, passLogsLoaded, passLogsLoading, loadPassLogs]);

  useEffect(() => {
    if (!isOpen || configLoaded || configLoading) return;
    void loadPipelineSnapshot();
  }, [isOpen, configLoaded, configLoading, loadPipelineSnapshot]);

  useEffect(() => {
    if (!isOpen || !user) return;
    if (!subsLoaded && !subsLoading) {
      void loadSubscriptions();
    }
    if (!rulesLoaded && !rulesLoading) {
      void loadUserRules();
    }
  }, [
    isOpen,
    user,
    subsLoaded,
    subsLoading,
    rulesLoaded,
    rulesLoading,
    loadSubscriptions,
    loadUserRules,
  ]);

  useEffect(() => {
    if (!config) return;
    setDraftOuter(String(config.effectiveSettings.rawMinOuterChars.value));
    setDraftNested(String(config.effectiveSettings.rawMinNestedCharsRetweet.value));
    setDraftRssUrl(config.effectiveSettings.ingestDedupeRssBlogMatchNewsUrl.value);
    setAdminError(null);
    setAdminOk(null);
  }, [config]);

  const fetchableSources = useMemo(
    () => subscribedSources.filter((source) => source.enabled !== false),
    [subscribedSources]
  );
  const pausedSources = useMemo(
    () => subscribedSources.filter((source) => source.enabled === false),
    [subscribedSources]
  );
  const rulesByModule = useMemo(() => {
    const map = new Map<PipelineRuleModuleKey, UserPipelineRuleRow[]>();
    for (const rule of rulesAll) {
      const moduleKey = getRuleModule(rule);
      if (!moduleKey) continue;
      const next = map.get(moduleKey) ?? [];
      next.push(rule);
      map.set(moduleKey, next);
    }
    return map;
  }, [rulesAll]);
  const rulesRec = useMemo(
    () => rulesByModule.get("recommendation") ?? [],
    [rulesByModule]
  );
  const hideRules = useMemo(
    () => rulesRec.filter((rule) => getRuleType(rule) === "hide_if_contains"),
    [rulesRec]
  );
  const preferRules = useMemo(
    () => rulesRec.filter((rule) => getRuleType(rule) === "prefer_keyword"),
    [rulesRec]
  );
  const visibleDaysRule = useMemo(
    () => rulesRec.find((rule) => getRuleType(rule) === "recommendation_visible_days"),
    [rulesRec]
  );
  const visibleRecommendationRuleCount = useMemo(
    () => rulesRec.filter((rule) => getRuleType(rule) !== DISABLE_BUILTIN_RULE_TYPE).length,
    [rulesRec]
  );
  const rulebookByKey = useMemo(() => {
    const map = new Map<string, RulebookStageItem>();
    for (const stage of config?.rulebook ?? []) map.set(stage.key, stage);
    return map;
  }, [config]);
  const pipeline = task?.result?.pipeline;
  const showTaskSection = Boolean(taskId && task);
  const isOptimistic = taskId === OPTIMISTIC_REFRESH_TASK_ID;

  const applyConfigResponse = useCallback((data: unknown) => {
    const parsed = data as { success?: boolean; config?: FetchPipelinePublicConfig; error?: string };
    if (parsed.success && parsed.config) {
      setConfig(parsed.config);
      setAdminOk("已保存");
    } else {
      setAdminError(parsed.error || "保存失败");
    }
  }, []);

  const putAdminSettings = useCallback(
    async (body: Record<string, unknown>) => {
      if (!user) return;
      setAdminSaving(true);
      setAdminError(null);
      setAdminOk(null);
      try {
        const res = await fetch("/api/admin/pipeline-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setAdminError((data && data.error) || `请求失败 (${res.status})`);
          return;
        }
        applyConfigResponse(data);
      } catch {
        setAdminError("网络错误");
      } finally {
        setAdminSaving(false);
      }
    },
    [user, applyConfigResponse]
  );

  const handleAdminSave = useCallback(() => {
    const outer = parseInt(draftOuter, 10);
    const nested = parseInt(draftNested, 10);
    if (!Number.isFinite(outer) || outer < 0 || outer > 500) {
      setAdminError("外层最短字符须为 0–500 的整数");
      return;
    }
    if (!Number.isFinite(nested) || nested < 0 || nested > 500) {
      setAdminError("引用帖最短字符须为 0–500 的整数");
      return;
    }
    void putAdminSettings({
      rawMinOuterChars: outer,
      rawMinNestedCharsRetweet: nested,
      ingestDedupeRssBlogMatchNewsUrl: draftRssUrl,
    });
  }, [draftOuter, draftNested, draftRssUrl, putAdminSettings]);

  const postRule = useCallback(
    async (moduleKey: PipelineRuleModuleKey, ruleType: string, payload: Record<string, unknown>) => {
      if (!user) return false;
      setRuleBusy(true);
      setRuleMsg(null);
      try {
        const res = await fetch("/api/me/pipeline-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ module: moduleKey, ruleType, payload }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setRuleMsg(data.error || "保存失败");
          return false;
        }
        setRuleMsg("已保存");
        await loadUserRules();
        return true;
      } catch {
        setRuleMsg("网络错误");
        return false;
      } finally {
        setRuleBusy(false);
      }
    },
    [user, loadUserRules]
  );

  const deleteRuleById = useCallback(
    async (id: string) => {
      if (!user) return;
      setRuleBusy(true);
      setRuleMsg(null);
      try {
        const res = await fetch(`/api/me/pipeline-rules?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setRuleMsg(data.error || "删除失败");
          return;
        }
        await loadUserRules();
      } catch {
        setRuleMsg("网络错误");
      } finally {
        setRuleBusy(false);
      }
    },
    [user, loadUserRules]
  );

  const handleUnsubscribe = useCallback(
    async (sourceId: string) => {
      if (!user) return;
      setUnsubId(sourceId);
      try {
        const res = await fetch(`/api/subscriptions?id=${encodeURIComponent(sourceId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setSubsError(data.error || "取消订阅失败");
          return;
        }
        await loadSubscriptions();
      } catch {
        setSubsError("网络错误");
      } finally {
        setUnsubId(null);
      }
    },
    [user, loadSubscriptions]
  );

  const patchSourceEnabled = useCallback(
    async (sourceId: string, enabled: boolean) => {
      if (!user) return false;
      setSourceBusyId(sourceId);
      setSubsError(null);
      try {
        const res = await fetch("/api/sources", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: sourceId, updates: { enabled } }),
        });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setSubsError(data.error || "更新抓取开关失败");
          return false;
        }
        setSubscribedSources((current) =>
          current.map((source) => (source.id === sourceId ? { ...source, enabled } : source))
        );
        return true;
      } catch {
        setSubsError("网络错误");
        return false;
      } finally {
        setSourceBusyId(null);
      }
    },
    [user]
  );

  const enableAllPausedSources = useCallback(async () => {
    if (!user || pausedSources.length === 0) return;
    setBulkSourceBusy(true);
    try {
      for (const source of pausedSources) {
        const ok = await patchSourceEnabled(source.id, true);
        if (!ok) break;
      }
      await loadSubscriptions();
    } finally {
      setBulkSourceBusy(false);
    }
  }, [user, pausedSources, patchSourceEnabled, loadSubscriptions]);

  const addHideKeyword = useCallback(async () => {
    const value = hideDraft.trim();
    if (!value) return;
    const ok = await postRule("recommendation", "hide_if_contains", { substring: value });
    if (ok) setHideDraft("");
  }, [hideDraft, postRule]);

  const addPreferKeyword = useCallback(async () => {
    const value = preferDraft.trim();
    if (!value) return;
    const ok = await postRule("recommendation", "prefer_keyword", { keyword: value });
    if (ok) setPreferDraft("");
  }, [preferDraft, postRule]);

  const saveVisibleDays = useCallback(async () => {
    const n = parseInt(recDays, 10);
    await postRule("recommendation", "recommendation_visible_days", {
      days: Number.isFinite(n) ? n : 1,
    });
  }, [recDays, postRule]);

  const setPlainRuleDraft = useCallback((moduleKey: PipelineRuleModuleKey, value: string) => {
    setPlainRuleDrafts((current) => ({ ...current, [moduleKey]: value }));
  }, []);

  const addPlainRule = useCallback(
    async (moduleKey: PipelineRuleModuleKey) => {
      const value = (plainRuleDrafts[moduleKey] ?? "").trim();
      if (!value) return;
      const ok = await postRule(moduleKey, PLAIN_RULE_TYPE, { text: value });
      if (ok) setPlainRuleDraft(moduleKey, "");
    },
    [plainRuleDrafts, postRule, setPlainRuleDraft]
  );

  const deleteDefaultRule = useCallback(
    async (moduleKey: PipelineRuleModuleKey, ruleId: string) => {
      await postRule(moduleKey, DISABLE_BUILTIN_RULE_TYPE, { ruleId });
    },
    [postRule]
  );

  const restoreDefaultRules = useCallback(
    async (moduleKey: PipelineRuleModuleKey) => {
      const hiddenRules = (rulesByModule.get(moduleKey) ?? []).filter(
        (rule) => getRuleType(rule) === DISABLE_BUILTIN_RULE_TYPE
      );
      for (const rule of hiddenRules) {
        await deleteRuleById(rule.id);
      }
    },
    [deleteRuleById, rulesByModule]
  );

  const getModuleRules = useCallback(
    (moduleKey: PipelineRuleModuleKey) => rulesByModule.get(moduleKey) ?? [],
    [rulesByModule]
  );

  const getHiddenDefaultCount = useCallback(
    (moduleKey: PipelineRuleModuleKey) =>
      getModuleRules(moduleKey).filter((rule) => getRuleType(rule) === DISABLE_BUILTIN_RULE_TYPE).length,
    [getModuleRules]
  );

  return (
    <AppModalShell
      isOpen={isOpen}
      onClose={onClose}
      panelVariant="large"
      panelClassName="max-h-[min(92vh,820px)] max-w-[760px] overflow-hidden p-0"
      ariaLabelledBy="fetch-pipeline-panel-title"
    >
      <div className="flex max-h-[min(92vh,820px)] flex-col bg-[#f8f8f8]">
        <div className="border-b border-[#e5e7eb] bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="fetch-pipeline-panel-title" className="text-base font-semibold text-[#101828]">
                抓取与筛选设置
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#6a7282]">
                抓取更新会先看你订阅了哪些源，再按下面这些规则筛一遍。
              </p>
            </div>
            <button
              type="button"
              className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium"
              onClick={() => void loadPipelineSnapshot()}
            >
              重新读取
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {configError ? <p className="mb-3 text-xs text-primary-600">{configError}</p> : null}
          {configLoading ? <p className="mb-3 text-xs text-[#99a1af]">正在读取规则…</p> : null}

          <section className="mb-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile
                label="会参与抓取"
                value={user ? `${fetchableSources.length}/${subscribedSources.length}` : "登录可见"}
              />
              <MetricTile
                label="首页时间窗"
                value={`${config?.effectiveSettings.feedVisibleDays.value ?? "—"} 天`}
                source={config?.effectiveSettings.feedVisibleDays.source}
              />
              <MetricTile
                label="最低重要性"
                value={`${config?.effectiveSettings.feedMinImportanceScore.value ?? "—"} 分`}
                source={config?.effectiveSettings.feedMinImportanceScore.source}
              />
              <MetricTile
                label="X 抓取密钥"
                value={config?.xFetchConfigured ? "已配置" : "未配置"}
              />
            </div>
          </section>

          <section className="mb-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#101828]">筛选机制</h3>
                <p className="mt-1 text-xs leading-5 text-[#6a7282]">
                  每一步都是可编辑的规则清单：默认规则可删除、可恢复，也可以继续新增自己的规则。
                </p>
              </div>
              {pausedSources.length > 0 ? (
                <span className="rounded bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary-700">
                  {pausedSources.length} 个源未参与
                </span>
              ) : null}
            </div>

            <div className="grid gap-3">
              <StageRuleCard
                index={1}
                title="信息源与订阅"
                summary={
                  user
                    ? `${subscribedSources.length} 个订阅源，其中 ${fetchableSources.length} 个会被刷新按钮抓取。`
                    : "登录后按你的订阅源抓取。"
                }
                stage={rulebookByKey.get("sources")}
                moduleKey="sources"
                userRules={getModuleRules("sources")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={user ? `${fetchableSources.length}/${subscribedSources.length} 会抓取` : "登录可见"}
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {pausedSources.length > 0 ? (
                      <button
                        type="button"
                        disabled={bulkSourceBusy}
                        className="btn-press rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => void enableAllPausedSources()}
                      >
                        全部启用抓取
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium"
                      onClick={() => onRequestAddSource?.()}
                    >
                      增加信息源
                    </button>
                  </div>
                  {subsLoading ? <p className="text-xs text-[#99a1af]">加载订阅…</p> : null}
                  {subsError ? <p className="text-xs text-primary-600">{subsError}</p> : null}
                  {!user ? (
                    <p className="text-xs leading-5 text-[#99a1af]">登录后可启用、暂停或取消每个订阅源。</p>
                  ) : subscribedSources.length === 0 && !subsLoading ? (
                    <p className="text-xs leading-5 text-[#6a7282]">暂无订阅源。</p>
                  ) : (
                    <ul className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
                      {subscribedSources.map((source) => {
                        const enabled = source.enabled !== false;
                        return (
                          <li
                            key={source.id}
                            className={[
                              "flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2",
                              enabled ? "border-[#f3f4f6] bg-white" : "border-primary-100 bg-primary-50",
                            ].join(" ")}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-xs font-semibold text-[#101828]">
                                  @{source.handle}
                                </span>
                                <span
                                  className={[
                                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                    enabled ? "bg-[#eef4ff] text-[#0055FF]" : "bg-white text-primary-700",
                                  ].join(" ")}
                                >
                                  {enabled ? "会抓取" : "未参与"}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-[#6a7282]">
                                {source.name || source.handle}
                                {typeof source.postCount === "number" ? ` · ${source.postCount} 条` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={sourceBusyId === source.id || bulkSourceBusy}
                                className={[
                                  "btn-press rounded-md px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50",
                                  enabled
                                    ? "border border-[#e5e7eb] bg-white text-[#6a7282] hover:bg-[#f5f5f5]"
                                    : "bg-primary-500 text-white",
                                ].join(" ")}
                                onClick={() => void patchSourceEnabled(source.id, !enabled)}
                              >
                                {sourceBusyId === source.id ? "保存中" : enabled ? "暂停" : "启用"}
                              </button>
                              <button
                                type="button"
                                disabled={unsubId === source.id}
                                className="btn-press rounded-md px-2 py-1.5 text-[11px] font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                                onClick={() => void handleUnsubscribe(source.id)}
                              >
                                {unsubId === source.id ? "…" : "删除"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <RuleAddBox
                    moduleKey="sources"
                    user={user}
                    draft={plainRuleDrafts.sources ?? ""}
                    placeholder="例如：只抓我明确订阅的账号"
                    hiddenDefaultCount={getHiddenDefaultCount("sources")}
                    disabled={ruleBusy}
                    onDraftChange={setPlainRuleDraft}
                    onAdd={addPlainRule}
                    onRestoreDefaults={restoreDefaultRules}
                  />
                </div>
              </StageRuleCard>

              <StageRuleCard
                index={2}
                title="拉取与去重"
                summary="判断这条内容是不是以前见过，见过就跳过。"
                stage={rulebookByKey.get("dedupe")}
                moduleKey="dedupe"
                userRules={getModuleRules("dedupe")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={config?.effectiveSettings.ingestDedupeRssBlogMatchNewsUrl.value ? "网页链接去重开" : "网页链接去重关"}
              >
                {config?.canEdit && user ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-[#101828]">
                      <input
                        type="checkbox"
                        className="rounded border-[#e5e7eb]"
                        checked={draftRssUrl}
                        onChange={(e) => setDraftRssUrl(e.target.checked)}
                      />
                      网页/RSS 链接去重
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={adminSaving}
                        className="btn-press rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => void putAdminSettings({ ingestDedupeRssBlogMatchNewsUrl: draftRssUrl })}
                      >
                        保存去重规则
                      </button>
                      <button
                        type="button"
                        disabled={adminSaving}
                        className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium"
                        onClick={() => void putAdminSettings({ ingestDedupeRssBlogMatchNewsUrl: null })}
                      >
                        删除覆盖
                      </button>
                    </div>
                    {adminError ? <p className="text-xs text-primary-600">{adminError}</p> : null}
                    {adminOk ? <p className="text-xs text-[#6a7282]">{adminOk}</p> : null}
                    <RuleAddBox
                      moduleKey="dedupe"
                      user={user}
                      draft={plainRuleDrafts.dedupe ?? ""}
                      placeholder="例如：同一个链接出现过就跳过"
                      hiddenDefaultCount={getHiddenDefaultCount("dedupe")}
                      disabled={ruleBusy}
                      onDraftChange={setPlainRuleDraft}
                      onAdd={addPlainRule}
                      onRestoreDefaults={restoreDefaultRules}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs leading-5 text-[#99a1af]">
                      网页/RSS 链接去重当前来自 {sourceLabel(config?.effectiveSettings.ingestDedupeRssBlogMatchNewsUrl.source ?? "default")}；管理员可调整这个开关。
                    </p>
                    <RuleAddBox
                      moduleKey="dedupe"
                      user={user}
                      draft={plainRuleDrafts.dedupe ?? ""}
                      placeholder="例如：同一个链接出现过就跳过"
                      hiddenDefaultCount={getHiddenDefaultCount("dedupe")}
                      disabled={ruleBusy}
                      onDraftChange={setPlainRuleDraft}
                      onAdd={addPlainRule}
                      onRestoreDefaults={restoreDefaultRules}
                    />
                  </div>
                )}
              </StageRuleCard>

              <StageRuleCard
                index={3}
                title="进入待处理区"
                summary="通过前面检查的内容先放进待处理区，再继续判断。"
                stage={rulebookByKey.get("raw")}
                moduleKey="raw"
                userRules={getModuleRules("raw")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={config?.processingJobsEnabled ? "队列开启" : "直接处理"}
              >
                <RuleAddBox
                  moduleKey="raw"
                  user={user}
                  draft={plainRuleDrafts.raw ?? ""}
                  placeholder="例如：通过检查后先排队处理"
                  hiddenDefaultCount={getHiddenDefaultCount("raw")}
                  disabled={ruleBusy}
                  onDraftChange={setPlainRuleDraft}
                  onAdd={addPlainRule}
                  onRestoreDefaults={restoreDefaultRules}
                />
              </StageRuleCard>

              <StageRuleCard
                index={4}
                title="太弱内容预筛"
                summary={`外层少于 ${config?.effectiveSettings.rawMinOuterChars.value ?? "—"} 字，或引用少于 ${config?.effectiveSettings.rawMinNestedCharsRetweet.value ?? "—"} 字且无媒体时丢弃。`}
                stage={rulebookByKey.get("quality")}
                moduleKey="quality"
                userRules={getModuleRules("quality")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={`${config?.effectiveSettings.rawMinOuterChars.value ?? "—"} / ${config?.effectiveSettings.rawMinNestedCharsRetweet.value ?? "—"} 字`}
              >
                {config?.canEdit && user ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1 text-xs text-[#6a7282]">
                        外层最短字符
                        <input
                          className="input-field rounded-md px-2 py-1 text-sm"
                          type="number"
                          min={0}
                          max={500}
                          value={draftOuter}
                          onChange={(e) => setDraftOuter(e.target.value)}
                        />
                      </label>
                      <label className="flex min-w-0 flex-col gap-1 text-xs text-[#6a7282]">
                        引用最短字符
                        <input
                          className="input-field rounded-md px-2 py-1 text-sm"
                          type="number"
                          min={0}
                          max={500}
                          value={draftNested}
                          onChange={(e) => setDraftNested(e.target.value)}
                        />
                      </label>
                    </div>
                    {adminError ? <p className="text-xs text-primary-600">{adminError}</p> : null}
                    {adminOk ? <p className="text-xs text-[#6a7282]">{adminOk}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={adminSaving}
                        className="btn-press rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => void handleAdminSave()}
                      >
                        保存预筛规则
                      </button>
                      <button
                        type="button"
                        disabled={adminSaving}
                        className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium"
                        onClick={() =>
                          void putAdminSettings({
                            rawMinOuterChars: null,
                            rawMinNestedCharsRetweet: null,
                          })
                        }
                      >
                        删除覆盖
                      </button>
                    </div>
                    <RuleAddBox
                      moduleKey="quality"
                      user={user}
                      draft={plainRuleDrafts.quality ?? ""}
                      placeholder="例如：太短且没图的视频内容直接丢弃"
                      hiddenDefaultCount={getHiddenDefaultCount("quality")}
                      disabled={ruleBusy}
                      onDraftChange={setPlainRuleDraft}
                      onAdd={addPlainRule}
                      onRestoreDefaults={restoreDefaultRules}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs leading-5 text-[#99a1af]">
                      字数阈值是站点级参数；你仍可新增或删除自己的规则说明。
                    </p>
                    <RuleAddBox
                      moduleKey="quality"
                      user={user}
                      draft={plainRuleDrafts.quality ?? ""}
                      placeholder="例如：太短且没图的视频内容直接丢弃"
                      hiddenDefaultCount={getHiddenDefaultCount("quality")}
                      disabled={ruleBusy}
                      onDraftChange={setPlainRuleDraft}
                      onAdd={addPlainRule}
                      onRestoreDefaults={restoreDefaultRules}
                    />
                  </div>
                )}
              </StageRuleCard>

              <StageRuleCard
                index={5}
                title="AI 判断是否值得入库"
                summary="判断这条内容是不是值得进入资讯流，再生成标题、摘要和分类。"
                stage={rulebookByKey.get("ai")}
                moduleKey="ai"
                userRules={getModuleRules("ai")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status="内置规则"
              >
                <div className="space-y-2">
                  <p className="text-xs leading-5 text-[#99a1af]">
                    AI 判断是全站共用能力；你可以在这里补充自己的判断规则。
                  </p>
                  <RuleAddBox
                    moduleKey="ai"
                    user={user}
                    draft={plainRuleDrafts.ai ?? ""}
                    placeholder="例如：只保留明确和 AI 相关的内容"
                    hiddenDefaultCount={getHiddenDefaultCount("ai")}
                    disabled={ruleBusy}
                    onDraftChange={setPlainRuleDraft}
                    onAdd={addPlainRule}
                    onRestoreDefaults={restoreDefaultRules}
                  />
                </div>
              </StageRuleCard>

              <StageRuleCard
                index={6}
                title="首页列表过滤"
                summary={`只显示最近 ${config?.effectiveSettings.feedVisibleDays.value ?? "—"} 天，且重要性不低于 ${config?.effectiveSettings.feedMinImportanceScore.value ?? "—"} 分的内容。`}
                stage={rulebookByKey.get("feed")}
                moduleKey="feed"
                userRules={getModuleRules("feed")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={`${config?.effectiveSettings.feedVisibleDays.value ?? "—"} 天 / ${config?.effectiveSettings.feedMinImportanceScore.value ?? "—"} 分`}
              >
                <div className="grid gap-2">
                  <MetricTile
                    label="首页时间窗"
                    value={`${config?.effectiveSettings.feedVisibleDays.value ?? "—"} 天`}
                    source={config?.effectiveSettings.feedVisibleDays.source}
                  />
                  <MetricTile
                    label="最低重要性"
                    value={`${config?.effectiveSettings.feedMinImportanceScore.value ?? "—"} 分`}
                    source={config?.effectiveSettings.feedMinImportanceScore.source}
                  />
                  <RuleAddBox
                    moduleKey="feed"
                    user={user}
                    draft={plainRuleDrafts.feed ?? ""}
                    placeholder="例如：太旧的内容不显示在首页"
                    hiddenDefaultCount={getHiddenDefaultCount("feed")}
                    disabled={ruleBusy}
                    onDraftChange={setPlainRuleDraft}
                    onAdd={addPlainRule}
                    onRestoreDefaults={restoreDefaultRules}
                  />
                </div>
              </StageRuleCard>

              <StageRuleCard
                index={7}
                title="个人推荐规则"
                summary="只影响你的订阅推荐流：可缩短时间窗、隐藏关键词、提升关键词排序。"
                stage={PERSONAL_RECOMMENDATION_RULE_STAGE}
                moduleKey="recommendation"
                userRules={getModuleRules("recommendation")}
                canEditRules={Boolean(user)}
                rulesBusy={ruleBusy}
                onDeleteDefaultRule={deleteDefaultRule}
                onDeleteUserRule={deleteRuleById}
                status={visibleDaysRule ? formatRulePayload("recommendation_visible_days", visibleDaysRule.payload) : `${visibleRecommendationRuleCount} 条规则`}
              >
                {!user ? (
                  <p className="text-xs leading-5 text-[#99a1af]">登录后可增加、删除或调整个人推荐规则。</p>
                ) : (
                  <div className="space-y-3">
                    {rulesErr ? <p className="text-xs text-primary-600">{rulesErr}</p> : null}
                    {ruleMsg ? (
                      <p className="text-xs text-[#6a7282]" role="status">
                        {ruleMsg}
                      </p>
                    ) : null}
                    {rulesLoading ? <p className="text-xs text-[#99a1af]">加载个人规则…</p> : null}
                    <RuleAddBox
                      moduleKey="recommendation"
                      user={user}
                      draft={plainRuleDrafts.recommendation ?? ""}
                      placeholder="例如：带这些词的内容优先看"
                      hiddenDefaultCount={getHiddenDefaultCount("recommendation")}
                      disabled={ruleBusy}
                      onDraftChange={setPlainRuleDraft}
                      onAdd={addPlainRule}
                      onRestoreDefaults={restoreDefaultRules}
                    />

                    <label className="flex flex-col gap-1 text-xs text-[#6a7282]">
                      推荐流最近 N 天
                      <div className="flex gap-2">
                        <input
                          className="input-field h-8 rounded-md py-1 text-xs"
                          type="number"
                          min={1}
                          max={90}
                          value={recDays}
                          onChange={(e) => setRecDays(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={ruleBusy}
                          className="btn-press rounded-md bg-primary-500 px-3 text-xs font-medium text-white disabled:opacity-50"
                          onClick={() => void saveVisibleDays()}
                        >
                          保存
                        </button>
                        {visibleDaysRule ? (
                          <button
                            type="button"
                            disabled={ruleBusy}
                            className="btn-primary btn-press rounded-md px-3 text-xs font-medium"
                            onClick={() => void deleteRuleById(visibleDaysRule.id)}
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    </label>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1 text-xs text-[#6a7282]">
                        隐藏关键词
                        <div className="flex min-w-0 gap-2">
                          <input
                            className="input-field h-8 min-w-0 rounded-md py-1 text-xs"
                            value={hideDraft}
                            onChange={(e) => setHideDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void addHideKeyword();
                            }}
                          />
                          <button
                            type="button"
                            disabled={ruleBusy || !hideDraft.trim()}
                            className="btn-primary btn-press rounded-md px-3 text-xs font-medium disabled:opacity-50"
                            onClick={() => void addHideKeyword()}
                          >
                            增加
                          </button>
                        </div>
                      </label>
                      <label className="flex min-w-0 flex-col gap-1 text-xs text-[#6a7282]">
                        优先关键词
                        <div className="flex min-w-0 gap-2">
                          <input
                            className="input-field h-8 min-w-0 rounded-md py-1 text-xs"
                            value={preferDraft}
                            onChange={(e) => setPreferDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void addPreferKeyword();
                            }}
                          />
                          <button
                            type="button"
                            disabled={ruleBusy || !preferDraft.trim()}
                            className="btn-primary btn-press rounded-md px-3 text-xs font-medium disabled:opacity-50"
                            onClick={() => void addPreferKeyword()}
                          >
                            增加
                          </button>
                        </div>
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium text-[#99a1af]">隐藏规则</p>
                        {hideRules.length > 0 ? (
                          <ul className="grid gap-1.5">
                            {hideRules.map((rule) => (
                              <RuleChip
                                key={rule.id}
                                rule={rule}
                                disabled={ruleBusy}
                                onDelete={(id) => void deleteRuleById(id)}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[#6a7282]">暂无隐藏关键词。</p>
                        )}
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium text-[#99a1af]">优先规则</p>
                        {preferRules.length > 0 ? (
                          <ul className="grid gap-1.5">
                            {preferRules.map((rule) => (
                              <RuleChip
                                key={rule.id}
                                rule={rule}
                                disabled={ruleBusy}
                                onDelete={(id) => void deleteRuleById(id)}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[#6a7282]">暂无优先关键词。</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </StageRuleCard>
            </div>
          </section>

          <section className="mb-4 rounded-md border border-[#f3f4f6] bg-white p-3 shadow-xs">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#101828]">当前 / 最近一次刷新</h3>
              <button
                type="button"
                className="btn-primary btn-press rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                disabled={passLogsLoading}
                onClick={togglePassLogs}
              >
                {passLogsOpen ? "收起 PASS 明细" : "查看 PASS 明细"}
              </button>
            </div>
            {!showTaskSection ? (
              <p className="text-sm text-[#6a7282]">暂无进行中的任务。</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[#6a7282]">状态</span>
                  <span className="font-medium text-[#101828]">{task?.status ?? "—"}</span>
                  {isOptimistic ? (
                    <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-xs text-[#6a7282]">启动中</span>
                  ) : null}
                </div>
                <p className="text-sm text-[#6a7282]">{task?.message ?? ""}</p>
                {pipeline ? (
                  <div className="grid gap-2 sm:grid-cols-4">
                    <MetricTile label="源进度" value={`${pipeline.sourcesProcessed ?? 0}/${pipeline.sourcesTotal ?? 0}`} />
                    <MetricTile label="新内容" value={`${pipeline.rawInserted ?? 0}`} />
                    <MetricTile label="入库" value={`${pipeline.processSuccess ?? 0}`} />
                    <MetricTile label="筛掉" value={`${(pipeline.droppedLowSignal ?? 0) + (pipeline.droppedUnimportant ?? 0)}`} />
                  </div>
                ) : null}
                {pipeline?.sourcesSkippedDisabled ? (
                  <p className="text-xs text-primary-600">
                    本轮有 {pipeline.sourcesSkippedDisabled} 个订阅源因抓取开关关闭未参与。
                  </p>
                ) : null}
              </div>
            )}
            {passLogsOpen ? (
              <div className="mt-3 overflow-hidden rounded-md border border-[#f3f4f6] bg-[#fafafa]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f4f6] bg-white px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-[#101828]">最近 PASS 记录</p>
                    <p className="mt-0.5 text-[11px] text-[#99a1af]">只展示已记录的订阅源条目。</p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-press rounded-md px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                    disabled={passLogsLoading}
                    onClick={() => void loadPassLogs()}
                  >
                    刷新
                  </button>
                </div>

                {passLogsLoading ? (
                  <p className="px-3 py-4 text-sm text-[#6a7282]" role="status">
                    正在加载 PASS 明细…
                  </p>
                ) : passLogsError ? (
                  <p className="px-3 py-4 text-sm text-primary-600">{passLogsError}</p>
                ) : passLogs.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[#6a7282]">
                    暂无 PASS 记录。新的刷新完成后会开始累积。
                  </p>
                ) : (
                  <ul className="max-h-[360px] divide-y divide-[#f3f4f6] overflow-y-auto">
                    {passLogs.map((log) => (
                      <li key={log.id} className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              log.passType === "low_signal"
                                ? "bg-[#f5f5f5] text-[#6a7282]"
                                : "bg-primary-50 text-primary-700",
                            ].join(" ")}
                          >
                            {passTypeLabel(log.passType)}
                          </span>
                          <span className="min-w-0 truncate text-xs font-medium text-[#101828]">
                            {log.sourceName || (log.sourceHandle ? `@${log.sourceHandle}` : "未知来源")}
                          </span>
                          <span className="text-[11px] text-[#99a1af]">
                            {formatPassLogTime(log.publishedAt || log.updatedAt)}
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
                        <p className="mt-2 text-xs leading-5 text-[#101828]">{log.passReason}</p>
                        {log.content ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6a7282]">
                            {log.content}
                          </p>
                        ) : null}
                        {log.summary ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#99a1af]">
                            {log.title ? `${log.title}：` : ""}
                            {log.summary}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

        </div>

        <div className="border-t border-[#e5e7eb] bg-white px-5 py-3">
          <button
            type="button"
            className="btn-primary btn-press w-full rounded-md py-2.5 text-sm font-medium"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </AppModalShell>
  );
}
