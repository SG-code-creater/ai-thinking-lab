// 实验平台数据访问层：统一封装对 Supabase 的读写。
// 所有调用走服务端 service_role；参与者数据隔离靠 participant_id 校验。

import { getServerSupabase } from "./supabase";
import type { ArmCode } from "./arms";

export class DbError extends Error {}

function requireDb() {
  const db = getServerSupabase();
  if (!db)
    throw new DbError(
      "数据库未配置（缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）",
    );
  return db;
}

/** 当前激活的实验臂（"none" 表示全部未开放） */
export async function getActiveArm(): Promise<string> {
  const db = requireDb();
  const { data } = await db
    .from("settings")
    .select("value")
    .eq("key", "active_arm")
    .maybeSingle();
  return (data?.value as string) ?? "none";
}

/** 切换激活臂：none | socratic | free | solo */
export async function setActiveArm(arm: string): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("settings")
    .upsert({ key: "active_arm", value: arm }, { onConflict: "key" });
  if (error) throw new DbError(error.message);
}

/** 根据分组码查询所属臂 */
export async function getCodeRow(
  code: string,
): Promise<{ arm: string } | null> {
  const db = requireDb();
  const { data } = await db
    .from("group_codes")
    .select("arm")
    .eq("code", code)
    .maybeSingle();
  return (data as { arm: string } | null) ?? null;
}

/** 成功输码后：创建参与者 + 会话，返回两者 id */
export async function createParticipantAndSession(
  code: string,
  arm: ArmCode,
): Promise<{ participantId: string; sessionId: string }> {
  const db = requireDb();
  const { data: p, error: pe } = await db
    .from("participants")
    .insert({ code, arm })
    .select("id")
    .single();
  if (pe) throw new DbError(pe.message);
  const pid = p.id as string;
  const { data: s, error: se } = await db
    .from("sessions")
    .insert({ participant_id: pid, arm })
    .select("id")
    .single();
  if (se) throw new DbError(se.message);
  return { participantId: pid, sessionId: s.id as string };
}

/** 读取会话信息并校验归属（归属不符返回 null） */
export async function getSessionInfo(
  sessionId: string,
  participantId: string,
): Promise<any | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("sessions")
    .select("id, participant_id, arm, started_at, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new DbError(error.message);
  if (!data) return null;
  if (data.participant_id !== participantId) return null;
  return data;
}

/** 校验会话归属 */
export async function verifySessionOwner(
  sessionId: string,
  participantId: string,
): Promise<boolean> {
  const info = await getSessionInfo(sessionId, participantId);
  return !!info;
}

/** 读取会话历史消息 */
export async function getMessages(sessionId: string): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("messages")
    .select("id, role, content, blocked, is_summary, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 追加一条消息 */
export async function appendMessage(
  sessionId: string,
  role: string,
  content: string,
  meta?: { blocked?: boolean; is_summary?: boolean },
): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("messages").insert({
    session_id: sessionId,
    role,
    content,
    blocked: meta?.blocked ?? false,
    is_summary: meta?.is_summary ?? false,
  });
  if (error) throw new DbError(error.message);
}

/** 记录分组码使用次数 */
export async function incrementCodeUsage(code: string): Promise<void> {
  const db = requireDb();
  const { data } = await db
    .from("group_codes")
    .select("used_count")
    .eq("code", code)
    .maybeSingle();
  const cur = (data?.used_count ?? 0) as number;
  await db
    .from("group_codes")
    .update({ used_count: cur + 1 })
    .eq("code", code);
}

function genCode(arm: ArmCode): string {
  const prefix = arm === "socratic" ? "SOC" : arm === "free" ? "FRE" : "SOL";
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

/** 生成 count 个不重复的分组码 */
export async function createCodes(
  arm: ArmCode,
  count: number,
  label?: string,
): Promise<string[]> {
  const db = requireDb();
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let inserted = false;
    for (let attempt = 0; attempt < 12 && !inserted; attempt++) {
      const c = genCode(arm);
      const { error } = await db
        .from("group_codes")
        .insert({ code: c, arm, label: label || null });
      if (!error) {
        codes.push(c);
        inserted = true;
      } else if (error.code !== "23505") {
        // 仅唯一冲突时重试，其余直接抛出
        throw new DbError(error.message);
      }
    }
    if (!inserted) throw new DbError("生成分组码失败（唯一冲突过多）");
  }
  return codes;
}

/** 列出所有分组码 */
export async function listCodes(): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("group_codes")
    .select("code, arm, label, created_at, used_count")
    .order("created_at", { ascending: false });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 保存一条上传/粘贴记录，返回 id */
export async function saveUpload(
  participantId: string,
  sessionId: string | null,
  filename: string,
  storagePath: string | null,
  sizeBytes: number | null,
  textContent: string | null,
): Promise<string> {
  const db = requireDb();
  const { data, error } = await db
    .from("uploads")
    .insert({
      participant_id: participantId,
      session_id: sessionId,
      filename,
      storage_path: storagePath,
      size_bytes: sizeBytes,
      text_content: textContent,
    })
    .select("id")
    .single();
  if (error) throw new DbError(error.message);
  return data.id as string;
}

/** 列出某参与者的上传记录 */
export async function listUploads(participantId: string): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("uploads")
    .select("id, filename, size_bytes, text_content, created_at")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 导出对话（含 arm / participant 维度，供文本分析） */
export async function exportMessages(): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("messages")
    .select(
      "session_id, role, content, blocked, is_summary, created_at, sessions(arm, participant_id)",
    )
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 导出上传记录 */
export async function exportUploads(): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("uploads")
    .select(
      "id, participant_id, session_id, filename, size_bytes, text_content, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}
