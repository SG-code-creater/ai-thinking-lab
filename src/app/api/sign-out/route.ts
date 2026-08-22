import { NextRequest, NextResponse } from "next/server";
import { verifyToken, clerkClient } from "@clerk/nextjs/server";

// 服务端登出：绕过客户端 SDK（EdgeOne 下 signOut() 返回异常响应）与 middleware。
// 流程：读 __session cookie → verifyToken 取 sessionId → 调 Clerk 后端吊销 session
// → 清除本地 cookie → 302 跳回首页。useUser() 重载后无有效 cookie 即视为已登出。
export async function POST(req: NextRequest) {
  const token =
    req.cookies.get("__session")?.value ||
    req.cookies.get("__clerk_session")?.value;

  if (token) {
    try {
      const claims = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      const sessionId = claims.sid as string | undefined;
      if (sessionId) {
        const client = await clerkClient();
        await client.sessions.revokeSession(sessionId);
      }
    } catch (e) {
      // 吊销失败不影响登出体验：cookie 仍会被清除，客户端会话即失效
      console.error("[sign-out] revoke failed:", (e as Error)?.message);
    }
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  const clerkCookies = ["__session", "__clerk_session", "__clerk_db_jwt", "__client"];
  for (const name of clerkCookies) {
    res.cookies.set(name, "", { maxAge: 0, path: "/", expires: new Date(0) });
  }
  return res;
}
