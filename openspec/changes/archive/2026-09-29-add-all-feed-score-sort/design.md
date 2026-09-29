## Context

需求与范围见 `proposal.md`，行为契约见 `specs/all-feed-sorting/spec.md`。与实现方案直接相关的现状：

- 页面数据流：`apps/web/app/routes/all.tsx` 的 loader 通过 loopback 请求 `GET /api/site/pool`（`apps/api/src/routes/site.ts:103`），后者调用 `loadPool()`（`packages/backend/src/publication/pool.ts:113`）。
- `loadPool` 有三条查询路径：不搜索、搜索「最新」、搜索「全文相关」。前两条都按 `p.timeline_at DESC, p.article_id DESC` 排序，先在 CTE 中取出本页的 `article_id`，再对这些行做 JOIN。分页方式是 `LIMIT 40 OFFSET (page-1)*40`，最多 50 页。
- 不搜索时，总数由 `poolCount` 按筛选条件缓存 30 秒，上限 2000；搜索「最新」的总数从 `pool_search` 计算。两者都与排序无关。
- AI 评分存放在 `publications.score numeric(5,2)`，可以为空，目前没有索引。现有 `publications_pool_timeline_idx ON (timeline_at DESC, article_id) WHERE visibility='public' AND eligible`。
- 前端 `DayList` 按北京日期把**相邻**条目切成一组；`DayHeader` 是吸顶的日期行，桌面端右侧一栏显示「星期 · N 条」。
- 北京时间固定为 UTC+8，不存在夏令时（`packages/contracts/src/time.ts`）。
- migration 由 `scripts/migrate.ts` 执行，每个文件在各自的事务里运行，所以不能使用 `CREATE INDEX CONCURRENTLY`。
- 搜索排序切换 `searchTabHref` 目前会删掉 `page`；筛选切换 `hrefWith` 会复制所有参数，只删掉 `page` 和 `cursor`。

## Goals / Non-Goals

**Goals:**
- 在现有三条查询路径的基础上，只替换排序表达式来支持评分排序，不另建一套查询。
- 评分排序下的分页性能与现在按时间分页处于同一量级。
- 页码越界的处理在服务端完成，页面 URL 与实际展示的页码保持一致。

**Non-Goals:**
- 不增加表字段，不改动评分的写入与合成方式（`analyze.ts`、`publish.ts`）。
- 不改 `DayList` 的分组算法：评分排序以日期为第一排序键，相邻切分的结果本来就正确。
- 不为「全文相关」增加评分作为次级排序键。

## Decisions

### D1. 参数设计：新增 `sort`，与已有的 `tab` 并存

- URL 与 `/api/site/pool` 都新增 `sort` 参数，取值只认 `score`，其他值一律视为 `time`。
- 实际生效的排序按以下规则确定：
  1. 有搜索词且 `tab=relevance`：全文相关，忽略 `sort`。
  2. `sort=score`：按评分排序。不搜索时适用；搜索时匹配范围与「最新」相同。
  3. 其他情况：按时间排序。
- 响应的 `PoolResponse.filters` 增加 `sort: "time" | "score"`，值为实际生效的排序；走全文相关时为 `"time"`。`tab` 字段的类型与含义不变。
- 搜索排序三项切换生成的链接：
  - 「最新」：删除 `tab` 和 `sort`
  - 「全文相关」：设置 `tab=relevance`，删除 `sort`
  - 「AI 评分」：设置 `sort=score`，删除 `tab`
  - 三者都保留 `page`
- 当前选中项的判断：`tab=relevance` 选中「全文相关」，否则 `sort=score` 选中「AI 评分」，否则选中「最新」。

**考虑过的替代方案**：把 `tab` 扩展为 `time | relevance | score`，不搜索时也用 `tab`。没有采用，原因是 `tab` 在现有代码里的语义是"搜索排序"，而且 API 在没有搜索词时会强制把它设成 `time`。用同一个 `sort` 参数表达"按评分"，搜索前后含义一致，SearchField 只要把 `sort` 带进表单，就能直接满足规格里"带着评分排序去搜索"的场景。

### D2. 排序表达式

在 `pool.ts` 中加一个按 `sort` 返回 ORDER BY 片段的辅助函数，本页 CTE 和外层 SELECT 都用它，保证两处顺序一致：

```sql
-- time（不变）
ORDER BY p.timeline_at DESC, p.article_id DESC
-- score
ORDER BY (p.timeline_at AT TIME ZONE 'Asia/Shanghai')::date DESC,
         p.score DESC NULLS LAST,
         p.timeline_at DESC, p.article_id DESC
```

- 日期用 `AT TIME ZONE 'Asia/Shanghai'` 计算，与前端 `beijingDate()` 的分组结果一致，所以同一页里每个日期只会出现一个日期标题。
- `article_id` 放在最后作为兜底排序键，保证 OFFSET 分页稳定，不会有条目在两页之间重复或丢失。
- 搜索「AI 评分」沿用搜索「最新」的查询路径（`directMatchCondition` 与计数方式都不变），只替换 ORDER BY。所以它和「最新」的找到条数一定相同。

**考虑过的替代方案**：
- 新增一个生成列 `timeline_day date`。没有采用：需要回填数据，还要检查写入路径，而表达式索引已经够用。
- 在前端对当前页重新排序。没有采用：这样只能排当前这一页，第 1 页不一定包含当天分数最高的那些条目。

### D3. 索引：新增 migration `0039_pool_score_sort_idx.sql`

```sql
CREATE INDEX publications_pool_score_idx ON publications (
  ((timeline_at AT TIME ZONE 'Asia/Shanghai')::date) DESC,
  score DESC NULLS LAST,
  timeline_at DESC,
  article_id DESC
) WHERE visibility = 'public' AND eligible;
```

- 索引列与 D2 的 ORDER BY 完全对应，谓词与现有 `publications_pool_timeline_idx` 相同，所以不搜索时的评分排序可以顺着索引取前 N 行，不用排序全部数据。
- `timezone(text, timestamptz)` 与 `timestamp::date` 都是 IMMUTABLE，可以用在表达式索引里。
- 带分类或频道筛选时，行为与现有时间线索引一样：顺着索引扫描，再过滤掉不符合条件的行。
- 搜索「AI 评分」时，先按 `search_text LIKE` 得到匹配集合，再排序。匹配集合通常不大，而且这条路径已经受 `withSearchCapacity` 的并发限制。

**考虑过的替代方案**：不建索引，每次查询时对全部符合条件的行做 top-N 排序。这样也能用，而且有 60 秒 CDN 缓存兜底。但最深的一页 OFFSET 是 1960，每次都要扫描全部 eligible 行。建索引的代价只是写入时多维护一个索引，所以选择建索引。实现时用 `EXPLAIN` 确认执行计划确实用上了它（见 tasks）。

### D4. 页码越界：服务端回退，页面重定向

- 在 `loadPool` 里，查询完成后如果 `rows` 为空、`total > 0`，并且 `page > pageCount`，就用 `pageCount` 作为页码再查一次，响应中的 `page` 是实际页码。这种情况很少发生，只在越界时多查一次；正常路径的查询次数不变。
- 在 `all.tsx` 的 loader 里，如果 `data.page` 和请求的页码不同，就用 `pageHref` 生成正确的 URL 并返回 `redirect`（302），让地址栏与内容一致。
- `total === 0` 时保持现状，展示空状态。

**考虑过的替代方案**：先查总数再查本页。没有采用：全文相关路径的总数和本页是在同一条 SQL 里算出来的，拆开会给每次搜索多加一次查询。

### D5. 前端放置与交互

- **桌面端**：`DayList` 新增一个可选的 `aside` 插槽，只渲染在**第一个** `DayHeader` 右侧（第三栏改为两端对齐：左边是「星期 · N 条」，右边是下拉）。这个位置就是截图红框所在的日期标题行。`DayHeader` 相应增加一个可选的 `aside` 属性。
- **移动端**：下拉放在分类标签行右侧，分类标签用 `min-w-0 flex-1` 保持可以横向滚动，下拉 `shrink-0`，沿用 `Select` 自带的 `h-8`（与 sm 分类标签轨道高度一致）。
- **组件**：复用 `components/ui/Controls.tsx` 的 `Select`，`aria-label="排序"`，选项为「默认」和「AI 评分」。
- **交互**：`onChange` 时用 `useNavigate` 跳转到"当前参数 + 设置或删除 `sort`，保留 `page`"的地址。沿用现有的 `busy` 半透明加载状态。
- **有搜索词时**：不渲染这个下拉，改用 `PillTabs` 三项切换（D1）。
- **SearchField 的 `keep`**：增加 `sort`，这样提交搜索时会带上当前排序。`CategoryTabs` 用的 `hrefWith` 本来就会复制 `sort`，不用改。
- **SEO**：`meta` 里 `listPath` 生成 canonical 时不带 `sort`，按评分排序的页面把 canonical 指向默认排序的同一页，避免重复收录。

**考虑过的替代方案**：
- 把下拉放在筛选行，与搜索框并排。没有采用：桌面筛选行已经有分类标签和搜索框，空间比较挤，而且这也不是用户在截图里标出的位置。
- 用 `Menu` 弹出菜单。没有采用：它的触发按钮是固定尺寸的图标按钮，不适合显示「默认 / AI 评分」这样的文字。

## Risks / Trade-offs

- [切换排序后，同一页的内容会在跨天的地方变化] → 这是方案 A 本来就有的效果：每页覆盖的日期范围基本不变，只有跨天边界上的少数条目会移到相邻页。
- [没有分数的条目很多时，当天末尾会集中一批无分内容] → 这是规格明确要求的结果；无分条目仍按时间倒序，便于浏览。
- [在较大的表上建索引会短暂锁住写入] → migration 在事务中执行，不能用 CONCURRENTLY。表的规模是几万到几十万行，建索引通常只要几秒。上线前在生产规模的数据上估算耗时；如果太慢，改成在维护窗口手动 `CREATE INDEX CONCURRENTLY`，再补写 `schema_migrations` 记录。
- [越界重定向会多一次往返] → 只在越界时发生，属于少见情况。
- [同分时排序变化会造成 ETag 抖动] → 不会。排序键最后有 `article_id`，排序是确定的。

## Migration Plan

1. 部署包含 `0039_pool_score_sort_idx.sql` 的版本，由 `npm run db:migrate` 自动建索引。
2. API 与 web 同时发布。`sort` 参数是新增的：旧版 web 请求新版 API 时不带 `sort`，结果与原来一致；新版 web 请求旧版 API 时 `sort` 会被忽略，只是退化成按时间排序。所以发布顺序不影响可用性。
3. 回滚：回滚应用代码即可。索引可以保留，也可以 `DROP INDEX publications_pool_score_idx`，不影响数据。
