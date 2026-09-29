# all-feed-sorting Specification

## Purpose
让读者在「全部动态」列表及其搜索结果中，选择按时间或按 AI 评分排序，在保持按天浏览的前提下优先看到每天评分更高的内容。

## Requirements

### Requirement: 排序方式选择
「全部动态」页面在未搜索时 SHALL 在列表上方右侧提供排序下拉，选项为「默认」和「AI 评分」。未指定排序时 SHALL 使用「默认」。桌面端与移动端 SHALL 都提供该下拉；移动端 SHALL 放在分类标签行的右侧，使用小号样式。

#### Scenario: 首次打开页面
- **WHEN** 用户打开 `/all`，URL 中没有 `sort` 参数
- **THEN** 下拉显示「默认」，列表按时间倒序排列，与本次变更前一致

#### Scenario: 选择 AI 评分
- **WHEN** 用户在下拉中选择「AI 评分」
- **THEN** 页面 URL 带上 `sort=score`，列表按评分排序规则重新排列

#### Scenario: 选回默认
- **WHEN** 用户当前为 `sort=score`，在下拉中选择「默认」
- **THEN** URL 中不再包含 `sort` 参数，列表恢复按时间倒序

#### Scenario: 无法识别的排序值
- **WHEN** URL 中 `sort` 的值不是 `score`（例如 `sort=foo`）
- **THEN** 页面按「默认」排序展示，不报错

### Requirement: 按 AI 评分排序的规则
选择「AI 评分」时，列表 SHALL 先按条目所属的北京日期倒序分组，同一天内 SHALL 按 AI 评分从高到低排列；评分相同时 SHALL 按时间倒序；没有 AI 评分的条目 SHALL 排在当天所有有评分条目之后，彼此按时间倒序。条目 SHALL NOT 因没有评分而被隐藏。每个北京日期在同一页内 SHALL 只出现一个日期标题。

#### Scenario: 同一天内高分在前
- **WHEN** 9月29日有评分为 19、85、60 的三条内容，用户选择「AI 评分」
- **THEN** 9月29日下的顺序为 85、60、19

#### Scenario: 不跨天混排
- **WHEN** 9月28日有一条 95 分内容，9月29日最高分为 70，用户选择「AI 评分」
- **THEN** 9月29日的所有内容仍排在 9月28日之前

#### Scenario: 同分按时间
- **WHEN** 同一天有两条都是 60 分的内容，分别在 10:00 和 15:00 收录
- **THEN** 15:00 的那条排在前面

#### Scenario: 无评分的条目
- **WHEN** 同一天有部分内容没有 AI 评分
- **THEN** 这些内容出现在当天有评分内容之后，并且照常展示

#### Scenario: 日期标题不重复
- **WHEN** 用户选择「AI 评分」浏览任意一页
- **THEN** 该页每个日期只出现一个日期标题，当天的「· N 条」计数与默认排序时相同

### Requirement: 搜索结果的排序切换
有搜索词时，页面 SHALL 隐藏排序下拉，并在搜索排序切换中提供三项：「最新（标题与摘要）」「全文相关」「AI 评分」。「AI 评分」SHALL 只匹配标题与摘要（与「最新」的匹配范围相同），并使用与「按 AI 评分排序的规则」相同的排序规则。「全文相关」的匹配范围与排序 SHALL 保持现状。

#### Scenario: 搜索时的排序项
- **WHEN** 用户搜索任意关键词
- **THEN** 页面不显示排序下拉，搜索排序切换显示三项

#### Scenario: 搜索结果按评分排序
- **WHEN** 用户搜索关键词后点击「AI 评分」
- **THEN** 结果集合与「最新（标题与摘要）」相同，排列改为按天分组、天内评分从高到低，找到条数不变

#### Scenario: 带着评分排序去搜索
- **WHEN** 用户在 `sort=score` 状态下提交搜索
- **THEN** 搜索结果默认选中「AI 评分」

#### Scenario: 从评分切到全文相关
- **WHEN** 用户在搜索结果「AI 评分」下点击「全文相关」
- **THEN** 结果按全文相关度排列，与本次变更前的全文相关行为一致

### Requirement: 排序在 URL 中的表达与保持
按评分排序 SHALL 以 URL 参数 `sort=score` 表达，默认排序 SHALL NOT 写入 URL。切换排序方式时 SHALL 保留当前页码。切换分类、频道、标签或提交搜索时 SHALL 保留当前排序方式，页码 SHALL 回到第 1 页（与现有筛选切换行为一致）。带有 `sort=score` 的链接被分享或刷新时 SHALL 展示相同的排序。

#### Scenario: 切换排序保留页码
- **WHEN** 用户在默认排序的第 3 页选择「AI 评分」
- **THEN** 页面跳到 `sort=score` 的第 3 页

#### Scenario: 切换分类保留排序
- **WHEN** 用户在 `sort=score` 状态下点击分类「模型」
- **THEN** 页面显示「模型」分类的第 1 页，仍按 AI 评分排序

#### Scenario: 分享链接
- **WHEN** 用户打开他人分享的 `/all?category=paper&sort=score&page=2`
- **THEN** 页面展示论文分类、按 AI 评分排序的第 2 页

### Requirement: 页码越界时回到最后一页
当请求的页码大于当前筛选、搜索与排序条件下的总页数，且结果不为空时，页面 SHALL 展示最后一页，页面 URL 中的页码 SHALL 与实际展示的页码一致。结果为空时 SHALL 保持现有的空状态提示。

#### Scenario: 切换到结果更少的排序
- **WHEN** 用户在搜索「最新」第 8 页切到「全文相关」，而全文相关结果只有 5 页
- **THEN** 页面展示全文相关的第 5 页，URL 中 `page=5`

#### Scenario: 手动输入过大页码
- **WHEN** 用户打开 `/all?category=tip&page=40`，而该分类只有 3 页
- **THEN** 页面展示第 3 页，URL 中 `page=3`

#### Scenario: 无结果
- **WHEN** 当前条件下没有任何结果
- **THEN** 页面显示原有的「没有找到相关内容」空状态

### Requirement: 对外接口保持不变
公开 API `/api/v1/items`、MCP 与 RSS 输出 SHALL NOT 因本变更改变排序或参数。

#### Scenario: 公开 API 不受影响
- **WHEN** 调用方以本变更前的参数请求 `/api/v1/items` 或 `/feed/all.xml`
- **THEN** 返回的排序与内容和变更前一致
