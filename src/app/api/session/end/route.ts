import { NextRequest, NextResponse } from "next/server";
import { getSessionInfo, endSession } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 结束会话：写入 ended_at / status=done / turns（参与者免登，靠归属校验）
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }
  const { sessionId, participantId } = body;
  if (!sessionId || !participantId)
    return NextResponse.json({ ok: false, error: "缺少参数" }, { status: 400 });

  try {
    const info = await getSessionInfo(sessionId, participantId);
    if (!info)
      return NextResponse.json(
        { ok: false, error: "会话无效或无权访问" },
        { status: 403 },
      );
    await endSession(sessionId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
