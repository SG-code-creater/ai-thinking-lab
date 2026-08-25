import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import {
  createCodes,
  listCodes,
  deleteUnusedCodes,
  deleteCodesByValues,
} from "@/lib/db";
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

/** 删除分组码：
 *  - ?unused=1  → 删除所有「已用 0 次」的码（原有行为，双重保险）
 *  - 请求体 { codes: [...] } → 删除指定码；默认跳过已用码，force:true 可强制 */
export async function DELETE(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  const url = new URL(req.url);
  if (url.searchParams.get("unused") === "1") {
    try {
      const deleted = await deleteUnusedCodes();
      return NextResponse.json({ ok: true, deleted });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message || "服务器错误" },
        { status: 500 },
      );
    }
  }

  let body: { codes?: string[]; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* 空 body */
  }
  const codes = Array.isArray(body.codes) ? body.codes : [];
  if (codes.length === 0)
    return NextResponse.json(
      { ok: false, error: "未提供要删除的分组码（用 ?unused=1 删全部未用码）" },
      { status: 400 },
    );
  try {
    const res = await deleteCodesByValues(codes as string[], body.force === true);
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
