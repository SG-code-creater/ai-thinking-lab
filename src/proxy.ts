import { clerkMiddleware } from '@clerk/nextjs/server'

// 应用已绑定到 *.xuebox.me 子域（与 Clerk FAPI 域 clerk.xuebox.me 同 eTLD+1）。
// 因此 clerkMiddleware() 的 auto-proxy 不再触发（auto-proxy 只对 *.vercel.app 生效），
// 客户端直连 clerk.xuebox.me，无需 /__clerk 代理路径，CORS 也无虞。
//
// 仅保留 clerkMiddleware() 服务端鉴权（lib/auth.ts 的 verifyToken + requireAdmin、
// api/chat 范围守卫、api/clerk-webhook 校验都依赖它在服务端跑）。
export default clerkMiddleware()

export const config = {
  matcher: [
    // 跳过 Next.js 内部资源与所有静态文件
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API 路由始终跑
    '/(api|trpc)(.*)',
  ],
}
