"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 课程正在后台生成时的占位页：自动轮询刷新，就绪后自动进入正常视图 */
export function CourseGeneratingNotice({ title }: { title?: string }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="card mx-auto mt-8 max-w-lg rounded-3xl p-8 text-center">
      <p className="text-5xl" aria-hidden>⏳</p>
      <h1 className="display mt-4 text-2xl text-ink">课程正在生成中</h1>
      <p className="mt-2 text-sm leading-6 text-neutral-text">
        {title ? `《${title}》` : "这门课"}正在拆大纲、逐关精讲并出题，
        通常需要 1～2 分钟。本页会自动刷新，完成后自动进入关卡地图。
      </p>
      <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-neutral-border/60">
        <span className="block h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-sea to-primary-hover" />
      </div>
    </div>
  );
}
