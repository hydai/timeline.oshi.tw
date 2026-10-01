# Timeline — Taiwan VTuber Live-Stream Timeline

[繁體中文](README.md) | **English**

A Threads-style "river" of Taiwan VTuber activity — **live now, upcoming, completed streams, and milestones** merged into one searchable timeline, with a VODs-style avatar rail for selecting one individual VTuber. The design language borrows the crystal glassmorphism of its sibling project **prism.oshi.tw**, with dark and light themes.

**Live site:** <https://timeline.oshi.tw>

## Features

- **River timeline** — four lanes (live / upcoming / completed / milestone) merged chronologically into a single stream
- **Search & filter** — search VTubers, switch content types instantly, and select one VTuber from a VODs-style avatar rail
- **Permanent history** — completed streams and milestones stay in D1 and are lazy-loaded from monthly R2 archives instead of rolling out of a recent window
- **Dark / light modes** — light is built on pale blue, pink, and white; dark mirrors the same palette
- **Fully static frontend** — Next.js static export, no server at runtime
- **Zero-idle backend** — a Cron-triggered Worker periodically publishes the current snapshot and monthly archives

## How it works

The system is two independent halves — a backend Worker that *accumulates permanent records and publishes snapshots/archives*, and a static frontend that *renders them*. They communicate only through public JSON in R2.

```
YouTube (RSS + Data API v3) ─┐
                             ├─►  streams-cache Worker ─► permanent D1 ─► R2
twvtuber REST API ───────────┘         (Cron-triggered)                 ├─ snapshot.json
                                                                       └─ archive/{index,YYYY-MM}.json
                                                                                 │
                                            browser reads on demand (static Next.js) ◄─┘
```

- **`worker/` — the streams-cache backend** (Cloudflare Workers)
  - **Heavy refresh** (4×/day, `0/6/12/18` UTC): auto-register new channels from data's VOD directory (excluding hololive) → discover recent videos via RSS (0 API quota) → get stream details through `videos.list` → backfill debut, every anniversary, and graduation milestone from the complete [twvtuber](https://twvtuber.oshi.tw) roster → backfill one pending newcomer's full stream history → publish data.
  - **Light refresh** (every 5 min): update live / imminent stream state and discover newly-created streams through RSS.
  - Channels, every stream, and milestones are permanent in **D1** (`timeline-streams`). Private/deleted videos are hidden with tombstones instead of being physically deleted; R2 serves both `streams/v1/snapshot.json` and monthly files under `streams/v1/archive/`.
  - Token-gated manual triggers cover `POST /refresh?mode=heavy|light` and one-channel repair through `mode=backfill&channel=UC...&dry=0` (with an `X-Trigger-Token` header).
- **`web/` — the frontend** (Next.js 16 static export, deployed to Cloudflare Pages)
  - Fetches the current snapshot and lightweight archive index. All always shows live/upcoming activity plus an expanded month of completed streams and milestones, with an older-month link at the bottom. Changing the history month keeps live/upcoming activity visible. The year/month picker appears only in Completed and Milestones.
  - Reloads restore browser-cached data before background revalidation: snapshots stay fresh for 1 minute, indexes/current-month archives for 5 minutes, and older months for 1 hour. The page checks for updates every minute. Stale data may be restored for up to 15 minutes (snapshot), 1 day (index), or 7 days (month); failed updates keep existing content visible with a retry. Storage is capped at 8 entries/~4 MB, with a network fallback when storage is unavailable. The header and home link are included in the static HTML.

## Tech stack

| | |
|---|---|
| **Backend** | Cloudflare Workers · D1 · R2 · Cron Triggers · TypeScript 7 · [zod](https://zod.dev) · Vitest 4 (`@cloudflare/vitest-pool-workers`) · Wrangler 4 |
| **Frontend** | Next.js 16 (App Router, `output: 'export'`) · React 19 · TypeScript 7 · Tailwind CSS 4 · lucide-react · next/font (self-hosted) · Vitest 4 + Testing Library + jsdom |

## Getting started

Requirements: Node.js 24+ (the repository's `.nvmrc` selects 24), [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4, a [YouTube Data API v3](https://developers.google.com/youtube/v3) key, and a Cloudflare account.

Both projects stay on Vitest 4 to satisfy `@cloudflare/vitest-pool-workers` peer dependencies. The Worker pins `sharp 0.35.4` with a Miniflare-scoped override to fix [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c); remove it once the test toolchain no longer includes older sharp versions. After dependency updates, run `npm audit`, `npm test`, and `npm run typecheck` in both directories, plus the frontend static build and `wrangler deploy --dry-run` for the Worker.

Tailwind 4 theme and source configuration lives in `web/app/globals.css`, with `@tailwindcss/postcss` as the PostCSS plugin. The browser baseline is Safari 16.4+, Chrome 111+, and Firefox 128+.

### Backend Worker (`worker/`)

```bash
cd worker
npm install

# Local secrets: create worker/.dev.vars (git-ignored)
#   YOUTUBE_API_KEY=your-key
#   MANUAL_TRIGGER_TOKEN=any-string

# Apply the schema to local D1
npm run db:migrate:local

# Seed channels. seed/seed.sql is committed — just apply it (no API key needed):
wrangler d1 execute timeline-streams --local --file seed/seed.sql

npm run dev            # local dev (use --test-scheduled to fire crons)
npm test               # run tests
```

> **Restrict the YouTube key by HTTP referrer** (`https://timeline.oshi.tw/*`), **not by IP** — Worker edge IPs are dynamic, so an IP restriction yields `403 API_KEY_IP_ADDRESS_BLOCKED`. The Worker sends `Referer: https://timeline.oshi.tw/` (set via the `YT_REFERER` var).

Deploying to Cloudflare:

```bash
# Create your own resources and put the ids back into wrangler.jsonc (database_id) and bucket_name
wrangler d1 create timeline-streams

# Set remote secrets
wrangler secret put YOUTUBE_API_KEY
wrangler secret put MANUAL_TRIGGER_TOKEN

npm run db:migrate:remote
wrangler d1 execute timeline-streams --remote --file seed/seed.sql
npm run deploy
```

### Optional Twitch integration

Twitch uses [Helix](https://dev.twitch.tv/docs/api/reference/) and [EventSub webhooks](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/), independently of schedules or VOD retention. This version uses app client credentials; no broadcaster OAuth page is required.

1. Register a Twitch Developer application and obtain its Client ID / Secret.
2. Apply all D1 migrations, including `0004_twitch.sql`. Deploy the updated frontend **before enabling ingestion**: historical Twitch records have `url: null`.
3. Set Worker secrets `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_WEBHOOK_SECRET`, and `TWITCH_WEBHOOK_URL` with `wrangler secret put`. The signing secret must be 10–100 random ASCII characters. The callback must be the public HTTPS/443 Worker URL ending in `/twitch/eventsub`, not the R2 data domain. See [`worker/.dev.vars.example`](worker/.dev.vars.example).
4. Run authenticated `POST /refresh?mode=heavy`, or wait for heavy cron. Discovery merges tracked channels' Prism `socialLinks.twitch` and twvtuber `twitch_id`, verifies numeric Twitch IDs, then reconciles `stream.online` v1, `stream.offline` v1 and `channel.update` v2. Conflicting, duplicate or missing identities are not tracked automatically.
5. Inspect `GET /twitch/accounts` with `X-Trigger-Token`. `POST /twitch/refresh` reconciles Twitch alone; initial discovery still requires a heavy pass.

[`worker/seed/twitch-consents.json`](worker/seed/twitch-consents.json) explicitly lists the 30 candidates approved by the operator on 2026-10-01; API verification still happens at runtime. Newly discovered accounts do not inherit that approval. Authenticated `POST /twitch/history` accepts `{ "userId": "numeric ID", "granted": true, "evidence": "permission record" }`. Revoking with `granted: false` disables tracking, deletes stream history, and rewrites public archives. Existing CDN/browser caches expire separately; immediate takedowns also need CDN purging. A later grant does not promote older unapproved data into permanent history.

HMAC-verified notifications are persisted and deduplicated before acknowledgement. Five-minute polling retries the inbox and reconciles live state; subscriptions are checked hourly and on heavy refresh. Raw notifications expire after 24 hours. Unapproved accounts have temporary live status only, never archived history. Without Twitch credentials, ingestion is disabled and YouTube continues normally.

The record preserves stream start, the **first observed** title/category and subsequent changes. History cards use that first observation, show “no replay”, and only offer a separate channel link. End times are observational estimates (`estimatedEnd`), not precise broadcast end timestamps. Pre-integration history cannot be reconstructed; a missed notification for a stream entirely between polling runs can be missed. Unobserved titles remain empty. Change details are stored in D1 but do not yet have a UI.

Canonical channel IDs and filters remain unchanged. Twitch IDs are namespaced as `twitch:<streamId>` in `videoId`, with optional `platform`, `platformStreamId`, `categoryName`, `initialTitle`, `initialCategoryName`, `channelUrl`, `estimatedEnd`, and temporary `expiresAt`. YouTube records retain their existing shape. The frontend now polls once per minute.

Preview without credentials using fictional data: run `NEXT_PUBLIC_SNAPSHOT_URL=/twitch-sample/snapshot.json npm run dev` from `web/`.

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev            # http://localhost:3000 (served from the bundled public/streams-sample.json)
npm run build          # static export to out/
npm test
```

Deploy to **Cloudflare Pages**: build command `npm run build`, output directory `out/`. Point the data source with `NEXT_PUBLIC_SNAPSHOT_URL`, or leave it unset to fall back to `https://data.oshi.tw/streams/v1/snapshot.json` (see [`web/.env.example`](web/.env.example)). Whatever host serves the snapshot must send `Access-Control-Allow-Origin`, since the browser fetches it cross-origin.

## Shareable filters and channel aliases

Filters are stored in the URL and restored on reload and browser back/forward navigation:

```text
/?channel=UCjv4bfP_67WLuPheS-Z8Ekg&type=upcoming
/v/mizuki?type=upcoming
/v/mizuki?type=recent&month=2026-08
/?group=ungrouped&type=live
```

The first two URLs are equivalent. `/v/[slug]` resolves to a stable channel ID and uses the same timeline as the home page. Its channel takes precedence over a conflicting `channel` query parameter.

Supported parameters are `channel` (YouTube channel ID), `group` (exact group name, or `ungrouped`), `type` (`live`, `upcoming`, `recent` for completed streams, or `milestone`), `q` (name/handle search), and `month` (`YYYY-MM`, Taipei months, for All, Completed, or Milestones history). Omitted filters mean all; omitted history months select the latest month with matching data. An explicit unavailable month or unknown channel shows an explanation instead of silently displaying different results.

“Share current filters” includes the displayed history month; “Share this VTuber” includes only the channel. Sharing prefers a published alias and falls back to `?channel=...`. Stream data continues updating; these links are not frozen snapshots.

In All, `month` scopes history only; live streams, upcoming streams, and future milestones still show current data. Type badges count all months, while the month navigator separately labels that month's count. Historical cards are expanded directly.

[`web/data/channel-aliases.json`](web/data/channel-aliases.json) stores `channelId → { slug, aliases, name, avatar }`. The initial profiles use the public roster from 2026-09-19. Slugs are case-sensitive, initially lowercase; Unicode aliases are URL-encoded. `name` and `avatar` supply build-time previews while the UI fetches current data.

- Add a profile and rebuild/deploy to publish a new alias. ID links work before the alias is deployed.
- When changing the main slug, keep the old value in `aliases`. Never assign a published alias to another channel; duplicate aliases fail validation.
- Update profile names/avatars and redeploy to refresh metadata. Social platforms may retain their own preview caches.

All aliases are statically exported with personal Open Graph/Twitter metadata and the primary slug as canonical. Unknown slugs return 404. Continue deploying `out/`; no runtime API is required, and stream refreshes do not rebuild the frontend.

`npm run build` also verifies each exported alias HTML file and its preview metadata, catching prerendered 404 pages before deployment.

## Data contracts (v1.0.0)

Current state uses a lightweight snapshot (see the `Snapshot` type in [`worker/src/types.ts`](worker/src/types.ts)):

```jsonc
{
  "version": "1.0.0",
  "generated_at": "ISO time",
  "heavy_refreshed_at": "ISO time",
  "channels": { "<channelId>": { "name", "handle", "avatar", "group", "nationality", "youtube_subs", "twvtuber_id" } },
  "groups": ["group name", ...],
  "live":      [ /* SnapshotStream */ ],
  "upcoming":  [ /* SnapshotStream */ ],
  "recent":    [ /* SnapshotStream */ ],
  "milestones":[ { "channelId", "type": "debut|anniversary|graduate", "date" } ]
}
```

The `SnapshotStream` time fields (`actualStart` / `scheduledStart` / `actualEnd` / `concurrentViewers`) are optional and omitted when null.

Permanent history is indexed by `streams/v1/archive/index.json`. An index marked with `facets: "channel"` also provides per-channel stream and milestone totals in each month's `by_channel`, keeping type, year, and month counts consistent after filtering. Each `streams/v1/archive/YYYY-MM.json` contains that month's `channels`, completed `streams`, and `milestones`; the browser fetches month files only when a historical filter is active.

## Project structure

```
worker/                 # Cloudflare Worker — streams-cache backend
  src/                  # refresh · onboarding · backfill · archive · YouTube/twvtuber/data adapters · D1/R2
  migrations/           # D1 schema and permanent-history migration
  seed/                 # channels.json (bootstrap channels) + seed.sql
  scripts/              # build-seed (roster → channels.json) · import-seed (channels.json → seed.sql)
  test/                 # Vitest (workers pool)
  wrangler.jsonc
web/                    # Next.js static-export frontend — deployed to Pages
  app/                  # App Router: page.tsx · layout · components/ · globals.css
  lib/                  # snapshot fetch · filter · river grouping · time formatting · types
  public/               # streams-sample.json (dev fixture)
  test/                 # Vitest + Testing Library
```

## Adding / updating channels

Production treats the VOD directory referenced by `data.oshi.tw/vod/v1/manifest.json` as the channel source. Each heavy refresh:

1. Inserts previously untracked YouTube channels that are not part of hololive into D1.
2. Creates a durable onboarding job and processes at most one newcomer per pass, walking the uploads playlist and retaining only livestreams/premieres.
3. Marks successful jobs complete so they never scan twice; failures retry on the next heavy pass.
4. Publishes any backfilled historical months to the R2 archive.

The complete-playlist scan is capped at 10,000 uploads. Hitting that cap marks the job `truncated` for curator follow-up. Private, deleted, or no-longer-listed videos cannot be recovered through the YouTube API. Channels that already exist when the migration is applied are marked `legacy`, avoiding an unexpected full-history scan of the entire production roster.

[`worker/seed/channels.json`](worker/seed/channels.json) remains the bootstrap/fallback for an empty database. Two ways to maintain it:

1. **By hand** — edit `channels.json` directly (`{ channelId, handle }`).
2. **Rebuild from the prism roster** — `YOUTUBE_API_KEY=... npm run build:seed` resolves the YouTube links in prism's registry to channel ids and drops hololive automatically.

Then rebuild the SQL and apply it to D1:

```bash
npm run import:seed    # channels.json → seed/seed.sql (idempotent INSERTs)
wrangler d1 execute timeline-streams --remote --file seed/seed.sql
```

After applying the seed, channels receive metadata on the next heavy refresh. A seeded channel that also exists in the VOD directory and has no onboarding state is queued for its one-time history backfill.

## Data sources & attribution

- The VTuber roster, groups, and milestones come from **[twvtuber](https://twvtuber.oshi.tw)**, whose data originates from **[TaiwanVtuberData](https://github.com/TaiwanVtuberData/TaiwanVTuberTrackingDataJson)**.
- Live / upcoming / recent stream metadata comes from the **YouTube Data API v3** (RSS discovery + `videos.list`).
- The design language is adapted from **prism.oshi.tw**'s crystal glassmorphism.

## License

Licensed under the [Apache License 2.0](LICENSE). Copyright © 2026 hydai.
