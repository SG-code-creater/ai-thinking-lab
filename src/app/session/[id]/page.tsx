"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ChatView from "@/components/ChatView";
import DocCollector from "@/components/DocCollector";

type Info = {
  arm: string;
  armName: string;
  description: string;
  isAiChat: boolean;
  scopeGuarded: boolean;
} | null;

type SurveyStatus = {
  pre: boolean;
  post: boolean;
  ended: boolean;
  endedAt: string | null;
};

// 前测 / 后测共用题目（反思思维自评，1–5 分）
const QUESTIONS = [
  "遇到人际矛盾时，我会先想清楚自己真正想要什么结果。",
  "我会主动换位思考对方的处境和动机。",
  "我能想出不止一种可行的解决办法，并估计可能的后果。",
];

export default function SessionPage() {
  const params = useParams();
  const sessionId = String(params.id);
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "bad">("loading");
  const [info, setInfo] = useState<Info>(null);
  const [participantId, setParticipantId] = useState("");
  // 对参与者可见的测试背景规则（开场说明卡）
  const [backgroundRules, setBackgroundRules] = useState<any[]>([]);
  const [showRules, setShowRules] = useState(true);
  // 问卷 / 结束状态
  const [survey, setSurvey] = useState<SurveyStatus | null>(null);
  const [stage, setStage] = useState<"pre" | "main" | "post" | "done">("pre");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("exp_participant");
    if (!raw) {
      router.replace("/");
      return;
    }
    let p: any;
    try {
      p = JSON.parse(raw);
    } catch {
      router.replace("/");
      return;
    }
    if (p.sessionId !== sessionId) {
      router.replace("/");
      return;
    }
    setParticipantId(p.participantId);
    fetch(
      `/api/session-info?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(p.participantId)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) setStatus("bad");
        else {
          setInfo(d);
          setSurvey(d.survey);
          // 计算初始阶段：已结束 → done；未做前测 → pre；否则 main
          const sv: SurveyStatus = d.survey;
          if (sv?.ended) setStage("done");
          else if (!sv?.pre) setStage("pre");
          else setStage("main");
          setStatus("ready");
          // 并行加载对参与者可见的测试背景规则
          fetch("/api/rules")
            .then((r) => r.json())
            .then((rd) => {
              if (rd.ok) setBackgroundRules(rd.rules);
            })
            .catch(() => {});
        }
      })
      .catch(() => setStatus("bad"));
  }, [sessionId, router]);

  function exit() {
    localStorage.removeItem("exp_participant");
    router.replace("/");
  }

  async function submitSurvey(phase: "pre" | "post", ans: number[]) {
    setBusy(true);
    try {
      const r = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          participantId,
          phase,
          q1: ans[0],
          q2: ans[1],
          q3: ans[2],
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "保存失败");
      if (phase === "pre") {
        setSurvey((s) => ({ ...(s as SurveyStatus), pre: true }));
        setStage("main");
      } else {
        // 后测保存成功后结束会话
        await fetch("/api/session/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, participantId }),
        });
        setSurvey((s) => ({
          ...(s as SurveyStatus),
          post: true,
          ended: true,
        }));
        setStage("done");
      }
    } catch (e: any) {
      alert("提交失败：" + (e?.message || "请重试"));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading")
    return <Centered text="加载中…" />;
  if (status === "bad" || !info)
    return <Centered text="会话无效，请返回首页重新进入。" />;

  // 前测 / 后测表单
  if (stage === "pre" || stage === "post") {
    return (
      <SurveyScreen
        phase={stage}
        busy={busy}
        onSubmit={submitSurvey}
      />
    );
  }

  // 完成页
  if (stage === "done") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center">
        <div className="text-lg font-semibold text-zinc-900">实验已完成</div>
        <p className="mt-2 max-w-md text-sm text-zinc-500">
          感谢你的参与！你的回答已记录，你可以关闭本页面。
        </p>
        <button
          onClick={exit}
          className="mt-6 rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          返回首页
        </button>
      </div>
    );
  }

  // 主界面
  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">思考会话</div>
          <div className="text-xs text-zinc-500">
            把你的真实处境写下来，尽量具体。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStage("post")}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            完成实验
          </button>
          <button
            onClick={exit}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            退出
          </button>
        </div>
      </header>
      {status === "ready" && backgroundRules.length > 0 && showRules && (
        <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-medium text-indigo-700">
                实验说明
              </div>
              <ul className="space-y-1">
                {backgroundRules.map((r: any) => (
                  <li
                    key={r.id}
                    className="whitespace-pre-wrap text-xs leading-relaxed text-indigo-900"
                  >
                    {r.content}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setShowRules(false)}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-indigo-500 hover:bg-indigo-100"
            >
              收起
            </button>
          </div>
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        {info.isAiChat ? (
          <ChatView sessionId={sessionId} participantId={participantId} />
        ) : (
          <DocCollector sessionId={sessionId} participantId={participantId} />
        )}
      </main>
    </div>
  );
}

function SurveyScreen({
  phase,
  busy,
  onSubmit,
}: {
  phase: "pre" | "post";
  busy: boolean;
  onSubmit: (phase: "pre" | "post", ans: number[]) => void;
}) {
  const [ans, setAns] = useState<number[]>([0, 0, 0]);

  const allAnswered = ans.every((n) => n >= 1 && n <= 5);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-zinc-900">
          {phase === "pre" ? "实验前小问卷" : "实验后小问卷"}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          请就以下陈述，按你的真实情况打分（1 = 完全不符合，5 = 完全符合）。
          {phase === "post" && " 同样的题目，再填一次即可。"}
        </p>
        <div className="mt-5 space-y-5">
          {QUESTIONS.map((q, i) => (
            <div key={i}>
              <div className="text-sm text-zinc-800">{q}</div>
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      const next = [...ans];
                      next[i] = n;
                      setAns(next);
                    }}
                    className={`h-9 w-9 rounded-lg border text-sm font-medium ${
                      ans[i] === n
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          disabled={!allAnswered || busy}
          onClick={() => onSubmit(phase, ans)}
          className="mt-6 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "提交中…" : phase === "pre" ? "开始实验" : "提交并结束"}
        </button>
      </div>
    </div>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-zinc-500">
      {text}
    </div>
  );
}
