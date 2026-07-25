import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_PROMPT_COOLDOWN_HOURS,
  shouldPromptAdjustment,
} from "@/lib/utils/plan-adjustment-prompt";

// T12 (PLAN §5 B4, "when NOT to ask"). A pure function so the 72-hour cooldown
// and the backfill/outcome exclusions can be pinned without touching the DB.

const NOW = new Date("2026-07-25T12:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("shouldPromptAdjustment", () => {
  it("never asks after an honest done", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "done",
        lastAdjustmentAt: null,
        now: NOW,
        isBackfill: false,
      }),
    ).toBe(false);
  });

  it("never asks on a backfilled (past-day) check-in", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "partial",
        lastAdjustmentAt: null,
        now: NOW,
        isBackfill: true,
      }),
    ).toBe(false);
  });

  it("stays quiet inside the 72-hour cooldown", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "partial",
        lastAdjustmentAt: hoursAgo(71),
        now: NOW,
        isBackfill: false,
      }),
    ).toBe(false);
  });

  it("asks again at exactly 72 hours", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "partial",
        lastAdjustmentAt: hoursAgo(72),
        now: NOW,
        isBackfill: false,
      }),
    ).toBe(true);
  });

  it("asks past the 72-hour cooldown", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "skipped",
        lastAdjustmentAt: hoursAgo(73),
        now: NOW,
        isBackfill: false,
      }),
    ).toBe(true);
  });

  it("asks on a fresh partial with no prior adjustment", () => {
    expect(
      shouldPromptAdjustment({
        outcome: "partial",
        lastAdjustmentAt: null,
        now: NOW,
        isBackfill: false,
      }),
    ).toBe(true);
  });

  it("pins the cooldown constant at 72 hours", () => {
    expect(ADJUSTMENT_PROMPT_COOLDOWN_HOURS).toBe(72);
  });
});
