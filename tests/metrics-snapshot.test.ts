import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_KEYS,
  ALLOWED_TEXT_KEYS,
  assertNoUserText,
  gapsAndReturns as gapsAndReturnsInScript,
} from "../scripts/metrics-snapshot.mjs";
import { METRIC_KEYS, gapsAndReturns } from "@/lib/metrics/definitions";

// Importing the script must not connect to the DB or write anything — see
// scripts/metrics-snapshot.mjs's top-level structure (main() only runs on
// direct execution). If this import ever throws or hangs, the script's
// structure has regressed.

describe("SNAPSHOT_KEYS contract with lib/metrics/definitions.ts (T2)", () => {
  it("matches METRIC_KEYS exactly, as a set", () => {
    const snapshotSet = new Set<string>(SNAPSHOT_KEYS);
    const metricSet = new Set<string>(METRIC_KEYS);

    const missingFromSnapshot = [...metricSet].filter((k) => !snapshotSet.has(k));
    const extraInSnapshot = [...snapshotSet].filter((k) => !metricSet.has(k));

    expect(
      { missingFromSnapshot, extraInSnapshot },
      `SNAPSHOT_KEYS and METRIC_KEYS disagree — missing from snapshot: [${missingFromSnapshot.join(", ")}], extra in snapshot: [${extraInSnapshot.join(", ")}]`,
    ).toEqual({ missingFromSnapshot: [], extraInSnapshot: [] });
  });

  it("has only snake_case, unique keys", () => {
    const snakeCase = /^[a-z][a-z0-9_]*$/;
    for (const key of SNAPSHOT_KEYS) {
      expect(key, `"${key}" is not snake_case`).toMatch(snakeCase);
    }
    expect(new Set(SNAPSHOT_KEYS).size, "SNAPSHOT_KEYS has duplicate entries").toBe(SNAPSHOT_KEYS.length);
  });
});

describe("assertNoUserText", () => {
  it("throws on a user-authored field like a goal title", () => {
    expect(() => assertNoUserText({ week_start: "2026-07-20", goal_title: "Выучить испанский" })).toThrow();
  });

  it("throws on text nested inside an array", () => {
    expect(() =>
      assertNoUserText({ week_start: "2026-07-20", notes: ["Выучить испанский", "ещё заметка"] }),
    ).toThrow();
  });

  it("throws on text nested inside a sub-object", () => {
    expect(() =>
      assertNoUserText({ week_start: "2026-07-20", reflection: { learned: "Что-то узнал на этой неделе" } }),
    ).toThrow();
  });

  it("does not throw on an object of numbers plus allowed service string keys", () => {
    const snapshot: Record<string, unknown> = {
      week_start: "2026-07-20",
      window_start: "2026-06-01",
      generated_at_utc: "2026-07-25T12:00:00.000Z",
      git_commit: "abc123",
      schema_version: "1",
    };
    for (const key of SNAPSHOT_KEYS) snapshot[key] = 0;

    expect(() => assertNoUserText(snapshot)).not.toThrow();
    // Sanity: every allowed key really is declared allowed (guards against a
    // typo in this test's fixture silently passing for the wrong reason).
    for (const key of ["week_start", "window_start", "generated_at_utc", "git_commit", "schema_version"]) {
      expect(ALLOWED_TEXT_KEYS).toContain(key);
    }
  });
});

// B5. The script cannot import lib/metrics/definitions.ts (see its file
// header), so it carries its own copy of gapsAndReturns — and the page and the
// frozen snapshot must never disagree about what a "возврат" is, because
// DECISION-RULE.md §4 point 5 is read from both. A key-set match (above) would
// not catch a copy that drifted: the keys would still line up while the
// numbers underneath them diverged. So both implementations run over the same
// fixtures here.
describe("B5 — the script's gapsAndReturns copy matches lib/metrics/definitions.ts", () => {
  const CASES: { name: string; window: string[]; active: string[] }[] = [
    {
      name: "no gaps at all",
      window: ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"],
      active: ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"],
    },
    {
      name: "nothing active",
      window: ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"],
      active: [],
    },
    {
      name: "one return after a two-week gap",
      window: ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"],
      active: ["2026-06-01", "2026-06-22"],
    },
    {
      name: "two returns, gaps of 1 and 2",
      window: ["2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25", "2026-06-01"],
      active: ["2026-04-27", "2026-05-11", "2026-06-01"],
    },
    {
      name: "active first week only — never a return",
      window: ["2026-06-01", "2026-06-08"],
      active: ["2026-06-01"],
    },
    {
      name: "open gap the person has not returned from",
      window: ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"],
      active: ["2026-06-01", "2026-06-08"],
    },
    {
      name: "active week outside the window is ignored by both",
      window: ["2026-06-08", "2026-06-15"],
      active: ["2026-06-01", "2026-06-15"],
    },
    {
      name: "window's very first week is active after an (unobserved) gap",
      window: ["2026-06-08", "2026-06-15", "2026-06-22"],
      active: ["2026-06-08", "2026-06-22"],
    },
  ];

  for (const { name, window, active } of CASES) {
    it(`agrees on: ${name}`, () => {
      expect(gapsAndReturnsInScript(active, window)).toEqual(gapsAndReturns(active, window));
    });
  }

  it("agrees on the three numbers the snapshot actually freezes", () => {
    for (const { window, active } of CASES) {
      const fromScript = gapsAndReturnsInScript(active, window);
      const fromLib = gapsAndReturns(active, window);
      const maxGap = (r: { gapWeeks: number }[]) => r.reduce((max, x) => Math.max(max, x.gapWeeks), 0);

      expect({
        weeks_missed: fromScript.missed.length,
        returns_after_gap: fromScript.returns.length,
        return_gap_weeks_max: maxGap(fromScript.returns),
      }).toEqual({
        weeks_missed: fromLib.missed.length,
        returns_after_gap: fromLib.returns.length,
        return_gap_weeks_max: maxGap(fromLib.returns),
      });
    }
  });
});
