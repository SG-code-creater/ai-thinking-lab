import { NextRequest, NextResponse } from "next/server";
import {
  getCodeRow,
  getActiveArm,
  createParticipantAndSession,
  incrementCodeUsage,
} from "@/lib/db";
import { getArm, type ArmCode } from "@/lib/arms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 校验分组码 → 检查是否为当前激活臂 → 创建参与者与会话。
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string")
      return NextResponse.json(
        { ok: false, error: "请输入分组码" },
        { status: 400 },
      );

    const normalized = code.trim().toUpperCase();
    const row = await getCodeRow(normalized);
    if (!row)
      return NextResponse.json(
        { ok: false, error: "分组码无效，请检查后重试" },
        { status: 404 },
      );

    const active = await getActiveArm();
    if (active !== row.arm) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          error: "本阶段尚未开放，请等待研究者通知后再参与。",
        },
        { status: 403 },
      );
    }

    const arm = getArm(row.arm);
    if (!arm)
      return NextResponse.json(
        { ok: false, error: "实验臂配置缺失" },
        { status: 500 },
      );

    const { participantId, sessionId } = await createParticipantAndSession(
      normalized,
      row.arm as ArmCode,
    );
    await incrementCodeUsage(normalized);

    return NextResponse.json({
      ok: true,
      participantId,
      sessionId,
      arm: arm.code,
      armName: arm.name,
      description: arm.description,
      isAiChat: arm.isAiChat,
      scopeGuarded: arm.scopeGuarded,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
