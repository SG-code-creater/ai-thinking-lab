import { NextRequest, NextResponse } from "next/server";
import { deleteParticipantData } from "@/lib/db";

// A4 退出 / 数据删除：删除该参与者的全部研究数据（人类受试者可退出原则）
export async function POST(req: NextRequest) {
  try {
    const { sessionId, participantId } = await req.json();
    if (!sessionId || !participantId)
      return NextResponse.json(
        { ok: false, error: "缺少必要参数" },
        { status: 400 },
      );
    await deleteParticipantData(sessionId, participantId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "删除数据失败" },
      { status: 500 },
    );
  }
}
