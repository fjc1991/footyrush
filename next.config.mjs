import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Supabase (REST + realtime), Upstash, Cloudflare
// Turnstile, Sentry ingest and Vercel analytics are explicitly allowlisted.
// 'unsafe-eval' is only permitted in development (webpack/runtime needs it).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // ws:/wss: in dev for Next HMR; external hosts for Supabase, Upstash, Turnstile, Sentry, Vercel.
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://*.supabase.co wss://*.supabase.co https://*.upstash.io https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://vitals.vercel-insights.com`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Only upgrade in production; would break http://localhost during development.
  ...(isDev ? [] : ["upgrade-insecure-requests"])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" }
];

const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

// withSentryConfig is build-time tooling only. Without SENTRY_AUTH_TOKEN it skips
// source-map upload (a warning, not an error), so the build stays green when
// Sentry is unconfigured. Runtime error capture is gated on the DSN in the
// sentry.*.config files, so this is a full no-op until both are provided.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT
});
