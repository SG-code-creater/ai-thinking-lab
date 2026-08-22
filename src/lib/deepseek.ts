// DeepSeek 调用封装：支持非流式（范围守卫分类）与流式（SSE 对话输出）。

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function apiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY 未配置");
  return key;
}

interface Opts {
  temperature?: number;
  maxTokens?: number;
}

/** 非流式：返回完整文本（用于范围守卫分类等短任务） */
export async function chatNonStream(
  messages: ChatMsg[],
  opts: Opts = {},
): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2000,
      stream: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeepSeek 错误 ${res.status}: ${t}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** 流式：逐 token 产出（AsyncGenerator） */
export async function* streamChat(
  messages: ChatMsg[],
  opts: Opts = {},
): AsyncGenerator<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2000,
      stream: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeepSeek 错误 ${res.status}: ${t}`);
  }
  if (!res.body) throw new Error("DeepSeek 未返回响应流");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        // 忽略不完整/非 JSON 行
      }
    }
  }
}
