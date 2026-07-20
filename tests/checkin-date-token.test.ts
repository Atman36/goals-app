import { describe, expect, it } from "vitest";
import { checkinInputSchema, resolveCheckinDate } from "@/lib/validators/checkin";

// CHECKIN-002 · DATE-001 (GA-013): the daily check-in must never write the day
// AFTER the one it was rendered for. /today renders at day D and the submit can
// land after 00:00 UTC; before this token the action just recomputed todayKey()
// and filed D's form under D+1.
//
// The clock is injected, so the boundary crossing is exercised for real rather
// than approximated.

const DURING_DAY = new Date("2026-07-20T23:59:59.000Z");
const AFTER_MIDNIGHT = new Date("2026-07-21T00:00:01.000Z");

describe("resolveCheckinDate (CHECKIN-002)", () => {
  it("accepts the token when the rendered day is still current", () => {
    const resolved = resolveCheckinDate("2026-07-20", DURING_DAY);
    expect(resolved).toEqual({ ok: true, date: "2026-07-20" });
  });

  it("refuses a form rendered for D and submitted after midnight", () => {
    const resolved = resolveCheckinDate("2026-07-20", AFTER_MIDNIGHT);
    expect(resolved).toEqual({ ok: false, currentDate: "2026-07-21" });
  });

  it("returns the SERVER key, never the client's — a forged token cannot target another day", () => {
    // Token equal to the server's current day: accepted, and the returned value
    // is the server-derived key.
    const ok = resolveCheckinDate("2026-07-21", AFTER_MIDNIGHT);
    expect(ok).toEqual({ ok: true, date: "2026-07-21" });

    // Any other day — past or future — is refused outright.
    expect(resolveCheckinDate("2026-07-19", DURING_DAY).ok).toBe(false);
    expect(resolveCheckinDate("2027-01-01", DURING_DAY).ok).toBe(false);
  });

  it("treats missing and malformed tokens exactly like a stale one", () => {
    for (const token of [undefined, null, "", "2026-02-31", "2026-07-20T23:59:59Z", 42, {}]) {
      expect(resolveCheckinDate(token, DURING_DAY)).toEqual({
        ok: false,
        currentDate: "2026-07-20",
      });
    }
  });
});

describe("checkinInputSchema.expectedDate (DATE-001)", () => {
  const base = {
    goalId: "3c1f6f7e-6b1a-4c1a-9b1a-1e1a1a1a1a1a",
    outcome: "done",
    feeling: 3,
  };

  it("requires the token — an old client that omits it cannot write", () => {
    expect(checkinInputSchema.safeParse(base).success).toBe(false);
  });

  it("requires a real calendar date", () => {
    expect(checkinInputSchema.safeParse({ ...base, expectedDate: "2026-02-31" }).success).toBe(false);
    expect(checkinInputSchema.safeParse({ ...base, expectedDate: "2026-07-20" }).success).toBe(true);
  });
});
