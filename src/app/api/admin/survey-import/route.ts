import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 把 .docx / .pdf 解析为纯文本，回填到后台「问卷题目配置」文本框（前端再行保存）。
// 纯文本（.txt/.md/.csv）也在此统一解析，避免前端 readAsText 对二进制格式产生乱码。
export async function POST(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "请使用 multipart/form-data 上传文件" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "缺少 file 字段" }, { status: 400 });
  }

  const name = String(file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text = "";
    if (ext === "txt" || ext === "md" || ext === "csv") {
      text = buf.toString("utf-8");
    } else if (ext === "docx") {
      const res = await mammoth.extractRawText({ buffer: buf });
      text = res.value || "";
    } else if (ext === "doc") {
      return NextResponse.json(
        { ok: false, error: "暂不支持旧版 .doc，请另存为 .docx 或复制文本粘贴" },
        { status: 415 },
      );
    } else if (ext === "pdf") {
      const data = await pdfParse(buf);
      text = data?.text || "";
    } else {
      return NextResponse.json(
        { ok: false, error: `不支持的扩展名 .${ext}（支持 txt/md/csv/docx/pdf）` },
        { status: 415 },
      );
    }

    // 统一换行符，空行清理交给前端的 parseQuestions
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return NextResponse.json({ ok: true, text, ext });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "解析失败：" + (e?.message || "未知错误") },
      { status: 500 },
    );
  }
}
