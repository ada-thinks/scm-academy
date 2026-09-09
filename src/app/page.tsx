import Link from "next/link";
import { AuthPanel } from "@/components/AuthPanel";
import { BookOpen, Map, Swords, Trophy, Upload } from "lucide-react";

const features = [
  { icon: Upload, label: "上传教材", desc: "Markdown / PDF / Word 一键拆解" },
  { icon: BookOpen, label: "自动备课", desc: "大纲、精讲笔记、业务案例" },
  { icon: Map, label: "知识脑图", desc: "概念关系一图看清" },
  { icon: Swords, label: "闯关测验", desc: "过关解锁下一关，教材随时可看" },
  { icon: Trophy, label: "小队排行", desc: "经验、三星评价、成就驱动" },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-full overflow-hidden">
      {/* 背景光晕 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-20 h-[26rem] w-[26rem] rounded-full bg-primary-base/60 blur-[96px]" />
        <div className="absolute -right-20 top-32 h-[22rem] w-[22rem] rounded-full bg-sand/50 blur-[80px]" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-primary-base/40 blur-[88px]" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div className="text-ink">
          <p className="text-xs font-medium tracking-[0.3em] text-sea uppercase">Supply Chain Quest</p>
          <h1 className="display mt-4 text-6xl font-bold leading-[1.1] tracking-tight lg:text-7xl">
            <span className="bg-gradient-to-r from-sea-deep via-sea to-primary-hover bg-clip-text text-transparent">
              链关学堂
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-neutral-text">
            把教材或系统手册丢给平台，自动生成精讲、脑图、案例，再拆成一关一关的测验。让团队边学边练。
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.label}
                className="group flex items-start gap-4 rounded-2xl border border-neutral-border/60 bg-white/70 p-4 backdrop-blur-sm transition hover:border-sea/30 hover:bg-white hover:shadow-lg hover:shadow-primary-base/10"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-base text-sea transition group-hover:scale-105">
                  <f.icon size={20} strokeWidth={2} />
                </span>
                <div>
                  <p className="font-medium text-ink">{f.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-text">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-mist">
            已有账号？直接右侧登录。新同事请走
            <Link href="/register" className="mx-1 font-medium text-gold hover:underline">注册</Link>
            。
          </p>
        </div>

        <AuthPanel mode="login" />
      </div>
    </div>
  );
}
