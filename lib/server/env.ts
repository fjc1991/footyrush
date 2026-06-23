import { z } from "zod";

/**
 * Centralised, validated access to server-side environment variables.
 *
 * Validation is lazy (run on first use inside a request handler) rather than at
 * import time, so `next build` never fails just because deploy-time secrets are
 * absent in the build environment. In production we hard-fail when a required
 * secret is missing instead of silently degrading to a public dev string; in
 * development we fall back to deterministic dev values so the app still runs.
 *
 * This module must only ever be imported from server code (route handlers,
 * server components, scripts) — never from a "use client" module.
 */

const DEV_IP_HASH_SALT = "local-footyrush-dev";
const DEV_INVINCIBLE_GATE_SECRET = "local-footyrush-invincible-dev";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

// During `next build` Next sets NEXT_PHASE; we never want to throw then because
// the build environment legitimately has no runtime secrets.
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

const rawSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  FOOTYRUSH_IP_HASH_SALT: z.string().min(1).optional(),
  INVINCIBLE_GATE_SECRET: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional()
});

export interface ServerEnv {
  /** Supabase project URL (service-role base). Null when Supabase is unconfigured (demo mode). */
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  /** True when both Supabase URL and the service-role key are present. */
  hasSupabase: boolean;
  ipHashSalt: string;
  invincibleGateSecret: string;
  turnstileSecretKey: string | null;
  upstash: { url: string; token: string } | null;
  sentryDsn: string | null;
  isProduction: boolean;
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) {
    return cached;
  }

  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  const env = parsed.data;

  const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? null;

  // In production we refuse to boot with dev-string fallbacks for the secrets
  // that protect competitive integrity / anti-abuse. Skipped during the build
  // phase, where these secrets are not expected to be present.
  if (isProduction() && !isBuildPhase()) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
    if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!env.FOOTYRUSH_IP_HASH_SALT) missing.push("FOOTYRUSH_IP_HASH_SALT");
    if (!env.INVINCIBLE_GATE_SECRET) missing.push("INVINCIBLE_GATE_SECRET");
    if (missing.length > 0) {
      throw new Error(`Refusing to start in production: missing required environment variables:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
    }
  }

  const upstash =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }
      : null;

  cached = {
    supabaseUrl,
    supabaseServiceRoleKey,
    hasSupabase: Boolean(supabaseUrl && supabaseServiceRoleKey),
    ipHashSalt: env.FOOTYRUSH_IP_HASH_SALT ?? DEV_IP_HASH_SALT,
    invincibleGateSecret: env.INVINCIBLE_GATE_SECRET ?? DEV_INVINCIBLE_GATE_SECRET,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? null,
    upstash,
    sentryDsn: env.SENTRY_DSN ?? env.NEXT_PUBLIC_SENTRY_DSN ?? null,
    isProduction: isProduction()
  };
  return cached;
}
