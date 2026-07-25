import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  logger,
  withRequestId: () => logger,
}));

import {
  ANALYTICS_EVENT_NAMES,
  analyticsEventSchema,
  feelingBucket,
  rejectForbiddenContent,
  track,
  type AnalyticsEvent,
} from "@/lib/analytics/events";

// T7 (PLAN §4 A3). What is under test is not the catalogue but the BOUNDARY:
// after this, an event physically cannot carry user text — the attempt fails
// instead of being politely ignored. Every payload in FORBIDDEN below is a
// leak that the old typed-only `track()` would have written to the log.

const NODE_ENV = process.env.NODE_ENV;

/** NODE_ENV is read at call time inside track(), so it can be swapped per
 *  test. vitest sets it to "test", i.e. the throwing (development) branch. */
function withNodeEnv(value: string, run: () => void) {
  vi.stubEnv("NODE_ENV", value);
  try {
    run();
  } finally {
    vi.stubEnv("NODE_ENV", NODE_ENV ?? "test");
  }
}

const VALID_PAYLOADS: AnalyticsEvent[] = [
  {
    name: "goal_created",
    goal_id: "0b7c2a4e-1f3d-4a2b-8c9d-5e6f70819203",
    goal_kind: "financial",
    currency: "RUB",
    kind: "financial",
    has_woop: true,
    has_concordance: false,
    checklist_size: 3,
  },
  { name: "goal_achieved", kind: "non_financial", days_to_achieve: 42, progress_events_count: 0 },
  { name: "goal_archived", kind: "financial", progress_pct: 0.5 },
  {
    name: "contribution_added",
    currency: "USD",
    amount_bucket: "1k-10k",
    is_preset: false,
    is_negative: true,
  },
  { name: "woop_completed", goal_id: "0b7c2a4e-1f3d-4a2b-8c9d-5e6f70819203" },
  { name: "checklist_item_added", kind: "if_then" },
  { name: "checklist_item_done", goal_kind: "financial" },
  { name: "comment_added", has_media: true },
  { name: "media_uploaded", context: "cover" },
  { name: "gallery_opened", scope: "global" },
  { name: "error_shown", code: "validation", surface: "today" },
  { name: "checkin_saved", outcome: "partial", feeling_bucket: "low", has_note: true },
  {
    name: "reflection_saved",
    answers_filled: 5,
    has_promise: true,
    promise_has_goal: true,
    has_if_then: false,
  },
  { name: "weekly_cycle_completed", outcome: "skipped", had_if_then: true },
  { name: "focus_goal_set", goal_id: "0b7c2a4e-1f3d-4a2b-8c9d-5e6f70819203" },
  { name: "if_then_structured", plan_type: "relapse_prevention", operation: "created" },
];

// Each entry is a real leak someone could write by accident. All must fail.
const FORBIDDEN: { why: string; payload: unknown }[] = [
  {
    why: "goal title in a field of its own",
    payload: { name: "goal_created", kind: "financial", has_woop: false, has_concordance: false, checklist_size: 0, title: "Квартира в Тбилиси" },
  },
  {
    why: "check-in note",
    payload: { name: "checkin_saved", outcome: "done", feeling_bucket: "high", has_note: true, note: "сегодня было тяжело" },
  },
  {
    why: "the promise text",
    payload: { name: "weekly_cycle_completed", outcome: "done", had_if_then: false, promise: "бегать три раза" },
  },
  {
    why: "a reflection answer",
    payload: { name: "reflection_saved", answers_filled: 5, has_promise: true, promise_has_goal: true, has_if_then: false, answer: "понял, что устал" },
  },
  {
    why: "free string in a known field",
    payload: { name: "media_uploaded", context: "мои фото за июль" },
  },
  {
    why: "an unknown key, however innocent",
    payload: { name: "woop_completed", extra: 1 },
  },
  {
    why: "text hidden one level down",
    payload: { name: "comment_added", has_media: false, meta: { text: "привет" } },
  },
  {
    why: "text hidden in an array",
    payload: { name: "comment_added", has_media: false, tags: ["всё сложно"] },
  },
  {
    why: "a forbidden key name, even empty",
    payload: { name: "comment_added", has_media: false, description: "" },
  },
  {
    why: "an unknown event name entirely",
    payload: { name: "mood_inferred", label: "депрессия" },
  },
];

beforeEach(() => {
  logger.info.mockClear();
  logger.warn.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("forbidden payloads", () => {
  it.each(FORBIDDEN)("refuses $why", ({ payload }) => {
    expect(() => track(payload as AnalyticsEvent)).toThrow();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("never echoes the offending value into the rejection log", () => {
    withNodeEnv("production", () => {
      track({ name: "comment_added", has_media: false, meta: { text: "секрет" } } as AnalyticsEvent);
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls[0])).not.toContain("секрет");
  });
});

describe("catalogue", () => {
  it("covers every event the schema declares", () => {
    // Fails the moment an event is added without a payload above.
    expect(new Set(VALID_PAYLOADS.map((e) => e.name))).toEqual(new Set(ANALYTICS_EVENT_NAMES));
  });

  it.each(VALID_PAYLOADS)("accepts $name on a real payload", (payload) => {
    expect(() => track(payload)).not.toThrow();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(analyticsEventSchema.safeParse(payload).success).toBe(true);
  });
});

describe("environment behaviour", () => {
  it("throws in development so the author sees it", () => {
    withNodeEnv("development", () => {
      expect(() => track({ name: "woop_completed", note: "ой" } as AnalyticsEvent)).toThrow();
    });
  });

  it("drops the event in production without throwing and without writing it", () => {
    withNodeEnv("production", () => {
      expect(() => track({ name: "woop_completed", note: "ой" } as AnalyticsEvent)).not.toThrow();
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("rejectForbiddenContent", () => {
  it("passes the discriminator but refuses a nested `name`", () => {
    expect(() => rejectForbiddenContent({ name: "woop_completed" })).not.toThrow();
    expect(() => rejectForbiddenContent({ name: "woop_completed", who: { name: "Аня" } })).toThrow();
  });

  it("allows ids, buckets and enum tokens", () => {
    expect(() =>
      rejectForbiddenContent({
        goal_id: "0b7c2a4e-1f3d-4a2b-8c9d-5e6f70819203",
        amount_bucket: "<1k",
        outcome: "done",
        has_note: true,
        answers_filled: 5,
      }),
    ).not.toThrow();
  });

  it("refuses anything that looks like something a person typed", () => {
    for (const value of ["Купить квартиру", "Марафон Тбилиси", "Two words", "ЗАГЛАВНЫМИ"]) {
      expect(() => rejectForbiddenContent({ outcome: value })).toThrow();
    }
  });
});

describe("feelingBucket", () => {
  it("buckets the 1–5 scale at its boundaries", () => {
    expect(feelingBucket(1)).toBe("low");
    expect(feelingBucket(2)).toBe("low");
    expect(feelingBucket(3)).toBe("mid");
    expect(feelingBucket(4)).toBe("high");
    expect(feelingBucket(5)).toBe("high");
  });

  it("reports a missing feeling as none, not as zero", () => {
    expect(feelingBucket(null)).toBe("none");
    expect(feelingBucket(undefined)).toBe("none");
  });
});
