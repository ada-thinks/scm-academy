import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export default async function LeaderboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  const users = await prisma.user.findMany({
    orderBy: { xp: "desc" },
    take: 20,
  });
  const passed = await prisma.progress.groupBy({
    by: ["userId"],
    where: { status: "passed" },
    _count: { id: true },
  });
  const passMap = Object.fromEntries(passed.map((p) => [p.userId, p._count.id]));

  return (
    <div>
      <h1 className="display text-4xl text-ink">小队排行榜</h1>
      <p className="mt-2 text-neutral-text">经验来自闯关、满分和成就。刷新一下，看看谁在冲关。</p>
      <div className="card mt-6 overflow-hidden rounded-3xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-sea-deep text-white">
            <tr>
              <th className="px-5 py-3">名次</th>
              <th>队员</th>
              <th>经验</th>
              <th>通关数</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row, index) => (
              <tr key={row.id} className={row.id === user.id ? "bg-sand" : "odd:bg-white even:bg-sand"}>
                <td className="px-5 py-3 font-medium">{index + 1}</td>
                <td className="py-3">
                  {row.name}
                  <span className="ml-2 text-xs text-mist">{row.username}</span>
                </td>
                <td>{row.xp}</td>
                <td>{passMap[row.id] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
