# 大学生思考力实验平台 · AI Thinking Lab

> 一个面向大学生"思考力 / 深度学习"研究的**三臂对照实验平台**：用同一套部署，按分组码把参与者随机分配到不同 AI 辅助模式，收集对话与文档数据，供研究者做对照分析。

English: A single-deployment, three-arm controlled experiment platform for studying how different AI-assistance modes affect college students' thinking & deep-learning. Participants are routed by a group code into one of three arms; all interaction data is collected for researcher-side analysis.

---

## 为什么做这个

研究问题：AI 辅助学习到底**增强**还是**削弱**学生的独立思考？平台用对照实验回答它——同一份课件/笔记输入，三种不同的"AI 姿态"：

| 臂 (Arm) | 代码前缀 | 行为 | 研究假设 |
| --- | --- | --- | --- |
| **苏格拉底引导** | `SOL` | AI 不直接给答案，只提问、追问、引导你自己推导 | 促进深度思考 |
| **自由问答** | `FRE` | AI 自由作答、解释、补充 | 高效但可能依赖 |
| **无 AI 自主思考** | `NONE` | 不调用 AI，仅做文档收集与自我回顾 | 对照组 |

后台可一键切换"当前激活臂"（`settings.active_arm`），发下去的分组码就指向哪条臂——**同一份部署、同一套代码，无需为每个臂单独上线**。

---

## 技术栈

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (PostCSS 模式)
- **DeepSeek API** — 流式对话 (`deepseek-chat`) + 范围守卫 (超题拦截)
- **Supabase** — Postgres 数据层 (service_role 单例) + Storage (bucket `documents`)
- **Clerk** — 仅 admin 后台鉴权；未配置密钥时自动降级（后台显示配置提示，不影响参与者流程）

---

## 核心设计

- **三臂单部署**：分组码路由 + 后台臂开关。参与者免登录（localStorage 存 `participantId` / `sessionId`），仅 admin 走 Clerk。
- **范围守卫 (scope guard)**：每次发言先用 DeepSeek 非流式判定是否在研究议题内，超题则返回拦截提示（黄色高亮），保证数据干净。
- **流式对话**：`/api/chat` 用 SSE (`event: token / blocked / meta / done / error`) 逐 token 推送。
- **数据隔离**：Supabase 不用 RLS，靠应用层 `participantId` / `sessionId` 隔离；service_role 仅服务端可用。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制模板并填入真实值：

```bash
cp .env.local.example .env.local
```

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek 对话与范围守卫 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 数据与 Storage（**仅服务端**，勿加 `NEXT_PUBLIC_`） |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `CLERK_WEBHOOK_SECRET` | 仅 admin 后台；留空则降级 |
| `ADMIN_EMAILS` | 逗号分隔的管理员邮箱（Clerk 用户匹配） |

### 3. 初始化数据库

在 Supabase SQL Editor 执行 `supabase/experiment.sql`（建表 + `documents` bucket + 初始 `active_arm = 'none'`）。

### 4. 本地运行

```bash
npm run dev
```

- 首页：输入分组码 → 建会话 → 进入 `/session/[id]`
- 后台：`/admin`（需 Clerk 配置；可切换臂 / 批量生成分组码 / 导出 CSV）

---

## 部署（EdgeOne Pages）

仓库**零配置**即可连 Git 自动部署；在 EdgeOne 控制台填入上面所有环境变量即可。Clerk 需额外配置 webhook 指向 `/api/clerk-webhook`。

---

## 目录结构

```
src/
  app/
    page.tsx                 落地页（分组码入口）
    session/[id]/page.tsx    参与者会话页（按臂渲染 ChatView / DocCollector）
    admin/page.tsx           后台（臂开关 / 分组码 / 导出）
    api/
      code/                  校验分组码 → 建参与者/会话
      session-info/          会话归属校验 → 返回臂配置
      messages/              历史消息
      chat/                  SSE 流式对话 + 范围守卫
      upload/                文档上传（Storage / 文本 JSON）
      admin/arm|codes|export 后台接口
      clerk-webhook|sign-out Clerk 集成
  components/
    ChatView.tsx             SSE 流式聊天
    DocCollector.tsx         文档收集（上传 + 文本 + 列表）
  lib/
    arms.ts                  三臂定义与配置
    db.ts                    Supabase 数据访问层
    deepseek.ts              流式 / 非流式对话
    scope-guard.ts           超题拦截
    supabase.ts / auth.ts    客户端单例 / Clerk 鉴权
supabase/experiment.sql     数据库 schema
```

---

## 数据导出

后台 `/admin` 提供 CSV 导出：消息表（含 arm / participant 维度）与上传表，便于做对照分析。

---

## License

Private / 研究用途。
