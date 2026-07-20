import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/**
 * Source with comments removed. app/fonts/index.ts documents the traps it
 * avoids by naming them, so assertions about what the code must NOT do have to
 * look at code only — otherwise the explanatory comment trips the assertion.
 */
function code(path: string): string {
  return source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

type FontCall = {
  constName: string;
  src: string;
  cssVariable: string | null;
  fontFamily: string | null;
  unicodeRange: string | null;
};

function parseFontCalls(): FontCall[] {
  const src = source("app/fonts/index.ts");
  const calls: FontCall[] = [];

  for (const match of src.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g)) {
    const [, constName, body] = match;
    calls.push({
      constName,
      src: body.match(/src:\s*"([^"]+)"/)?.[1] ?? "",
      cssVariable: body.match(/variable:\s*"([^"]+)"/)?.[1] ?? null,
      fontFamily: body.match(/\{\s*prop:\s*"font-family",\s*value:\s*"([^"]+)"\s*\}/)?.[1] ?? null,
      unicodeRange:
        body.match(/\{\s*prop:\s*"unicode-range",\s*value:\s*"([^"]+)"\s*\}/)?.[1] ?? null,
    });
  }

  return calls;
}

describe("self-hosted fonts (CR-028)", () => {
  it("never reaches the network at build time", () => {
    // next/font/google downloads woff2 from fonts.gstatic.com during `next
    // build` and there is no on-disk cache, so any usage makes the build fail
    // without network access (CI, fresh clone, offline dev).
    expect(code("app/layout.tsx")).not.toContain("next/font/google");
    expect(code("app/fonts/index.ts")).not.toContain("next/font/google");
    expect(code("app/fonts/index.ts")).toContain('from "next/font/local"');
  });

  it("vendors every woff2 file it declares", () => {
    const calls = parseFontCalls();
    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) {
      const file = join(process.cwd(), "app/fonts", call.src.replace(/^\.\//, ""));
      expect(existsSync(file), `${call.constName} -> ${call.src} is missing`).toBe(true);
    }

    // Nothing vendored but unreferenced, so dead font files can't accumulate.
    const onDisk = readdirSync(join(process.cwd(), "app/fonts")).filter((f) =>
      f.endsWith(".woff2"),
    );
    expect(onDisk.sort()).toEqual(calls.map((c) => c.src.replace(/^\.\//, "")).sort());
  });

  it("names each variable-owning const exactly after the family it declares", () => {
    // This is the load-bearing invariant. Turbopack derives the family name
    // used by the generated CSS variable from the JS CONST NAME, not from the
    // `font-family` given in `declarations`. If they disagree,
    // `--font-manrope` resolves to a family that no @font-face declares and
    // every glyph silently falls back to Arial — a visual regression that
    // still typechecks, lints and builds cleanly.
    const owners = parseFontCalls().filter((c) => c.cssVariable !== null);

    expect(owners.map((c) => c.cssVariable).sort()).toEqual([
      "--font-jetbrains-mono",
      "--font-manrope",
      "--font-unbounded",
    ]);

    for (const owner of owners) {
      expect(
        owner.fontFamily,
        `${owner.constName} owns ${owner.cssVariable} but declares no font-family`,
      ).not.toBeNull();
      expect(
        owner.constName,
        `const ${owner.constName} must be renamed to ${owner.fontFamily} (or vice versa)`,
      ).toBe(owner.fontFamily);
    }
  });

  it("gives every subset of a family the same font-family and its own unicode-range", () => {
    const byFamily = new Map<string, FontCall[]>();
    for (const call of parseFontCalls()) {
      expect(call.fontFamily, `${call.constName} declares no font-family`).not.toBeNull();
      byFamily.set(call.fontFamily!, [...(byFamily.get(call.fontFamily!) ?? []), call]);
    }

    expect([...byFamily.keys()].sort()).toEqual(["JetBrainsMono", "Manrope", "Unbounded"]);

    for (const [family, calls] of byFamily) {
      // A shared family with no unicode-range would make the last @font-face
      // win outright, dropping every other subset.
      const ranges = calls.map((c) => c.unicodeRange);
      expect(ranges.every((r) => r !== null), `${family} has a subset without unicode-range`).toBe(
        true,
      );
      expect(new Set(ranges).size, `${family} has duplicate unicode-ranges`).toBe(ranges.length);
    }
  });

  it("applies only .variable to <html>, never .className", () => {
    // `.className` also sets font-family on the element, so applying more than
    // one would leave whichever sorted last as the page font.
    const fonts = code("app/fonts/index.ts");
    expect(fonts).toContain("Manrope.variable");
    expect(fonts).not.toMatch(/\.className/);
    expect(code("app/layout.tsx")).toContain("fontVariables");
  });
});
