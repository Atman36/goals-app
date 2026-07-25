"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import type { Reflection } from "@/lib/db/schema";
import { listGoals } from "@/lib/db/queries/goals";
import { withLockedLiveGoal } from "@/lib/db/queries/parent-lock";
import { getLatestReflectionBefore, upsertReflection } from "@/lib/db/queries/reflections";
import { reflectionInputSchema, resolveReflectionWeek } from "@/lib/validators/reflection";

export type ReflectionState = {
  /** "stale" = the week rolled over while the form was open (CR-030). The
   *  answers were NOT saved; the user must reload to get the new week's form. */
  status: "idle" | "success" | "error" | "stale";
  message?: string;
};

const GENERIC_ERROR = "Не удалось сохранить рефлексию, попробуйте ещё раз";
const MISSING_OUTCOME_ERROR = "Отметьте исход прошлого обещания";
const STALE_WEEK_ERROR =
  "Неделя сменилась, пока форма была открыта — ответы не сохранены. Обновите страницу, чтобы заполнить рефлексию новой недели.";
const GOAL_REQUIRED_ERROR = "Выберите цель, к которой относится обещание";
const GOAL_NOT_FOUND_ERROR = "Цель не найдена или удалена";

/** Saves (upserts) this week's reflection — the 5 questions plus, when a
 *  previous promise exists, its outcome (growth-reactor v5 §6/§11/§12: a
 *  completed promise cycle is the product's North Star).
 *
 *  weekStart is always server-derived, never taken from the client. The form
 *  posts the week it was rendered for (`expectedWeekStart`) purely so this
 *  action can detect a week boundary crossed between render and submit and
 *  refuse the write instead of filing the answers under the wrong week — see
 *  the week-token contract in lib/validators/reflection.ts (CR-030). */
export async function saveReflection(
  _prevState: ReflectionState,
  formData: FormData,
): Promise<ReflectionState> {
  const user = await getCurrentUser();

  const parsed = reflectionInputSchema.safeParse({
    promised: formData.get("promised"),
    done: formData.get("done"),
    blocked: formData.get("blocked"),
    learned: formData.get("learned"),
    promise: formData.get("promise"),
    prevOutcome: formData.get("prevOutcome") || undefined,
    newIfThen: formData.get("newIfThen"),
    promiseGoalId: formData.get("promiseGoalId") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: GENERIC_ERROR };
  }

  // CR-030: reject rather than silently rewrite the target week.
  const week = resolveReflectionWeek(formData.get("expectedWeekStart"));
  if (!week.ok) {
    return { status: "stale", message: STALE_WEEK_ERROR };
  }
  const weekStart = week.weekStart;

  const prev = await getLatestReflectionBefore(user.id, weekStart);
  if (prev?.promise?.trim() && !parsed.data.prevOutcome) {
    return { status: "error", message: MISSING_OUTCOME_ERROR };
  }

  const { promiseGoalId } = parsed.data;

  // Decisions D1/D3: a goal is required whenever the user has one to point
  // at; the ownership check happens under the SAME lock as the write (GA-015
  // idiom — see lib/db/queries/parent-lock.ts), not in an earlier round trip
  // a concurrent soft-delete could race. A promise with no goal (D2/D4) never
  // opens a transaction at all — there is no parent row to hold.
  let saved: Reflection | null;
  if (promiseGoalId) {
    saved = await withLockedLiveGoal(user.id, promiseGoalId, (tx) =>
      upsertReflection(user.id, weekStart, parsed.data, tx),
    );
    if (!saved) return { status: "error", message: GOAL_NOT_FOUND_ERROR };
  } else {
    const activeGoals = await listGoals(user.id, { status: "active" });
    if (activeGoals.length > 0) {
      return { status: "error", message: GOAL_REQUIRED_ERROR };
    }
    saved = await upsertReflection(user.id, weekStart, parsed.data);
    if (!saved) return { status: "error", message: GENERIC_ERROR };
  }

  revalidatePath("/reflections");
  revalidatePath("/review");
  revalidatePath("/today"); // the global streak may change

  return { status: "success", message: "Сохранено ✓" };
}
