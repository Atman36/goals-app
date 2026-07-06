import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, woopEntries, type NewWoopEntry, type WoopEntry } from "@/lib/db/schema";

// T12 will extend this file (edit/read WOOP for the goal page) — kept minimal
// here to just what T11's wizard-create flow needs.

export async function insertWoopEntry(
  userId: string,
  goalId: string,
  values: Pick<NewWoopEntry, "wish" | "outcome" | "obstacle" | "plan">,
): Promise<WoopEntry | null> {
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId), isNull(goals.deletedAt)))
    .limit(1);
  if (!goal) return null;

  const [row] = await db
    .insert(woopEntries)
    .values({ ...values, goalId })
    .returning();
  return row;
}
