"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn, UserPlus, ArrowRight, type LucideIcon } from "lucide-react";
import { loginAction, registerAction } from "@/lib/actions";

type Mode = "login" | "register";

const labels: Record<Mode, { title: string; subtitle: string; action: string; icon: LucideIcon; link: { text: string; href: string; hint: string } }> = {
  login: {
    title: "登录",
    subtitle: "演示账号 admin / admin123，学员 zhang 或 wang / learn123",
    action: "开始闯关",
    icon: LogIn,
    link: { text: "创建账号", href: "/register", hint: "还没有账号？" },
  },
  register: {
    title: "加入小队",
    subtitle: "小团队一起学。第一个注册的人会成为管理员。",
    action: "创建账号",
    icon: UserPlus,
    link: { text: "直接登录", href: "/login", hint: "已有账号？" },
  },
};

export function AuthPanel({ mode }: { mode: Mode }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => action(formData),
    null,
  );
  const cfg = labels[mode];
  const Icon = cfg.icon;

  const inputCls =
    "mt-1.5 w-full rounded-xl border border-neutral-border bg-white px-4 py-2.5 text-ink outline-none transition placeholder:text-neutral-disable focus:border-sea focus:ring-2 focus:ring-primary-base/60";

  return (
    <form action={formAction} className="card relative w-full max-w-md overflow-hidden rounded-3xl p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sea via-primary-hover to-gold" />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-base text-sea">
          <Icon size={20} strokeWidth={2} />
        </span>
        <div>
          <p className="text-xs font-medium tracking-widest text-sea uppercase">Chain Quest</p>
          <h1 className="display mt-0.5 text-3xl text-ink">{cfg.title}</h1>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-neutral-text">{cfg.subtitle}</p>

      {mode === "register" && (
        <label className="mt-6 block text-sm font-medium text-ink">
          昵称
          <input name="name" required placeholder="小队里显示的名字" className={inputCls} />
        </label>
      )}
      <label className="mt-5 block text-sm font-medium text-ink">
        账号
        <input name="username" required placeholder="输入账号" className={inputCls} />
      </label>
      <label className="mt-4 block text-sm font-medium text-ink">
        密码
        <input name="password" type="password" required placeholder="输入密码" className={inputCls} />
      </label>

      {state?.error && <p className="mt-4 text-sm text-coral">{state.error}</p>}

      <button
        disabled={pending}
        className="group mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sea to-primary-hover py-3 font-medium text-white shadow-lg shadow-primary-base/25 transition hover:shadow-xl hover:shadow-primary-base/30 disabled:opacity-60"
      >
        {pending ? "正在进入…" : cfg.action}
        {!pending && <ArrowRight size={18} className="transition group-hover:translate-x-0.5" />}
      </button>

      <p className="mt-5 text-center text-sm text-mist">
        {cfg.link.hint}
        <Link href={cfg.link.href} className="ml-1 font-medium text-gold hover:underline">
          {cfg.link.text}
        </Link>
      </p>
    </form>
  );
}
