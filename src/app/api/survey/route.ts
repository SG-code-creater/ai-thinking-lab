import { NextRequest, NextResponse } from "next/server";
import { getSessionInfo, saveSurvey } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 保存一份前测 / 后测问卷（参与者免登，靠 sessionId + participantId 校验归属）
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }
  const { sessionId, participantId, phase, answers } = body;
  if (!sessionId || !participantId || (phase !== "pre" && phase !== "post"))
    return NextResponse.json(
      { ok: false, error: "缺少参数或 phase 非法" },
      { status: 400 },
    );
  if (
    !Array.isArray(answers) ||
    answers.length === 0 ||
    !answers.every((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  )
    return NextResponse.json(
      { ok: false, error: "answers 需为非空的整数数组，每题 1–5" },
      { status: 400 },
    );

  try {
    const info = await getSessionInfo(sessionId, participantId);
    if (!info)
      return NextResponse.json(
        { ok: false, error: "会话无效或无权访问" },
        { status: 403 },
      );
    await saveSurvey(sessionId, participantId, info.arm, phase, answers);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
