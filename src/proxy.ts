import { clerkMiddleware } from '@clerk/nextjs/server'

// 暴露 /__clerk/* 前端 API 代理（让 Clerk JS 能从应用自身域加载，并维护会话状态）。
// 自定义鉴权（lib/auth.ts 的 verifyToken + requireAdmin）保留不动。
//
// 注意：Next.js 16 把 middleware 文件约定改名为 proxy（旧的 middleware 已弃用，
// 仍能 build 但 /__clerk/* 代理在 deprecated 模式下不工作）。
//
// matcher 第三行 '/__clerk/(.*)' 必须显式列出——Clerk 文档原话："Ensure your middleware
// matcher includes the proxy path (by default, /__clerk) so proxy requests are handled
// by the middleware." 没有它，/__clerk/npm/.../clerk.browser.js 会被第一行当成 .js
// 静态文件排除，proxy 不跑，Next.js 404，浏览器报 "Failed to load Clerk JS"。
export default clerkMiddleware()

export const config = {
  matcher: [
    // 跳过 Next.js 内部资源与所有静态文件
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API 路由始终跑
    '/(api|trpc)(.*)',
    // Clerk 前端 API 代理路径始终跑（默认 /__clerk）
    '/__clerk/(.*)',
  ],
}
