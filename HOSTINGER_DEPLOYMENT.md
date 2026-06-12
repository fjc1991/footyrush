# Hostinger Deployment

FootyRush is a server-rendered Next.js app, so deploy it as a Hostinger Node.js Web App, not as static website files.

## Recommended Plan

Start with Hostinger Business Web Hosting. Upgrade to Cloud Startup only if CPU, RAM, I/O, or database connection usage approaches the plan limits.

## Current Production Status

The app can be deployed to Hostinger now as a Next.js application. The current code still has Supabase-shaped authentication hooks and local/demo leaderboard behavior, so a fully production all-in-one Hostinger setup needs one more backend pass:

- Replace Supabase auth with Better Auth or Auth.js.
- Replace Supabase/Postgres schema with Hostinger MySQL/MariaDB tables.
- Move leaderboard reads and writes to trusted server routes.
- Store guest limits in the database instead of relying only on a browser cookie.

Do not set `NEXT_PUBLIC_TESTING_MODE` in production.

## Hostinger Build Settings

Use GitHub deployment where possible, so Hostinger can rebuild from the main branch and create dependency security PRs.

```txt
Framework: Next.js
Node.js version: 24.x
Install command: npm ci
Build command: npm run build
Start command: npm run start
Output directory: .next
Entry file: leave blank when Hostinger detects Next.js
```

The `start` script respects Hostinger's `PORT` environment variable and falls back to port `3000` for local runs.

## Environment Variables

Minimum production variables for the current app:

```txt
FOOTYRUSH_IP_HASH_SALT=<long random secret>
TURNSTILE_SECRET_KEY=<optional Cloudflare Turnstile secret>
```

Only set these if the Supabase backend is still being used during a transition:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Do not commit real secrets to the repository.

## Domain And SSL

Use Hostinger for the domain and DNS to keep the setup in one control panel:

1. Buy or transfer the domain in Hostinger.
2. Add the website as a Node.js Web App for that domain.
3. Keep Hostinger managed SSL enabled.
4. Add any email inboxes after the app is live, so DNS changes are easier to audit.

## Go-Live Checks

Run these locally before pushing a deployment branch:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

After Hostinger deployment, smoke test:

1. Open `/en`.
2. Start a guest season.
3. Complete a league.
4. Confirm the one-free-guest-play limit.
5. Confirm leaderboard behavior.
6. Confirm no production page shows "Local demo mode" unless intentionally launching without the database migration.

## Next Backend Pass

For the all-in-one Hostinger version, implement a MySQL/MariaDB backend with server-side API routes:

- `users` / `sessions` managed by Better Auth or Auth.js.
- `profiles` for display name, locale, manager score, completed leagues, and expert unlock state.
- `guest_play_allowances` keyed by salted IP hash.
- `leaderboard_entries` keyed by user, period, and completion timestamp.
- Server-side league completion endpoint that validates and stores the human manager result.

Keep simulation writes server-side or signed, so players cannot spoof leaderboard entries from browser dev tools.
