// Self-hosted fonts (CR-028).
//
// These were previously loaded via `next/font/google`, which fetches the woff2
// files from fonts.gstatic.com at BUILD time. There is no on-disk font cache,
// so every cold build (CI, fresh clone, offline dev) hit the network, and a
// build without network access failed outright. The woff2 files are now
// vendored in this directory and loaded via `next/font/local`, so the build is
// hermetic.
//
// The files are the exact bytes Google served for the previous
// `subsets: ["latin", "cyrillic"]` config — one file per subset, each with its
// upstream unicode-range. Reproducing those ranges is what keeps rendering and
// download size identical: the browser fetches only the subsets whose
// codepoints actually appear on the page.
//
// Two `next/font/local` constraints shape the structure below.
//
// 1. `declarations` is applied to EVERY entry of `src`, so a single call
//    cannot give each file its own `unicode-range`. Hence one call per subset,
//    each pinning the same `font-family` in `declarations` so all of a
//    family's @font-face rules compose into one logical font in the browser.
//
// 2. Turbopack derives the family name used by the generated CSS variable from
//    the JS CONST NAME, not from the `font-family` in `declarations`. If the
//    two disagree, `--font-manrope` resolves to a family that no @font-face
//    declares and every glyph silently falls back to Arial. The three
//    variable-owning consts are therefore named EXACTLY after the family they
//    declare (`Manrope`, `Unbounded`, `JetBrainsMono`) and MUST STAY THAT WAY
//    — renaming one is a silent visual regression, not a compile error.
//    (`JetBrainsMono` is spelled without a space because a JS identifier
//    cannot contain one; the name is just a CSS matching key, so this has no
//    rendering effect.)
//
// Only the `latin` call of each family carries `variable` + the
// `adjustFontFallback` Arial metrics; the other subsets set
// `adjustFontFallback: false` so each family gets exactly one
// "<Family> Fallback" face. `preload` mirrors the old
// `subsets: ["latin", "cyrillic"]`.
import localFont from "next/font/local";

/* ------------------------------ Manrope ------------------------------ */
const Manrope = localFont({
  src: "./manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: true,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});
const manropeCyrillic = localFont({
  src: "./manrope-cyrillic.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ],
});
const manropeCyrillicExt = localFont({
  src: "./manrope-cyrillic-ext.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
  ],
});
const manropeGreek = localFont({
  src: "./manrope-greek.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF" },
  ],
});
const manropeVietnamese = localFont({
  src: "./manrope-vietnamese.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
  ],
});
const manropeLatinExt = localFont({
  src: "./manrope-latin-ext.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Manrope" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
});

/* ------------------------------ Unbounded ----------------------------- */
const Unbounded = localFont({
  src: "./unbounded-latin.woff2",
  variable: "--font-unbounded",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: true,
  declarations: [
    { prop: "font-family", value: "Unbounded" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});
const unboundedCyrillic = localFont({
  src: "./unbounded-cyrillic.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Unbounded" },
    { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ],
});
const unboundedCyrillicExt = localFont({
  src: "./unbounded-cyrillic-ext.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Unbounded" },
    { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
  ],
});
const unboundedVietnamese = localFont({
  src: "./unbounded-vietnamese.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Unbounded" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
  ],
});
const unboundedLatinExt = localFont({
  src: "./unbounded-latin-ext.woff2",
  weight: "200 900",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Unbounded" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
});

/* ------------------------------ JetBrainsMono ------------------------- */
const JetBrainsMono = localFont({
  src: "./jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: true,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});
const jetbrainsMonoCyrillic = localFont({
  src: "./jetbrains-mono-cyrillic.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ],
});
const jetbrainsMonoCyrillicExt = localFont({
  src: "./jetbrains-mono-cyrillic-ext.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" },
  ],
});
const jetbrainsMonoGreek = localFont({
  src: "./jetbrains-mono-greek.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF" },
  ],
});
const jetbrainsMonoVietnamese = localFont({
  src: "./jetbrains-mono-vietnamese.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" },
  ],
});
const jetbrainsMonoLatinExt = localFont({
  src: "./jetbrains-mono-latin-ext.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrainsMono" },
    { prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  ],
});

// The three variable-owning consts above are what layout.tsx applies to <html>.
// NOTE: use `.variable` and never `.className` — `.className` also sets
// `font-family` on the element, so applying several would leave whichever
// sorted last as the page font.
export const fontVariables = [Manrope.variable, Unbounded.variable, JetBrainsMono.variable].join(
  " ",
);

// The non-latin subsets contribute only @font-face rules, which are emitted as
// a side effect of this module being imported — they have no class to apply.
// They are collected here so they are neither reported as unused nor dropped.
export const subsetFaces = [
  manropeCyrillic,
  manropeCyrillicExt,
  manropeGreek,
  manropeVietnamese,
  manropeLatinExt,
  unboundedCyrillic,
  unboundedCyrillicExt,
  unboundedVietnamese,
  unboundedLatinExt,
  jetbrainsMonoCyrillic,
  jetbrainsMonoCyrillicExt,
  jetbrainsMonoGreek,
  jetbrainsMonoVietnamese,
  jetbrainsMonoLatinExt,
];
