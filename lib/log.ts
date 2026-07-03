import pino from "pino";

// Structured JSON logger singleton. `track()` in lib/analytics/events.ts writes
// analytics events through this same logger (PostHog wiring is Phase 2, PRD §9).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["email", "*.email", "token", "*.token", "req.headers.authorization"],
    censor: "[REDACTED]",
  },
});

/** Child logger tagged with a request id — pass crypto.randomUUID() at the call site. */
export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}
