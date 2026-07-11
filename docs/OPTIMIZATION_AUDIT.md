# uAI News 系统检查与优化记录

更新时间：2026-07-11

## 当前结论

当前分支可以本地运行和构建，但仍不建议直接推送或合并到 `main`。原因是工作区仍有大量未提交文件，当前分支也没有配置远端，需要先把变更归类、提交并决定合并路径。

## 已落地优化

- 长文列表 API 支持 `offset` / `limit`，返回 `posts`、`total`、`nextOffset`、`hasMore`。
- 长文页签改为首批 12 条，点击“加载更多长文”追加下一批，保留按需加载全文的 list/detail split。
- `/api/health/feed` 增加结构化队列字段：`queue.rawQueuePending`、`queue.processingJobsPending`、`queue.totalPending`、`queue.oldestPendingAgeMinutes`，并保留 `checks`。
- raw queue 处理路径统一只消费 `new` / `queued`，按 `created_at ASC` 稳定取队列，并排除 active jobs。
- 新增性能索引迁移：推荐流、订阅流、长文流、raw queue、pending jobs。
- PASS 操作降为更轻的次级动作，保留“解读”为信息卡主动作。
- 文档中的 Next.js 版本更新为 15.5.19，并移除过时的 `ignoreBuildErrors` 说明。

## 性能预算

- 首页 First Load JS：不超过 `145 kB`。
- 主页 HTML：不超过 `90 KB`。
- `/api/feed?offset=0&limit=12`：不超过 `30 KB`。
- `/api/longform/posts?offset=0&limit=12`：不超过 `100 KB`。

## 回归检查

基础检查：

```bash
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run build
git diff --check
```

本地服务已启动后运行 API smoke：

```bash
npm.cmd run test:api-smoke
```

浏览器 smoke 重点：

- 首页标题为 `uAI News | AI 资讯聚合`。
- 首页控制台无 warn/error。
- 普通信息流不混入长文。
- 长文页签首批渲染 12 篇，并显示“加载更多长文”。
- 点击“加载更多长文”后追加下一批，控制台仍无 warn/error。

## 合并前门槛

- 工作区干净，新增文件已归类。
- 所有检查通过。
- 关键 API 返回体积不超过预算。
- raw queue 口径在健康检查、处理路径和测试中一致。
- 若要推送，需要先配置 remote；若只做本地发布，先在当前分支提交，再决定是否 merge 到 `main`。
