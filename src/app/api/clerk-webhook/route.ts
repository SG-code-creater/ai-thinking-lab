import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { getServerSupabase } from "@/lib/supabase";

// Clerk Webhook：签名校验后维护 profiles 表（user.created/updated/deleted）。
// 需在 Clerk Dashboard → Webhooks 配置端点 https://<域名>/api/clerk-webhook
// 订阅 user.created / user.updated / user.deleted，并填入 CLERK_WEBHOOK_SECRET。
export async function POST(req: NextRequest) {
  let evt: { type: string; data: Record<string, any> };
  try {
    evt = (await verifyWebhook(req)) as typeof evt;
  } catch (err) {
    console.error("[webhook] 签名校验失败:", (err as Error)?.message);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    // 无 DB 时仍返回 200，避免 Clerk 反复重试
    return new NextResponse("ok (no db)", { status: 200 });
  }

  const { type, data } = evt;
  try {
    if (type === "user.created" || type === "user.updated") {
      const userId = data.id as string;
      const email =
        (data.email_addresses?.[0]?.email_address as string) || null;
      if (type === "user.created") {
        await supabase
          .from("profiles")
          .upsert({ user_id: userId, email, plan: "free" }, {
            onConflict: "user_id",
          });
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({ email })
          .eq("user_id", userId);
        if (error && error.code === "PGRST116") {
          await supabase
            .from("profiles")
            .upsert({ user_id: userId, email, plan: "free" }, {
              onConflict: "user_id",
            });
        }
      }
    } else if (type === "user.deleted") {
      const userId = data.id as string;
      await supabase.from("profiles").delete().eq("user_id", userId);
    }
  } catch (e) {
    console.error("[webhook] 处理失败:", (e as Error)?.message);
    return new NextResponse("error", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}
