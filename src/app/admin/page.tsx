"use client";

import { useEffect, useState } from "react";
import { useUser, SignIn } from "@clerk/nextjs";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const ARM_OPTIONS = [
  { code: "none", name: "全部关闭（未开放）" },
  { code: "socratic", name: "臂1 · 苏格拉底式引导" },
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
  const [ruleText, setRuleText] = useState("");
  const [ruleBusy, setRuleBusy] = useState(false);

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

  useEffect(() => {
    if (isSignedIn) {
      loadMeta();
      loadCodes();
      loadRules();
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
        body: JSON.stringify({ kind: ruleKind, content: text }),
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
                <option value="socratic">臂1 · 苏格拉底式引导</option>
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
                          <span className="whitespace-pre-wrap text-xs text-zinc-700">
                            {r.content}
                          </span>
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

        {/* 数据导出 */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">数据导出</h2>
          <p className="mt-1 text-xs text-zinc-500">
            导出后用于三组文本对比分析（AI 是限制还是增强思考）。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="/api/admin/export?type=messages"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出对话（messages.csv）
            </a>
            <a
              href="/api/admin/export?type=uploads"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              导出文档收集（uploads.csv）
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
