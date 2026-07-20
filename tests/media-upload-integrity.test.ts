import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level invariants for the media upload / comment write paths, in the
 * same style as security-invariants.test.ts: these flows need a browser, a
 * Supabase bucket and a database to exercise for real, so the regressions they
 * guard (CR-032 stuck spinners + leaked blob URLs, CR-019 discarded results,
 * CR-009 unenforced quota + duplicate rows, CR-033 fake delete success) are
 * asserted against the code that must contain them.
 */
function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const UPLOAD_COMPONENTS = [
  "components/goals/cover-upload.tsx",
  "components/goals/goal-gallery.tsx",
  "components/goals/comments-block.tsx",
];

describe("CR-032: upload handlers cannot get stuck or leak blob URLs", () => {
  it.each(UPLOAD_COMPONENTS)("%s wraps its upload in try/catch/finally", (file) => {
    const code = source(file);

    expect(code).toContain("try {");
    expect(code).toContain("} catch {");
    expect(code).toContain("} finally {");
  });

  it("cover-upload clears the uploading state from finally, not from each branch", () => {
    const code = source("components/goals/cover-upload.tsx");

    // The success path is the only one that may leave status "ready".
    expect(code).toContain("let succeeded = false");
    expect(code).toContain("succeeded = true");
    expect(code).toMatch(/finally \{\s*if \(!succeeded\) \{/);
  });

  it.each([
    "components/goals/cover-upload.tsx",
    "components/goals/comments-block.tsx",
  ])("%s revokes every object URL it creates", (file) => {
    const code = source(file);

    const created = code.match(/URL\.createObjectURL\(/g) ?? [];
    const revoked = code.match(/URL\.revokeObjectURL\(/g) ?? [];

    expect(created.length).toBeGreaterThan(0);
    expect(revoked.length).toBeGreaterThanOrEqual(created.length);
    // Revocation goes through the tracked ref, never through possibly-stale
    // state holding an http(s) preview URL.
    expect(code).toContain("blobUrlRef");
  });

  it("comments-block frees the staged preview when the comment is submitted", () => {
    const code = source("components/goals/comments-block.tsx");

    expect(code).toContain("function clearPendingPhoto()");
    expect(code).toContain("URL.revokeObjectURL(blobUrlRef.current)");
    // setPendingPhoto(null) alone would drop the blob without freeing it.
    expect(code).not.toContain("setPendingPhoto(null);\n      router.refresh()");
  });

  it("goal-gallery collects per-file failures instead of overwriting them", () => {
    const code = source("components/goals/goal-gallery.tsx");

    expect(code).toContain("const failures: string[] = []");
    expect(code).toContain("failures.join(");
    expect(code).toMatch(/finally \{[\s\S]*setUploading\(false\)/);
  });
});

describe("CR-019: registerMedia results are never discarded", () => {
  it.each([
    "components/goals/goal-gallery.tsx",
    "components/goals/goal-form.tsx",
    "lib/actions/comments.ts",
  ])("%s checks what registerMedia returned", (file) => {
    const code = source(file);

    expect(code).toMatch(/(const|let)\s+\w+\s*=\s*await registerMedia\(/);
    // A bare `await registerMedia(...);` statement is the bug being guarded.
    expect(code).not.toMatch(/^\s*await registerMedia\(/m);
  });

  it("addComment reports a saved comment whose photo failed as a partial success", () => {
    const code = source("lib/actions/comments.ts");

    expect(code).toContain("export type AddCommentResult");
    expect(code).toContain("warning?: string");
    expect(code).toContain("Promise<AddCommentResult>");
    expect(code).toContain("mediaAttached = registered.ok");
  });

  it("addComment's has_media analytics reflects the DB write, not the request", () => {
    const code = source("lib/actions/comments.ts");

    expect(code).toContain("has_media: mediaAttached");
    expect(code).not.toContain("has_media: !!parsed.data.media");
  });

  it("comments-block surfaces the partial-failure warning", () => {
    const code = source("components/goals/comments-block.tsx");

    expect(code).toContain("result.warning");
    expect(code).toContain("setNotice(result.warning)");
  });

  it("goal-form offers a way forward instead of inviting a duplicate submit", () => {
    const code = source("components/goals/goal-form.tsx");

    expect(code).toContain("setCoverWarning(");
    // Resubmitting after a saved goal would create a second goal. Asserted on
    // the guard, not the whole expression: GA-012 added `|| isStale` to the
    // same disabled= condition, and pinning the exact string made an unrelated
    // safety addition look like a regression.
    expect(code).toMatch(/disabled=\{[^}]*!!coverWarning/);
    expect(code).toContain("Перейти к цели");
  });
});

describe("CR-009: media quota and duplicate registration", () => {
  it("registerMedia enforces MAX_MEDIA_PER_GOAL itself, not only createSignedUpload", () => {
    const code = source("lib/actions/media.ts");

    const registerBody = code.slice(code.indexOf("export async function registerMedia"));
    expect(registerBody).toContain("countMediaForGoal");
    expect(registerBody).toContain("MAX_MEDIA_PER_GOAL");
  });

  it("both quota checks compare against the same constant", () => {
    const code = source("lib/actions/media.ts");

    const checks = code.match(/>= MAX_MEDIA_PER_GOAL/g) ?? [];
    expect(checks.length).toBe(2);
    expect(code).toContain("const MAX_MEDIA_PER_GOAL = 50");
  });

  it("insertMediaItem handles a duplicate storage path instead of inserting twice", () => {
    const code = source("lib/db/queries/media.ts");

    expect(code).toContain("export type InsertMediaResult");
    expect(code).toContain(".onConflictDoNothing()");
    expect(code).toContain('{ status: "duplicate"');
    expect(code).toContain('{ status: "conflict" }');
    // The replayed row still has to belong to the caller.
    expect(code).toMatch(/eq\(mediaItems\.storagePath, values\.storagePath\)[\s\S]{0,200}ownedByUser\(userId\)/);
  });

  it("registerMedia maps every insert outcome, replaying duplicates idempotently", () => {
    const code = source("lib/actions/media.ts");

    expect(code).toContain('inserted.status === "forbidden"');
    expect(code).toContain('inserted.status === "conflict"');
    // A duplicate is a replay of an upload already counted once.
    expect(code).toContain('if (inserted.status === "inserted") {');
  });

  it("migration 0007 adds a live-rows-only unique index on storage_path", () => {
    const sql = source("drizzle/0007_media_storage_path_unique.sql");

    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(sql).toContain('ON "media_items" ("storage_path")');
    expect(sql).toContain('WHERE "deleted_at" IS NULL');
    // Soft delete only — the de-dup step must not hard-delete rows.
    expect(sql).toContain('SET "deleted_at" = now()');
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });
});

describe("CR-033: soft delete reports what actually happened", () => {
  it("softDeleteComment returns the affected row", () => {
    const code = source("lib/db/queries/comments.ts");

    expect(code).toContain("Promise<{ id: string } | null>");
    expect(code).toContain(".returning({ id: comments.id })");
    expect(code).toContain("return deleted ?? null");
  });

  it("deleteComment fails loudly when nothing was deleted", () => {
    const code = source("lib/actions/comments.ts");

    expect(code).toContain("const deleted = await softDeleteComment(");
    expect(code).toContain("if (!deleted) {");
    expect(code).toContain('return { ok: false, error: "Комментарий не найден" }');
    // The success log must sit after the guard, so a no-op never logs a delete.
    expect(code.indexOf("if (!deleted) {")).toBeLessThan(code.indexOf('"comment soft-deleted"'));
  });

  it("comments-block surfaces a failed delete", () => {
    const code = source("components/goals/comments-block.tsx");

    expect(code).toMatch(/deleteComment\(goalId, commentId\)[\s\S]{0,200}if \(!result\.ok\)/);
  });
});
