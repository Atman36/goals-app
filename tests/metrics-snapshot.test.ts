import { describe, expect, it } from "vitest";
import { SNAPSHOT_KEYS, ALLOWED_TEXT_KEYS, assertNoUserText } from "../scripts/metrics-snapshot.mjs";
import { METRIC_KEYS } from "@/lib/metrics/definitions";

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
