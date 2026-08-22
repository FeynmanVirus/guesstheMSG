# Guessmoji

A browser-based party game: players join a room, race to guess the answer behind an emoji
sequence, and climb a live leaderboard. Built with Next.js 16 (App Router) and Supabase
(Postgres + RLS, Realtime, anonymous Auth, Edge Functions).

See `ARCHITECTURE.md` for the technical design and `DESIGN.md` for the visual/UX spec.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is fine)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) — `npm install -g supabase`, or use
  the Supabase MCP server if you're working with an AI coding assistant that's connected to one
  (this repo's schema changes were made that way; see `.mcp.json`)

## Local development

1. **Clone and install**

   ```bash
   git clone <this-repo>
   cd guessthemsg
   npm install
   ```

2. **Create a Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard) if
   you don't have one already.

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your
   project's **Settings > API** page. See `.env.example` for details — these are the only two
   variables the Next.js app needs, and both are safe to expose to the browser (RLS is what
   actually protects data, not hiding these).

4. **Apply the database schema**

   Every schema change in this project is a versioned migration under `supabase/migrations/`.
   Link your local CLI to your project and push them:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This creates all tables, RLS policies, triggers, helper functions, and the `pg_cron`
   scheduled cleanup job (see [Scheduled cleanup](#scheduled-cleanup-of-inactive-rooms) below).

5. **Deploy the Edge Functions**

   All trusted game logic (room creation, joining, scoring, round timing) runs server-side in
   Supabase Edge Functions — the client never has enough access to cheat. Deploy them all:

   ```bash
   supabase functions deploy
   ```

   `verify_jwt` should be `true` for every function (the default) — they all require a signed-in
   (anonymous) caller.

6. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Where it's used | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server (Next.js) | Supabase dashboard: Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server (Next.js) | Supabase dashboard: Settings > API Keys > Publishable key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback if the above is unset (legacy projects) | Supabase dashboard: Settings > API |

That's the complete list for the Next.js app. **Edge Functions need nothing set manually** —
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
into every function's runtime by Supabase itself. Never add a service-role key to this app's own
environment variables (Vercel or local) — it should never exist outside the Edge Function
runtime and the Supabase dashboard.

On Vercel, set the two `NEXT_PUBLIC_*` variables in **Project Settings > Environment Variables**
for all three environments (Production, Preview, Development) — see
[Deploying to Vercel](#deploying-to-vercel) below.

## Scheduled cleanup of inactive rooms

A `pg_cron` job (`supabase/migrations/20260822090100_scheduled_room_cleanup.sql`) runs hourly
and deletes any room whose `last_active_at` is older than 24 hours. Every related row (players,
rounds, guesses, chat messages, categories, the room's password hash if any) cascades away with
it — nothing needs separate cleanup. This is set up entirely by the migration; there's nothing
to configure after `supabase db push`.

To check it's running on your project:

```sql
select * from cron.job;                    -- confirm the job is scheduled
select * from cron.job_run_details          -- confirm it's actually firing
  order by start_time desc limit 5;
```

## Security notes

- **Row Level Security is on for every table**, scoped to room membership — see `ARCHITECTURE.md`
  §4 for the policy shapes. `words.answer` (the thing players are guessing) and room password
  hashes are never selectable by any client role, including via Realtime — only `service_role`
  inside Edge Functions can read them.
- **All guess/scoring/timing logic is server-side.** The client never evaluates a guess or holds
  a room's password hash.
- Before going further to production traffic, consider enabling Supabase's
  [leaked password protection](https://supabase.com/docs/guides/auth/password-security) and
  reviewing rate limits on anonymous sign-ins (Auth settings) — flagged as open items in
  `ARCHITECTURE.md` §16.

## Testing

```bash
# Pure logic unit tests (Deno, no network) — normalization, scoring, hints, word pool
npx deno test --allow-net --allow-env --import-map=supabase/functions/deno.json supabase/functions/_shared/

# Edge Function integration tests (hit your real linked Supabase project)
npx deno test --allow-net --allow-env --import-map=supabase/functions/deno.json supabase/functions/submit-guess/submit-guess.integration.test.deno.ts

# Browser end-to-end tests (starts the dev server automatically)
npx playwright test
```

## Deploying to Vercel

This app deploys like any Next.js app — Vercel builds and hosts the frontend; Supabase Cloud
already hosts everything else (database, Auth, Realtime, Edge Functions). There's no server to
provision beyond what you set up in [Local development](#local-development) above.

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In the [Vercel dashboard](https://vercel.com/new), import the repository. Vercel
   auto-detects Next.js — no build command changes needed.
3. Add the two environment variables from [Environment variables](#environment-variables) above
   under **Project Settings > Environment Variables**, applied to Production, Preview, and
   Development.
4. Deploy. Every push to your default branch redeploys automatically; PRs get preview
   deployments.

Make sure your Supabase migrations and Edge Functions are deployed to your production Supabase
project *before* pointing Vercel's env vars at it (steps 4–5 in Local development) — Vercel only
hosts the frontend, so the backend has to already exist for the deployed site to work.
