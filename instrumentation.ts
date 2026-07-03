import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

// Sentry is opt-in: no-op unless SENTRY_DSN is configured (PRD §8.1 P0; no DSN
// available yet). Plain runtime init — no build-time wrapping, no source maps.
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;

  await Sentry.captureRequestError(...args);
};
