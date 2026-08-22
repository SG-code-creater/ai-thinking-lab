"use client";

import { useEffect, useRef, useState } from "react";

type Upload = {
  id: string;
  filename: string;
  size_bytes: number | null;
  text_content: string | null;
  created_at: string;
};

export default function DocCollector({
  sessionId,
  participantId,
}: {
  sessionId: string;
  participantId: string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function load() {
    fetch(
      `/api/upload?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(participantId)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUploads(d.uploads);
      })
      .catch(() => {});
  }
  useEffect(load, [sessionId, participantId]);

  async function uploadFile() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/upload?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(participantId)}`,
        { method: "POST", body: form },
      );
      const d = await res.json();
      if (!d.ok) setMsg(d.error || "上传失败");
      else {
        setMsg("已保存：" + d.filename);
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        load();
      }
    } catch {
      setMsg("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/upload?sessionId=${encodeURIComponent(sessionId)}&participantId=${encodeURIComponent(participantId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textContent: t }),
        },
      );
      const d = await res.json();
      if (!d.ok) setMsg(d.error || "保存失败");
      else {
        setMsg("已保存你的记录");
        setText("");
        load();
      }
    } catch {
      setMsg("网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scroll-thin mx-auto h-full max-w-2xl space-y-6 overflow-y-auto px-4 py-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">上传资料</h2>
        <p className="mt-1 text-xs text-zinc-500">
          支持 Word / PDF / TXT，作为你思考的参考材料（可选）。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".doc,.docx,.pdf,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-600"
          />
          <button
            onClick={uploadFile}
            disabled={!file || busy}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            上传
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">写下你的思考</h2>
        <p className="mt-1 text-xs text-zinc-500">
          不借助 AI，自主梳理你的问题、思路与可能的解决方式。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="在这里自由书写…"
          className="scroll-thin mt-3 w-full resize-none rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={saveText}
            disabled={!text.trim() || busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">
          已收集（{uploads.length}）
        </h2>
        <ul className="mt-2 space-y-2">
          {uploads.length === 0 && (
            <li className="text-xs text-zinc-400">暂无记录</li>
          )}
          {uploads.map((u) => (
            <li
              key={u.id}
              className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 p-2 text-xs"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-700">
                  {u.filename}
                </div>
                {u.text_content && (
                  <div className="mt-1 line-clamp-2 text-zinc-500">
                    {u.text_content}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-zinc-400">
                {u.size_bytes
                  ? (u.size_bytes / 1024).toFixed(0) + "KB"
                  : new Date(u.created_at).toLocaleString("zh-CN")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
