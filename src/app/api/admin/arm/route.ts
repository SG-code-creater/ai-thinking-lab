import { NextRequest, NextResponse } from "next/server";
import { getActiveArm, setActiveArm } from "@/lib/db";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { ARM_LIST } from "@/lib/arms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = ["none", "socratic", "free", "solo"];

export async function GET() {
  try {
    const activeArm = await getActiveArm();
    return NextResponse.json({
      ok: true,
      activeArm,
      arms: ARM_LIST.map((a) => ({ code: a.code, name: a.name })),
    });
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

  const { activeArm } = await req.json();
  if (!VALID.includes(activeArm))
    return NextResponse.json({ ok: false, error: "非法实验臂" }, { status: 400 });

  try {
    await setActiveArm(activeArm);
    return NextResponse.json({ ok: true, activeArm });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
