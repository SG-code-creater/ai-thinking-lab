"use client";

import { useEffect, useRef, useState } from "react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
  streaming?: boolean;
};

/**
 * 防御性 Markdown 剥离护栏：
 * 即便我们在 system prompt 里反复要求不要用 Markdown，模型偶尔还是会冒出来一些 ** 加粗、
 * `#` 标题、列表之类的东西。这里把它们还原成纯文本，避免渲染出"机器味"，也避免泄露结构性步骤。
 */
function stripMarkdown(s: string): string {
  return s
    // 代码块 ```...``` 整体删除
    .replace(/```[\s\S]*?```/g, "")
    // 行内代码 `xx` → xx
    .replace(/`([^`]+)`/g, "$1")
    // 加粗 **xx** 或 __xx__ → xx
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    // 标题 # ## ### … 行首 → 删除
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    // 列表 1. 2. - * + 行首 → 删除
    .replace(/^[ \t]*(\d+[\.\)]|[-*+])[ \t]+/gm, "")
    // 引用 > 行首 → 删除
    .replace(/^[ \t]*>[ \t]?/gm, "")
    // 分割线 --- 或 *** 单占一行 → 删除
    .replace(/^[ \t]*([-*_][ \t]*){3,}[ \t]*$/gm, "")
    // 链接 [text](url) → text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    // 多余空行合并
    .replace(/\n{3,}/g, "\n\n");
}

export default function ChatView({
  sessionId,
  participantId,
}: {
  sessionId: string;
  participantId: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(
      `/api/messages?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(participantId)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.ok)
          setMessages(
            d.messages.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              blocked: m.blocked,
            })),
          );
      })
      .catch(() => {});
  }, [sessionId, participantId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true },
    ]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, participantId, message: text }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "请求失败");
        setMessages((m) => m.slice(0, -1));
        setBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const lines = block.split("\n");
          const ev = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
          const dt = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
          if (!ev || !dt) continue;
          if (ev === "token") {
            const t = JSON.parse(dt) as string;
            setMessages((m) => {
              const c = [...m];
              const last = c[c.length - 1];
              if (last && last.role === "assistant")
                c[c.length - 1] = { ...last, content: last.content + t };
              return c;
            });
          } else if (ev === "blocked") {
            const t = JSON.parse(dt) as string;
            setMessages((m) => {
              const c = [...m];
              const last = c[c.length - 1];
              if (last && last.role === "assistant")
                c[c.length - 1] = {
                  ...last,
                  content: t,
                  blocked: true,
                  streaming: false,
                };
              return c;
            });
          } else if (ev === "error") {
            const t = JSON.parse(dt) as string;
            setError(t);
          }
        }
      }
      setMessages((m) => {
        const c = [...m];
        const last = c[c.length - 1];
        if (last && last.role === "assistant")
          c[c.length - 1] = { ...last, streaming: false };
        return c;
      });
    } catch (e: any) {
      setError(e?.message || "网络错误");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-2xl rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            开始描述你遇到的困扰或思考，我会陪你一起梳理。
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={[
                "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : m.blocked
                    ? "border border-amber-300 bg-amber-50 text-amber-800"
                    : "border border-zinc-200 bg-white text-zinc-800",
              ].join(" ")}
            >
              {m.role === "assistant" ? stripMarkdown(m.content) : m.content}
              {m.streaming && <span className="caret" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-4 pb-1 text-xs text-red-600">{error}</div>
      )}

      <div className="border-t border-zinc-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="输入你的想法…（Enter 发送，Shift+Enter 换行）"
            className="scroll-thin max-h-32 flex-1 resize-none rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "生成中" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
