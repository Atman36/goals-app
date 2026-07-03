import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

type NewUser = typeof users.$inferInsert;

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/** Upserts by id (the Supabase auth user id) on first login. */
export async function upsertUser(values: NewUser): Promise<User> {
  const [row] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: values.email,
        name: values.name,
        avatarUrl: values.avatarUrl,
      },
    })
    .returning();
  return row;
}

export async function updateUserProfile(
  id: string,
  values: Partial<Pick<NewUser, "name" | "avatarUrl" | "defaultCurrency" | "theme" | "reflectionDay">>,
): Promise<User | null> {
  const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning();
  return row ?? null;
}
