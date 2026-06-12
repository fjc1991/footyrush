# Render Deployment

FootyRush can deploy to Render as a Node web service. The current configuration is aimed at a free initial test deployment.

## Current Render Shape

The app is a standard server-rendered Next.js app:

```txt
Build command: npm ci && npm run build
Start command: npm run start
Runtime: Node.js 24.x
Health check: /api/health
```

The included `render.yaml` creates one free web service in Render's Singapore region. It does not create Render Postgres yet because the current app still uses demo/local leaderboard behavior and Supabase-shaped auth hooks.

## Cost Expectations

For initial testing:

```txt
Web service: Free
Database: None
Expected cost: $0/month
```

For an always-on soft launch:

```txt
Web service: Starter, usually around $7/month
Database: optional later
```

For a production all-in Render setup after the backend pass:

```txt
Web service: Starter
Render Postgres: Basic
Expected minimum: roughly $13-15/month before bandwidth or larger instance upgrades
```

Free Render web services can spin down after inactivity. That is acceptable for testing, but it is not ideal for a live game because the first visitor after idle time may see a cold start.

Free Render Postgres is useful for experiments, but it expires after 30 days. Do not store real leaderboard/user data there unless the database is upgraded before expiry.

## Required Git Step

Render Git-backed deployment requires this project to be pushed to GitHub, GitLab, or Bitbucket first. This local folder is not currently a Git repository.

After creating a remote repository:

```bash
git init
git add .
git commit -m "Prepare FootyRush for Render deployment"
git branch -M main
git remote add origin <repo-url>
git push -u origin main
```

Then open Render:

```txt
https://dashboard.render.com/blueprint/new
```

Select the repository and let Render read `render.yaml`.

## Environment Variables

The Blueprint generates:

```txt
FOOTYRUSH_IP_HASH_SALT
```

Only add these manually if you are temporarily keeping Supabase during a transition:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SECRET_KEY
```

Do not set `NEXT_PUBLIC_TESTING_MODE` in production.

## Go-Live Checks

Before pushing:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

After deploy:

1. Confirm `/api/health` returns `{ "ok": true }`.
2. Open `/en`.
3. Complete a guest season.
4. Confirm the guest play limit behaves as expected.
5. Confirm leaderboard behavior.
6. Check Render logs for startup or runtime errors.

## Later Backend Pass

For a proper Render production version, choose one:

- Keep Supabase for auth/database and host only the app on Render.
- Replace Supabase with Render Postgres plus Better Auth or Auth.js.

If replacing Supabase, add a Render Postgres database to the Blueprint and implement server-side persistence for profiles, guest play limits, league completions, and leaderboard entries.
