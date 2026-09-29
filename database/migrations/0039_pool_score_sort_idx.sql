-- 全部动态「AI 评分」排序: Beijing day newest first, then score high to low (unscored last), then
-- time. Same predicate as publications_pool_timeline_idx, so the unsearched pool pages by walking it.
CREATE INDEX publications_pool_score_idx ON publications (
  ((timeline_at AT TIME ZONE 'Asia/Shanghai')::date) DESC,
  score DESC NULLS LAST,
  timeline_at DESC,
  article_id DESC
) WHERE visibility = 'public' AND eligible;
