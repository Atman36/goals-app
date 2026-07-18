import { describe, expect, it } from "vitest";
import { buildTrajectory, type TrajectoryWeek } from "@/lib/utils/trajectory";

type Input = Parameters<typeof buildTrajectory>[0];

// createdAt is a Monday (ISO week start), so its week key equals its date key.
const baseGoal = {
  title: "Накопить",
  createdAt: new Date("2026-06-15T10:00:00Z"),
  achievedAt: null,
  currency: "RUB" as const,
};

function build(partial: Partial<Input> = {}): TrajectoryWeek[] {
  return buildTrajectory({
    goal: partial.goal ?? baseGoal,
    contributions: partial.contributions ?? [],
    steps: partial.steps ?? [],
    comments: partial.comments ?? [],
    media: partial.media ?? [],
    checkins: partial.checkins ?? [],
    revisions: partial.revisions ?? [],
  });
}

const events = (weeks: TrajectoryWeek[]) => weeks.flatMap((w) => w.events);

describe("buildTrajectory", () => {
  it("puts the created event in the creation week and never returns an empty week", () => {
    const weeks = build();
    const creationWeek = weeks.find((w) => w.weekStart === "2026-06-15");
    expect(creationWeek).toBeDefined();
    expect(creationWeek!.events.some((e) => e.kind === "created")).toBe(true);
    expect(creationWeek!.events[0].text).toBe("Цель поставлена");
    for (const w of weeks) {
      expect(w.events.length > 0 || w.checkins !== null).toBe(true);
    }
  });

  it("returns weeks newest-first and skips weeks with no events or check-ins", () => {
    const weeks = build({ contributions: [{ occurredAt: "2026-07-06", amount: 100000n, note: null }] });
    // Weeks 2026-06-22 and 2026-06-29 have nothing → dropped.
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-07-06", "2026-06-15"]);
  });

  it("aggregates a week's check-ins into one summary with averaged feeling", () => {
    const weeks = build({
      checkins: [
        { date: "2026-06-22", outcome: "done", feeling: 2 },
        { date: "2026-06-24", outcome: "partial", feeling: 4 },
      ],
    });
    const week = weeks.find((w) => w.weekStart === "2026-06-22");
    expect(week).toBeDefined();
    expect(week!.checkins).toEqual({ total: 2, done: 1, partial: 1, skipped: 0, avgFeeling: 3 });
    expect(week!.events).toHaveLength(0);
  });

  it("includes gallery photos but excludes comment-attached media", () => {
    const weeks = build({
      media: [
        { commentId: null, goalId: "g1", createdAt: new Date("2026-06-16T09:00:00Z") },
        { commentId: "c1", goalId: null, createdAt: new Date("2026-06-16T09:00:00Z") },
      ],
    });
    const photos = events(weeks).filter((e) => e.kind === "photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].text).toBe("Фото добавлено");
  });

  it("shows only completed steps with a done date, at the done week", () => {
    const weeks = build({
      steps: [
        { title: "Открыть счёт", isDone: true, doneAt: new Date("2026-06-23T08:00:00Z") },
        { title: "Собрать документы", isDone: false, doneAt: null },
        { title: "Помечен, но без даты", isDone: true, doneAt: null },
      ],
    });
    const steps = events(weeks).filter((e) => e.kind === "step_done");
    expect(steps).toHaveLength(1);
    expect(steps[0].detail).toBe("Открыть счёт");
    expect(weeks.find((w) => w.weekStart === "2026-06-22")!.events.some((e) => e.kind === "step_done")).toBe(true);
  });

  it("formats revision events with RU field names and prior title only when title changed", () => {
    const weeks = build({
      revisions: [
        { title: "Старое имя", description: null, deadline: "2026-12-31", changed: ["title", "deadline"], changedAt: new Date("2026-06-17T08:00:00Z") },
        { title: "Другое", description: "x", deadline: "2026-11-30", changed: ["description"], changedAt: new Date("2026-06-18T08:00:00Z") },
      ],
    });
    const revs = events(weeks).filter((e) => e.kind === "revision");
    expect(revs).toHaveLength(2);
    const withTitle = revs.find((e) => e.text.includes("название"))!;
    expect(withTitle.text).toBe("Формулировка обновлена (название, срок)");
    expect(withTitle.detail).toBe("Было: «Старое имя»");
    const descOnly = revs.find((e) => e.text === "Формулировка обновлена (описание)")!;
    expect(descOnly.detail).toBeUndefined();
  });

  it("emits the achieved event only when achievedAt is set", () => {
    expect(events(build()).some((e) => e.kind === "achieved")).toBe(false);
    const achieved = build({ goal: { ...baseGoal, achievedAt: new Date("2026-07-06T12:00:00Z") } });
    const ev = events(achieved).find((e) => e.kind === "achieved");
    expect(ev).toBeDefined();
    expect(ev!.text).toBe("Цель достигнута");
    expect(ev!.dateKey).toBe("2026-07-06");
  });

  it("renders contribution events at occurredAt with a signed amount", () => {
    const weeks = build({
      contributions: [
        { occurredAt: "2026-06-16", amount: 500000n, note: "зарплата" },
        { occurredAt: "2026-06-17", amount: -100000n, note: null },
      ],
    });
    const evs = events(weeks).filter((e) => e.kind === "contribution");
    const positive = evs.find((e) => e.detail === "зарплата")!;
    expect(positive.text.startsWith("Взнос +")).toBe(true);
    const negative = evs.find((e) => e.text.startsWith("Взнос −"))!;
    expect(negative).toBeDefined();
    expect(weeks.find((w) => w.weekStart === "2026-06-15")!.events.some((e) => e.kind === "contribution")).toBe(true);
  });

  it("orders events within a week newest-first by date", () => {
    const weeks = build({ contributions: [{ occurredAt: "2026-06-19", amount: 100000n, note: "поздний" }] });
    const week = weeks.find((w) => w.weekStart === "2026-06-15")!;
    expect(week.events[0].dateKey).toBe("2026-06-19");
    expect(week.events[week.events.length - 1].kind).toBe("created");
  });
});
