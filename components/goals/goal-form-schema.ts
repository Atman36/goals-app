import { z } from "zod";
import { GOAL_SPHERES } from "@/lib/spheres";

// Form-facing mirror of lib/validators/goal.ts's `goalSchema`, but in the
// shapes an HTML form actually produces (plain strings, incl. amounts in
// MAJOR units as digit strings) instead of domain types (bigint minor units,
// coerced Date). This schema is UX-only — lib/actions/goals.ts converts and
// re-validates with the real `goalSchema` before touching the DB, which is
// the actual gate. Kept alongside goal-form.tsx (not under lib/validators/**,
// which T6 must only import from) since it's the client-side half of that
// split.
//
// A flat object + superRefine (rather than a discriminatedUnion like the
// domain schema) so every field has one static type across both kinds —
// react-hook-form's Path<T>/resolver typing needs that to register financial
// fields (currencySymbol/targetAmountMajor/initialAmountMajor) cleanly.
//
// Cover image is not a field here: it's uploaded out-of-band via
// lib/actions/media.ts (createSignedUpload → upload → registerMedia sets
// coverImageId directly), never routed through createGoal/updateGoal.

const POSITIVE_INT_RE = /^\d+$/;

export const clientGoalSchema = z
  .object({
    kind: z.enum(["financial", "non_financial"]),
    title: z.string().trim().min(3, "От 3 до 60 символов").max(60, "От 3 до 60 символов"),
    description: z.string().max(4000).optional().or(z.literal("")),
    deadline: z
      .string()
      .min(1, "Укажите срок")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Некорректная дата"),
    // `.or(z.literal(""))`: the hidden input backing this field (goal-form.tsx)
    // renders "" for a non-financial goal (HTML has no concept of an
    // `undefined` field value) — without this, the base shape rejects that ""
    // as an invalid enum member on every non-financial submit, and since the
    // error is only ever displayed inside the financial branch, the button
    // silently does nothing.
    currencySymbol: z.enum(["RUB", "USD"]).optional().or(z.literal("")),
    targetAmountMajor: z.string().optional(),
    initialAmountMajor: z.string().optional(),
    // Same idiom as currencySymbol: a native <select> always sends a string,
    // so "" (no HTML value for "unset") stands in for "no sphere chosen".
    sphere: z.enum(GOAL_SPHERES).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.kind !== "financial") return;

    if (!data.currencySymbol) {
      ctx.addIssue({ code: "custom", path: ["currencySymbol"], message: "Укажите валюту" });
    }

    const target = data.targetAmountMajor?.trim() ?? "";
    if (!POSITIVE_INT_RE.test(target) || Number(target) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["targetAmountMajor"],
        message: "Целое число больше нуля",
      });
    }

    const initial = data.initialAmountMajor?.trim() ?? "";
    if (initial !== "" && !POSITIVE_INT_RE.test(initial)) {
      ctx.addIssue({ code: "custom", path: ["initialAmountMajor"], message: "Целое число" });
    }
  });

export type ClientGoalInput = z.infer<typeof clientGoalSchema>;
