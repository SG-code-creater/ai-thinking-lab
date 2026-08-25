import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";
import {
  exportMessages,
  exportUploads,
  exportWide,
  exportPeerReviews,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== CSV 工具 =====
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

// ===== XLSX 工具 =====
function toXlsx(rows: any[], cols: string[]): Buffer {
  const aoa = [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
}

function buildResponse(
  rows: any[],
  cols: string[],
  format: string,
  baseName: string,
): Response {
  if (format === "xlsx") {
    const buf = toXlsx(rows, cols);
    const ab = buf.buffer as ArrayBuffer;
    const view = new Uint8Array(ab, buf.byteOffset, buf.byteLength);
    const blob = new Blob([view], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return new Response(blob, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }
  const csv = toCsv(rows, cols);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
    },
  });
}

export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  if (!isAuthorizedAdmin(email))
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 403 });

  const type = req.nextUrl.searchParams.get("type") || "messages";
  const arm = req.nextUrl.searchParams.get("arm") || "";
  const format = req.nextUrl.searchParams.get("format") || "csv";
  const armTag = arm ? `_${arm}` : "";

  try {
    if (type === "wide") {
      const { rows, cols } = await exportWide();
      return buildResponse(rows, cols, format, `wide${armTag}`);
    }

    if (type === "uploads") {
      const rows = await exportUploads(arm || undefined);
      const cols = [
        "id",
        "participant_id",
        "session_id",
        "filename",
        "size_bytes",
        "text_content",
        "created_at",
      ];
      return buildResponse(rows, cols, format, `uploads${armTag}`);
    }

    if (type === "peer") {
      const data = await exportPeerReviews(arm || undefined);
      const rows = (data || []).map((r: any) => ({
        review_id: r.id,
        reviewer_arm: r.sessions?.arm ?? "",
        reviewer_participant: r.sessions?.participant_id ?? "",
        target_filename: r.uploads?.filename ?? "",
        target_text: r.uploads?.text_content ?? "",
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
      }));
      const cols = [
        "review_id",
        "reviewer_arm",
        "reviewer_participant",
        "target_filename",
        "target_text",
        "rating",
        "comment",
        "created_at",
      ];
      return buildResponse(rows, cols, format, `peer_reviews${armTag}`);
    }

    // 默认导出对话（含 arm / participant 维度）
    const data = await exportMessages(arm || undefined);
    const rows = (data || []).map((m: any) => ({
      session_id: m.session_id,
      participant_id: m.sessions?.participant_id ?? "",
      arm: m.sessions?.arm ?? "",
      role: m.role,
      content: m.content,
      blocked: m.blocked,
      is_summary: m.is_summary,
      created_at: m.created_at,
    }));
    const cols = [
      "session_id",
      "participant_id",
      "arm",
      "role",
      "content",
      "blocked",
      "is_summary",
      "created_at",
    ];
    return buildResponse(rows, cols, format, `messages${armTag}`);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "服务器错误" },
      { status: 500 },
    );
  }
}
