# FootyRush — Pre-Launch Review

_Audit date: 2026-07-19 · Target platform: Vercel · Scope: written review only (no source changes)_

This report answers three things before you make FootyRush public:

1. **Can it run locally right now?** (dependency check)
2. **Why doesn't the UI fit on a phone, and what fixes it?** (mobile responsiveness)
3. **What should be improved before launch?** (production readiness)

Every fix below is described so you can approve and apply it in a follow-up pass. Nothing in the source tree was changed to produce this report.

---

## At a glance

| Area | Status | Headline |
| --- | --- | --- |
| Run locally | ⚠️ One command away | `node_modules` is stale after your pull — run `npm install`. Then it runs in demo mode with no secrets. |
| Mobile UI | ⚠️ Fixable | Viewport is fine; the real breakers are a crushed pitch ratio, an unstyled registration page, and desktop-sized min-heights. |
| Security backend | ✅ Strong | Verified-token identity, service-role writes, RLS, server-recomputed anti-cheat. No secrets committed to git. |
| SEO / social preview | ❌ Missing | Shared links render with no image/title/description — the #1 thing to fix before marketing. |
| Page weight | ⚠️ Heavy | A 3.4 MB `data.json` ships to every visitor and is duplicated in the repo. |

---

## 1. Run it locally

### 1.1 Dependency status

- **Package manager:** npm (there is a `package-lock.json`; use `npm install` / `npm ci`).
- **Node version — mismatch to reconcile.** This machine runs **Node v24.14.0**, but `package.json` pins `"engines": { "node": "22.x" }` and CI (`.github/workflows/ci.yml`) uses 22.x — while `RENDER_DEPLOYMENT.md` and `HOSTINGER_DEPLOYMENT.md` both say **24.x**. Next 16 runs fine on 24, so this isn't a local blocker, but the inconsistency should be resolved (recommended: widen `engines` to `">=22"` or `"22.x || 24.x"` since Vercel and your machine use 24).
- **Missing packages after the pull.** `npm ls` reports these as **UNMET** — they're declared in `package.json` but not installed, because you pulled new commits without re-installing:
  - `@sentry/nextjs`, `@upstash/ratelimit`, `@upstash/redis`, `@vercel/analytics`, `@playwright/test`
  - A few `@emnapi/*` / `@napi-rs/*` packages show as "extraneous" — harmless leftovers; a clean `npm ci` removes them.
- **No `.env` file exists** — and that's OK locally. The app is env-driven: `lib/server/env.ts` only hard-fails in **production** when required secrets are missing, and `lib/supabase/client.ts` returns `null` when unconfigured, so the app boots into **demo mode** (local leaderboards, no real auth) with zero configuration.

### 1.2 Steps to run

```bash
npm install            # restores the 5 missing packages (~1–2 min)
npm run dev            # starts Next.js on http://localhost:3000  → redirects to /en
# optional, only for end-to-end tests:
npx playwright install # downloads browser binaries for Playwright
```

Then open `http://localhost:3000`, which redirects to `/en`. You can appoint a manager, draft a squad, and play a Mini League entirely in demo mode.

**Quality gates** (run these before any deploy — they mirror CI):

```bash
npm test               # Vitest unit tests (game engine)
npx tsc --noEmit       # TypeScript type-check
npm run lint           # ESLint (fails on any warning: --max-warnings=0)
npm run build          # production build
```

### 1.3 Recommended: add a `.env.example`

There's no template documenting what production needs — the vars live only in prose in `PRODUCTION_SETUP.md`. Add a committed `.env.example` so future-you (or a collaborator) can copy it to `.env.local`:

```dotenv
# --- Required in production (app refuses to boot without these) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FOOTYRUSH_IP_HASH_SALT=          # long random string
INVINCIBLE_GATE_SECRET=          # long random string

# --- Optional (feature turns on when set; safe no-op when absent) ---
UPSTASH_REDIS_REST_URL=          # rate limiting (fail-open if unset)
UPSTASH_REDIS_REST_TOKEN=
TURNSTILE_SECRET_KEY=            # DO NOT set until the client widget exists (see PRODUCTION_SETUP.md §6)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=               # source-map upload during build
```

> **Verdict:** dependencies are one `npm install` away from a working local run. See the "Verification results" section at the end for the actual output of these commands on this machine.

---

## 2. Mobile responsiveness

You reported the UI "doesn't fit on a standard phone." Good news: the usual culprit — a missing viewport meta — is **not** the problem here. Next.js auto-injects `width=device-width, initial-scale=1` (confirmed in the build output), and pinch-zoom is allowed. The real issues are specific CSS rules that assume desktop width. All live in `app/globals.css` unless noted.

Fixes are ordered by user-visible impact. This pass keeps them **targeted** — no rewrite of the 5,384-line stylesheet.

### 2.1 The pitch ratio is crushed (most likely your "ratio" complaint) — HIGH
The pitch uses `aspect-ratio: 2/3` and positions players by percentage, which is inherently responsive. But three rules cap its height and **override the aspect ratio** on a narrow screen:

- `globals.css:1921` — `.season-pitch-panel .pitch-container { max-height: 330px }`
- `globals.css:5348` — `.draft-right .pitch-container { max-height: 330px }`
- `globals.css:3585` — 1120px breakpoint bumps it to `max-height: 440px`

On a ~300px-wide single column, a true 2:3 pitch wants ~450px tall, but `max-height: 330px` wins → the pitch renders near-square and the fixed-percentage player rows (GK 88% / DEF 66% / MID 42% / ATT 17%) **compress and overlap**.

> **Fix direction:** drop or relax these `max-height` caps below ~640px viewport width (e.g. wrap them in `@media (min-width: 641px)`), so `aspect-ratio: 2/3` holds and the rows keep their spacing on phones.

### 2.2 The registration page is completely unstyled — HIGH
`components/RegistrationPage.tsx` (lines 154–221) uses classes `registration-shell`, `registration-card`, `registration-hero`, `registration-form`, `registration-id-row`, `registration-benefits`, etc. **None of these classes exist in any CSS file.** The whole `/[locale]/register` route therefore renders with raw browser defaults — full-width unconstrained inputs, no card, no layout. Broken on mobile *and* desktop.

> **Fix direction:** add a `registration-*` style block reusing the existing design tokens (`--panel`, `--r-lg`, button styles) so the page gets a centered, width-capped card like the rest of the app.

### 2.3 Desktop `min-height`s don't shrink — MEDIUM
Several panels have fixed pixel minimum heights that make them artificially tall and cramped on a phone:

- `globals.css:5319` — `.draft-board { min-height: 468px }`
- `globals.css:4755` — `.setup-control { min-height: 351px }`
- `globals.css:4792` — `.setup-home .manager-pick { min-height: 276px }`
- `globals.css:3351` — `.formation-preview-pitch { min-height: 278px }`

> **Fix direction:** convert to `min-height: min(<value>, <fraction>vh)` or clamp so they shrink on small viewports.

### 2.4 Names get clipped at the screen edge — MEDIUM
`html, body { overflow-x: hidden }` (`globals.css:4258`) hides horizontal overflow by **clipping** it, and there are ~13 `white-space: nowrap` rules (e.g. `.topbar .profile-pill` at `:4293`, table/rank name cells). A long Manager ID or team label is silently cut off — reads as "doesn't fit."

> **Fix direction:** allow wrapping or add `text-overflow: ellipsis` (with a `min-width: 0` flex parent) on the nowrap pills/labels, and treat the `overflow-x: hidden` as a safety net rather than the fix.

### 2.5 No notch / safe-area handling — MEDIUM
There is no `viewport-fit=cover` and no `env(safe-area-inset-*)` anywhere, so on notched/rounded phones the full-bleed topbar and content can sit under the notch, rounded corners, or the home indicator.

> **Fix direction:** add an explicit viewport export to `app/layout.tsx` and pad the shell with the safe-area insets:
> ```ts
> // app/layout.tsx
> export const viewport = {
>   width: "device-width",
>   initialScale: 1,
>   viewportFit: "cover",
>   themeColor: [
>     { media: "(prefers-color-scheme: dark)", color: "#070b16" },
>     { media: "(prefers-color-scheme: light)", color: "#eef3f9" },
>   ],
> };
> ```
> ```css
> .app-shell { padding-left: max(var(--page-pad), env(safe-area-inset-left));
>              padding-right: max(var(--page-pad), env(safe-area-inset-right)); }
> .topbar    { padding-top: max(12px, env(safe-area-inset-top)); }
> ```

### 2.6 Touch targets below ~44px — LOW
Some interactive elements are smaller than the ~44px touch guideline: `.lang-btn` (`:1410`, padding `4px 8px`, no `min-height`), `.slot-picker-close` (`:681`, 30×30), and the footer links (`:4900`).

> **Fix direction:** give these a `min-height`/`min-width` of 44px (or generous padding) on touch viewports.

### 2.7 Minor
- `.setup-solo` uses `100vh` instead of `100dvh` (`:4625`) — the classic mobile-toolbar overflow bug. (This selector appears to be dead CSS, so low priority.)
- The base font is `Inter` (`:94`) but Inter is never actually loaded (no `next/font`/`@font-face`), so it silently falls back to the system font. Loading it via `next/font` would make the design match your intent.

### 2.8 Root cause to keep in mind (not fixed this pass)
`app/globals.css` redefines the same selectors across many sequential "redesign pass" blocks (`.app-shell` defined 3×, `.topbar` ~5×, three separate `@media (max-width:720px)` blocks). Layout at any given width depends on source order, which is why small regressions keep appearing. A future consolidation pass would make responsive behavior predictable — but it's higher-risk and deliberately out of scope here.

---

## 3. Pre-launch production improvements

### 3.1 Blockers before a public / marketed launch

**❌ SEO, social preview, and PWA metadata are essentially absent — fix this first.**
`app/layout.tsx:5` sets only `title` and `description`. Missing: `metadataBase`, `openGraph`, `twitter` card, favicon/icons, web `manifest`, `robots`, `sitemap`, and per-locale metadata. `<html lang="en">` is hardcoded for all four locales (`layout.tsx:12`). `public/` contains **only** `data.json` — no favicon or share image.

**Why it matters most:** the moment you post a FootyRush link on TikTok, X, WhatsApp, or Discord, it renders as a bare URL with **no image, title, or description**. That kills click-through on exactly the channels your marketing depends on. Minimum to add:

```ts
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://<your-domain>"),
  title: { default: "FootyRush", template: "%s · FootyRush" },
  description: "Draft your XI. Chase the table. Make history. A free football draft game.",
  openGraph: {
    title: "FootyRush",
    description: "Draft your XI. Chase the table. Make history.",
    url: "https://<your-domain>",
    siteName: "FootyRush",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "FootyRush",
             description: "Draft your XI. Chase the table. Make history.", images: ["/og.png"] },
  icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
};
```
Plus: add `app/icon.png` (favicon), `public/og.png` (1200×630 share image — reuse the Floodlit-Night brand), `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts`, and localize `<html lang>` per route.

**⚠️ `data.json` is 3.4 MB, ships to every visitor, and is duplicated in the repo.**
`data.json` (root) and `public/data.json` are byte-identical (~6.8 MB committed total). The client `fetch("/data.json")`es the full file on first load (`lib/game/data.ts:18`). It's not bundled into JS (good), but it's a heavy first-visit transfer — bad for conversion on mobile data during a launch spike.
> Actions: keep a **single source of truth** (drop the duplicate); serve it with long-lived cache headers; and/or split it so a session only fetches the club-seasons it needs. Even just ensuring gzip/brotli on the static asset helps a lot.

**⚠️ Rotate the shared admin account.**
`ADMIN_CREDENTIALS.local.md` is correctly **gitignored and not committed** (verified — no secret is in git history), but it stores a *live* admin account's password in plaintext on disk. Rotate it before launch and never zip/share the folder with that file in it.

**Add `.env.example`** (see §1.3).

### 3.2 Should-fix

- **No error boundaries.** There's no `app/error.tsx`, `app/global-error.tsx`, or `app/not-found.tsx`. An uncaught render error in the 3,621-line client component drops users to Next's default error screen. Add branded recovery pages (Sentry still captures the error, but UX is much better).
- **Guard `NEXT_PUBLIC_TESTING_MODE`.** It fully disables the guest-play limit client-side (`FootyRushApp.tsx:766, 1474`). Make sure it can never be set in the production build (it's a public env var, so treat it as a footgun and assert it's off in prod).
- **Reconcile the Node version** across `engines`, CI, and the deploy docs (§1.1).
- **Broaden test coverage.** Vitest covers the game engine thoroughly (~1,100 lines across 10 files), but there are **no tests for any API route** or `lib/server/*`, and only **one Playwright smoke test**. Add route-level tests for `/api/results`, `/api/guest-plays`, and the Invincible complete flow, plus e2e for a full draft→league→leaderboard journey.
- **Anti-abuse is advisory, not enforced.** Sign-up runs through the Supabase browser client, so the server's disposable-email/MX checks on `/api/auth/email` can be skipped by calling Supabase directly. Manager-ID uniqueness *is* DB-enforced (safe). Only worth hardening (DB trigger / edge check) if you actually see abuse.

### 3.3 Nice-to-have

- Tighten the CSP off `'unsafe-inline'` in `script-src` (move the theme bootstrap to a nonce/hash) — `next.config.mjs:12`.
- Migrate ad-hoc API body validation to `zod` schemas (zod is already a dependency, used only in `env.ts` today).
- Lazy-load / code-split `FootyRushApp.tsx` (3,621 lines, all `use client`) to shrink the initial JS.
- Wrap the four competitive client fetches (`FootyRushApp.tsx:770, 964, 1131, 1233`) in try/catch.
- Accessibility polish: keyboard/escape parity on modal-backdrop `div onClick`s (`:2422, :2452`), `aria-invalid`/`aria-describedby` on the registration form, and a WCAG-AA contrast audit of both themes.

### 3.4 Secondary — only if you deploy to Render/Hostinger (not your Vercel target)

`render.yaml` would boot into a **500 state in production**: it sets `NODE_ENV=production` and generates only `FOOTYRUSH_IP_HASH_SALT`, but `lib/server/env.ts:81` also requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `INVINCIBLE_GATE_SECRET`, so any server route throws. Since you're launching on **Vercel**, this is informational — fix the blueprint (or relax the prod gate for a deliberate demo) only if Render comes back into play. Hostinger's docs additionally propose replacing Supabase with MySQL/Auth.js, which is a much larger project.

---

## 4. What's already solid (don't touch)

So the review isn't all red — these are genuinely well built and shouldn't be "improved" casually:

- **Competitive integrity / anti-cheat:** identity is derived from the **verified Supabase bearer token**, never from request-body fields (`lib/server/auth.ts`); Invincible awards are **recomputed server-side** and replay-safe (`app/api/invincible-attempts/[attemptId]/complete/route.ts`); the award-rarity gate scales from 1-in-1,000 to 1-in-100,000 as the user base grows (`lib/game/invincible-gate.ts`).
- **Database security:** RLS is enabled on every table; competitive writes go only through the service role (no client insert/update policies); RPCs are `security definer` with a fixed `search_path`. No SQL-injection surface (parameterized query builder throughout).
- **Secrets hygiene:** no real secret is committed to git; `env.ts` validates required vars with zod and hard-fails loudly in prod rather than silently degrading.
- **Security headers:** strong CSP + HSTS + `X-Frame-Options: DENY` + `nosniff` + Referrer-Policy + Permissions-Policy (`next.config.mjs`).
- **Observability:** Sentry wired across server/edge/client, DSN-gated so it's a no-op until configured.
- **Engine tests:** the deterministic simulation, draft, season, and leaderboard logic have real, meaningful unit tests.

---

## 5. Suggested order of work (after this review)

1. **SEO/social metadata + favicon + OG image** — unblocks marketing (§3.1).
2. **Mobile: pitch ratio + registration styles + safe-area** — the three highest-impact fixes (§2.1–2.2, §2.5).
3. **`.env.example` + Node-version reconcile** — quick, removes onboarding friction (§1.3, §1.1).
4. **`data.json` de-dupe + caching** — lighter first load for the launch (§3.1).
5. **Error boundaries + `NEXT_PUBLIC_TESTING_MODE` guard** (§3.2).
6. Remaining mobile polish (min-heights, name clipping, touch targets) and the nice-to-haves.

---

## Verification results

Every command below was actually run on this machine (Windows, Node v24.14.0) on 2026-07-19, after `npm install`:

| Check | Result |
| --- | --- |
| `npm install` | ✅ Added 129 packages, removed 10, **0 vulnerabilities** (~38s). One non-fatal `EBADENGINE` warning: requires Node `22.x`, found `v24.14.0`. |
| Missing packages resolved | ✅ `@sentry/nextjs@10.59.0`, `@upstash/ratelimit@2.0.8`, `@upstash/redis@1.38.0`, `@vercel/analytics@2.0.1`, `@playwright/test@1.61.0` all present. |
| `npx tsc --noEmit` | ✅ Pass — exit 0, no type errors. |
| `npm test` (Vitest) | ✅ Pass — **10 test files, 50 tests, all passing** (8.35s). |
| `npm run lint` | ✅ Pass — exit 0 with `--max-warnings=0`. |
| `npm run build` | ✅ Pass — compiled in 10.1s; 17 static pages generated; all 4 locales + 10 API routes built. |
| `npm run dev` + HTTP probe | ✅ `/` → 307 → `/en`; `/en` → **HTTP 200** (15.6 KB); page renders real game content ("Draft your XI", "Build your matchday squad"). |
| `/api/health` | ✅ `{"ok":true,"mode":"demo","database":"unconfigured"}` — confirms it runs correctly with no secrets configured. |
| Viewport meta | ✅ Present in served HTML (auto-injected by Next) — confirms the mobile problems are CSS, not a missing viewport tag. |

**Bottom line: the project builds, type-checks, lints, passes all tests, and runs locally.** The only thing that was actually wrong after your pull was the stale `node_modules` — fixed by a single `npm install`. Everything else in this report is an improvement opportunity, not a broken build.
