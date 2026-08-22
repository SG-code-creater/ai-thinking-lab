import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { createCodes, listCodes } from "@/lib/db";
import { ARM_LIST } from "@/lib/arms";
import type { ArmCode } from "@/lib/arms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });
  try {
    const codes = await listCodes();
    return NextResponse.json({ ok: true, codes });
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

  const { arm, count, label } = await req.json();
  const valid = ARM_LIST.some((a) => a.code === arm);
  if (!valid)
    return NextResponse.json({ ok: false, error: "非法实验臂" }, { status: 400 });

  const n = Math.min(Math.max(parseInt(count, 10) || 10, 1), 200);
  try {
    const codes = await createCodes(arm as ArmCode, n, label);
    return NextResponse.json({ ok: true, codes });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
