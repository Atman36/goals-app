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
  const offset = circumference * (1 - clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        className="fill-none stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground text-[10px] font-medium"
        style={{ transformOrigin: "center", transformBox: "fill-box" }}
      >
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  );
}
