import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnerEmail } from "@/lib/owner";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOwnerEmail", () => {
  it("fails closed when OWNER_EMAIL is unset", () => {
    vi.stubEnv("OWNER_EMAIL", undefined);
    expect(isOwnerEmail("owner@x.com")).toBe(false);
  });

  it("fails closed when OWNER_EMAIL is an empty string", () => {
    vi.stubEnv("OWNER_EMAIL", "");
    expect(isOwnerEmail("owner@x.com")).toBe(false);
  });

  it("returns true for an exact match", () => {
    vi.stubEnv("OWNER_EMAIL", "owner@x.com");
    expect(isOwnerEmail("owner@x.com")).toBe(true);
  });

  it("returns true for a case-mixed match", () => {
    vi.stubEnv("OWNER_EMAIL", "owner@x.com");
    expect(isOwnerEmail("Owner@X.COM")).toBe(true);
  });

  it("returns false for a different email", () => {
    vi.stubEnv("OWNER_EMAIL", "owner@x.com");
    expect(isOwnerEmail("stranger@x.com")).toBe(false);
  });

  it("returns false when email is undefined, null, or empty", () => {
    vi.stubEnv("OWNER_EMAIL", "owner@x.com");
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });
});
