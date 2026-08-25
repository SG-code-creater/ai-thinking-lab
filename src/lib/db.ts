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

/** 删除所有未使用的分组码（used_count = 0 或 null），返回删除数量 */
export async function deleteUnusedCodes(): Promise<number> {
  const db = requireDb();
  const { data, error } = await db
    .from("group_codes")
    .delete()
    .or("used_count.eq.0,used_count.is.null")
    .select("code");
  if (error) throw new DbError(error.message);
  return data?.length ?? 0;
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

// ============ 实验规则（测试背景 + 限制条件） ============

export type RuleKind = "background" | "constraint";

/** 列出所有实验规则（按创建时间倒序） */
export async function listRules(): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("rules")
    .select("id, kind, content, visible_to_participant, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 新增一条规则：kind = background（测试背景）| constraint（限制条件）。
 *  测试背景默认对参与者可见（visible_to_participant=true），限制条件仅后台可见。 */
export async function createRule(kind: RuleKind, content: string): Promise<void> {
  const db = requireDb();
  if (kind !== "background" && kind !== "constraint")
    throw new DbError("非法的规则类型");
  const { error } = await db.from("rules").insert({
    kind,
    content,
    visible_to_participant: kind === "background",
  });
  if (error) throw new DbError(error.message);
}

/** 读取对参与者可见的测试规则（供会话页开场说明，绝不返回限制条件） */
export async function getParticipantRules(): Promise<any[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("rules")
    .select("id, kind, content")
    .eq("visible_to_participant", true)
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return (data as any[]) ?? [];
}

/** 读取所有「限制条件」类规则（供注入 AI 系统提示词，约束智能体行为；参与者不可见） */
export async function getConstraintRules(): Promise<string[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("rules")
    .select("content")
    .eq("kind", "constraint")
    .order("created_at", { ascending: true });
  if (error) throw new DbError(error.message);
  return ((data as any[]) ?? []).map((r) => String(r.content));
}

/** 删除一条规则（按 id） */
export async function deleteRule(id: string): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("rules").delete().eq("id", id);
  if (error) throw new DbError(error.message);
}

// ============ 前测 / 后测问卷（surveys） ============
// 题目数量不写死：答案以 jsonb 数组存储，前/后测共用同一套题目（来自 survey_config）。

/** 保存一份问卷（pre / post 各一份，upsert 按 session_id + phase）。
 *  answers 为与题目顺序一致的 1–5 整数数组。 */
export async function saveSurvey(
  sessionId: string,
  participantId: string,
  arm: string,
  phase: "pre" | "post",
  answers: number[],
): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("surveys").upsert(
    {
      session_id: sessionId,
      participant_id: participantId,
      arm,
      phase,
      answers,
    },
    { onConflict: "session_id,phase" },
  );
  if (error) throw new DbError(error.message);
}

/** 读取某会话的问卷填写状态与会话结束状态 */
export async function getSurveyStatus(
  sessionId: string,
): Promise<{
  pre: boolean;
  post: boolean;
  ended: boolean;
  endedAt: string | null;
}> {
  const db = requireDb();
  const { data: svs, error: se } = await db
    .from("surveys")
    .select("phase")
    .eq("session_id", sessionId);
  if (se) throw new DbError(se.message);
  const phases = new Set(((svs as any[]) ?? []).map((r) => r.phase));
  const { data: sd, error: de } = await db
    .from("sessions")
    .select("status, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (de) throw new DbError(de.message);
  return {
    pre: phases.has("pre"),
    post: phases.has("post"),
    ended: sd?.status === "done",
    endedAt: sd?.ended_at ?? null,
  };
}

/** 结束会话：写入 ended_at / status='done'，并计算轮次（user 消息数） */
export async function endSession(sessionId: string): Promise<void> {
  const db = requireDb();
  const { count, error: ce } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("role", "user");
  if (ce) throw new DbError(ce.message);
  const turns = (count as number) ?? 0;
  const { error } = await db
    .from("sessions")
    .update({
      status: "done",
      ended_at: new Date().toISOString(),
      turns,
    })
    .eq("id", sessionId);
  if (error) throw new DbError(error.message);
}

// ============ 问卷题目配置（survey_config，单行） ============
// 题目不在代码里写死，由研究者通过后台导入；参与者端动态拉取。

/** 读取当前问卷题目（默认空数组） */
export async function getSurveyConfig(): Promise<string[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("survey_config")
    .select("questions")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new DbError(error.message);
  if (!data) return [];
  const qs = (data as any).questions;
  return Array.isArray(qs) ? (qs as string[]) : [];
}

/** 保存问卷题目（覆盖式，单行 id=1） */
export async function saveSurveyConfig(questions: string[]): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("survey_config").upsert(
    {
      id: 1,
      questions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new DbError(error.message);
}

/** 统一宽表导出（每会话一行，含前/后测、时长、轮次、完成度、上传数、反思分、对话全文）。
 *  返回 { rows, cols }：列头随配置题数动态展开，供导出路由直接生成 CSV。 */
export async function exportWide(): Promise<{ rows: any[]; cols: string[] }> {
  const db = requireDb();
  const { data: sessions, error: se } = await db
    .from("sessions")
    .select("id, participant_id, arm, status, started_at, ended_at, turns, guessed_group")
    .order("started_at", { ascending: true });
  if (se) throw new DbError(se.message);
  const { data: surveys, error: sve } = await db
    .from("surveys")
    .select("session_id, phase, answers");
  if (sve) throw new DbError(sve.message);
  const { data: parts, error: pe } = await db
    .from("participants")
    .select("id, code");
  if (pe) throw new DbError(pe.message);
  const { data: msgs, error: me } = await db
    .from("messages")
    .select("session_id, role, content")
    .order("created_at", { ascending: true });
  if (me) throw new DbError(me.message);
  const { data: ups, error: upe } = await db
    .from("uploads")
    .select("session_id");
  if (upe) throw new DbError(upe.message);

  // 反思分：旧库未跑迁移时整列缺失，单独 guarded 读取，避免整次导出失败
  const reflMap = new Map<string, number | null>();
  try {
    const { data: rf, error: rfe } = await db
      .from("sessions")
      .select("id, reflection_score");
    if (!rfe)
      for (const r of (rf as any[]) ?? [])
        reflMap.set(r.id, r.reflection_score ?? null);
  } catch {
    /* 未执行 10.2 迁移则跳过反思分列 */
  }

  // 当前配置题数（用于动态展开 pre_qN / post_qN 列）
  let cfgQ = 0;
  try {
    const { data: cfg } = await db
      .from("survey_config")
      .select("questions")
      .eq("id", 1)
      .maybeSingle();
    if (cfg && Array.isArray((cfg as any).questions))
      cfgQ = (cfg as any).questions.length;
  } catch {
    /* 忽略 */
  }

  const surveyMap = new Map<string, any>();
  let maxQ = cfgQ;
  for (const s of (surveys as any[]) ?? []) {
    const m = surveyMap.get(s.session_id) || {};
    const arr = Array.isArray(s.answers) ? (s.answers as number[]) : [];
    m[s.phase] = arr;
    maxQ = Math.max(maxQ, arr.length);
    surveyMap.set(s.session_id, m);
  }

  const partMap = new Map<string, string>();
  for (const p of (parts as any[]) ?? []) partMap.set(p.id, p.code);

  const msgStat = new Map<string, { total: number; user: number }>();
  const msgTextMap = new Map<string, string[]>();
  for (const m of (msgs as any[]) ?? []) {
    const s = msgStat.get(m.session_id) || { total: 0, user: 0 };
    s.total += 1;
    if (m.role === "user") s.user += 1;
    msgStat.set(m.session_id, s);
    const speaker =
      m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : "系统";
    const arr = msgTextMap.get(m.session_id) || [];
    arr.push(`${speaker}：${m.content}`);
    msgTextMap.set(m.session_id, arr);
  }

  const upStat = new Map<string, number>();
  for (const u of (ups as any[]) ?? [])
    upStat.set(u.session_id, (upStat.get(u.session_id) || 0) + 1);

  const rows = ((sessions as any[]) ?? []).map((row) => {
    const sv = surveyMap.get(row.id) || {};
    const ms = msgStat.get(row.id) || { total: 0, user: 0 };
    const durMin =
      row.ended_at && row.started_at
        ? Math.max(
            0,
            Math.round(
              (new Date(row.ended_at).getTime() -
                new Date(row.started_at).getTime()) /
                60000,
            ),
          )
        : null;
    const pre: number[] = sv.pre || [];
    const post: number[] = sv.post || [];
    const obj: Record<string, any> = {
      participant_id: row.participant_id,
      group_code: partMap.get(row.participant_id) ?? "",
      arm: row.arm,
      status: row.status,
      completed: row.status === "done",
      started_at: row.started_at,
      ended_at: row.ended_at,
      duration_min: durMin,
      turns: row.turns ?? ms.user,
      message_count: ms.total,
      user_turns: ms.user,
      upload_count: upStat.get(row.id) ?? 0,
      reflection_score: reflMap.get(row.id) ?? "",
      guessed_group: row.guessed_group ?? "",
      pre_answers: pre.join("|"),
      post_answers: post.join("|"),
      messages_text: (msgTextMap.get(row.id) || []).join("\n"),
    };
    for (let i = 0; i < maxQ; i++) {
      obj[`pre_q${i + 1}`] = pre[i] ?? "";
      obj[`post_q${i + 1}`] = post[i] ?? "";
    }
    return obj;
  });

  const cols = [
    "participant_id",
    "group_code",
    "arm",
    "status",
    "completed",
    "started_at",
    "ended_at",
    "duration_min",
    "turns",
    "message_count",
    "user_turns",
    "upload_count",
    "reflection_score",
    "guessed_group",
    "pre_answers",
    "post_answers",
    ...Array.from({ length: maxQ }, (_, i) => `pre_q${i + 1}`),
    ...Array.from({ length: maxQ }, (_, i) => `post_q${i + 1}`),
    "messages_text",
  ];
  return { rows, cols };
}

// ============ D2 反思深度自动打分 ============

/** 取尚未打反思分的会话（含其对话全文），供批处理。
 *  无消息文本的会话（如纯上传的 solo）会被跳过。 */
export async function getUnscoredSessions(
  limit = 50,
): Promise<{ sessionId: string; arm: string; transcript: string }[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("sessions")
    .select("id, arm, reflection_score")
    .is("reflection_score", null)
    .limit(limit);
  if (error) throw new DbError(error.message);
  const out: { sessionId: string; arm: string; transcript: string }[] = [];
  for (const s of (data as any[]) ?? []) {
    const msgs = await getMessages(s.id);
    if (!msgs.length) continue; // 无对话文本可打分
    const transcript = msgs
      .map((m: any) =>
        m.role === "user"
          ? `用户：${m.content}`
          : m.role === "assistant"
            ? `助手：${m.content}`
            : `系统：${m.content}`,
      )
      .join("\n");
    out.push({ sessionId: s.id, arm: s.arm, transcript });
  }
  return out;
}

/** 写入某会话的反思打分结果 */
export async function saveReflectionScore(
  sessionId: string,
  score: number,
  reason: string,
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("sessions")
    .update({
      reflection_score: score,
      reflection_reason: reason,
      reflection_scored_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw new DbError(error.message);
}

// ============ A4 知情同意 ============

/** 记录一次知情同意（每会话唯一，重复写入幂等） */
export async function saveConsent(
  sessionId: string,
  participantId: string,
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("consents")
    .upsert(
      { session_id: sessionId, participant_id: participantId },
      { onConflict: "session_id" },
    );
  if (error) throw new DbError(error.message);
}

/** 该会话是否已记录知情同意 */
export async function getConsent(sessionId: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("consents")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new DbError(error.message);
  return !!data;
}

// ============ A4 退出 / 数据删除 ============

/** 删除某参与者的全部研究数据（按依赖顺序，避免外键冲突）。
 *  用于参与者随时退出并删除其数据，符合人类受试者可退出/数据最小化原则。 */
export async function deleteParticipantData(
  sessionId: string,
  participantId: string,
): Promise<void> {
  const db = requireDb();
  // 1) 先清同伴互评：本参与者作为评审者的记录
  await db.from("peer_reviews").delete().eq("reviewer_session_id", sessionId);
  // 2) 他人评价了本参与者的上传 → 按上传 id 清
  const { data: myUps } = await db
    .from("uploads")
    .select("id")
    .eq("participant_id", participantId);
  if (myUps && (myUps as any[]).length) {
    const ids = (myUps as any[]).map((u) => u.id);
    await db.from("peer_reviews").delete().in("target_upload_id", ids);
  }
  // 3) 其余按依赖顺序
  await db.from("messages").delete().eq("session_id", sessionId);
  await db.from("uploads").delete().eq("participant_id", participantId);
  await db.from("surveys").delete().eq("session_id", sessionId);
  await db.from("consents").delete().eq("session_id", sessionId);
  await db.from("sessions").delete().eq("id", sessionId);
  await db.from("participants").delete().eq("id", participantId);
}

// ============ A3 盲化校验 ============

/** 写入参与者自报的组别猜测（中性选项字母 A/B/C/D） */
export async function saveGuessGroup(
  sessionId: string,
  participantId: string,
  guess: string,
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("sessions")
    .update({ guessed_group: guess })
    .eq("id", sessionId)
    .eq("participant_id", participantId);
  if (error) throw new DbError(error.message);
}

// ============ 臂3 同伴互评（匿名） ============

/** 抽取其他 solo 参与者的匿名文本，供当前 solo 参与者评价。
 *  仅取含文本且长度≥10 字的上传，随机打乱后取前 limitN 条；不返回作者信息。 */
export async function getPeerSamples(
  currentSessionId: string,
  limitN = 3,
): Promise<{ uploadId: string; text: string }[]> {
  const db = requireDb();
  const { data: solos, error: se } = await db
    .from("sessions")
    .select("id")
    .eq("arm", "solo")
    .neq("id", currentSessionId);
  if (se) throw new DbError(se.message);
  const soloIds = ((solos as any[]) ?? []).map((s) => s.id);
  if (!soloIds.length) return [];
  const { data, error } = await db
    .from("uploads")
    .select("id, text_content")
    .in("session_id", soloIds)
    .not("text_content", "is", null)
    .limit(limitN * 4);
  if (error) throw new DbError(error.message);
  const arr = ((data as any[]) ?? [])
    .map((u) => ({ uploadId: u.id, text: (u.text_content || "").trim() }))
    .filter((u) => u.text.length >= 10);
  // 打乱（Fisher–Yates）后取前 limitN
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limitN);
}

/** 批量写入同伴互评（对同一份文本重复提交幂等：upsert on conflict） */
export async function savePeerReviews(
  reviewerSessionId: string,
  reviews: { uploadId: string; rating: number; comment?: string }[],
): Promise<void> {
  const db = requireDb();
  for (const r of reviews) {
    if (!r.uploadId || !(r.rating >= 1 && r.rating <= 5)) continue;
    const { error } = await db
      .from("peer_reviews")
      .upsert(
        {
          reviewer_session_id: reviewerSessionId,
          target_upload_id: r.uploadId,
          rating: r.rating,
          comment: r.comment?.trim() || null,
        },
        { onConflict: "reviewer_session_id,target_upload_id" },
      );
    if (error) throw new DbError(error.message);
  }
}

/** 当前 session 已提交的同伴互评条数 */
export async function countPeerReviews(
  reviewerSessionId: string,
): Promise<number> {
  const db = requireDb();
  const { count, error } = await db
    .from("peer_reviews")
    .select("id", { count: "exact", head: true })
    .eq("reviewer_session_id", reviewerSessionId);
  if (error) throw new DbError(error.message);
  return (count as number) ?? 0;
}
