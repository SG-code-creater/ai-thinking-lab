"use client";

import { useEffect, useState } from "react";
import { useUser, SignIn } from "@clerk/nextjs";
import type { ArmStat } from "@/lib/db";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ARM_OPTIONS = [
  { code: "none", name: "全部关闭（未开放）" },
  { code: "socratic", name: "臂1 · 元认知引导" },
  { code: "free", name: "臂2 · 自由问答" },
  { code: "solo", name: "臂3 · 自主思考（无 AI）" },
];

export default function AdminPage() {
  if (!PUBLISHABLE_KEY) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          研究者后台需要配置 Clerk。请在 <code>.env.local</code> 中填入{" "}
          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> 与{" "}
          <code>CLERK_SECRET_KEY</code>，并设置 <code>ADMIN_EMAILS</code>。
        </div>
      </div>
    );
  }
  return <AdminInner />;
}

function AdminInner() {
  const { isSignedIn, user, isLoaded } = useUser();
  const [activeArm, setActiveArm] = useState<string>("none");
  const [armGen, setArmGen] = useState<string>("socratic");
  // armGenSynced = true 后下拉框才真正被允许编辑，避免「Loaded 之前看到默认 socratic」的误操作
  const [armGenSynced, setArmGenSynced] = useState(false);
  const [count, setCount] = useState(10);
  const [codes, setCodes] = useState<any[]>([]);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 实验规则（测试背景 / 限制条件）
  const [rules, setRules] = useState<any[]>([]);
  const [ruleKind, setRuleKind] = useState<"background" | "constraint">(
    "background",
  );
  const [ruleArm, setRuleArm] = useState<string>("all");
  const [ruleText, setRuleText] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

  // 问卷题目配置（不写死，研究者导入）
  const [surveyQuestions, setSurveyQuestions] = useState<string[]>([]);
  const [surveyText, setSurveyText] = useState("");
  const [surveyBusy, setSurveyBusy] = useState(false);

  // D2 反思深度批处理打分
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreResult, setScoreResult] = useState<{
    processed: number;
    scored: number;
    errors: number;
    details: {
      sessionId: string;
      arm: string;
      score?: number;
      reason?: string;
      error?: string;
    }[];
  } | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // 导出选项：格式（csv/xlsx）+ 按臂
  const [expFmt, setExpFmt] = useState<string>("csv");
  const [expArm, setExpArm] = useState<string>("all");

  // 进度看板（按臂聚合）
  const [armStats, setArmStats] = useState<ArmStat[]>([]);

  async function loadMeta() {
    const r = await fetch("/api/admin/arm");
    const d = await r.json();
    if (d.ok) setActiveArm(d.activeArm);
  }
  async function loadCodes() {
    const r = await fetch("/api/admin/codes");
    const d = await r.json();
    if (d.ok) setCodes(d.codes);
  }
  async function loadRules() {
    const r = await fetch("/api/admin/rules");
    const d = await r.json();
    if (d.ok) setRules(d.rules);
  }
  async function loadStats() {
    try {
      const r = await fetch("/api/admin/stats");
      const d = await r.json();
      if (d.ok) setArmStats(d.stats);
    } catch {
      /* 忽略 */
    }
  }
  async function loadSurveyQuestions() {
    const r = await fetch("/api/admin/survey-questions");
    const d = await r.json();
    if (d.ok) {
      setSurveyQuestions(d.questions || []);
      setSurveyText((d.questions || []).join("\n"));
    }
  }

  useEffect(() => {
    if (isSignedIn) {
      loadMeta();
      loadCodes();
      loadRules();
      loadSurveyQuestions();
      loadStats();
    }
  }, [isSignedIn]);

  // 切臂后，把下拉框的 armGen 跟着切到当前激活臂
  // （设计：分组码归属 = 当前激活臂，强行锁定）
  useEffect(() => {
    if (activeArm && activeArm !== "none") {
      setArmGen(activeArm);
    }
    setArmGenSynced(true);
  }, [activeArm]);

  async function switchArm(arm: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/arm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeArm: arm }),
    });
    const d = await r.json();
    if (d.ok) {
      setActiveArm(d.activeArm);
      setMsg("已切换激活臂");
    } else setMsg("切换失败：" + (d.error || ""));
    setBusy(false);
  }

  async function genCodes() {
    if (activeArm === "none") {
      setMsg("请先在「实验臂开关」中打开一个实验臂，再生成分组码");
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arm: armGen, count, label: "" }),
    });
    const d = await r.json();
    if (d.ok) {
      setNewCodes(d.codes);
      loadCodes();
      setMsg(`已生成 ${d.codes.length} 个分组码`);
    } else setMsg("生成失败：" + (d.error || ""));
    setBusy(false);
  }

  async function cleanUnusedCodes() {
    const yes = window.confirm(
      "确认删除所有「已用 0 次」的分组码？\n进行中（已用 > 0）的码不会被删除。",
    );
    if (!yes) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/codes?unused=1", { method: "DELETE" });
      const d = await r.json();
      if (d.ok) {
        setMsg(`已清理 ${d.deleted} 个未使用的分组码`);
        loadCodes();
      } else setMsg("清理失败：" + (d.error || ""));
    } catch (e: any) {
      setMsg("清理失败：" + (e?.message || "网络错误"));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/sign-out", { method: "POST" });
    window.location.href = "/";
  }

  async function scoreReflection() {
    const yes = window.confirm(
      "将对本批尚未打分的会话调用 DeepSeek 做反思深度评级（0–3）。\n按默认每批 20 条，可多次点击继续。确认开始？",
    );
    if (!yes) return;
    setScoreBusy(true);
    setMsg(null);
    setScoreResult(null);
    setScoreError(null);
    try {
      const r = await fetch("/api/admin/score-reflection", {
        method: "POST",
      });
      const d = await r.json();
      if (d.ok) {
        setScoreResult(d);
        if (d.processed === 0) {
          setMsg(
            "没有需要打分的会话：可能已全部打完，或这些会话还没有对话内容（solo 纯上传也会被跳过）。",
          );
        } else {
          setMsg(
            `反思打分完成：本批处理 ${d.processed} 条，成功 ${d.scored}，失败 ${d.errors}。未打完的会话可再次点击继续。`,
          );
        }
      } else {
        setScoreError("打分失败：" + (d.error || ""));
        setMsg("打分失败：" + (d.error || ""));
      }
    } catch (e: any) {
      setScoreError("打分失败：" + (e?.message || "网络错误"));
      setMsg("打分失败：" + (e?.message || "网络错误"));
    } finally {
      setScoreBusy(false);
    }
  }

  // 解析题目文本：按行拆分，去空行、去首尾空格
  function parseQuestions(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  // 从文件导入题目（支持 .txt/.md/.csv 等纯文本；Word 请先复制文本）
  function onSurveyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setSurveyText(text);
    };
    reader.readAsText(file);
  }

  async function saveSurveyQuestions() {
    const qs = parseQuestions(surveyText);
    if (qs.length === 0) {
      setMsg("题目不能为空（每行一题）");
      return;
    }
    setSurveyBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/survey-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: qs }),
      });
      const d = await r.json();
      if (d.ok) {
        setSurveyQuestions(qs);
        setMsg(`已保存 ${qs.length} 道题目，参与者进入实验时将作答`);
      } else setMsg("保存失败：" + (d.error || ""));
    } catch (e: any) {
      setMsg("保存失败：" + (e?.message || "网络错误"));
    } finally {
      setSurveyBusy(false);
    }
  }

  async function addRule() {
    const text = ruleText.trim();
    if (!text) {
      setMsg("规则内容不能为空");
      return;
    }
    setRuleBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: ruleKind, content: text, arm: ruleArm }),
      });
      const d = await r.json();
      if (d.ok) {
        setRuleText("");
        await loadRules();
        setMsg("已添加规则");
      } else setMsg("添加失败：" + (d.error || ""));
    } catch (e: any) {
      setMsg("添加失败：" + (e?.message || "网络错误"));
    } finally {
      setRuleBusy(false);
    }
  }

  async function deleteRuleItem(id: string) {
    if (!window.confirm("确认删除这条规则？")) return;
    setRuleBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/rules?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (d.ok) {
        await loadRules();
        setMsg("已删除规则");
      } else setMsg("删除失败：" + (d.error || ""));
    } catch (e: any) {
      setMsg("删除失败：" + (e?.message || "网络错误"));
    } finally {
      setRuleBusy(false);
    }
  }

  if (!isLoaded)
    return (
      <div className="p-10 text-sm text-zinc-500">加载中…</div>
    );
  if (!isSignedIn)
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-zinc-900">
            研究者登录
          </h1>
          <SignIn routing="hash" fallbackRedirectUrl="/admin" />
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <h1 className="text-sm font-semibold text-zinc-900">研究后台</h1>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{user?.primaryEmailAddress?.emailAddress}</span>
          <button
            onClick={signOut}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
          >
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {msg && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            {msg}
          </div>
        )}

        {/* 实验臂开关 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">
            实验臂开关（同一时间仅开放一组）
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            当前激活：
            <span className="font-medium text-indigo-600">
              {ARM_OPTIONS.find((a) => a.code === activeArm)?.name ?? activeArm}
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ARM_OPTIONS.map((a) => (
              <button
                key={a.code}
                onClick={() => switchArm(a.code)}
                disabled={busy}
                className={[
                  "rounded-lg px-3 py-2 text-sm transition disabled:opacity-50",
                  activeArm === a.code
                    ? "bg-indigo-600 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                ].join(" ")}
              >
                {a.name}
              </button>
            ))}
          </div>
        </section>

        {/* 分组码生成 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">生成分组码</h2>
          <p className="mt-1 text-xs text-zinc-500">
            生成的码将自动绑定到当前激活臂：
            <span className="font-medium text-indigo-600">
              {ARM_OPTIONS.find((a) => a.code === activeArm)?.name ?? "—"}
            </span>
            。切臂后，码归属臂会一起切换。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-zinc-500">
              实验臂（自动跟随激活臂）
              <select
                value={armGen}
                disabled
                className="mt-1 block w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-500"
              >
                <option value="socratic">臂1 · 元认知引导</option>
                <option value="free">臂2 · 自由问答</option>
                <option value="solo">臂3 · 自主思考</option>
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              数量
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1 block w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              />
            </label>
            <button
              onClick={genCodes}
              disabled={busy || activeArm === "none"}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              生成
            </button>
          </div>
          {newCodes.length > 0 && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-3">
              <div className="mb-1 text-xs text-zinc-500">本次生成：</div>
              <div className="flex flex-wrap gap-2">
                {newCodes.map((c) => (
                  <span
                    key={c}
                    className="rounded-md bg-white px-2 py-1 font-mono text-xs text-zinc-700 ring-1 ring-zinc-200"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 分组码列表 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              分组码列表（{codes.length}）
            </h2>
            <button
              onClick={cleanUnusedCodes}
              disabled={busy || codes.every((c) => (c.used_count || 0) > 0)}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="仅删除 已用 0 次 的分组码；进行中（已用 > 0）的码保留"
            >
              清除未使用的码
            </button>
          </div>
          <div className="scroll-thin mt-3 max-h-64 space-y-1 overflow-y-auto">
            {codes.length === 0 && (
              <p className="text-xs text-zinc-400">暂无分组码</p>
            )}
            {codes.map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"
              >
                <span className="font-mono text-zinc-700">{c.code}</span>
                <span className="text-zinc-500">
                  {ARM_OPTIONS.find((a) => a.code === c.arm)?.name ?? c.arm}
                </span>
                <span className="text-zinc-400">已用 {c.used_count || 0}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 实验规则（测试背景 / 限制条件） */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">
            实验规则（测试背景 / 限制条件）
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            添加本轮实验的背景说明与限制条件，下方实时显示当前已配置的全部规则。
          </p>
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            说明：「测试背景」作为开场说明卡展示给参与者；「限制条件」注入 AI 系统提示词、约束智能体行为，参与者不可见。两者都可选择「适用臂」——默认全局生效；指定臂后，背景仅对该臂参与者显示、约束仅注入该臂 AI（避免误伤其他臂或向 solo 臂泄露分组信息）。
          </p>

          {/* 添加表单 */}
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRuleKind("background")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  ruleKind === "background"
                    ? "bg-indigo-600 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                ].join(" ")}
              >
                测试背景
              </button>
              <button
                type="button"
                onClick={() => setRuleKind("constraint")}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition",
                  ruleKind === "constraint"
                    ? "bg-indigo-600 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                ].join(" ")}
              >
                限制条件
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">适用臂</span>
              <select
                value={ruleArm}
                onChange={(e) => setRuleArm(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700"
              >
                <option value="all">全部臂（全局）</option>
                <option value="socratic">臂1 · 元认知引导</option>
                <option value="free">臂2 · 自由问答</option>
                <option value="solo">臂3 · 自主思考</option>
              </select>
            </div>
            <textarea
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
              rows={3}
              placeholder={
                ruleKind === "background"
                  ? "例如：本实验围绕大学生宿舍矛盾场景，请尽量结合真实经历填写。"
                  : "例如：不得讨论任何暴力、自伤或违法内容。"
              }
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <button
              onClick={addRule}
              disabled={ruleBusy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              添加规则
            </button>
          </div>

          {/* 现有规则列表 */}
          <div className="mt-5 space-y-4">
            {(["background", "constraint"] as const).map((k) => {
              const items = rules.filter((r: any) => r.kind === k);
              return (
                <div key={k}>
                  <div className="text-xs font-medium text-zinc-500">
                    {k === "background" ? "测试背景" : "限制条件"}（{items.length}）
                  </div>
                  {items.length === 0 ? (
                    <p className="mt-1 text-xs text-zinc-400">暂无</p>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {items.map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="mb-1 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                              {r.arm
                                ? ARM_OPTIONS.find((a) => a.code === r.arm)
                                    ?.name ?? r.arm
                                : "全局"}
                            </span>
                            <span className="block whitespace-pre-wrap text-xs text-zinc-700">
                              {r.content}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteRuleItem(r.id)}
                            className="shrink-0 text-xs text-rose-500 hover:text-rose-700"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 问卷题目配置（前测/后测共用，不写死） */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">问卷题目配置</h2>
          <p className="mt-1 text-xs text-zinc-500">
            前测 / 后测使用同一套题目（当前已配置 {surveyQuestions.length} 题）。题目不写死在代码里，
            在这里粘贴或导入即可；未配置时参与者端会自动跳过问卷。每行一题。
          </p>
          <textarea
            value={surveyText}
            onChange={(e) => setSurveyText(e.target.value)}
            rows={6}
            placeholder={"每行一题，例如：\n遇到人际矛盾时，我会先想清楚自己真正想要什么结果。\n我会主动换位思考对方的处境和动机。\n我能想出不止一种可行的解决办法，并估计可能的后果。"}
            className="mt-3 w-full rounded-lg border border-zinc-200 p-3 text-sm text-zinc-800 focus:border-indigo-400 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={saveSurveyQuestions}
              disabled={surveyBusy}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {surveyBusy ? "保存中…" : "保存题目"}
            </button>
            <label className="cursor-pointer rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              导入文档
              <input
                type="file"
                accept=".txt,.md,.csv,text/plain"
                onChange={onSurveyFile}
                className="hidden"
              />
            </label>
            <span className="text-xs text-zinc-400">
              支持 .txt/.md/.csv 纯文本（Word 请先复制文本粘贴）
            </span>
          </div>
        </section>

        {/* 数据导出 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">数据导出</h2>
          <p className="mt-1 text-xs text-zinc-500">
            导出后用于三组文本对比分析（AI 是限制还是增强思考）。可按臂拆分导出，便于组间对比。
          </p>

          {/* 导出选项：格式 + 臂 */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span>格式</span>
              <select
                value={expFmt}
                onChange={(e) => setExpFmt(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (xlsx)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span>按臂</span>
              <select
                value={expArm}
                onChange={(e) => setExpArm(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              >
                <option value="all">全部</option>
                <option value="socratic">臂1 元认知</option>
                <option value="free">臂2 自由问答</option>
                <option value="solo">臂3 无AI</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/api/admin/export?type=messages&format=${expFmt}${expArm !== "all" ? `&arm=${expArm}` : ""}`}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出对话
            </a>
            <a
              href={`/api/admin/export?type=uploads&format=${expFmt}${expArm !== "all" ? `&arm=${expArm}` : ""}`}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出文档收集
            </a>
            <a
              href={`/api/admin/export?type=peer&format=${expFmt}${expArm !== "all" ? `&arm=${expArm}` : ""}`}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出同伴互评
            </a>
            <a
              href={`/api/admin/export?type=wide&format=${expFmt}${expArm !== "all" ? `&arm=${expArm}` : ""}`}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              导出统一宽表
            </a>
            <button
              onClick={scoreReflection}
              disabled={scoreBusy}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {scoreBusy ? "打分中…" : "批量反思打分（D2）"}
            </button>
          </div>
          {scoreError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {scoreError}
            </div>
          )}
          {scoreResult && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium text-zinc-700">
                本批结果：处理 {scoreResult.processed} 条，成功{" "}
                {scoreResult.scored} 条，失败 {scoreResult.errors} 条
              </div>
              <ul className="max-h-64 space-y-1 overflow-auto text-xs">
                {scoreResult.details.map((d, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-2 rounded bg-white px-2 py-1"
                  >
                    <span className="shrink-0 font-mono text-zinc-400">
                      {String(d.sessionId).slice(0, 8)}
                    </span>
                    <span className="shrink-0 text-zinc-500">
                      {d.arm === "socratic"
                        ? "臂1"
                        : d.arm === "free"
                          ? "臂2"
                          : d.arm === "solo"
                            ? "臂3"
                            : d.arm}
                    </span>
                    {typeof d.score === "number" ? (
                      <span className="shrink-0 font-semibold text-emerald-700">
                        分 {d.score}
                      </span>
                    ) : (
                      <span className="shrink-0 font-semibold text-rose-600">
                        失败
                      </span>
                    )}
                    <span className="text-zinc-600">
                      {d.reason || d.error || ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-400">
            评分标准（DeepSeek 依据对话内容判定，理由写入 reflection_reason 供抽样校验）：0
            陈述 / 1 浅反思 / 2 深反思 / 3 批判反思。
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            文件名含臂标识（如 <code>messages_socratic.xlsx</code>）；不选「按臂」则导出全部。
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            宽表为每会话一行，含前/后测（按配置题数动态展开）、时长、轮次、完成度、上传数、反思分（reflection_score）与对话全文（messages_text），可直接喂统计软件做 ANOVA / 前后测差值分析。
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            反思分需先点「批量反思打分」由 DeepSeek 评级（0–3）。组间文本特征对比（提问密度/第一人称/行动词/情绪词）可用仓库 <code>scripts/text_features.py</code> 对 messages.csv 跑，无需新功能。
          </p>
        </section>

        {/* 进度看板 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">进度看板（按臂）</h2>
            <button
              onClick={loadStats}
              className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
            >
              刷新
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            实时掌握各实验臂的数据收集进度，便于判断何时达到可分析样本量。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {armStats.length === 0 && (
              <p className="text-xs text-zinc-400">暂无数据，开始收集后会自动显示。</p>
            )}
            {armStats.map((s) => {
              const pct = Math.round(s.completionRate * 100);
              return (
                <div
                  key={s.arm}
                  className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-800">
                      {s.label}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {s.completed}/{s.total}
                    </span>
                  </div>
                  {/* 完成率进度条 */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    完成率 {pct}%
                  </div>
                  <dl className="mt-3 space-y-1 text-xs text-zinc-600">
                    <div className="flex justify-between">
                      <dt>平均轮次</dt>
                      <dd>{s.avgTurns == null ? "—" : s.avgTurns}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>平均时长</dt>
                      <dd>{s.avgDurationMin == null ? "—" : `${s.avgDurationMin} 分`}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>平均反思分</dt>
                      <dd>{s.avgReflection == null ? "—" : s.avgReflection}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            平均反思分仅统计已点「批量反思打分」的已完成会话；轮次=用户消息数，时长=结束−开始。
          </p>
        </section>
      </main>
    </div>
  );
}
