# Timeline — Taiwan VTuber Live-Stream Timeline

[繁體中文](README.md) | **English**

A Threads-style "river" of Taiwan VTuber activity — **live now, upcoming, recently ended, and milestones** merged into one searchable timeline you can filter by group. The design language borrows the crystal glassmorphism of its sibling project **prism.oshi.tw**, with dark and light themes.

**Live site:** <https://timeline.oshi.tw>

## Features

- **River timeline** — four lanes (live / upcoming / recent / milestone) merged chronologically into a single stream
- **Search & filter** — search VTubers as you type and multi-select by group
- **Dark / light modes** — light is built on pale blue, pink, and white; dark mirrors the same palette
- **Fully static frontend** — Next.js static export, no server at runtime
- **Zero-idle backend** — a Cron-triggered Worker periodically produces a snapshot; the frontend just reads one JSON file

## How it works

The system is two independent halves — a backend Worker that *produces a data snapshot*, and a static frontend that *renders it*. They only ever talk through one public JSON snapshot.

```
YouTube (RSS + Data API v3) ─┐
                             ├─►  streams-cache Worker ─►  D1 ─►  R2 snapshot
twvtuber REST API ───────────┘         (Cron-triggered)        data.oshi.tw/streams/v1/snapshot.json
                                                                        │
                                       browser reads (timeline.oshi.tw, static Next.js) ◄─┘
```

- **`worker/` — the streams-cache backend** (Cloudflare Workers)
  - **Heavy refresh** (4×/day, `0/6/12/18` UTC): per channel, discover recent videos via RSS (0 API quota) → `videos.list` for stream details → join the [twvtuber](https://twvtuber.oshi.tw) roster and milestones → write the snapshot to R2.
  - **Light refresh** (every 30 min): update only live / imminent stream state.
  - Channels and stream state live in **D1** (`timeline-streams`); the snapshot JSON is written to **R2** at `streams/v1/snapshot.json` and served through the R2 custom domain at `https://data.oshi.tw/streams/v1/snapshot.json`.
  - A token-gated manual trigger (`POST /refresh?mode=heavy|light` with an `X-Trigger-Token` header) exists for debugging.
- **`web/` — the frontend** (Next.js 16 static export, deployed to Cloudflare Pages)
  - Fetches the snapshot JSON in the browser and renders the river, search, group filter, and theme toggle, auto-refreshing on a timer.

## Tech stack

| | |
|---|---|
| **Backend** | Cloudflare Workers · D1 · R2 · Cron Triggers · TypeScript · [zod](https://zod.dev) · Vitest (`@cloudflare/vitest-pool-workers`) · Wrangler 4 |
| **Frontend** | Next.js 16 (App Router, `output: 'export'`) · React 19 · TypeScript · Tailwind CSS 3.4 · lucide-react · next/font (self-hosted) · Vitest + Testing Library + jsdom |

## Getting started

Requirements: Node.js 20+, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 4, a [YouTube Data API v3](https://developers.google.com/youtube/v3) key, and a Cloudflare account.

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

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev            # http://localhost:3000 (served from the bundled public/streams-sample.json)
npm run build          # static export to out/
npm test
```

Deploy to **Cloudflare Pages**: build command `npm run build`, output directory `out/`. Point the data source with `NEXT_PUBLIC_SNAPSHOT_URL`, or leave it unset to fall back to `https://data.oshi.tw/streams/v1/snapshot.json` (see [`web/.env.example`](web/.env.example)). Whatever host serves the snapshot must send `Access-Control-Allow-Origin`, since the browser fetches it cross-origin.

## Snapshot contract (v1.0.0)

The only interface between the two halves is this JSON (see the `Snapshot` type in [`worker/src/types.ts`](worker/src/types.ts)):

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

## Project structure

```
worker/                 # Cloudflare Worker — streams-cache backend
  src/                  # index (cron+fetch) · refresh · rss · youtube · twvtuber · db · r2 · snapshot · seed · types
  migrations/           # D1 schema (0001_init.sql)
  seed/                 # channels.json (38 channels) + seed.sql
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

The channel seed lives in [`worker/seed/channels.json`](worker/seed/channels.json). Two ways:

1. **By hand** — edit `channels.json` directly (`{ channelId, handle }`).
2. **Rebuild from the prism roster** — `YOUTUBE_API_KEY=... npm run build:seed` resolves the YouTube links in prism's registry to channel ids and drops hololive automatically.

Then rebuild the SQL and apply it to D1:

```bash
npm run import:seed    # channels.json → seed/seed.sql (idempotent INSERTs)
wrangler d1 execute timeline-streams --remote --file seed/seed.sql
```

New channels are discovered and back-filled with metadata on the next heavy refresh.

## Data sources & attribution

- The VTuber roster, groups, and milestones come from **[twvtuber](https://twvtuber.oshi.tw)**, whose data originates from **[TaiwanVtuberData](https://github.com/TaiwanVtuberData/TaiwanVTuberTrackingDataJson)**.
- Live / upcoming / recent stream metadata comes from the **YouTube Data API v3** (RSS discovery + `videos.list`).
- The design language is adapted from **prism.oshi.tw**'s crystal glassmorphism.

## License

Licensed under the [Apache License 2.0](LICENSE). Copyright © 2026 hydai.
