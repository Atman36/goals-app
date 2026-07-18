"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getLatestReflectionBefore, upsertReflection } from "@/lib/db/queries/reflections";
import { reflectionInputSchema } from "@/lib/validators/reflection";
import { todayKey } from "@/lib/utils/date-keys";
import { weekStartKey } from "@/lib/utils/week-keys";

export type ReflectionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const GENERIC_ERROR = "Не удалось сохранить рефлексию, попробуйте ещё раз";
const MISSING_OUTCOME_ERROR = "Отметьте исход прошлого обещания";

/** Saves (upserts) this week's reflection — the 5 questions plus, when a
 *  previous promise exists, its outcome (growth-reactor v5 §6/§11/§12: a
 *  completed promise cycle is the product's North Star). weekStart is always
 *  server-computed from the current date, never trusted from the client. */
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
  });
  if (!parsed.success) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const weekStart = weekStartKey(todayKey());
  const prev = await getLatestReflectionBefore(user.id, weekStart);
  if (prev?.promise?.trim() && !parsed.data.prevOutcome) {
    return { status: "error", message: MISSING_OUTCOME_ERROR };
  }

  const saved = await upsertReflection(user.id, weekStart, parsed.data);
  if (!saved) return { status: "error", message: GENERIC_ERROR };

  revalidatePath("/reflections");
  revalidatePath("/review");
  revalidatePath("/today"); // the global streak may change

  return { status: "success", message: "Сохранено ✓" };
}
