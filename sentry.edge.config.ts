import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry. No DSN => no-op.
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production"
  });
}
