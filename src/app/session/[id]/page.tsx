"use client";

import { useEffect, useRef, useState } from "react";
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
  const [questions, setQuestions] = useState<string[]>([]); // 题目（后台配置，动态）
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

    // 并行：会话信息 + 问卷题目
    const loadInfo = fetch(
      `/api/session-info?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(p.participantId)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) {
          setStatus("bad");
          return;
        }
        setInfo(d);
        setSurvey(d.survey);
        // 阶段判定延后到题目加载后统一处理
        return d;
      })
      .catch(() => setStatus("bad"));

    const loadQuestions = fetch("/api/survey-questions")
      .then((r) => r.json())
      .then((rd) => {
        if (rd.ok) {
          const qs = rd.questions || [];
          questionsRef.current = qs;
          setQuestions(qs);
        }
      })
      .catch(() => {});

    Promise.all([loadInfo, loadQuestions]).then(([d]) => {
      const info = (d as any) || null;
      const surveyStatus = (info?.survey as SurveyStatus) || null;
      const qs = questionsRef.current || [];
      if (!surveyStatus) return;
      if (surveyStatus.ended) setStage("done");
      else if (qs.length === 0) setStage("main"); // 题目未配置 → 跳过问卷
      else if (!surveyStatus.pre) setStage("pre");
      else setStage("main");
      setStatus("ready");

      // 并行加载对参与者可见的测试背景规则（按当前臂过滤）
      const arm = info?.arm;
      fetch(`/api/rules${arm ? `?arm=${encodeURIComponent(arm)}` : ""}`)
        .then((r) => r.json())
        .then((rd) => {
          if (rd.ok) setBackgroundRules(rd.rules);
        })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, router]);

  // 题目加载后用于阶段判定（避免闭包拿到旧值）
  const questionsRef = useRef<string[]>([]);

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
          answers: ans,
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
        setSurvey((s) => ({ ...(s as SurveyStatus), post: true, ended: true }));
        setStage("done");
      }
    } catch (e: any) {
      alert("提交失败：" + (e?.message || "请重试"));
    } finally {
      setBusy(false);
    }
  }

  // 点击「完成实验」：有题目 → 填后测；无题目 → 直接结束
  async function finishExperiment() {
    if (questions.length > 0) {
      setStage("post");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, participantId }),
      });
      setSurvey((s) => ({ ...(s as SurveyStatus), ended: true }));
      setStage("done");
    } catch (e: any) {
      alert("结束失败：" + (e?.message || "请重试"));
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
        questions={questions}
        busy={busy}
        onSubmit={submitSurvey}
      />
    );
  }

  // 完成页（含盲化校验 + 臂3 同伴互评 + 数据删除）
  if (stage === "done") {
    return (
      <DoneScreen
        sessionId={sessionId}
        participantId={participantId}
        arm={info?.arm ?? ""}
        onExit={exit}
      />
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
            onClick={finishExperiment}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
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
  questions,
  busy,
  onSubmit,
}: {
  phase: "pre" | "post";
  questions: string[];
  busy: boolean;
  onSubmit: (phase: "pre" | "post", ans: number[]) => void;
}) {
  const [ans, setAns] = useState<number[]>(() => questions.map(() => 0));

  // 题目数量变化时重置答案
  useEffect(() => {
    setAns(questions.map(() => 0));
  }, [questions]);

  const allAnswered = ans.length === questions.length && ans.every((n) => n >= 1 && n <= 5);

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
          {questions.map((q, i) => (
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

// 完成页：盲化校验题（A3）→ 感谢 + 臂3 同伴互评 → 数据删除入口（A4）
function DoneScreen({
  sessionId,
  participantId,
  arm,
  onExit,
}: {
  sessionId: string;
  participantId: string;
  arm: string;
  onExit: () => void;
}) {
  const [guessDone, setGuessDone] = useState(false);
  const [guess, setGuess] = useState<string | null>(null);
  const [guessBusy, setGuessBusy] = useState(false);

  async function submitGuess(g: string) {
    setGuessBusy(true);
    try {
      const r = await fetch("/api/guess-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, participantId, guess: g }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "提交失败");
      setGuess(g);
      setGuessDone(true);
    } catch (e: any) {
      alert("提交失败：" + (e?.message || "请重试"));
    } finally {
      setGuessBusy(false);
    }
  }

  if (!guessDone) {
    const options = [
      { k: "A", t: "一个会不断反问、引导我自己思考的 AI" },
      { k: "B", t: "一个直接回答我、给我信息的 AI" },
      { k: "C", t: "没有 AI，完全靠我自己书写" },
      { k: "D", t: "不确定 / 说不清" },
    ];
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-zinc-900">
            最后一步小问题
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            凭你的真实感觉选一项即可（没有标准答案）。
          </p>
          <div className="mt-4 space-y-2">
            {options.map((o) => (
              <button
                key={o.k}
                disabled={guessBusy}
                onClick={() => submitGuess(o.k)}
                className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-left text-sm text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span className="font-semibold text-indigo-600">{o.k}.</span>
                <span>{o.t}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin h-screen overflow-y-auto bg-zinc-50 px-6 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center">
          <div className="text-lg font-semibold text-zinc-900">实验已完成</div>
          <p className="mt-2 text-sm text-zinc-500">
            感谢你的参与！你的回答已记录。
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={onExit}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              返回首页（保留数据）
            </button>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    "确定要删除你提交的全部数据并退出吗？此操作不可恢复。",
                  )
                )
                  return;
                try {
                  const r = await fetch("/api/withdraw", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId, participantId }),
                  });
                  const d = await r.json();
                  if (!d.ok) throw new Error(d.error || "删除失败");
                  onExit();
                } catch (e: any) {
                  alert("删除失败：" + (e?.message || "请重试"));
                }
              }}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              删除我的数据并退出
            </button>
          </div>
        </div>

        {arm === "solo" && <PeerReviewBox sessionId={sessionId} />}
      </div>
    </div>
  );
}

// 臂3 同伴互评：抽取其他 solo 参与者的匿名文本，当前参与者打分 + 评论
function PeerReviewBox({ sessionId }: { sessionId: string }) {
  const [samples, setSamples] = useState<
    { uploadId: string; text: string }[]
  >([]);
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/peer-review?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setSamples(d.samples || []);
          if ((d.alreadyReviewed ?? 0) > 0) setSubmitted(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [sessionId]);

  async function submit() {
    const reviews = samples
      .filter((s) => ratings[s.uploadId] != null)
      .map((s) => ({
        uploadId: s.uploadId,
        rating: ratings[s.uploadId] as number,
        comment: comments[s.uploadId] || "",
      }));
    if (!reviews.length) return;
    setBusy(true);
    try {
      const r = await fetch("/api/peer-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, reviews }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "提交失败");
      setSubmitted(true);
    } catch (e: any) {
      alert("提交失败：" + (e?.message || "请重试"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="text-base font-semibold text-zinc-900">
        看看同伴怎么想（匿名）
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        下面是其他同学（匿名）写下的思考片段，凭你的真实感觉为其「可借鉴程度」打分（1–5，5 最高）。这是可选的，不评也不影响任何结果。
      </p>

      {!loaded && (
        <p className="mt-4 text-sm text-zinc-400">加载中…</p>
      )}

      {loaded && samples.length === 0 && !submitted && (
        <p className="mt-4 text-sm text-zinc-400">
          暂时没有其他同伴的匿名内容，稍后再来看看也可。
        </p>
      )}

      {submitted && (
        <p className="mt-4 text-sm text-emerald-600">
          已提交评价，感谢你的反馈！
        </p>
      )}

      {!submitted &&
        samples.map((s) => (
          <div
            key={s.uploadId}
            className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-3"
          >
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
              {s.text}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">可借鉴程度：</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setRatings((m) => ({ ...m, [s.uploadId]: n }))
                  }
                  className={`h-8 w-8 rounded-lg border text-sm font-medium ${
                    ratings[s.uploadId] === n
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              value={comments[s.uploadId] || ""}
              onChange={(e) =>
                setComments((m) => ({
                  ...m,
                  [s.uploadId]: e.target.value,
                }))
              }
              rows={2}
              placeholder="一句话评论（可选）"
              className="mt-2 w-full resize-none rounded-lg border border-zinc-300 p-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
        ))}

      {!submitted && samples.length > 0 && (
        <button
          disabled={busy}
          onClick={submit}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "提交中…" : "提交评价"}
        </button>
      )}
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
