import { z } from "zod";
import { checklistItemKindSchema, ifThenPlanSchema } from "@/lib/validators/checklist";
import { currencySchema, goalKindSchema } from "@/lib/validators/goal";
import { checkinOutcomeValues } from "@/lib/validators/checkin";
import { logger } from "@/lib/log";

// T7 (PLAN §4 A3, docs/goals-app-audit-2026-07-20/product/ANALYTICS_SPEC.md §2–3).
//
// TypeScript types are not a security boundary: until now `track()` wrote any
// object straight into pino, so one careless line could ship a goal title, a
// check-in note or the text of a promise into the logs — the class of leak that
// is never recalled. The boundary is now built two ways round:
//
//   1. BY CONSTRUCTION — an event property may only be a boolean, a number, or
//      a string from a declared closed vocabulary (an enum, or an id). Free
//      strings do not exist in this catalogue, so there is nothing for user
//      text to travel in. Objects are strict: an unknown key is an error, not
//      a silently dropped field.
//   2. SECOND LINE — rejectForbiddenContent() walks the parsed payload and
//      refuses telling key names carrying strings, plus any string that does
//      not look like a token or an id. It exists for the day someone adds an
//      enum field called `title`.
//
// Ids (uuid) are allowed: they carry no text. Note that these events are NOT
// the instruments of the four-week trial — pino is not retained on Vercel, so
// /metrics reads the database itself (PLAN §4). What matters here is the
// boundary, not the completeness of the catalogue.

const goalIdProps = {
  goal_id: z.uuid().optional(),
  goal_kind: goalKindSchema.optional(),
  currency: currencySchema.optional(),
};

/** A strict event variant carrying the common optional props (PRD §8.4). */
function eventSchema<N extends string, T extends z.ZodRawShape>(name: N, shape: T) {
  return z.strictObject({ name: z.literal(name), ...goalIdProps, ...shape });
}

const outcomeEnum = z.enum(checkinOutcomeValues);

/** 1–2 → low, 3 → mid, 4–5 → high, absent → none. A bucket, never the number
 *  itself: the daily feeling scale is a diary field, and its exact value is
 *  the person's, not the log's. */
export function feelingBucket(feeling: number | null | undefined): "low" | "mid" | "high" | "none" {
  if (feeling == null || !Number.isFinite(feeling)) return "none";
  if (feeling <= 2) return "low";
  if (feeling === 3) return "mid";
  return "high";
}

const count = z.number().int().nonnegative();

export const analyticsEventSchema = z.discriminatedUnion("name", [
  // --- existing catalogue (PRD §8.4) ---------------------------------------
  eventSchema("goal_created", {
    kind: goalKindSchema,
    has_woop: z.boolean(),
    has_concordance: z.boolean(),
    checklist_size: count,
  }),
  eventSchema("goal_achieved", {
    kind: goalKindSchema,
    days_to_achieve: z.number(),
    progress_events_count: count,
  }),
  eventSchema("goal_archived", {
    kind: goalKindSchema,
    progress_pct: z.number(),
  }),
  // Spelled out rather than built by eventSchema(): `currency` is REQUIRED
  // here, and a generic spread cannot be seen to override the common optional.
  z.strictObject({
    name: z.literal("contribution_added"),
    goal_id: z.uuid().optional(),
    goal_kind: goalKindSchema.optional(),
    currency: currencySchema,
    // The exact amount never leaves lib/utils/money.ts — only its bucket.
    amount_bucket: z.enum(["<1k", "1k-10k", ">10k"]),
    is_preset: z.boolean(),
    is_negative: z.boolean(),
  }),
  eventSchema("woop_completed", {}),
  eventSchema("checklist_item_added", { kind: checklistItemKindSchema }),
  eventSchema("checklist_item_done", {}),
  eventSchema("comment_added", { has_media: z.boolean() }),
  eventSchema("media_uploaded", { context: z.enum(["cover", "gallery", "comment"]) }),
  eventSchema("gallery_opened", { scope: z.enum(["goal", "global"]) }),
  // `code` and `surface` used to be free strings — the one place a stack trace
  // or a message could have slipped in. Both are closed vocabularies now:
  // widening them means editing these lists on purpose.
  eventSchema("error_shown", {
    code: z.enum(["validation", "not_found", "forbidden", "conflict", "stale", "server", "network"]),
    surface: z.enum([
      "dashboard",
      "goal",
      "today",
      "reflections",
      "review",
      "gallery",
      "metrics",
      "settings",
    ]),
  }),

  // --- the methodology cycle (T7) ------------------------------------------
  eventSchema("checkin_saved", {
    outcome: outcomeEnum,
    feeling_bucket: z.enum(["low", "mid", "high", "none"]),
    has_note: z.boolean(),
  }),
  eventSchema("reflection_saved", {
    /** How many of the five weekly questions were answered — a count, never
     *  the answers. */
    answers_filled: z.number().int().min(0).max(5),
    has_promise: z.boolean(),
    promise_has_goal: z.boolean(),
    has_if_then: z.boolean(),
  }),
  // North Star: a promise met a recorded outcome — including an honest
  // "не в этот раз". Emitted once, when the outcome is first registered.
  eventSchema("weekly_cycle_completed", {
    outcome: outcomeEnum,
    had_if_then: z.boolean(),
  }),
  eventSchema("focus_goal_set", {}),
  eventSchema("if_then_structured", {
    // Absent on removal: the deleted step's plan type would cost an extra read
    // inside the goal lock, and the operation itself is the signal.
    plan_type: ifThenPlanSchema.shape.planType.optional(),
    operation: z.enum(["created", "updated", "removed"]),
  }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

/** Every event name the catalogue knows — used by the boundary test to prove
 *  no event was added without being covered. */
export const ANALYTICS_EVENT_NAMES = analyticsEventSchema.options.map(
  (option) => option.shape.name.value as string,
);

// Telling key names, matched case-insensitively on the WHOLE key. Whole-key
// matching is deliberate: `has_note` is a boolean bit about a note, not a
// note, and a substring rule would reject it while catching nothing extra —
// a string under any of these names is rejected below regardless of nesting.
const FORBIDDEN_KEYS = new Set([
  "title",
  "name",
  "text",
  "note",
  "notes",
  "promise",
  "promised",
  "answer",
  "answers",
  "comment",
  "message",
  "body",
  "caption",
  "description",
  "reason",
  "email",
  "phone",
  "url",
  "path",
  "filename",
  "query",
  "stack",
]);

/** A string a closed vocabulary can produce: an enum token (`done`, `RUB`), a
 *  bucket label («<1k»), or a uuid. Anything containing whitespace or a
 *  non-ASCII letter — i.e. anything written by a person — fails. A single
 *  Latin word would slip past this rule, which is why it is the SECOND line:
 *  the strict schema above has already refused any field that is not an enum. */
const TOKEN_RE = /^[A-Za-z0-9_<>+.:-]{1,64}$/;

/** Second line of the boundary (see the header). Throws on the first
 *  violation; never includes the offending value in the message, because the
 *  message itself is logged.
 *
 *  `name` at the top level is the discriminator — a literal from the closed
 *  list above — so it is exempt there and forbidden anywhere else. */
export function rejectForbiddenContent(payload: unknown, path: string[] = []): void {
  if (payload == null || typeof payload === "boolean" || typeof payload === "number") return;

  if (typeof payload === "string") {
    const key = path[path.length - 1] ?? "";
    if (FORBIDDEN_KEYS.has(key.toLowerCase()) && !(path.length === 1 && key === "name")) {
      throw new Error(`analytics: forbidden key "${path.join(".")}" carries a string`);
    }
    if (!TOKEN_RE.test(payload)) {
      throw new Error(`analytics: free text in "${path.join(".") || "<root>"}"`);
    }
    return;
  }

  if (Array.isArray(payload)) {
    payload.forEach((item, i) => rejectForbiddenContent(item, [...path, String(i)]));
    return;
  }

  if (typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      rejectForbiddenContent(value, [...path, key]);
    }
    return;
  }

  throw new Error(`analytics: unsupported value type in "${path.join(".") || "<root>"}"`);
}

/** Dev throws so the author sees it immediately; production drops the event
 *  and records one content-free line — swallowing it silently would hide the
 *  leak, and logging the object would BE the leak (ANALYTICS_SPEC §3). */
function refuse(reason: string, name: unknown): void {
  if (process.env.NODE_ENV !== "production") throw new Error(reason);
  logger.warn(
    {
      analyticsRejected: {
        reason,
        // Only a name the catalogue already knows is echoed back.
        name: ANALYTICS_EVENT_NAMES.includes(name as string) ? (name as string) : "unknown",
      },
    },
    "analytics event rejected",
  );
}

/**
 * Structured analytics sink. Parses the event against the runtime catalogue and
 * walks it for forbidden content BEFORE writing anything; PostHog wiring is
 * Phase 2 (PRD §9) and slots in here without call-site changes.
 *
 * The signature is unchanged on purpose — existing tests mock this module.
 */
export function track(event: AnalyticsEvent): void {
  const parsed = analyticsEventSchema.safeParse(event);
  if (!parsed.success) {
    // Issue PATHS only — an issue's `received` value would carry the very text
    // this boundary exists to stop.
    const where = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    refuse(`analytics: event failed schema (${where || "name"})`, (event as { name?: unknown })?.name);
    return;
  }

  try {
    rejectForbiddenContent(parsed.data);
  } catch (error) {
    refuse(error instanceof Error ? error.message : "analytics: forbidden content", parsed.data.name);
    return;
  }

  logger.info({ analytics: parsed.data }, parsed.data.name);
}
