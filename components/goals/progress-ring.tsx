export function ProgressRing({
  progress, // 0..1
  size = 56,
  strokeWidth = 5,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        className="fill-none stroke-foreground/9"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        className="fill-none stroke-primary transition-[stroke-dasharray] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground font-display text-[10px] font-bold"
        style={{ transformOrigin: "center", transformBox: "fill-box" }}
      >
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  );
}
