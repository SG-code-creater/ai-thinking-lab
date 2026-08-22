import { clerkMiddleware } from '@clerk/nextjs/server'

// 暴露 /_clerk/* 代理路由（让 Clerk JS 能从应用自身域加载，并维护会话状态）。
// 自定义鉴权（lib/auth.ts 的 verifyToken + requireAdmin）保留不动。
//
// 注意：Next.js 16 把 middleware 文件约定改名为 proxy（旧的 middleware 已弃用，
// 仍能 build 但 /_clerk/* 代理在 deprecated 模式下不工作）。
export default clerkMiddleware()

export const config = {
  matcher: [
    // 跳过 Next.js 内部资源与所有静态文件
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API 路由始终跑
    '/(api|trpc)(.*)',
  ],
}
