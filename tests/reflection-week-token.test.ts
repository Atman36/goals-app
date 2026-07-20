import { describe, expect, it } from "vitest";
import { resolveReflectionWeek, weekStartTokenSchema } from "@/lib/validators/reflection";

// CR-030 regression suite. All cases use an injected clock — never real time —
// so the Monday 00:00 UTC boundary is exercised deterministically.
//
// Reference week: Mon 2026-07-13 … Sun 2026-07-19, next week starts 2026-07-20.
const WEEK = "2026-07-13";
const NEXT_WEEK = "2026-07-20";

/** A Date fixed at an exact UTC instant. */
function at(iso: string): Date {
  return new Date(iso);
}

describe("weekStartTokenSchema", () => {
  it("accepts a yyyy-MM-dd key", () => {
    expect(weekStartTokenSchema.safeParse("2026-07-13").success).toBe(true);
  });

  it.each(["2026-7-13", "13-07-2026", "2026-07-13T00:00:00Z", "", "nope"])(
    "rejects the malformed key %j",
    (bad) => {
      expect(weekStartTokenSchema.safeParse(bad).success).toBe(false);
    },
  );

  it("rejects a non-existent calendar date", () => {
    expect(weekStartTokenSchema.safeParse("2026-02-31").success).toBe(false);
  });
});

describe("resolveReflectionWeek — same week", () => {
  it("accepts a token matching the current week, mid-week", () => {
    const result = resolveReflectionWeek(WEEK, at("2026-07-15T12:00:00Z"));
    expect(result).toEqual({ ok: true, weekStart: WEEK });
  });

  it("accepts at the very first instant of the week", () => {
    const result = resolveReflectionWeek(WEEK, at("2026-07-13T00:00:00.000Z"));
    expect(result).toEqual({ ok: true, weekStart: WEEK });
  });

  it("accepts at the very last instant of the week", () => {
    const result = resolveReflectionWeek(WEEK, at("2026-07-19T23:59:59.999Z"));
    expect(result).toEqual({ ok: true, weekStart: WEEK });
  });
});

describe("resolveReflectionWeek — boundary crossing (the CR-030 bug)", () => {
  // The exact scenario: the page renders Sunday evening, the user submits after
  // Monday 00:00 UTC. Previously the action recomputed the week at submit time
  // and wrote week W's answers under week W+1.
  it("refuses a submit that crosses Monday 00:00 UTC by one millisecond", () => {
    const rendered = resolveReflectionWeek(WEEK, at("2026-07-19T23:59:59.999Z"));
    expect(rendered.ok).toBe(true);

    const submitted = resolveReflectionWeek(WEEK, at("2026-07-20T00:00:00.000Z"));
    expect(submitted).toEqual({ ok: false, currentWeekStart: NEXT_WEEK });
  });

  it("refuses at 05:00 Monday local for the owner's UTC+5 offset", () => {
    // 2026-07-20T00:00Z is 05:00 Monday in UTC+5 — the boundary the owner
    // actually experiences, which is why this is reachable in practice.
    const submitted = resolveReflectionWeek(WEEK, at("2026-07-20T00:30:00Z"));
    expect(submitted).toEqual({ ok: false, currentWeekStart: NEXT_WEEK });
  });

  it("reports the NEW week so the UI can prompt a reload", () => {
    const result = resolveReflectionWeek(WEEK, at("2026-07-20T09:00:00Z"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.currentWeekStart).toBe(NEXT_WEEK);
  });

  it("refuses a token from a week in the past", () => {
    const result = resolveReflectionWeek("2026-06-01", at("2026-07-15T12:00:00Z"));
    expect(result).toEqual({ ok: false, currentWeekStart: WEEK });
  });

  it("refuses a token from a week in the future", () => {
    const result = resolveReflectionWeek(NEXT_WEEK, at("2026-07-15T12:00:00Z"));
    expect(result).toEqual({ ok: false, currentWeekStart: WEEK });
  });
});

describe("resolveReflectionWeek — untrusted input", () => {
  it.each([undefined, null, "", "not-a-date", 20260713, {}, ["2026-07-13"]])(
    "refuses the non-token %j instead of writing to a guessed week",
    (bad) => {
      const result = resolveReflectionWeek(bad, at("2026-07-15T12:00:00Z"));
      expect(result).toEqual({ ok: false, currentWeekStart: WEEK });
    },
  );

  it("never returns a client-supplied string as the week key", () => {
    // A forged token that is well-formed but not the current week must not be
    // written; the only accepted value is the server-derived key.
    const forged = resolveReflectionWeek("2020-01-06", at("2026-07-15T12:00:00Z"));
    expect(forged.ok).toBe(false);

    // And when it IS accepted, the returned key is the server's own
    // computation, identical to the token by construction.
    const accepted = resolveReflectionWeek(WEEK, at("2026-07-15T12:00:00Z"));
    expect(accepted).toEqual({ ok: true, weekStart: WEEK });
  });

  it("refuses a mid-week date even when it falls inside the current week", () => {
    // Only the week START is a valid token — "2026-07-15" is in the current
    // week but is not its key, so it cannot be used to address the week.
    const result = resolveReflectionWeek("2026-07-15", at("2026-07-15T12:00:00Z"));
    expect(result).toEqual({ ok: false, currentWeekStart: WEEK });
  });
});

describe("resolveReflectionWeek — year boundary", () => {
  it("handles a week spanning new year", () => {
    // Mon 2026-12-28 … Sun 2027-01-03.
    expect(resolveReflectionWeek("2026-12-28", at("2027-01-01T12:00:00Z"))).toEqual({
      ok: true,
      weekStart: "2026-12-28",
    });
    expect(resolveReflectionWeek("2026-12-28", at("2027-01-04T00:00:00Z"))).toEqual({
      ok: false,
      currentWeekStart: "2027-01-04",
    });
  });
});
