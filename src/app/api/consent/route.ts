import { NextRequest, NextResponse } from "next/server";
import { saveConsent } from "@/lib/db";

// A4 知情同意：参与前记录一次同意（每会话唯一，幂等）
export async function POST(req: NextRequest) {
  try {
    const { sessionId, participantId } = await req.json();
    if (!sessionId || !participantId)
      return NextResponse.json(
        { ok: false, error: "缺少必要参数" },
        { status: 400 },
      );
    await saveConsent(sessionId, participantId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "记录知情同意失败" },
      { status: 500 },
    );
  }
}
