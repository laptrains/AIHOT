## Why

「全部动态」（`/all`）目前只能按时间倒序浏览，一天几百条，读者想先看"今天最值得读的"只能逐条扫 AI 评分。每条资料都已有 AI 评分（两次独立评分的平均值），把它用作排序依据，可以在不改变按天浏览习惯的前提下，让高分内容排到每天的前面。

## What Changes

- `/all` 在列表上方右侧（日期标题行对齐的位置）新增排序下拉，选项为「默认」（按时间倒序，现状）和「AI 评分」（从高到低）。
- 「AI 评分」排序仍按北京日期分天：日期倒序，同一天内按评分从高到低；同分按时间倒序；没有评分的条目排在当天最后。
- 搜索时隐藏排序下拉，搜索排序切换由两项扩展为三项：「最新（标题与摘要）」「全文相关」「AI 评分」。搜索下的「AI 评分」只匹配标题与摘要，排序规则同上（分天、天内按分）。
- URL 新增 `sort=score` 表示按评分排序；默认排序不写入 URL。切换排序时保留当前页码；切换分类、频道、标签或发起搜索时保留当前排序。
- 请求的页码超过结果总页数时，改为返回最后一页（此前返回空页）。
- 内部接口 `/api/site/pool` 新增 `sort` 查询参数，响应的 `filters` 中新增 `sort` 字段（新增字段，不破坏已有调用）。
- 新增数据库 migration，为按"北京日期、评分、时间"排序增加部分索引。

不在本次范围：

- 公开 API `/api/v1/items`、MCP、RSS 不增加评分排序（它们使用独立查询与游标分页，另开变更处理）。
- 「全文相关」结果中同一天出现多个日期标题的问题不在本次处理。
- 首页精选时间线、主题页不增加评分排序。

## Capabilities

### New Capabilities
- `all-feed-sorting`: 「全部动态」列表（含搜索结果）的排序方式选择，包括按时间与按 AI 评分两种排序的行为、URL 表达、分页与筛选切换时的保持规则。

### Modified Capabilities
（无。项目目前没有已记录的 spec。）

## Impact

- 前端：`apps/web/app/routes/all.tsx`（下拉、搜索排序三项、`sort` 参数透传、页码越界跳转）；`apps/web/app/features/feed/Filters.tsx`（切换分类/搜索时保留 `sort`）；复用 `apps/web/app/components/ui/Controls.tsx` 的 `Select`。
- API：`apps/api/src/routes/site.ts` 的 `/api/site/pool` 解析 `sort`。
- 后端查询：`packages/backend/src/publication/pool.ts` 的 `loadPool` 增加评分排序分支与页码越界处理。
- 契约：`packages/contracts/src/site.ts` 的 `PoolResponse.filters` 增加 `sort`。
- 数据库：新增 `database/migrations/0039_pool_score_sort_idx.sql`。
- 测试：新增 `tests/` 下针对评分排序与页码越界的用例。
- 缓存：`/api/site/pool` 的 ETag 与 CDN 缓存按完整 URL 区分，`sort` 不同的请求自然分开缓存，无需额外处理。
