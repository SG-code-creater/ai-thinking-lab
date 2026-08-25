import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import { exportMessages, exportUploads, exportWide } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeCsv(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows: any[], cols: string[]): string {
  const head = cols.map(escapeCsv).join(",");
  const body = rows
    .map((r) => cols.map((c) => escapeCsv(r[c])).join(","))
    .join("\n");
  return head + "\n" + body;
}

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type") || "messages";

  try {
    if (type === "wide") {
      const { rows, cols } = await exportWide();
      const csv = toCsv(rows, cols);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="wide.csv"',
        },
      });
    }

    if (type === "uploads") {
      const rows = await exportUploads();
      const csv = toCsv(rows, [
        "id",
        "participant_id",
        "session_id",
        "filename",
        "size_bytes",
        "text_content",
        "created_at",
      ]);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="uploads.csv"',
        },
      });
    }

    // 默认导出对话（含 arm / participant 维度）
    const data = await exportMessages();
    const flat = (data || []).map((m: any) => ({
      session_id: m.session_id,
      participant_id: m.sessions?.participant_id ?? "",
      arm: m.sessions?.arm ?? "",
      role: m.role,
      content: m.content,
      blocked: m.blocked,
      is_summary: m.is_summary,
      created_at: m.created_at,
    }));
    const csv = toCsv(flat, [
      "session_id",
      "participant_id",
      "arm",
      "role",
      "content",
      "blocked",
      "is_summary",
      "created_at",
    ]);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="messages.csv"',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
