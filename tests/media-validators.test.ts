import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, registerMediaSchema, signedUploadSchema } from "@/lib/validators/media";

describe("signedUploadSchema", () => {
  it("rejects a fileSize of 0", () => {
    const result = signedUploadSchema.safeParse({
      fileName: "photo.jpg",
      fileSize: 0,
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a fileSize over the 10 MB limit", () => {
    const result = signedUploadSchema.safeParse({
      fileName: "photo.jpg",
      fileSize: MAX_UPLOAD_BYTES + 1,
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unsupported mimeType", () => {
    const result = signedUploadSchema.safeParse({
      fileName: "photo.gif",
      fileSize: 1000,
      mimeType: "image/gif",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid input", () => {
    const result = signedUploadSchema.safeParse({
      goalId: "3c1f6f7e-6b1a-4c1a-9b1a-1e1a1a1a1a1a",
      fileName: "photo.jpg",
      fileSize: 1000,
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(true);
  });
});

describe("registerMediaSchema", () => {
  it("rejects an empty path", () => {
    const result = registerMediaSchema.safeParse({ path: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer width", () => {
    const result = registerMediaSchema.safeParse({ path: "user-id/goal-id/file.jpg", width: 100.5 });
    expect(result.success).toBe(false);
  });

  it("accepts a valid input", () => {
    const result = registerMediaSchema.safeParse({
      goalId: "3c1f6f7e-6b1a-4c1a-9b1a-1e1a1a1a1a1a",
      path: "3c1f6f7e-6b1a-4c1a-9b1a-1e1a1a1a1a1a/goal-id/file.jpg",
      width: 800,
      height: 600,
      setAsCover: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a path containing a '..' segment but still accepts a normal path", () => {
    const traversal = registerMediaSchema.safeParse({ path: "user-1/../other/x.jpg" });
    expect(traversal.success).toBe(false);

    const normal = registerMediaSchema.safeParse({ path: "user-1/goal-1/uuid.jpg" });
    expect(normal.success).toBe(true);
  });
});
