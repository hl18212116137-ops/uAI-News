# uAI News

AI 资讯聚合网站：订阅信息源、中文摘要、INSIGHT 解读、收藏、阅读偏好与长文阅读。

## 技术栈

- Next.js **15.5.27** App Router、React **18.2**、TypeScript 5
- Tailwind CSS 3.4；设计规范与布局约束见 [AGENTS.md](AGENTS.md)
- PostgreSQL（兼容 Supabase），通过 Drizzle + `pg` 访问
- NextAuth 4 Credentials + JWT 会话；AI 提供者由 `lib/ai/ai-factory.ts` 配置

## 本地运行

需要 Node.js 20.9+ 与可连接的 PostgreSQL。

```bash
npm ci
cp .env.example .env.local
# 配置 DATABASE_URL、NEXTAUTH_SECRET 及所需 API 密钥
npm run init-db  # 仅在自己的新数据库中执行
npm run dev
```

开发地址为 `http://localhost:3001`，可通过 `npm run dev -- --port 3100` 调整。
信息源由数据库和网站管理；`data/sources.json` 仅用于补充头像与简介，不能代替数据库。

```bash
npm run typecheck     # 源码与维护脚本检查，包含未使用变量/参数检查
npm test              # 无需数据库或 API 密钥的回归测试
npm run build         # 生产编译及 Next.js 路由类型检查
npm start             # 运行 standalone 产物，默认端口 3001
npm run check         # 上述检查、测试和构建
npm run benchmark:feed
```

开发输出与生产输出分别为 `.next-dev` / `.next`。`npm start` 只同步静态资源，不再复制整套依赖到第二个运行目录。

## 数据处理与部署

- `npm run fetch` 抓取启用信息源，`npm run process` 消费原始内容；两者都调用网站使用的服务层，会访问配置的数据库及付费 API。
- 网站的「更新」入口只处理当前用户订阅的来源；浏览信息流不会自动触发抓取。
- 阅读偏好只提供时间范围、屏蔽关键词与优先关键词；个人隐藏记录可在此恢复。
- `/admin/pipeline` 集中管理采集参数、订阅源开关、筛选审核和长文导入。使用 `PIPELINE_ADMIN_EMAILS` 或 `PIPELINE_ADMIN_USER_IDS` 配置管理员；未配置时默认禁止管理操作。
- 自动长文发现默认关闭；登录用户可按需提取已存在新闻的长文，任意 URL/文件导入仅限管理员。
- 定时任务由外部调度调用 `app/api/internal/cron/` 下的接口，并使用 `CRON_SECRET`。
- `FEED_CANDIDATE_LIMIT` 控制每个信息流快照的最大候选行数，默认 1000，可设为 100–5000。筛选和统计针对此窗口，不代表全库历史总量；不会删除窗口外数据。
- 抓取任务状态保存到 PostgreSQL `refresh_tasks`，支持跨实例查询与取消，仅发起人可读取。Next.js `after()` 保持响应后的执行生命周期，超出平台执行时限的长任务仍需独立工作进程。

详细数据流、扩展入口见 [架构说明](docs/ARCHITECTURE.md)。本次检查结果、清理快照和性能测量见 [重构记录](docs/REFACTOR-2026-10-04.md)。

功能精简、权限调整与隔离库验证见 [功能调整记录](docs/FEATURE-ADJUSTMENTS-2026-10-04.md)。

`mobile-app/` 是独立客户端和服务项目，本轮网站重构未修改该目录。

最终清理、依赖审计、浏览器验证及推送前置条件见 [最终检查记录](docs/FINAL-REVIEW-2026-10-04.md)。

远程 main 整合及最新验证结果见 [合并检查记录](docs/MERGE-REVIEW-2026-10-04.md)。
