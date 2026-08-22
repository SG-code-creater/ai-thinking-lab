import { NextRequest, NextResponse } from "next/server";
import { getMessages, verifySessionOwner } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 加载会话历史消息（前端进入会话时拉取）。
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!sessionId || !participantId)
    return NextResponse.json(
      { ok: false, error: "缺少参数" },
      { status: 400 },
    );

  try {
    if (!(await verifySessionOwner(sessionId, participantId)))
      return NextResponse.json(
        { ok: false, error: "无权访问" },
        { status: 403 },
      );
    const messages = await getMessages(sessionId);
    return NextResponse.json({ ok: true, messages });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
