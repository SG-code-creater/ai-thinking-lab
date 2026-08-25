import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { getUnscoredSessions, saveReflectionScore } from "@/lib/db";
import { chatNonStream } from "@/lib/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 批处理可能较久，放宽超时

const SYSTEM_PROMPT = `你是一个研究助手，负责对学生与 AI 的对话做「反思深度」评级。
请依据下面的 0–3 量表，仅基于对话内容给出最贴切的层级，并写一句简短依据（中文，不超过 40 字）。

0 陈述：只描述事件或情绪，几乎没有自我审视。
1 浅反思：意识到自己的感受或问题，但未深入分析。
2 深反思：分析成因、换位思考，或考虑了多种办法与后果。
3 批判反思：质疑自身假设/价值观，形成可迁移的元认知。

只输出 JSON，不要任何解释或 Markdown，格式严格为：
{"score": 0到3的整数, "reason": "一句依据"}`;

/** 从模型返回里稳健解析出 { score, reason } */
function parseScore(text: string): { score: number; reason: string } {
  let t = text.trim();
  // 去掉可能的 ```json ... ``` 代码围栏
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  // 取第一个 { 到最后一个 } 之间的内容
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const obj = JSON.parse(t);
  let score = Number(obj.score);
  if (!Number.isInteger(score) || score < 0 || score > 3)
    throw new Error("score 非法");
  return { score, reason: String(obj.reason || "").slice(0, 200) };
}

export async function POST(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") || "20") || 20, 1),
    100,
  );

  try {
    const items = await getUnscoredSessions(limit);
    let scored = 0;
    let errors = 0;
    const details: any[] = [];
    for (const it of items) {
      try {
        const raw = await chatNonStream(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: it.transcript },
          ],
          { temperature: 0, maxTokens: 300 },
        );
        const { score, reason } = parseScore(raw);
        await saveReflectionScore(it.sessionId, score, reason);
        scored += 1;
        details.push({ sessionId: it.sessionId, arm: it.arm, score, reason });
      } catch (e: any) {
        errors += 1;
        details.push({
          sessionId: it.sessionId,
          arm: it.arm,
          error: e?.message || "打分失败",
        });
      }
    }
    return NextResponse.json({
      ok: true,
      processed: items.length,
      scored,
      errors,
      details,
    });
  } catch (e: any) {
    // 多半是未执行 10.2 迁移（reflection_score 列不存在）
    return NextResponse.json(
      {
        ok: false,
        error:
          e?.message ||
          "批处理失败（若提示 reflection_score 列不存在，请先在 Supabase 执行实验 SQL 的 10.2 迁移）",
      },
      { status: 500 },
    );
  }
}
