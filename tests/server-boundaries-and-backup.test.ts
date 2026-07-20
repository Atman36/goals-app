import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("server-only module boundaries (CR-034)", () => {
  it("declares the server-only package as a real dependency", () => {
    const pkg = JSON.parse(source("package.json")) as { dependencies: Record<string, string> };

    // Must be a prod dependency, not a devDependency: it has to resolve during
    // a production build for the guard to fire at all.
    expect(pkg.dependencies["server-only"]).toBeDefined();
  });

  it("build-enforces the boundary on modules holding the service-role key", () => {
    // Prose comments alone don't stop a mis-import. This matters most for
    // lib/supabase/admin.ts, because lib/supabase/client.ts — the PUBLIC anon
    // client that "use client" components legitimately import — is its
    // directory neighbour.
    for (const path of ["lib/supabase/admin.ts", "lib/storage.ts"]) {
      expect(source(path), `${path} must import "server-only"`).toContain('import "server-only"');
    }
  });

  it("keeps the shared media constants importable from client components", () => {
    // lib/storage.ts re-exports these, but the constants themselves live in a
    // module that must stay client-safe.
    expect(source("lib/validators/media.ts")).not.toContain('import "server-only"');
  });
});

describe("database backup integrity (CR-029)", () => {
  const script = source("scripts/backup-db.mjs");

  it("dumps every table from one consistent snapshot", () => {
    // Per-table SELECTs outside a transaction can interleave with live writes,
    // producing a backup where tables disagree (a goal without its
    // contributions, or contributions pointing at an absent goal). This script
    // runs right before schema migrations, so that skew is maximally costly.
    expect(script).toContain("ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(script).toMatch(/sql\.begin\(/);

    // Every read must run on the transaction handle, not the pool handle,
    // or it escapes the snapshot.
    expect(script).not.toMatch(/await sql`/);
  });

  it("probes for the migration ledger without aborting the snapshot", () => {
    // Inside a transaction, a "relation does not exist" error poisons the
    // whole transaction, so existence must be tested rather than caught.
    expect(script).toContain("to_regclass");
  });

  it("records a per-file hash so a restore can detect corruption", () => {
    expect(script).toContain("createHash");
    expect(script).toContain("sha256");
  });

  it("still writes backups with private filesystem permissions", () => {
    // Regression guard for the permissions fix in c5526f7.
    expect(script).toContain("mode: 0o700");
    expect(script).toContain("mode: 0o600");
  });
});

describe("checklist deletion reports truthfully (CR-026)", () => {
  it("returns the deleted row so callers can tell a miss from a success", () => {
    const query = source("lib/db/queries/checklist.ts");

    expect(query).toMatch(/softDeleteChecklistItem[\s\S]*?Promise<ChecklistItem \| null>/);
    expect(query).toMatch(/softDeleteChecklistItem[\s\S]*?\.returning\(\)/);
  });

  it("answers 404 for an unknown item instead of a blanket ok", () => {
    // The PATCH handler in the same file already does this; DELETE used to
    // return {ok:true} unconditionally, so deleting a nonexistent or
    // already-deleted item looked like a success.
    const route = source("app/api/v1/checklist/[itemId]/route.ts");
    const del = route.slice(route.indexOf("export async function DELETE"));

    expect(del).toContain("const deleted = await softDeleteChecklistItem");
    expect(del).toMatch(/if \(!deleted\) return jsonError\("[^"]+", 404\)/);
  });
});
