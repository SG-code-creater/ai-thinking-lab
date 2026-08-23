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

  if (status === "loading")
    return <Centered text="加载中…" />;
  if (status === "bad" || !info)
    return <Centered text="会话无效，请返回首页重新进入。" />;

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">思考会话</div>
          <div className="text-xs text-zinc-500">
            把你的真实处境写下来，尽量具体。
          </div>
        </div>
        <button
          onClick={exit}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          结束并退出
        </button>
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
          <ChatView
            sessionId={sessionId}
            participantId={participantId}
          />
        ) : (
          <DocCollector sessionId={sessionId} participantId={participantId} />
        )}
      </main>
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
