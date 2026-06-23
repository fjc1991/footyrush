import * as Sentry from "@sentry/nextjs";

// Browser Sentry. Must use a NEXT_PUBLIC_ DSN to be available client-side.
// No DSN => no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production"
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
