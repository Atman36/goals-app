import { NextResponse } from "next/server";

/**
 * Recursively converts bigint values (money in minor units — PRD §4/§7) to
 * decimal strings so the result is safe for JSON.stringify / NextResponse.json,
 * which both throw on a raw bigint. Dates are ISO-stringified for the same
 * reason (NextResponse.json would otherwise leave them as-is, which is fine,
 * but this keeps every /api/v1 response shape explicit and predictable).
 */
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, toJsonSafe(v)]),
    );
  }
  return value;
}

/** Standard success envelope for the /api/v1 surface — PRD §5.3. */
export function jsonData(data: unknown, status = 200) {
  return NextResponse.json({ data: toJsonSafe(data) }, { status });
}

/** Standard error envelope. */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
