-- 10.2) sessions 增加反思深度自动打分字段（D2，幂等）
--      reflection_score：0–3 反思层级（DeepSeek 批处理写入）
--      reflection_reason：打分依据（抽样人工校验用）
--      reflection_scored_at：打分时间
-- 说明：本文件可单独在 Supabase SQL Editor 执行一次；重复执行安全（if not exists）。
alter table if exists public.sessions
  add column if not exists reflection_score int,
  add column if not exists reflection_reason text,
  add column if not exists reflection_scored_at timestamptz;

-- 校验是否成功（应返回 3 行）：
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='sessions'
--   and column_name in ('reflection_score','reflection_reason','reflection_scored_at');
