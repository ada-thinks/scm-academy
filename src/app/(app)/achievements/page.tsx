import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const [owned, all] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
    }),
    prisma.achievement.findMany({ orderBy: { code: "asc" } }),
  ]);
  const ownedByCode = new Map(owned.map((item) => [item.achievement.code, item.unlockedAt]));
  const unlockedCount = owned.length;
  const unlockedXp = owned.reduce((sum, item) => sum + item.achievement.xpReward, 0);

  return (
    <div>
      <Link href="/home" className="text-sm text-sea">← 返回营地</Link>
      <div className="hero mt-4 rounded-3xl p-7">
        <p className="text-5xl" aria-hidden>🏅</p>
        <h1 className="display mt-2 text-3xl text-white">成就徽章</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/90">
          已点亮 {unlockedCount} / {all.length} · 徽章奖励共 +{unlockedXp} XP 已直接计入经验。每闯过关键节点就会解锁一枚，全点亮就是全站最硬核的供应链同学。
        </p>
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((achievement) => {
          const unlockedAt = ownedByCode.get(achievement.code);
          const done = Boolean(unlockedAt);
          return (
            <li
              key={achievement.code}
              className={`card rounded-3xl p-5 ${done ? "" : "opacity-80"}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl ${
                    done ? "bg-[#e8f2ff]" : "bg-neutral-bg"
                  } ${done ? "" : "grayscale"}`}
                  aria-hidden
                >
                  {done ? achievement.emoji : "🔒"}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-ink">{achievement.name}</h3>
                  <p className="text-xs text-neutral-tip">
                    奖励 {achievement.xpReward > 0 ? `+${achievement.xpReward} XP` : "无经验"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-neutral-text">{achievement.description}</p>
              <p className={`mt-3 text-xs ${done ? "text-sea" : "text-neutral-tip"}`}>
                {done && unlockedAt
                  ? `✅ 已于 ${unlockedAt.toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })} 解锁`
                  : "尚未解锁，继续闯关点亮它"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
