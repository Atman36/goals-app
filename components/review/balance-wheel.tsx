import type { BalanceWheelData } from "@/lib/utils/balance-wheel";
import { pluralRu } from "@/lib/utils/plural";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 108;
const SECTOR_DEG = 360 / 8;
const MIN_OPACITY = 0.08; // floor so an empty wheel still shows its 8 sectors

// Sector boundary point on the wheel's circle for a given angle (degrees,
// 0° = 12 o'clock, increasing clockwise).
function pointAt(angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CENTER + RADIUS * Math.cos(rad), CENTER + RADIUS * Math.sin(rad)];
}

function sectorPath(index: number): string {
  const [x1, y1] = pointAt(index * SECTOR_DEG);
  const [x2, y2] = pointAt((index + 1) * SECTOR_DEG);
  return `M ${CENTER},${CENTER} L ${x1},${y1} A ${RADIUS},${RADIUS} 0 0 1 ${x2},${y2} Z`;
}

function joinLabels(labels: string[]): string {
  return labels.join(", ");
}

/** Server-compatible (no "use client", no hooks) — the weekly review page is
 *  a server component. All information is readable from the legend/summary
 *  text alone; the SVG is illustrative only (Stage0-4 decision: honest,
 *  text-labeled wheel, no color-only encoding). */
export function BalanceWheel({ data }: { data: BalanceWheelData }) {
  const { slices, unassignedGoals, maxWeekEvents } = data;
  const emptySpheres = slices.filter((s) => s.activeGoals === 0);
  const noMovementSpheres = slices.filter((s) => s.activeGoals > 0 && s.weekEvents === 0);

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto w-full max-w-60"
        aria-hidden="true"
      >
        {slices.map((slice, i) => {
          const opacity =
            maxWeekEvents > 0 ? Math.max(MIN_OPACITY, slice.weekEvents / maxWeekEvents) : MIN_OPACITY;
          const isEmpty = slice.activeGoals === 0;
          return (
            <path
              key={slice.sphere}
              d={sectorPath(i)}
              className={isEmpty ? "fill-primary stroke-foreground/30" : "fill-primary stroke-border"}
              style={{ opacity }}
              strokeWidth={1}
              strokeDasharray={isEmpty ? "4 3" : undefined}
            />
          );
        })}
      </svg>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {slices.map((slice) => {
          const muted = slice.activeGoals === 0 && slice.weekEvents === 0;
          return (
            <li
              key={slice.sphere}
              className={muted ? "text-xs text-muted-foreground" : "text-xs text-foreground"}
            >
              {slice.label} — {slice.activeGoals}{" "}
              {pluralRu(slice.activeGoals, "цель", "цели", "целей")} ·{" "}
              {slice.weekEvents} {pluralRu(slice.weekEvents, "событие", "события", "событий")}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {emptySpheres.length > 0 ? <p>Без целей: {joinLabels(emptySpheres.map((s) => s.label))}</p> : null}
        {noMovementSpheres.length > 0 ? (
          <p>Без движения за неделю: {joinLabels(noMovementSpheres.map((s) => s.label))}</p>
        ) : null}
        {unassignedGoals > 0 ? (
          <p>
            Без сферы: {unassignedGoals} {pluralRu(unassignedGoals, "цель", "цели", "целей")} —
            укажите сферу в настройках цели
          </p>
        ) : null}
      </div>
    </div>
  );
}
