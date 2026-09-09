import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/types";

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-20 bg-primary text-white shadow-[0_8px_24px_-16px_rgba(38,100,253,0.7)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/home" className="display text-2xl">
          链关学堂
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/home" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/15">营地</Link>
          <Link href="/leaderboard" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/15">排行榜</Link>
          <Link href="/achievements" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/15">成就</Link>
          {user.role === "admin" && (
            <Link href="/admin" className="rounded-full px-3 py-1.5 transition-colors hover:bg-white/15">教材工坊</Link>
          )}
          <div className="mx-3 hidden items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 sm:flex">
            <span>⚡ {user.xp} XP</span>
            <span className="font-medium">{user.name}</span>
          </div>
          <form action={logoutAction}>
            <button className="rounded-full px-3 py-1.5 text-white/75 transition-colors hover:bg-white/15 hover:text-white">离开</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
