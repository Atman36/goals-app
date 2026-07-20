import { z } from "zod";
import { GOAL_SPHERES } from "@/lib/spheres";
import { parseMajorAmountToMinor } from "@/lib/utils/money";
import { isCalendarDateKey } from "@/lib/validators/date-key";

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

const AMOUNT_RANGE_MESSAGE = "Слишком большая сумма";

/** Mirrors the server-side bound: the amount must survive the major→minor
 *  conversion and still fit the int8 column it lands in. Rejecting it here
 *  turns "the form submits and the action returns a generic error" into a
 *  field-level message. lib/actions/goals.ts re-checks — this half is UX only. */
function isAmountInRange(digits: string): boolean {
  return parseMajorAmountToMinor(digits) !== null;
}

export const clientGoalSchema = z
  .object({
    kind: z.enum(["financial", "non_financial"]),
    title: z.string().trim().min(3, "От 3 до 60 символов").max(60, "От 3 до 60 символов"),
    description: z.string().max(4000).optional().or(z.literal("")),
    // Same strict calendar-date rule the server applies (goalSchema →
    // lib/validators/date-key.ts). The old `new Date(v)` check accepted
    // "2026-02-31" because the Date constructor normalizes it to March 3.
    deadline: z.string().min(1, "Укажите срок").refine(isCalendarDateKey, "Некорректная дата"),
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
    } else if (!isAmountInRange(target)) {
      ctx.addIssue({ code: "custom", path: ["targetAmountMajor"], message: AMOUNT_RANGE_MESSAGE });
    }

    const initial = data.initialAmountMajor?.trim() ?? "";
    if (initial !== "" && !POSITIVE_INT_RE.test(initial)) {
      ctx.addIssue({ code: "custom", path: ["initialAmountMajor"], message: "Целое число" });
    } else if (initial !== "" && !isAmountInRange(initial)) {
      ctx.addIssue({ code: "custom", path: ["initialAmountMajor"], message: AMOUNT_RANGE_MESSAGE });
    }
  });

export type ClientGoalInput = z.infer<typeof clientGoalSchema>;
