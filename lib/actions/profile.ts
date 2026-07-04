"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { updateUserProfile } from "@/lib/db/queries/users";
import { profileSchema } from "@/lib/validators/profile";

export type ProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const GENERIC_ERROR = "Не удалось сохранить настройки, попробуйте ещё раз";

// One year, matches the DB as the source of truth — this cookie only mirrors
// `users.theme` so app/layout.tsx can render the right <html> class on the
// very first response (no flash of the wrong theme).
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function updateProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Не авторизовано" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    defaultCurrency: formData.get("defaultCurrency"),
    theme: formData.get("theme"),
    reflectionDay: formData.get("reflectionDay"),
  });
  if (!parsed.success) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const updated = await updateUserProfile(user.id, parsed.data);
  if (!updated) return { status: "error", message: GENERIC_ERROR };

  const cookieStore = await cookies();
  cookieStore.set("theme", updated.theme, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  revalidatePath("/settings");

  return { status: "success", message: "Настройки сохранены" };
}
