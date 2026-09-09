export const ACHIEVEMENTS = [
  {
    code: "first_pass",
    name: "初出茅庐",
    description: "第一次通关任意一章",
    emoji: "🌱",
    xpReward: 20,
  },
  {
    code: "perfect",
    name: "零失误",
    description: "任意一关拿到满分",
    emoji: "🎯",
    xpReward: 30,
  },
  {
    code: "three_star",
    name: "三星船长",
    description: "单关拿到 3 星",
    emoji: "⭐",
    xpReward: 20,
  },
  {
    code: "course_clear",
    name: "全线打通",
    description: "通关一门完整课程",
    emoji: "🏆",
    xpReward: 80,
  },
  {
    code: "xp_200",
    name: "供应链新锐",
    description: "累计获得 200 经验",
    emoji: "🚀",
    xpReward: 0,
  },
] as const;

export function starsFromScore(score: number) {
  if (score >= 90) return 3;
  if (score >= 75) return 2;
  if (score >= 60) return 1;
  return 0;
}

export function xpFromResult(passed: boolean, score: number, firstPass: boolean) {
  if (!passed) return 8;
  let xp = 25 + Math.round(score / 5);
  if (score === 100) xp += 15;
  if (firstPass) xp += 10;
  return xp;
}
