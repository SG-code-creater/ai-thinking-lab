import { NextRequest, NextResponse } from "next/server";
import { getSurveyConfig } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公开读取当前问卷题目（参与者端拉取，无 PII）
export async function GET() {
  try {
    const questions = await getSurveyConfig();
    return NextResponse.json({ ok: true, questions });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
