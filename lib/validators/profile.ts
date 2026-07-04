import { z } from "zod";

// PRD §3.8 profile fields. reflectionDay matches the users.reflection_day
// column's own contract (smallint comment: "0=Sunday..6=Saturday").
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  defaultCurrency: z.enum(["RUB", "USD"]),
  theme: z.enum(["light", "dark"]),
  reflectionDay: z.coerce.number().int().min(0).max(6),
});

export type ProfileInput = z.infer<typeof profileSchema>;
