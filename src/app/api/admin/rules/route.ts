import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { listRules, createRule, deleteRule } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });
  try {
    const rules = await listRules();
    return NextResponse.json({ ok: true, rules });
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

  const { kind, content, arm } = await req.json();
  const text = (content || "").trim();
  if (!text)
    return NextResponse.json({ ok: false, error: "规则内容不能为空" }, { status: 400 });
  if (kind !== "background" && kind !== "constraint")
    return NextResponse.json({ ok: false, error: "非法的规则类型" }, { status: 400 });

  try {
    await createRule(kind, text, arm || null);
    return NextResponse.json({ ok: true });
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

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id)
    return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });

  try {
    await deleteRule(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
