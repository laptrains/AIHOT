## 1. 数据库与契约

- [x] 1.1 新增 `database/migrations/0039_pool_score_sort_idx.sql`，按 design D3 创建 `publications_pool_score_idx`；在 `*_test` 库执行 `npm run db:migrate`，确认输出 `applied 0039_pool_score_sort_idx.sql`，并用 `\d publications` 看到该索引
- [x] 1.2 在 `packages/contracts/src/site.ts` 的 `PoolResponse.filters` 增加 `sort: "time" | "score"`；运行 `npm run typecheck`，报错只应出现在尚未适配的 `pool.ts` 返回值处

## 2. 后端查询

- [x] 2.1 在 `packages/backend/src/publication/pool.ts` 的 `PoolQuery` 增加 `sort?: "time" | "score"`，按 design D1 的优先级算出实际生效的排序，写入响应的 `filters.sort`；`npm run typecheck` 通过
- [x] 2.2 新增按排序返回 ORDER BY 片段的辅助函数（design D2），替换"不搜索"和"搜索·最新"两条路径中 CTE 与外层 SELECT 的排序；全文相关路径保持不变。用 `git diff` 确认全文相关的 SQL 没有改动
- [x] 2.3 在 `loadPool` 中实现页码越界回退（design D4）：`rows` 为空、`total > 0` 且 `page > pageCount` 时，用最后一页重查，并在响应中返回实际页码
- [x] 2.4 在 `*_test` 库对 `sort=score` 的不搜索查询执行 `EXPLAIN`，确认计划使用 `publications_pool_score_idx`，而不是对全部 eligible 行做 Sort；把结论写进 PR 描述

## 3. API

- [x] 3.1 在 `apps/api/src/routes/site.ts` 的 `/api/site/pool` 中解析 `q.sort`（只认 `score`，其他值都视为 `time`）并传给 `loadPool`；本地启动 API，确认 `curl "http://127.0.0.1:3001/api/site/pool?sort=score"` 返回 `filters.sort === "score"`，`?sort=foo` 返回 `"time"`

## 4. 前端

- [x] 4.1 `apps/web/app/routes/all.tsx` 的 loader 读取 `sort` 并透传给 API；当 `data.page` 与请求页码不同时，按 `pageHref` 返回 302 重定向（design D4）。访问 `/all?page=999` 时，确认地址栏变为最后一页
- [x] 4.2 `DayHeader` 增加可选的 `aside` 属性，`DayList` 增加 `aside` 插槽，只在第一个日期标题右侧渲染；首页时间线等其他调用方不传这个属性，页面上确认它们外观不变
- [x] 4.3 在 `all.tsx` 中，不搜索时渲染排序 `Select`：桌面端通过 `DayList` 的 `aside` 放到第一个日期标题右侧，移动端放在分类行右侧并用小号；切换时保留 `page`，选「默认」时删除 `sort`。在浏览器里验证第 3 页切到「AI 评分」后仍是第 3 页，而且每天内部按分数从高到低
- [x] 4.4 把搜索排序 `PillTabs` 扩展为「最新（标题与摘要）/ 全文相关 / AI 评分」三项，按 design D1 生成链接、判断选中项，并保留 `page`；有搜索词时隐藏 `Select`。在浏览器里验证三项切换时找到条数的变化：「最新」与「AI 评分」相同，「全文相关」可能不同
- [x] 4.5 在 `SearchField` 的 `keep` 中加入 `sort`；在 `sort=score` 状态下提交搜索，确认结果默认选中「AI 评分」；点击分类「模型」，确认仍然按评分排序且回到第 1 页
- [x] 4.6 `meta` 生成 canonical 时不带 `sort`；查看 `/all?sort=score&page=2` 的页面源码，确认 canonical 为 `/all?page=2`

## 5. 测试与整体验证

- [x] 5.1 新增 `tests/pool-sort.test.ts`，覆盖以下情况，并确认 `npm test` 通过：
  - 同一天内按分数从高到低
  - 不跨天混排
  - 同分按时间倒序
  - 无分条目排在当天末尾
  - 搜索「AI 评分」与「最新」的 `total` 相同
  - `sort=foo` 按时间排序
  - 页码越界时返回最后一页
  - 结果为空时 `page` 保持原值
- [x] 5.2 运行 `npm run typecheck` 与 `npm test`，全部通过；抽查 `/api/v1/items` 与 `/feed/all.xml` 的输出，确认与改动前一致
- [x] 5.3 在桌面和移动两种宽度下，按规格 `specs/all-feed-sorting/spec.md` 的各个场景逐条手动走查，确认日期标题不重复、今日条数不变、暗色模式下下拉样式正常
