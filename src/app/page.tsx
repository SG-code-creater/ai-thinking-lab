"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A4 知情同意：输码成功后暂存待确认信息，展示同意页，同意才进入会话
  const [pending, setPending] = useState<{
    participantId: string;
    sessionId: string;
    arm: string;
  } | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const c = code.trim();
    if (!c) {
      setErr("请输入研究者提供的分组码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error || "提交失败");
        return;
      }
      // 暂不进入，先走知情同意
      setPending({
        participantId: data.participantId,
        sessionId: data.sessionId,
        arm: data.arm,
      });
    } catch {
      setErr("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function agree() {
    if (!pending) return;
    setConsentBusy(true);
    try {
      // 记录知情同意（落库），再写入本地会话标识并进入
      const r = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: pending.sessionId,
          participantId: pending.participantId,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "知情同意记录失败");
      localStorage.setItem(
        "exp_participant",
        JSON.stringify({
          participantId: pending.participantId,
          sessionId: pending.sessionId,
          arm: pending.arm,
        }),
      );
      router.push(`/session/${pending.sessionId}`);
    } catch (e: any) {
      alert("无法进入：" + (e?.message || "请重试"));
    } finally {
      setConsentBusy(false);
    }
  }

  if (pending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">参与前告知</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            这是一项关于「AI 如何影響大学生思考与解决问题」的研究。你将被邀请围绕真实遇到的宿舍矛盾、人际与情绪议题进行思考。
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-600">
            <li>• <span className="font-medium text-zinc-800">数据用途</span>：仅用于本研究的数据分析与论文撰写。</li>
            <li>• <span className="font-medium text-zinc-800">匿名化</span>：你的身份以随机编号代替，不会关联到你的真实姓名。</li>
            <li>• <span className="font-medium text-zinc-800">可随时退出</span>：你可随时停止参与；研究结束后也可要求删除你提交的全部数据。</li>
            <li>• <span className="font-medium text-zinc-800">自愿参与</span>：是否参与不会影响你的任何课程或成绩。</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-zinc-400">
            点击下方按钮即表示你已了解上述内容，并同意参与本研究。
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={agree}
              disabled={consentBusy}
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {consentBusy ? "进入中…" : "我已知情，开始参与"}
            </button>
            <button
              onClick={() => setPending(null)}
              disabled={consentBusy}
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50"
            >
              返回
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900">
            大学生思考力研究
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            AI 引导式问题解决实验平台
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            本实验邀请你围绕真实遇到的宿舍矛盾、人际与情绪议题进行思考。请输入研究者发给你的分组码，进入对应的参与环节。
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例如 SOC-AB12CD"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              autoFocus
            />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "校验中…" : "进入实验"}
            </button>
          </form>
        </div>
        <div className="mt-4 text-center">
          <a href="/admin" className="text-xs text-zinc-400 hover:text-zinc-600">
            研究者入口
          </a>
        </div>
      </div>
    </main>
  );
}
