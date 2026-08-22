import { NextRequest } from "next/server";
import { verifyToken } from "@clerk/nextjs/server";

// 从请求中解析 Clerk 登录用户 id（sub）。
// 读 __session cookie（或 Bearer），verifyToken 手动校验，绕开 EdgeOne 不支持的 middleware。
// 本平台仅 /admin 等研究者后台使用 Clerk 登录；普通参与者用分组码免登。
export async function getUserIdFromReq(req: NextRequest): Promise<string | null> {
  try {
    const cookieToken =
      req.cookies.get("__session")?.value ||
      req.cookies.get("__clerk_session")?.value;
    const authHeader = req.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const token = cookieToken || bearer;
    if (!token) return null;
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return (claims.sub as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * 校验当前请求者是否为授权研究者（admin）。
 * 通过 Clerk 登录用户的邮箱比对 ADMIN_EMAILS（逗号分隔）环境变量。
 */
export async function getAdminEmailFromReq(
  req: NextRequest,
): Promise<string | null> {
  try {
    const cookieToken =
      req.cookies.get("__session")?.value ||
      req.cookies.get("__clerk_session")?.value;
    const authHeader = req.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const token = cookieToken || bearer;
    if (!token) return null;
    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const email = (claims as Record<string, any>)?.email as string | undefined;
    return email ?? null;
  } catch {
    return null;
  }
}

export function isAuthorizedAdmin(email: string | null): boolean {
  if (!email) return false;
  const allowed = process.env.ADMIN_EMAILS;
  if (!allowed) return false; // 未配置时拒绝，避免误开放
  const list = allowed
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
