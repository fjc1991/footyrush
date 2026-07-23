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
- `0006_guest_plays_daily.sql` — **new.** Adds `play_day` and makes guest plays a
  per-day allowance (3 free plays/day, resets at UTC midnight).
- `0007_community_squads.sql` — **new.** `community_squads` table for the cross-user
  end-of-season one-off (stores a completed squad as jsonb; public read).
- `0008_oauth_profile_onboarding.sql` — allows OAuth profiles to start without a
  `manager_id` and updates the signup trigger to use the display-name fallback
  order `display_name` → `full_name` → `name` → email local-part. An explicit
  `manager_id` supplied by password registration is still preserved.
- `0009_competition_progress.sql` — adds mode-aware, idempotent completed-run
  history for Mini League and Invincible, plus title-board fields. It also
  recovers points/GD for older authenticated Invincible attempts without
  guessing historical league titles that were never stored.
- `0010_consent_product_analytics.sql` — adds the service-role-only
  `product_events` store for consented, allowlisted gameplay analytics. It stores
  a random browser ID and optional account ID, but no raw IP, email, X profile,
  post content, player names, user agent, or free-form text.
- `0011_user_identity_activity_preferences.sql` — adds one-time manager-ID
  confirmation/rename, signed-in visits and mode lifecycles, optional profile
  preferences, independent communication/audience consent, administrator export
  auditing, and the atomic `claim_manager_id` function.

Apply `0009`, then `0010`, then `0011` before releasing the matching application
code. `0011` marks every existing account as requiring one manager-ID
confirmation or change, clears only deterministic generated `mgr_…` IDs, and
starts every future account with `manager_id = null`. The atomic claim updates
the profile and existing leaderboard, community-squad, and league-member public
names together.

The application includes an idempotent compatibility path that can still save
and read authenticated **Mini League** results through the pre-`0009` table
shape. This prevents completed five-match runs from being lost during a rolling
deployment. Apply `0009` promptly: full Invincible persistence, format-separated
leaderboards, and exact finishing-position history intentionally remain gated
on the verified migration.

```bash
# via Supabase CLI (or paste into the SQL editor in order)
supabase db push
```

After `0010` is applied, the owner can inspect aggregate usage in the Supabase
SQL editor without exposing individual event rows:

```sql
select
  date_trunc('day', created_at) as day,
  event_name,
  count(*) as events,
  count(distinct anonymous_id) as opted_in_browsers
from public.product_events
where created_at >= now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;
```

### Where player information is stored

| Information | Storage | Owner view |
| --- | --- | --- |
| X/Supabase identity, provider identifier and basic provider metadata | Supabase Auth (`auth.users`, managed by Supabase) | Supabase Dashboard → Authentication → Users |
| FootyRush manager ID, display name and email (when the provider supplies one) | Supabase Postgres `public.profiles` | Supabase Dashboard → Table Editor → `profiles` |
| Completed Mini League and Invincible history used by rankings/progress | `public.leaderboard_entries` and `public.invincible_attempts` | Table Editor or aggregate SQL |
| Shared end-of-run squads | `public.community_squads` | Table Editor |
| Guest free-play enforcement | `public.guest_play_allowances` using a salted IP hash, not the raw IP | Table Editor |
| Opt-in, allowlisted gameplay events | `public.product_events` after migration `0010` | Prefer aggregate SQL; raw rows are service-role-only |
| Signed-in visits and visible/recently-active time | `public.user_visits` after migration `0011` | My home and administrator aggregates; no raw IP or exact fingerprint |
| Mode starts, completions, abandoned runs and matches | `public.user_mode_runs` after migration `0011` | My home and administrator aggregates |
| Optional football preferences and separate audience-insight consent | `public.profile_preferences` after migration `0011` | My home; advertiser view is aggregate-only and suppresses groups below 10 |
| FootyRush promotional-email consent | `public.marketing_preferences` after migration `0011` | My home and verified-email administrator export only |
| Active setup/draft state and unsynced fallback progress | The player's browser storage | Not centrally visible; it stays on that device unless a completed result is synced |

X credentials and tokens are handled by X and Supabase Auth. FootyRush does not
store the user's X password, scrape their posts, or copy their X profile into
`product_events`. Product analytics remains off until the player explicitly
opts in.

### Administrator user database

Grant access only with verified Supabase Auth app metadata:

```json
{ "role": "admin" }
```

Never infer administrator access from an email or client-editable
`user_metadata`. Verified administrators can open `/{locale}/admin/users`; every
API behind that screen re-verifies the bearer token and `app_metadata.role`.
The advertiser report contains opted-in aggregates only and suppresses segments
with fewer than ten people. CSV export contains only explicit FootyRush email
opt-ins with a Supabase-verified email, and each export is written to
`admin_export_audit`. There is no advertiser contact-list export.

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

> **Payments removed:** Stripe Checkout and the paid extra-spins bundle were removed
> to focus on core gameplay first. Manager spins and draft re-shuffles are the free
> allowances only. Payments will be reintroduced later.

Vercel Web Analytics and FootyRush product analytics activate only after the
player selects **Allow gameplay analytics**. The preference can be reversed
from **Data choices** in the game footer.

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
| `PATCH /api/registration` | 5 / min |
| `GET /api/registration` (availability) | 60 / min |
| `POST /api/guest-plays` | 10 / min |
| `POST /api/invincible-attempts` | 20 / hour |
| `POST /api/invincible-attempts/[id]/complete` | 30 / hour |
| `POST /api/results` | 30 / hour |
| `POST /api/analytics` | 180 / hour |

## 4. What changed (security/integrity)
- **Guest gate** is now server-enforced via the `guest_play_allowances` table
  (hashed IP), surviving incognito/cookie-clearing. The cookie is a hint only.
- **Invincible awards** are recomputed server-side: an award requires a complete
  38-game season with `losses === 0` and internally consistent points. The
  client's `unbeaten` flag is ignored. Completion is replay-safe (idempotent) and
  bound to the participant (guest IP / profile id). The validated attempt also
  stores its reported goals and final table position so progress and league wins are
  written durably without a second unbound title claim.
- **Security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) are set in `next.config.mjs`.
- **Leaderboards** read immutable, mode-aware `leaderboard_entries`; Mini League
  points stay separate from 38-match totals, while the League Wins board combines
  only championship runs and shows the Mini/Invincible split.
- **/api/health** now pings the database (503 when down).

## 5. Identity & trust model
Competitive routes (`/api/invincible-attempts`, `.../complete`, `/api/results`)
derive the user identity from the **verified Supabase access token** sent as
`Authorization: Bearer <token>` — never from a request-body field. The client
attaches this automatically for signed-in users. So:
- Official Invincible awards and leaderboard persistence require a valid session.
- Guests (no token) use a hashed-IP identity and stay on local-only history.

## 6. X sign-in and redirect configuration

The app now uses Supabase's **X / Twitter OAuth 2.0** provider. Google is no
longer offered in the FootyRush interface and should be disabled in Supabase.

### X Developer Dashboard

1. Create an X Project and App at `https://developer.x.com`.
2. Under **User authentication settings**, enable OAuth 2.0, select **Web App**,
   and turn on **Request email from users**.
3. Use this exact callback URL (the Supabase callback, not a locale page):
   - `https://gqiafshqonbhirtuzesp.supabase.co/auth/v1/callback`
4. Use this website URL:
   - `https://footyrush-bay.vercel.app`
5. Add the production legal URLs required by X:
   - Privacy Policy: `https://footyrush-bay.vercel.app/en/privacy`
   - Terms of Service: `https://footyrush-bay.vercel.app/en/terms`
6. Copy the OAuth 2.0 Client ID and Client Secret. Never put the secret in source
   control or a `NEXT_PUBLIC_*` variable.

### Supabase Dashboard

1. Open **Authentication → Providers → X / Twitter (OAuth 2.0)**, enable it,
   enter the X OAuth 2.0 Client ID and Client Secret, and save.
2. Open **Authentication → Providers → Google** and disable it.
3. Open **Authentication → URL Configuration** and set the Site URL to:
   - `https://footyrush-bay.vercel.app`
4. Allow all four production return URLs:
   - `https://footyrush-bay.vercel.app/en`
   - `https://footyrush-bay.vercel.app/es`
   - `https://footyrush-bay.vercel.app/fr`
   - `https://footyrush-bay.vercel.app/pt`
5. Keep local redirect URLs separate for development; do not use a wildcard for
   the production origin.

### Vercel

Set `NEXT_PUBLIC_SUPABASE_URL` to exactly
`https://gqiafshqonbhirtuzesp.supabase.co` with no leading/trailing whitespace.
Check `SUPABASE_URL` too if it is set separately. Keep the existing anon and
service-role keys in their matching variables, apply migrations `0008`, `0009`,
and `0010`, then redeploy.

Smoke-test X sign-in once in each locale. A first-time X user should be sent to
manager-ID onboarding; a returning user should load the canonical `profiles`
row and enter the app without onboarding again.

## 7. Known limitations / follow-ups
- **Turnstile widget is not yet rendered client-side.** Server verification is
  wired, but the client does not yet show the Cloudflare widget or send a token.
  ⚠️ **Do not set `TURNSTILE_SECRET_KEY` in production until the widget exists**,
  or email sign-in will be rejected. (Add a `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  widget that posts `captchaToken` to `/api/auth/email`.)
- **CSP uses `'unsafe-inline'` in `script-src`** (required by the inline theme
  bootstrap in `app/layout.tsx`). Tightening to a nonce/hash-based policy via
  middleware is a defense-in-depth follow-up.
- **Match and table simulation is client-side**, so reported Mini League and
  Invincible standings are validated and bound to an account/attempt but are not
  cryptographically trustworthy. A server-authoritative simulation and fixture
  store would be a larger redesign.
- The repo lives on an exFAT drive that regenerates macOS `._*` AppleDouble files
  (they break `git fsck` and were picked up by Playwright). Cleaning is temporary;
  cloning to an APFS volume is the durable fix.
