import { NextRequest, NextResponse } from "next/server";
import { saveGuessGroup } from "@/lib/db";

// A3 盲化校验：会话末写入参与者自报的组别猜测（中性选项字母 A/B/C/D）
export async function POST(req: NextRequest) {
  try {
    const { sessionId, participantId, guess } = await req.json();
    if (!sessionId || !participantId || !guess)
      return NextResponse.json(
        { ok: false, error: "缺少必要参数" },
        { status: 400 },
      );
    await saveGuessGroup(sessionId, participantId, String(guess));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "提交失败" },
      { status: 500 },
    );
  }
}
