"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      localStorage.setItem(
        "exp_participant",
        JSON.stringify({
          participantId: data.participantId,
          sessionId: data.sessionId,
          arm: data.arm,
        }),
      );
      router.push(`/session/${data.sessionId}`);
    } catch {
      setErr("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
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
