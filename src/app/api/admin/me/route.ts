import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromReq, isAuthorizedAdmin } from "@/lib/auth";

/** 当前登录用户是否为授权研究者（供前端显示「无权限」提示，避免默默 403）。 */
export async function GET(req: NextRequest) {
  const email = await getAdminEmailFromReq(req);
  return NextResponse.json({
    authed: isAuthorizedAdmin(email),
    email,
  });
}
