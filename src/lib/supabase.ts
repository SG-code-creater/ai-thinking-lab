import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let initialized = false;

/**
 * 返回服务端 Supabase 客户端（使用 service_role key，可写）。
 * 若未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，则返回 null，
 * 调用方应优雅降级（跳过使用记录写入，不阻断主流程）。
 */
export function getServerSupabase(): SupabaseClient | null {
  if (initialized) return client;
  initialized = true;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn(
      "[supabase] 未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，跳过使用记录写入。",
    );
    return null;
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return client;
}
