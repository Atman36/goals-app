import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

import { getCurrentUser } from "@/lib/auth";
import { getFocusGoal } from "@/lib/db/queries/agenda";
import { listGoals, type GoalWithProgress } from "@/lib/db/queries/goals";
import { getGlobalConsistency } from "@/lib/db/queries/streaks";
import { getCheckinForGoalOnDate } from "@/lib/db/queries/checkins";
import { getLatestReflectionBefore, getReflectionByWeek } from "@/lib/db/queries/reflections";
import { listChecklistItems } from "@/lib/db/queries/checklist";
import { getRecentPlanAdjustmentForGoal } from "@/lib/db/queries/plan-adjustments";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";
import { daysLeftInWeek, promiseCardState } from "@/lib/utils/promise-card";
import { consistencyBadgeState } from "@/lib/utils/consistency-badge";
import { toAdjustmentStepOptions } from "@/lib/utils/adjustment-step";
import { pickTodayStep, todayStepCaption } from "@/lib/utils/today-step";
import { homeBlocks, orderHomeGoalRows } from "@/lib/utils/home-blocks";
import { formatMoney } from "@/lib/utils/money";
import { pluralRu } from "@/lib/utils/plural";
import type { Currency } from "@/lib/validators/goal";
import { CheckinCard } from "@/components/goals/checkin-card";
import { ConsistencyBadge } from "@/components/goals/consistency-badge";
import { FocusPicker, type FocusPickerGoal } from "@/components/goals/focus-picker";
import { GoalRow } from "@/components/goals/goal-row";
import { WeeklyPromiseCard } from "@/components/goals/weekly-promise-card";
import { Button } from "@/components/ui/button";

// The home page: день → ритм → путь.
//
// It is a COMPOSITION of independent blocks, never a switch over a screen
// state (B3). The mockup shipped six mutually exclusive states, but in real
// life they stack: somebody back after three weeks almost certainly has an
// unclosed promise; a day can be marked while the week is still open. Every
// condition lives in lib/utils/home-blocks.ts so the combinations the mockup
// never drew are pinned by tests rather than discovered in production.
//
// The goal list, its filters and archive moved to /goals; so did «Шаги» and
// «Дедлайны» (C5). This page answers «что сегодня», that one «что на подходе».

/** The subtitle under a goal in the focus picker. Formatted here, on the
 *  server: the picker is a client component and money is bigint minor units
 *  end-to-end — it must never cross that boundary as a raw value. */
function pickerSubtitle(goal: GoalWithProgress): string {
  const deadline = `срок ${format(parseISO(goal.deadline), "d MMMM", { locale: ru })}`;
  if (goal.kind === "financial") {
    const currency = goal.currency as Currency;
    return `${formatMoney(goal.saved, currency)} из ${formatMoney(goal.targetAmount ?? 0n, currency)} · ${deadline}`;
  }
  const steps = pluralRu(goal.checklistTotal, "шага", "шагов", "шагов");
  return `${goal.checklistDone} из ${goal.checklistTotal} ${steps} · ${deadline}`;
}

const panelClassName =
  "flex flex-col gap-4 rounded-[18px] border border-border bg-card p-[clamp(16px,1.9vw,22px)]";

export default async function HomePage() {
  const user = await getCurrentUser();
  const today = todayKey();
  const weekStart = weekStartKey(today);

  const [focusGoal, activeGoals, consistency, currentReflection, previousReflection] =
    await Promise.all([
      getFocusGoal(user.id),
      listGoals(user.id, { status: "active", sort: "deadline" }),
      getGlobalConsistency(user.id),
      getReflectionByWeek(user.id, weekStart),
      getLatestReflectionBefore(user.id, weekStart),
    ]);

  const checkin = focusGoal ? await getCheckinForGoalOnDate(user.id, focusGoal.id, today) : null;
  const [checklistItems, recentAdjustment] = focusGoal
    ? await Promise.all([
        listChecklistItems(user.id, focusGoal.id),
        getRecentPlanAdjustmentForGoal(user.id, focusGoal.id),
      ])
    : [[], null];

  const badge = consistencyBadgeState(consistency);

  // T6 (PLAN §5 B2): the weekly promise lives here every day, not only on
  // /reflections. `unclosed-previous` is its own band above the week block —
  // registering an outcome (including an honest «не в этот раз») is what closes
  // a cycle, the product's North Star (Decisions #6).
  const promiseStates = promiseCardState({
    currentWeek: currentReflection
      ? {
          promise: currentReflection.promise,
          prevOutcome: currentReflection.prevOutcome,
          goal: currentReflection.promiseGoal,
        }
      : null,
    previousWeek: previousReflection
      ? {
          promise: previousReflection.promise,
          goal: previousReflection.promiseGoal,
          weekStart: previousReflection.weekStart,
        }
      : null,
    todayKey: today,
  });
  const unclosedPrevious = promiseStates.filter((s) => s.kind === "unclosed-previous");
  const currentPromise = promiseStates.find((s) => s.kind !== "unclosed-previous") ?? null;

  const blocks = homeBlocks({
    hasGoals: activeGoals.length > 0,
    hasFocusGoal: focusGoal !== null,
    checkedInToday: checkin !== null,
    rhythmVisible: badge.visible,
    returnedAfterGap: badge.returnNote !== null,
    hasCurrentPromise: currentPromise !== null && currentPromise.kind !== "none",
    hasUnclosedPromise: unclosedPrevious.length > 0,
  });

  const todayStep = focusGoal ? pickTodayStep(checklistItems, focusGoal.kind) : null;
  const goalRows = orderHomeGoalRows(activeGoals, focusGoal?.id ?? null);
  const pickerGoals: FocusPickerGoal[] = activeGoals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    subtitle: pickerSubtitle(goal),
  }));

  // C6: the proza, not the markup — «в будни только тихая ссылка "разобрать
  // неделю", кнопкой она становится с субботы». daysLeftInWeek is 1 on
  // Saturday and 0 on Sunday.
  const weekReviewIsPrimary = daysLeftInWeek(today) <= 1;

  return (
    <div className="flex flex-col gap-[clamp(12px,1.4vw,16px)]">
      <section className="flex flex-col gap-[clamp(14px,1.4vw,18px)] rounded-[20px] border border-surface-focus-ring bg-surface-focus p-[clamp(18px,2.3vw,28px)]">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 font-mono text-xs text-muted-foreground">
          <span>{format(parseISO(today), "EEEE, d MMMM", { locale: ru })}</span>
          {focusGoal ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">цель №1 — {focusGoal.title}</span>
            </>
          ) : null}
        </div>

        {/* C2: the neutral return block. No fire, no «ничего не сгорело» — the
            product has no burning mechanic left to remind anyone of, and saying
            so at the most vulnerable moment reintroduces the very idea the
            rolling window removed. Two plain lines instead, measured in weeks
            because weeks are the only unit the rhythm is measured in (B5). */}
        {blocks.showReturnBlock && badge.returnNote ? (
          /* bg-card, not bg-muted: muted-foreground over a 5% tint of the focus
             surface composites to 4.47:1, just under AA — and this is the very
             sentence C3 raised the token to make readable. On --card it is
             4.78:1 light and 5.55:1 dark, and it matches the note box below. */
          <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5">
            <span className="text-[14.5px] font-semibold text-foreground text-pretty">
              {badge.returnNote}
            </span>
            {badge.returnFact ? (
              <span className="text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
                {badge.returnFact}
              </span>
            ) : null}
          </div>
        ) : null}

        {blocks.dayCard === "no-goals" || blocks.dayCard === "pick-focus" ? (
          <FocusPicker goals={pickerGoals} />
        ) : focusGoal ? (
          /* Keyed by the day. A check-in submitted after midnight is rejected
             as stale (GA-013) and the card offers a refresh; router.refresh()
             keeps client state, so without this key the new day's card would
             still hold yesterday's answers and would save them under today the
             moment the user touched a control. */
          <CheckinCard
            key={today}
            goalId={focusGoal.id}
            expectedDate={today}
            initial={
              checkin
                ? { outcome: checkin.outcome, feeling: checkin.feeling, note: checkin.note }
                : null
            }
            steps={toAdjustmentStepOptions(checklistItems)}
            lastAdjustmentAt={recentAdjustment?.createdAt ?? null}
            stepCaption={todayStepCaption(todayStep)}
          />
        ) : null}

        {/* Offered on return only: after a gap, the goal someone left may not be
            the goal they want to come back to. */}
        {blocks.showFocusSwitchLine && focusGoal ? (
          <div className="text-[13px] text-muted-foreground">
            Цель №1 всё ещё «{focusGoal.title}».{" "}
            {/* /goals, not this goal's own page: FocusToggle there only offers
                «Снять фокус», so the current goal is the one place you cannot
                switch FROM. Switching means picking another goal. */}
            <Link href="/goals" className="font-semibold text-primary hover:underline">
              Сменить
            </Link>
          </div>
        ) : null}
      </section>

      {blocks.showUnclosedPromise
        ? unclosedPrevious.map((state, i) => (
            <WeeklyPromiseCard key={`unclosed-${i}`} state={state} />
          ))
        : null}

      {blocks.showWeekBlock || blocks.showGoalsBlock ? (
        <div className="grid items-start gap-[clamp(12px,1.4vw,16px)] md:grid-cols-2">
          {blocks.showWeekBlock ? (
            <section className={panelClassName}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[15px] font-semibold tracking-tight">Неделя</h2>
                {weekReviewIsPrimary ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href="/reflections">разобрать неделю</Link>}
                  />
                ) : (
                  <Link
                    href="/reflections"
                    className="text-[13px] font-semibold text-primary hover:underline"
                  >
                    разобрать неделю
                  </Link>
                )}
              </div>
              {currentPromise ? (
                <WeeklyPromiseCard state={currentPromise} variant="compact" />
              ) : null}
              {blocks.showRhythm ? <ConsistencyBadge state={badge} /> : null}
            </section>
          ) : null}

          {blocks.showGoalsBlock ? (
            <section className={panelClassName}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[15px] font-semibold tracking-tight">
                  Куда это ведёт
                </h2>
                <Link
                  href="/goals"
                  className="text-[13px] font-semibold text-primary hover:underline"
                >
                  все цели
                </Link>
              </div>
              <div className="flex flex-col gap-2.5">
                {goalRows.rows.map((goal) => (
                  <GoalRow key={goal.id} goal={goal} isFocus={goal.id === focusGoal?.id} />
                ))}
              </div>
              {goalRows.hiddenCount > 0 ? (
                <span className="text-[13px] text-muted-foreground">
                  Ещё {goalRows.hiddenCount}{" "}
                  {pluralRu(goalRows.hiddenCount, "цель", "цели", "целей")} —{" "}
                  <Link href="/goals" className="font-semibold text-primary hover:underline">
                    открыть список
                  </Link>
                </span>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
