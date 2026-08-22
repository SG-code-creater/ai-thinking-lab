import { NextRequest, NextResponse } from "next/server";
import { getSessionInfo } from "@/lib/db";
import { getArm } from "@/lib/arms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 读取会话信息（校验归属后返回臂配置，供前端渲染对应界面）。
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!sessionId || !participantId)
    return NextResponse.json(
      { ok: false, error: "缺少参数" },
      { status: 400 },
    );

  try {
    const info = await getSessionInfo(sessionId, participantId);
    if (!info)
      return NextResponse.json(
        { ok: false, error: "会话无效或无权访问" },
        { status: 403 },
      );
    const arm = getArm(info.arm);
    return NextResponse.json({
      ok: true,
      arm: arm?.code,
      armName: arm?.name,
      description: arm?.description,
      isAiChat: arm?.isAiChat,
      scopeGuarded: arm?.scopeGuarded,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
