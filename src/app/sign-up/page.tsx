"use client";

import { SignUp } from "@clerk/nextjs";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
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
          创建研究者账户
        </h1>
        <SignUp routing="hash" fallbackRedirectUrl="/admin" />
      </div>
    </div>
  );
}
