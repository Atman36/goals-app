import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("security and history invariants", () => {
  it("locks the current goal row before recording a formulation revision", () => {
    const query = source("lib/db/queries/goal-revisions.ts");

    expect(query).toContain('.for("update")');
  });

  it("sets a cover only when the media belongs to the same owned goal", () => {
    const query = source("lib/db/queries/media.ts");

    expect(query).toContain("export async function setGoalCoverForUser");
    expect(query).toContain("eq(mediaItems.id, mediaId)");
    expect(query).toContain("eq(mediaItems.goalId, goalId)");
    expect(query).toContain("eq(goals.userId, userId)");
  });

  it("writes personal database backups with private filesystem permissions", () => {
    const script = source("scripts/backup-db.mjs");

    expect(script).toContain("mode: 0o700");
    expect(script).toContain("mode: 0o600");
  });
});
