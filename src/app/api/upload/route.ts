import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";
import { verifySessionOwner, saveUpload, listUploads } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documents";

// 臂3 文档收集：上传文件（存 Storage）或保存粘贴文本；GET 拉取已收集列表。
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const participantId = req.nextUrl.searchParams.get("participantId");
  if (!sessionId || !participantId)
    return NextResponse.json({ ok: false, error: "缺少参数" }, { status: 400 });
  try {
    if (!(await verifySessionOwner(sessionId, participantId)))
      return NextResponse.json({ ok: false, error: "无权访问" }, { status: 403 });
    const uploads = await listUploads(participantId);
    return NextResponse.json({ ok: true, uploads });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  const participantId = req.nextUrl.searchParams.get("participantId") || "";
  if (!sessionId || !participantId)
    return NextResponse.json({ ok: false, error: "缺少参数" }, { status: 400 });

  try {
    if (!(await verifySessionOwner(sessionId, participantId)))
      return NextResponse.json({ ok: false, error: "无权访问" }, { status: 403 });

    const supabase = getServerSupabase();
    if (!supabase)
      return NextResponse.json({ ok: false, error: "存储未配置" }, { status: 500 });

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return NextResponse.json({ ok: false, error: "未找到文件" }, { status: 400 });

      const bytes = await file.arrayBuffer();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${participantId}/${sessionId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      if (error)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      const id = await saveUpload(
        participantId,
        sessionId,
        file.name,
        path,
        file.size,
        null,
      );
      return NextResponse.json({ ok: true, id, filename: file.name, size: file.size });
    } else {
      const { textContent } = await req.json();
      if (!textContent || !String(textContent).trim())
        return NextResponse.json({ ok: false, error: "内容为空" }, { status: 400 });
      const id = await saveUpload(
        participantId,
        sessionId,
        "粘贴文本",
        null,
        null,
        String(textContent).slice(0, 50000),
      );
      return NextResponse.json({ ok: true, id });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
