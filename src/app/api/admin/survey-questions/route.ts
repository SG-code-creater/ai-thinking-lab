import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { saveSurveyConfig, getSurveyConfig } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 读取问卷题目（admin 侧预览，题目本身对参与者公开，无需鉴权）
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

export async function POST(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }
  const { questions } = body;
  if (
    !Array.isArray(questions) ||
    questions.length === 0 ||
    !questions.every((q: any) => typeof q === "string" && q.trim().length > 0)
  )
    return NextResponse.json(
      { ok: false, error: "questions 需为非空字符串数组（每题一行）" },
      { status: 400 },
    );

  const cleaned = (questions as string[]).map((q) => q.trim());
  try {
    await saveSurveyConfig(cleaned);
    return NextResponse.json({ ok: true, count: cleaned.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
