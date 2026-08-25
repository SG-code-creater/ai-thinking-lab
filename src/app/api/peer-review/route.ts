import { NextRequest, NextResponse } from "next/server";
import {
  getPeerSamples,
  savePeerReviews,
  countPeerReviews,
} from "@/lib/db";

export const dynamic = "force-dynamic";

// 臂3 同伴互评：给当前 solo 参与者抽取其他 solo 的匿名文本
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId)
      return NextResponse.json(
        { ok: false, error: "缺少 sessionId" },
        { status: 400 },
      );
    const samples = await getPeerSamples(sessionId, 3);
    const done = await countPeerReviews(sessionId);
    return NextResponse.json({ ok: true, samples, alreadyReviewed: done });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "获取同伴样本失败" },
      { status: 500 },
    );
  }
}

// 提交同伴互评（批量，对同一条文本重复提交幂等）
export async function POST(req: NextRequest) {
  try {
    const { sessionId, participantId, reviews } = await req.json();
    if (!sessionId || !Array.isArray(reviews))
      return NextResponse.json(
        { ok: false, error: "参数错误" },
        { status: 400 },
      );
    await savePeerReviews(sessionId, reviews);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "提交互评失败" },
      { status: 500 },
    );
  }
}
