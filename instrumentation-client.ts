import * as Sentry from "@sentry/nextjs";

// Sentry is opt-in: no-op unless NEXT_PUBLIC_SENTRY_DSN is configured (PRD §8.1
// P0; no DSN available yet). Plain runtime init, conservative sample rate.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
