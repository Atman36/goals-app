import { NextResponse } from "next/server";

// Smoke-test endpoint for the /api/v1 surface — see PRD §5.3 (TMA/integrations readiness).
export function GET() {
  return NextResponse.json({ status: "ok" });
}
