import { priorityStars, priorityTip } from "@/lib/format";

/** 教材标注优先级（P1～P3）的“推荐指数”徽章；无标注不渲染 */
export function PriorityBadge({
  priority,
  className = "",
  showLabel = true,
}: {
  priority?: string | null;
  className?: string;
  /** 仅展示星标、隐藏“推荐指数”文字（用于右上角等简洁场景） */
  showLabel?: boolean;
}) {
  const level = String(priority || "").trim().toUpperCase();
  const stars = priorityStars(level);
  if (!stars || !level) return null;
  // 仅星标模式：无气泡背景，纯星标
  if (!showLabel) {
    return (
      <span
        title={priorityTip(level)}
        className={`inline-block whitespace-nowrap text-base leading-none tracking-tight ${className}`}
        aria-label={`推荐指数 ${stars}`}
      >
        {stars}
      </span>
    );
  }
  const tone =
    level === "P1"
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : level === "P2"
        ? "border-sea/25 bg-[#f0f7ff] text-sea-deep"
        : "border-neutral-border bg-neutral-bg text-neutral-text";
  return (
    <span
      title={priorityTip(level)}
      className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone} ${className}`}
    >
      推荐指数 {stars}
    </span>
  );
}
