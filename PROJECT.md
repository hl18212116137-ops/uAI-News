# uAI News — 项目知识库

> **AI 读取说明**：本文档是项目的单一可信来源，每次开始任务前请先读此文件。
> 最后更新：2026-03-21

---

## 一、项目概述

**uAI News（ainews-v2）** 是一个 AI 驱动的新闻聚合网站，自动抓取 X（Twitter）、RSS、Blog 等平台的 AI 领域资讯，经 AI 处理（标题生成、摘要、分类、重要性评分）后展示给用户。

- **正式网站**：部署在 Vercel（`main` 分支触发）
- **GitHub 仓库**：`hl18212116137-ops/uAI-News`
- **数据库**：Supabase（托管 PostgreSQL）

---

## 二、技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | Next.js App Router | 14.2.0 |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 3.4.0 |
| UI | React 函数组件 | 18.x |
| 数据库 | Supabase (PostgreSQL) | @supabase/supabase-js ^2.x |
| AI 主服务 | Minimax | abab6.5-chat |
| AI 备用服务 | Claude | claude-sonnet-4-6 |
| 部署 | Vercel Serverless | Hobby（60s 超时） |
| 认证 | **无**（待实现） | — |

**路径别名**：`@/*` → 项目根目录

---

## 三、Supabase 数据库

**Project URL**：`https://whlbhxxrhvjeskgevgjk.supabase.co`

### 表结构

#### `news_items`（最终新闻）
```sql
id TEXT PRIMARY KEY           -- 格式：x-{tweetId} 或 rss-{hash}
title TEXT                    -- AI 生成的中文标题
summary TEXT                  -- AI 生成的中文摘要
content TEXT                  -- AI 翻译的中文全文
source_platform TEXT          -- 'X' | 'RSS' | 'Blog'
source_name TEXT              -- 作者名
source_handle TEXT            -- 作者 handle（小写）
source_url TEXT UNIQUE        -- 原文链接（去重依据）
category TEXT                 -- 见下方分类列表
published_at TIMESTAMPTZ      -- 原文发布时间
original_text TEXT            -- 原始英文文本
created_at TIMESTAMPTZ        -- 入库时间
importance_score INTEGER      -- AI 评分 0-100
```

#### `sources`（信息源配置）
```sql
id TEXT PRIMARY KEY
source_type TEXT              -- 'blogger' | 'media' | 'academic'
platform TEXT                 -- 'X' | 'RSS' | 'Blog'
handle TEXT                   -- 唯一标识符
name TEXT
url TEXT
avatar TEXT
description TEXT
enabled BOOLEAN DEFAULT true
added_at TIMESTAMPTZ
last_fetched_at TIMESTAMPTZ
fetch_config JSONB            -- RSS 源的额外配置
```

#### `raw_posts`（抓取暂存区）
AI 处理完成后自动删除，不需要手动维护。

#### `ai_cache`、`seen_ids`
辅助表，当前未充分利用。

### 新闻分类（NewsCategory）
```
'Model Update' | 'Product Update' | 'Research' | 'Company News'
'Funding' | 'Policy' | 'Open Source' | 'Other'
```

---

## 四、环境变量

### Vercel 和 .env.local 都需要配置

| 变量名 | 用途 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端密钥（绕过 RLS） |
| `TWITTERAPI_IO_KEY` | twitterapi.io 的 API Key（抓取 X 推文） |
| `ANTHROPIC_API_KEY` | Claude AI 密钥 |
| `MINIMAX_API_KEY` | Minimax AI 密钥 |
| `MINIMAX_GROUP_ID` | Minimax 群组 ID |
| `AI_PROVIDER` | `'minimax'`（默认）或 `'claude'` |

---

## 五、目录结构

```
ainews-v2/
├── app/
│   ├── page.tsx              # 首页（Server Component，revalidate=0）
│   ├── layout.tsx            # 根布局
│   ├── globals.css           # 全局样式 + 组件类
│   ├── news/[id]/page.tsx    # 新闻详情页
│   └── api/
│       ├── refresh/route.ts          # 触发全量刷新（异步，返回 taskId）
│       ├── refresh/fetch/route.ts    # 只抓取 → raw_posts
│       ├── refresh/process/route.ts  # AI 处理 → news_items
│       ├── sources/route.ts          # 信息源 CRUD
│       ├── task-status/route.ts      # 轮询任务进度
│       └── import-from-url/route.ts  # 手动导入单条 URL
├── components/               # 19 个组件，全部扁平结构
│   ├── MainContent.tsx       # ⭐ 核心：所有客户端状态在这里
│   ├── NewsCard.tsx          # 新闻卡片
│   ├── NewsList.tsx          # 新闻列表
│   ├── SourcesList.tsx       # 左侧信息源列表
│   ├── CategoryFilter.tsx    # 分类筛选标签栏
│   ├── FilterPanel.tsx       # 活动筛选器面板
│   ├── SiteHeader.tsx        # 顶部栏（含刷新按钮）
│   ├── RefreshButton.tsx     # 刷新进度条（每1秒轮询）
│   ├── TopImportantNews.tsx  # 重要新闻置顶区
│   ├── WeeklyReportModal.tsx # 周报全屏弹窗
│   └── AddSourceModal.tsx    # 添加信息源弹窗
├── lib/
│   ├── types.ts              # ⭐ 共享 TypeScript 类型
│   ├── db.ts                 # Supabase 数据库操作（server-only）
│   ├── supabase.ts           # Supabase 客户端单例（server-only）
│   ├── sources.ts            # 信息源 CRUD（server-only）
│   ├── news.ts               # 新闻过滤/排序/查询
│   ├── stats.ts              # 统计数据
│   ├── x.ts                  # Twitter/X API 客户端
│   ├── media-fetcher.ts      # RSS/Blog 抓取
│   ├── task-manager.ts       # 内存任务队列（globalThis 单例）
│   ├── ai/
│   │   ├── ai-service.ts     # AIService 接口（7个方法）
│   │   ├── ai-factory.ts     # 工厂 + 自动降级 + 重试
│   │   ├── claude-service.ts # Claude 实现
│   │   └── minimax-service.ts # Minimax 实现
│   ├── deduplication/        # 去重系统（见下）
│   └── import/               # 手动导入流水线
├── tailwind.config.ts        # 设计 Token（颜色/间距/阴影/动画）
├── CLAUDE.md                 # Figma-to-Code 设计系统规则
└── PROJECT.md                # 本文档（项目知识库）
```

---

## 六、数据流

```
用户访问首页
    ↓
app/page.tsx (Server Component)
    getAllPosts()         → Supabase news_items 全表
    getTopImportantNews() → 过滤近3天，按 importance_score 排序
    getSources()          → Supabase sources 表
    getStats()            → 统计数据
    ↓
<MainContent> (Client Component)
    useMemo → 客户端过滤（category / source / query URL参数）
    ↓
<NewsList> → <NewsCard>
```

```
用户点击"刷新"
    ↓
POST /api/refresh → 创建 taskId，异步启动
    ↓
POST /api/refresh/fetch
    读 sources → 对每个 X 源调用 twitterapi.io
    对 RSS/Blog 源调用 media-fetcher
    双重去重（ID + source_url）
    写入 raw_posts
    ↓
POST /api/refresh/process
    读 raw_posts（最多50条）
    AI: processNews() → { title, summary, category, important }
    AI: translateContent() → 中文全文
    AI: scoreNewsImportance() → 0-100 分
    写入 news_items，删除 raw_posts 对应记录
    ↓
前端每1秒轮询 /api/task-status
完成后 router.refresh() 刷新页面
```

---

## 七、去重系统

三层去重，依次执行：

| 层级 | 方式 | 触发时机 |
|------|------|---------|
| **硬去重** | ID + URL + 文本 SHA-256 | 抓取时（fetch 路由） |
| **数据库去重** | `source_url` 唯一约束 | 写入前（addPost 函数） |
| **语义去重** | AI 相似度对比（可选） | 需要 `SEMANTIC_DEDUP_ENABLED=true` |

---

## 八、Git 分支策略

| 分支 | 用途 | 对应部署 |
|------|------|---------|
| `main` | 正式版本 | Vercel 正式网站 |
| `dev` | 日常开发 | Vercel 自动生成预览 URL |

**工作流**：
1. 在 `dev` 分支开发和测试
2. 推送到 `dev` → Vercel 自动生成预览链接（格式：`xxx-git-dev-xxx.vercel.app`）
3. 确认没问题 → 合并到 `main` → 正式网站更新

**回退方法**：
```bash
# 查看历史版本
git log --oneline

# 回退单个文件
git checkout <commit-hash> -- path/to/file.tsx

# 回退整个项目（慎用）
git reset --hard <commit-hash>
```

---

## 九、已完成的重要改动记录

### v1.0.0（2026-03 上线）

| 改动 | 文件 | 说明 |
|------|------|------|
| 迁移数据库 | `lib/db.ts`, `lib/supabase.ts` | 从本地 JSON 文件迁移到 Supabase PostgreSQL |
| 迁移信息源配置 | `lib/sources.ts` | sources.json → Supabase sources 表 |
| 重构刷新流水线 | `app/api/refresh/*/route.ts` | 移除 child_process.spawn，改为两步 API 路由 |
| 修复 URL 去重 | `lib/db.ts`, `app/api/refresh/fetch/route.ts` | addPost 加 source_url 查重；fetch 路由加双重去重 |
| ID 规范化 | `lib/db.ts` | `x_` 前缀统一改为 `x-`，防止同一推文重复入库 |
| 禁用页面缓存 | `app/page.tsx` | `export const revalidate = 0`，确保 Vercel 不缓存旧数据 |
| 统一筛选架构 | `MainContent.tsx`, `FilterPanel.tsx`, `SourcesList.tsx` | 所有筛选改为 URL 参数驱动，客户端 useMemo 过滤 |

---

## 十、待办事项（按优先级）

| 优先级 | 任务 | 涉及文件 | 预期效果 |
|--------|------|---------|---------|
| 🔴 高 | NewsCard/NewsList 加 React.memo | `components/NewsCard.tsx`, `components/NewsList.tsx` | FilterPanel 切换不卡顿 |
| 🔴 高 | process 路由改并发处理 | `app/api/refresh/process/route.ts` | 刷新速度提升 3-5 倍 |
| 🟡 中 | 处理上限 50→100 条 | `app/api/refresh/process/route.ts` | 减少多次手动触发 |
| 🟡 中 | 改为服务端过滤 | `app/page.tsx`, `lib/news.ts` | 数据量大时初始负载小 |
| 🟢 低 | 用户系统（Clerk） | `middleware.ts`, `SiteHeader.tsx`, API routes | 管理员鉴权 |

---

## 十一、常见问题

**Q：为什么有时候网站数据不更新？**
A：`revalidate = 0` 已设置，Vercel 不缓存。如果还是旧数据，尝试强制刷新（Ctrl+Shift+R）。

**Q：刷新按钮点了没反应？**
A：检查 Vercel 环境变量是否都已配置（尤其是 `TWITTERAPI_IO_KEY`）。

**Q：添加信息源后很慢？**
A：正常，添加时会后台处理历史推文，需要等待 AI 处理完成。

**Q：重复数据怎么清理？**
A：在 Supabase SQL Editor 执行：
```sql
DELETE FROM news_items WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY source_url ORDER BY COALESCE(importance_score, 0) DESC, created_at ASC
    ) AS rn FROM news_items
  ) ranked WHERE rn > 1
);
```
