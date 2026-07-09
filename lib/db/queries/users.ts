import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

type NewUser = typeof users.$inferInsert;

/**
 * Single-owner mode (T9): resolves the one fixed owner user row, creating it
 * on first run. Returns the oldest existing row if the table is non-empty
 * (preserves any pre-existing data); otherwise inserts one with a random id,
 * OWNER_EMAIL (or a fallback), and the schema's default name/currency/theme.
 * The insert uses onConflictDoNothing on the unique email column, then
 * re-SELECTs the oldest row, so two concurrent first-hits converge on one row
 * instead of racing.
 */
export async function getOrCreateOwner(): Promise<User> {
  const [existing] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
  if (existing) return existing;

  await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: process.env.OWNER_EMAIL ?? "owner@goals.local",
    })
    .onConflictDoNothing({ target: users.email });

  const [row] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!row) {
    throw new Error("getOrCreateOwner: failed to create or find the owner user");
  }
  return row;
}

export async function updateUserProfile(
  id: string,
  values: Partial<Pick<NewUser, "name" | "avatarUrl" | "defaultCurrency" | "theme" | "reflectionDay">>,
): Promise<User | null> {
  const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning();
  return row ?? null;
}

export async function setUserFocusGoal(userId: string, goalId: string | null): Promise<void> {
  await db.update(users).set({ focusGoalId: goalId }).where(eq(users.id, userId));
}
