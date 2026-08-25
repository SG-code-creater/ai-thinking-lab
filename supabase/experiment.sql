-- ============================================================
-- 大学生思考力研究 · 实验平台 数据库 Schema
-- 在 Supabase 控制台的 SQL Editor 中完整执行本文件即可。
-- 说明：所有数据访问均经由服务端 service_role，未启用 RLS；
--       参与者为「免登」匿名身份，隔离靠应用层 participant_id 校验。
-- ============================================================

create extension if not exists pgcrypto;

-- 1) profiles：Clerk 研究者账户（供 /api/clerk-webhook 维护）
create table if not exists public.profiles (
  user_id    text primary key,
  email      text,
  plan       text default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) settings：后台设置（当前激活的实验臂）
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);
-- 初始为 "none"：未开放任何臂
insert into public.settings (key, value)
values ('active_arm', '"none"')
on conflict (key) do nothing;

-- 3) group_codes：分组码 → 实验臂（研究者生成后发给参与者）
create table if not exists public.group_codes (
  code       text primary key,
  arm        text not null check (arm in ('socratic','free','solo')),
  label      text,
  created_at timestamptz default now(),
  used_count int default 0
);

-- 4) participants：免登参与者（每次成功输码生成一个）
create table if not exists public.participants (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  arm        text not null,
  created_at timestamptz default now()
);

-- 5) sessions：一次实验会话
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  arm           text not null,
  started_at    timestamptz default now(),
  ended_at      timestamptz,
  status        text default 'active'
);

-- 6) messages：对话记录（含范围守卫拦截标记、总结标记）
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  role       text not null check (role in ('user','assistant','system')),
  content    text not null,
  blocked    boolean default false,  -- 范围守卫拦截
  is_summary boolean default false,  -- 苏格拉底式总结
  created_at timestamptz default now()
);
create index if not exists idx_messages_session on public.messages(session_id, created_at);

-- 7) uploads：臂3（自主思考）的文档收集
create table if not exists public.uploads (
  id            uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete cascade,
  filename      text not null,
  storage_path  text,                         -- Supabase Storage 路径（上传文件）
  size_bytes    bigint,
  text_content  text,                         -- 直接粘贴的文本
  created_at    timestamptz default now()
);

-- 8) Storage bucket：文档存储（非公开，经服务端读取）
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- 9) rules：实验规则（测试背景 + 限制条件），仅后台管理
create table if not exists public.rules (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('background','constraint')),
  content    text not null,
  visible_to_participant boolean default false,  -- 测试背景默认对参与者可见
  created_at timestamptz default now()
);
create index if not exists idx_rules_kind on public.rules(kind, created_at);
create index if not exists idx_rules_visible on public.rules(visible_to_participant, created_at);

-- 9.1) 已有 rules 表安全加字段（重复执行无副作用；新建库由建表语句覆盖）
alter table if exists public.rules
  add column if not exists visible_to_participant boolean default false;

-- 10) surveys：前测 / 后测问卷（答案以 jsonb 数组存储，题量不写死）
--     每会话 pre / post 各一份，靠 unique(session_id, phase) 保证不重复。
--     answers 为与题目顺序一致的 1–5 整数数组（题目来自 survey_config）。
create table if not exists public.surveys (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  arm            text not null,
  phase          text not null check (phase in ('pre','post')),
  answers        jsonb not null default '[]'::jsonb,
  created_at     timestamptz default now(),
  unique (session_id, phase)
);
create index if not exists idx_surveys_session on public.surveys(session_id, phase);

-- 10.1) sessions 增加 turns（对话轮次 = user 消息数），幂等
alter table if exists public.sessions
  add column if not exists turns int default 0;

-- 10.2) sessions 增加反思深度自动打分字段（D2，幂等）
--      reflection_score：0–3 反思层级（DeepSeek 批处理写入）
--      reflection_reason：打分依据（抽样人工校验用）
--      reflection_scored_at：打分时间
alter table if exists public.sessions
  add column if not exists reflection_score int,
  add column if not exists reflection_reason text,
  add column if not exists reflection_scored_at timestamptz;

-- 11) survey_config：问卷题目配置（单行，研究者后台导入，不写死在代码）
create table if not exists public.survey_config (
  id          int primary key default 1,        -- 单行配置
  questions   jsonb not null default '[]'::jsonb, -- 题目字符串数组
  updated_at  timestamptz default now()
);
insert into public.survey_config (id, questions)
values (1, '[]'::jsonb)
on conflict (id) do nothing;
