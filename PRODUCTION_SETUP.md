# Production setup (Phase 0–2)

This document lists what you must provision for the hardening/persistence work to
take effect. The app is **env-driven**: with nothing configured it still builds
and runs in demo mode; each feature activates when its keys are present.

## 1. Database migrations

Apply the SQL migrations in `supabase/migrations/` in order. The new ones since
the last deploy:

- `0003_registered_manager_profiles.sql` — `manager_id` column (likely already applied).
- `0004_profile_on_signup.sql` — **new.** Trigger that auto-creates a `profiles`
  row on signup, reading `manager_id` / `display_name` from the signup metadata.
- `0005_guest_play_increment.sql` — **new.** Atomic, capped `increment_guest_play`
  RPC (closes a guest-gate race and prevents over-recording past the limit).

```bash
# via Supabase CLI (or paste into the SQL editor in order)
supabase db push
```

## 2. Environment variables

### Required in production (the app refuses to boot without these)
| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side competitive writes |
| `FOOTYRUSH_IP_HASH_SALT` | Salt for hashed-IP guest gate / rate-limit keys — set a long random value |
| `INVINCIBLE_GATE_SECRET` | HMAC secret for the Invincible eligibility gate — set a long random value |

> `lib/server/env.ts` validates these lazily and throws on boot in production if
> any are missing — no more silent fallback to public dev strings. The build is
> unaffected (validation only runs when serving).

### Optional (feature activates when set, otherwise safe no-op)
| Var(s) | Enables | Behavior when absent |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting on all mutating/abusable routes | **Fail-open** (allowed), warns in logs |
| `TURNSTILE_SECRET_KEY` | Server-side Cloudflare Turnstile verification on `/api/auth/email` | Verification skipped |
| `SENTRY_DSN` and/or `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring (server + client) | No-op |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Source-map upload during build | Upload skipped (build still succeeds) |

Vercel Web Analytics (`<Analytics />`) activates automatically when deployed on
Vercel; nothing to configure.

### Accounts to create
- **Upstash Redis** (Vercel-native integration) → provides the two `UPSTASH_*` vars.
- **Cloudflare Turnstile** site → secret key (above) + a public site key for the widget.
- **Sentry** project → DSN(s) + (optional) org/project/auth-token for source maps.

## 3. Rate limits (current values)
Defined per route via `lib/server/rate-limit.ts`:

| Route | Limit |
| --- | --- |
| `POST /api/auth/email` | 5 / min |
| `POST /api/registration` | 5 / min |
| `GET /api/registration` (availability) | 60 / min |
| `POST /api/guest-plays` | 10 / min |
| `POST /api/invincible-attempts` | 20 / hour |
| `POST /api/invincible-attempts/[id]/complete` | 30 / hour |
| `POST /api/results` | 30 / hour |

## 4. What changed (security/integrity)
- **Guest gate** is now server-enforced via the `guest_play_allowances` table
  (hashed IP), surviving incognito/cookie-clearing. The cookie is a hint only.
- **Invincible awards** are recomputed server-side: an award requires a complete
  38-game season with `losses === 0` and internally consistent points. The
  client's `unbeaten` flag is ignored. Completion is replay-safe (idempotent) and
  bound to the participant (guest IP / profile id).
- **Security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) are set in `next.config.mjs`.
- **Leaderboards** read `leaderboard_entries` and aggregate by period; completed
  Mini-League runs by registered users persist via `POST /api/results`.
- **/api/health** now pings the database (503 when down).

## 5. Identity & trust model
Competitive routes (`/api/invincible-attempts`, `.../complete`, `/api/results`)
derive the user identity from the **verified Supabase access token** sent as
`Authorization: Bearer <token>` — never from a request-body field. The client
attaches this automatically for signed-in users. So:
- Official Invincible awards and leaderboard persistence require a valid session.
- Guests (no token) use a hashed-IP identity and stay on local-only history.

## 6. Known limitations / follow-ups
- **Turnstile widget is not yet rendered client-side.** Server verification is
  wired, but the client does not yet show the Cloudflare widget or send a token.
  ⚠️ **Do not set `TURNSTILE_SECRET_KEY` in production until the widget exists**,
  or email sign-in will be rejected. (Add a `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  widget that posts `captchaToken` to `/api/auth/email`.)
- **CSP uses `'unsafe-inline'` in `script-src`** (required by the inline theme
  bootstrap in `app/layout.tsx`). Tightening to a nonce/hash-based policy via
  middleware is a defense-in-depth follow-up.
- **Mini-League results are client-simulated**, so reported figures are clamped
  but not cryptographically trustworthy — inherent to the client-side engine.
  A server-authoritative simulation would be a larger redesign.
- The repo lives on an exFAT drive that regenerates macOS `._*` AppleDouble files
  (they break `git fsck` and were picked up by Playwright). Cleaning is temporary;
  cloning to an APFS volume is the durable fix.
