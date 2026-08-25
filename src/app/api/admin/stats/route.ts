import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { getArmStats } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  try {
    const stats = await getArmStats();
    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
