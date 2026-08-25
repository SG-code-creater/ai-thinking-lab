-- ============================================================
--  ai-thinking-lab 增量迁移（10.2 – 10.6）
--  说明：本文件整合 D2 反思打分 / A3 盲化 / A4 知情同意 /
--        臂3 同伴互评 / 按臂规则 所需的全部增量字段与表。
--  全部使用 if not exists / on conflict do nothing，可重复执行，安全。
--  适用：Supabase SQL Editor 整段粘贴执行一次即可。
--  执行前若想先确认现状，可直接跳到文件末尾的「校验查询」先看一眼。
-- ============================================================

-- 10.2) sessions 增加反思深度自动打分字段（D2）
--      reflection_score：0–3 反思层级（DeepSeek 批处理写入）
--      reflection_reason：打分依据（抽样人工校验用）
--      reflection_scored_at：打分时间
alter table if exists public.sessions
  add column if not exists reflection_score int,
  add column if not exists reflection_reason text,
  add column if not exists reflection_scored_at timestamptz;

-- 10.3) consents：知情同意记录（A4）
--      每会话仅一次同意；参与前落库，作为人类受试者研究的伦理留痕。
create table if not exists public.consents (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references public.sessions(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  consented_at   timestamptz default now(),
  unique (session_id)
);

-- 10.4) sessions 增加盲化校验猜测字段（A3）
--      guessed_group：参与者会话末自报「我觉得自己在哪组」，存中性选项字母 A/B/C/D
--      研究者对照 arm 映射（socratic→A, free→B, solo→C）即可算盲化成功率。
alter table if exists public.sessions
  add column if not exists guessed_group text;

-- 10.5) peer_reviews：臂3 同伴互评（匿名）
--      reviewer 为当前 solo 参与者；target 为其他 solo 参与者的匿名文本上传。
--      同一评审者对同一份文本只评一次（unique 约束去重，upsert 幂等）。
create table if not exists public.peer_reviews (
  id                  uuid primary key default gen_random_uuid(),
  reviewer_session_id uuid references public.sessions(id) on delete cascade,
  target_upload_id    uuid references public.uploads(id) on delete cascade,
  rating              int not null check (rating between 1 and 5),
  comment             text,
  created_at          timestamptz default now(),
  unique (reviewer_session_id, target_upload_id)
);
create index if not exists idx_peer_reviews_target
  on public.peer_reviews(target_upload_id);

-- 10.6) rules 增加适用臂字段（按臂规则）
--      arm：null/空 = 全局生效；'socratic'/'free'/'solo' = 仅该臂生效。
--      背景(background) 规则按 arm 过滤后仅展示给该臂参与者；
--      约束(constraint) 规则按 arm 过滤后仅注入该臂 AI，避免误伤其他臂。
alter table if exists public.rules
  add column if not exists arm text;

-- ============================================================
--  校验查询：执行上面迁移后，跑这段确认所需结构都已就位
-- ============================================================
-- select 'sessions.reflection_score' as item,
--        count(*) as exists_count
-- from information_schema.columns
-- where table_schema='public' and table_name='sessions'
--   and column_name in ('reflection_score','reflection_reason','reflection_scored_at','guessed_group','turns');
-- select 'consents' as tbl, count(*) as exists_count
-- from information_schema.tables where table_schema='public' and table_name='consents';
-- select 'peer_reviews' as tbl, count(*) as exists_count
-- from information_schema.tables where table_schema='public' and table_name='peer_reviews';
-- select 'rules.arm' as item, count(*) as exists_count
-- from information_schema.columns where table_schema='public' and table_name='rules' and column_name='arm';
