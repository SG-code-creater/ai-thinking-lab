import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { listSessions, deleteSessionsByIds } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });
  const url = new URL(req.url);
  try {
    const rows = await listSessions({
      arm: url.searchParams.get("arm") || undefined,
      status: url.searchParams.get("status") || undefined,
      emptyOnly: url.searchParams.get("emptyOnly") === "1",
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      q: url.searchParams.get("q") || undefined,
    });
    return NextResponse.json({ ok: true, sessions: rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });
  const { sessionIds } = await req.json();
  if (!Array.isArray(sessionIds) || sessionIds.length === 0)
    return NextResponse.json(
      { ok: false, error: "未提供要删除的会话 ID" },
      { status: 400 },
    );
  try {
    const res = await deleteSessionsByIds(sessionIds as string[]);
    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
