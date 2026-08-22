import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 实验平台 · 大学生思考力研究",
  description: "大学生宿舍矛盾等议题的 AI 引导式解决实验平台",
};

// 无 Clerk 密钥时（如本地未配置）不挂载 Provider，避免崩溃；admin 页会给出配置提示。
const CLERK_PK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full bg-zinc-50 text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );

  return CLERK_PK ? (
    <ClerkProvider publishableKey={CLERK_PK}>{body}</ClerkProvider>
  ) : (
    body
  );
}
