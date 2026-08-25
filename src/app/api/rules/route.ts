import { NextRequest, NextResponse } from "next/server";
import { getParticipantRules } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公开接口（参与者免登）：仅返回 visible_to_participant=true 的测试背景规则，
// 绝不返回限制条件，避免泄漏后台实验约束。?arm= 用于按臂过滤（仅返回全局或适用该臂的规则）。
export async function GET(req: NextRequest) {
  try {
    const arm = req.nextUrl.searchParams.get("arm") || undefined;
    const rules = await getParticipantRules(arm);
    return NextResponse.json({ ok: true, rules });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
