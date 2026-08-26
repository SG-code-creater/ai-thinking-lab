"use client";

import { SignIn, useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    // 登录成功后兜底跳研究后台。
    // 注：Clerk hash 模式下 fallbackRedirectUrl 有时回跳首页，这里用 effect 补回，
    // 同时让用户看到「登录成功」提示（延迟 1.2s 再跳，避免瞬间闪走）。
    if (isLoaded && isSignedIn) {
      const t = setTimeout(() => router.replace("/admin"), 1200);
      return () => clearTimeout(t);
    }
  }, [isLoaded, isSignedIn, router]);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          研究者后台需要配置 Clerk。请在 <code>.env.local</code> 中填入{" "}
          <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> 与{" "}
          <code>CLERK_SECRET_KEY</code>，并设置 <code>ADMIN_EMAILS</code>。
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-zinc-900">
          登录研究者账户
        </h1>
        {isSignedIn ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
            ✅ 登录成功，正在进入研究后台…
          </div>
        ) : (
          <SignIn routing="hash" fallbackRedirectUrl="/admin" />
        )}
      </div>
    </div>
  );
}